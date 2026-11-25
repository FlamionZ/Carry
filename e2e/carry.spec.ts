import { expect, test } from "@playwright/test";
import {
  createCommunity,
  enroll,
  openCommunity,
  pasteScan as scan,
  pasteTransfer,
  phone,
  readFrames,
  waitForServiceWorker,
  watch,
  writeMessage,
} from "./helpers";

/**
 * DEMO_PLAN.md scenes 1–5 with three isolated browser contexts ("phones").
 * Frames move through the scanner's paste fallback; the frame text is exactly
 * the QR content. The camera path is covered in camera.spec.ts.
 */
test("three phones: join, relay, acknowledgement, integrity checks, offline shell", async ({ browser }) => {
  // ~60 UI steps on three pages; WebKit on Windows needs well over the default when engines run in parallel.
  test.slow();
  const w = watch();
  const A = await phone(browser, "Alex", w);
  const B = await phone(browser, "Sam", w);
  const C = await phone(browser, "Chris", w);

  // Scene 2: private community and two approved members.
  await createCommunity(A.page, "Campus Volunteers");
  await enroll(A.page, B.page, "Sam", pasteTransfer);
  await enroll(A.page, C.page, "Chris", pasteTransfer);

  // Scene 3: A → B → C. The message is a Change; its kind travels inside the ciphertext.
  const text = "Meet at the north entrance. Bring the first-aid kit.";
  const message = await writeMessage(A.page, text, "Change");

  await scan(B.page, message);
  await expect(B.page.getByText(text)).toBeVisible();
  await expect(B.page.getByText("Change", { exact: true })).toBeVisible();
  await expect(B.page.getByText("Received", { exact: true })).toBeVisible();
  await B.page.getByRole("button", { name: "Relay this packet" }).click();
  await expect(
    B.page.getByText("Relay copy: the same encrypted packet, with your signed relay entry for the next hop."),
  ).toBeVisible();
  const relayed = await readFrames(B.page);

  await scan(C.page, relayed);
  await expect(C.page.getByText(text)).toBeVisible();
  await expect(C.page.getByText("1 of 6")).toBeVisible();
  await expect(C.page.getByText("Change", { exact: true })).toBeVisible();
  // Sam signed a relay entry, but C has never seen Sam's certificate.
  const journey = C.page.getByRole("region", { name: "Relay journey" });
  await expect(journey.getByText("Alex → unknown member → you", { exact: true })).toBeVisible();
  await expect(journey.getByText("Unknown member on this device")).toBeVisible();
  await expect(journey.getByText("Verified", { exact: true })).toHaveCount(0);
  // The message list shows the kind as a text label too.
  await openCommunity(C.page);
  await expect(C.page.getByRole("link", { name: /Change/ }).getByText("Change", { exact: true })).toBeVisible();

  // Scene 5a: the same packet again is a duplicate.
  await scan(C.page, relayed);
  await expect(C.page.getByText("Already on this device")).toBeVisible();

  // Scene 4: C acknowledges; B carries the ACK back to A.
  await C.page.getByRole("link", { name: "Open it" }).click();
  await C.page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(C.page.getByRole("heading", { name: "Acknowledgement", exact: true })).toBeVisible();
  const ack = await readFrames(C.page);

  await scan(B.page, ack);
  await expect(B.page.getByText("Chris acknowledged Alex's message")).toBeVisible();
  // B leaves and later finds the ACK in the relay queue.
  await openCommunity(B.page);
  await B.page.getByRole("tab", { name: /Relay/ }).click();
  await B.page.getByRole("link", { name: /Chris acknowledged Alex's message/ }).click();
  await B.page.getByRole("button", { name: "Relay this packet" }).click();
  const ackRelayed = await readFrames(B.page);

  // Not acknowledged until the ACK is scanned on A.
  await openCommunity(A.page);
  await expect(A.page.getByText("Shown", { exact: true })).toBeVisible();
  await scan(A.page, ackRelayed);
  await expect(A.page.getByRole("heading", { name: "Message", exact: true })).toBeVisible();
  await expect(A.page.getByText("Acknowledged", { exact: true })).toBeVisible();
  const returned = A.page.getByRole("region", { name: "Acknowledgements" });
  await expect(returned.getByText("Chris", { exact: true }).first()).toBeVisible();
  // Both journeys, verified on A: the copy inside the ACK and the ACK's own entries.
  const out = returned.getByRole("region", { name: "Message journey to Chris" });
  await expect(out.getByText("Alex → Sam → Chris", { exact: true })).toBeVisible();
  await expect(out.getByText("Verified", { exact: true })).toHaveCount(1);
  const back = returned.getByRole("region", { name: "Acknowledgement journey back from Chris" });
  await expect(back.getByText("Chris → Sam → Alex", { exact: true })).toBeVisible();
  await expect(back.getByText("Verified", { exact: true })).toHaveCount(1);
  await expect(returned.getByText("Unknown member on this device")).toHaveCount(0);

  // The Ledger on A lists the Change with its acknowledgement count and both journeys.
  await openCommunity(A.page);
  await A.page.getByRole("tab", { name: "Ledger" }).click();
  const ledger = A.page.getByRole("tabpanel", { name: "Ledger" });
  const entry = ledger.getByRole("link", { name: new RegExp(text) });
  await expect(entry.getByText("Change", { exact: true })).toBeVisible();
  await expect(entry.getByText("Acknowledged", { exact: true })).toBeVisible();
  await expect(entry.getByText("1 member acknowledged", { exact: true })).toBeVisible();
  await expect(entry.getByText("You → Sam → Chris", { exact: true })).toBeVisible();
  await expect(entry.getByText("Chris → Sam → you", { exact: true })).toBeVisible();
  await entry.click();
  const timeline = A.page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByText("Created on this device")).toBeVisible();
  await expect(timeline.getByText("Shown: first displayed as QR frames")).toBeVisible();
  await expect(timeline.getByText(/^Acknowledged by Chris/)).toBeVisible();
  await expect(A.page.getByRole("region", { name: "Message journey to Chris" })).toBeVisible();
  await expect(A.page.getByRole("region", { name: "Acknowledgement journey back from Chris" })).toBeVisible();
  await expect(A.page.getByRole("region", { name: "Acknowledgements" }).getByText("1 member acknowledged")).toBeVisible();

  // Members confirm a Request: its count reads "confirmed" on the message page and in the Ledger.
  const request = "Two volunteers needed at the info desk.";
  await scan(C.page, await writeMessage(A.page, request, "Request"));
  await expect(C.page.getByText(request)).toBeVisible();
  await C.page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(C.page.getByRole("heading", { name: "Acknowledgement", exact: true })).toBeVisible();
  await scan(A.page, await readFrames(C.page));
  await expect(A.page.getByText(request)).toBeVisible();
  const confirmations = A.page.getByRole("region", { name: "Acknowledgements" });
  await expect(confirmations.getByText("1 member confirmed", { exact: true })).toBeVisible();
  await openCommunity(A.page);
  await A.page.getByRole("tab", { name: "Ledger" }).click();
  const requestEntry = A.page.getByRole("tabpanel", { name: "Ledger" }).getByRole("link", { name: new RegExp(request) });
  await expect(requestEntry.getByText("1 member confirmed", { exact: true })).toBeVisible();
  await expect(entry.getByText("1 member acknowledged", { exact: true })).toBeVisible();

  // Scene 5b/c: corrupted frame and expired packet fixtures are rejected.
  await A.page.goto("/settings");
  await A.page.getByRole("button", { name: "Corrupted frame" }).click();
  const corrupted = await readFrames(A.page);
  await scan(B.page, corrupted);
  await expect(B.page.getByText("The scanned frames do not match their checksum.", { exact: false })).toBeVisible();

  await A.page.getByRole("button", { name: "Hide test QR" }).click();
  await A.page.getByRole("button", { name: "Expired packet" }).click();
  const expired = await readFrames(A.page);
  await scan(B.page, expired);
  await expect(B.page.getByText("This packet has expired", { exact: false })).toBeVisible();

  // An interrupted transfer is listed until finished or discarded.
  await B.page.goto("/scan");
  await B.page.getByText("Fallbacks: image upload or frame text").click();
  await B.page.getByRole("button", { name: "Paste frame text" }).click();
  await B.page.getByLabel(/Frame text \(one or more/).fill(message[0]!);
  await B.page.getByRole("button", { name: "Import frame text" }).click();
  await expect(B.page.getByText(`1 of ${message.length} QR frames scanned.`)).toBeVisible();
  await B.page.goto("/scan");
  const unfinished = B.page.getByRole("region", { name: "Unfinished transfers" });
  await expect(unfinished.getByText(`1 of ${message.length} frames`)).toBeVisible();
  await unfinished.getByRole("button", { name: "Discard" }).click();
  await expect(unfinished).toHaveCount(0);

  // Rehearsal measurements on B count the rejections.
  await B.page.goto("/settings");
  await expect(B.page.getByText("TRANSFER_DIGEST_MISMATCH: 1")).toBeVisible();
  await expect(B.page.getByText("PACKET_EXPIRED: 1")).toBeVisible();

  // Scene 1: with the network off, the cached app shell and local data still load.
  await A.page.goto("/settings");
  if (await waitForServiceWorker(A.page)) {
    await expect(A.page.getByText("Files this page uses are cached", { exact: false })).toBeVisible();
    await A.setOffline(true);
    await A.page.reload();
    await expect(A.page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await A.page.goto("/");
    await expect(A.page.getByRole("link", { name: /Campus Volunteers/ })).toBeVisible();
    await expect(A.page.getByText("Offline-ready", { exact: true })).toBeVisible();
  } else {
    test.info().annotations.push({ type: "offline", description: "No service worker in this browser build; offline step skipped." });
  }

  expect(w.external, "no request may leave the app origin").toEqual([]);
  expect(w.problems, "no console errors, page errors or CSP violations").toEqual([]);
});

test("theme: night by default, Light choice persists across reloads", async ({ browser }) => {
  const w = watch();
  const A = await phone(browser, "Alex", w);
  const root = A.page.locator("html");
  await expect(root).not.toHaveAttribute("data-theme", "light");

  await A.page.goto("/settings");
  const night = A.page.getByRole("radio", { name: /Kiroween night/ });
  const light = A.page.getByRole("radio", { name: /^Light/ });
  await expect(night).toBeChecked();
  // The radio is visually hidden inside its card; people tap the card label.
  await A.page.getByText("Light", { exact: true }).click();
  await expect(light).toBeChecked();
  await expect(root).toHaveAttribute("data-theme", "light");

  await A.page.reload();
  await expect(light).toBeChecked();
  await expect(root).toHaveAttribute("data-theme", "light");

  await A.page.getByText("Kiroween night", { exact: true }).click();
  await expect(night).toBeChecked();
  await expect(root).not.toHaveAttribute("data-theme", "light");

  expect(w.external, "no request may leave the app origin").toEqual([]);
  expect(w.problems, "no console errors, page errors or CSP violations").toEqual([]);
});
