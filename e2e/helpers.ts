import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * WebKit rejects promises of a document that is being reloaded or left with
 * "Context is stopped" and reports them as page errors without a stack. The
 * tests reload and navigate on purpose, so this one message is noted instead
 * of failing the run. Any other page error still fails.
 */
function isWebKitTeardownNoise(page: Page, message: string): boolean {
  return page.context().browser()?.browserType().name() === "webkit" && message === "Context is stopped";
}

export interface Phone {
  page: Page;
  setOffline(offline: boolean): Promise<void>;
}

/** Collected across phones; tests assert both are empty at the end. */
export interface Watch {
  external: string[];
  problems: string[];
}

export function watch(): Watch {
  return { external: [], problems: [] };
}

/** A phone = an isolated browser context with its own IndexedDB, set up with a display name. */
export async function phone(browser: Browser, name: string, w: Watch, init?: () => void): Promise<Phone> {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on("request", (r) => {
    const { protocol, hostname } = new URL(r.url());
    if (protocol === "data:" || protocol === "blob:") return;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") w.external.push(r.url());
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const { url, lineNumber } = m.location();
    w.problems.push(`${name}: console: ${m.text()} @ ${url}:${lineNumber} (page ${page.url()})`);
  });
  page.on("pageerror", (e) => {
    if (isWebKitTeardownNoise(page, e.message)) {
      test.info().annotations.push({ type: "webkit-teardown", description: `${name}: ${e.message} on ${page.url()}` });
      return;
    }
    w.problems.push(`${name}: pageerror: ${e.message}\n${e.stack ?? ""} (page ${page.url()})`);
  });

  await page.goto("/");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your communities" })).toBeVisible();
  return { page, setOffline: (offline) => context.setOffline(offline) };
}

/** Read every frame shown by the QR display (diagnostics text = QR content). */
export async function readFrames(page: Page): Promise<string[]> {
  const details = page.locator("details", { hasText: "Frame text (diagnostics)" }).first();
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator("summary").click();
  const areas = details.locator("textarea");
  await expect(areas.first()).toBeVisible();
  return areas.evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
}

export async function createCommunity(page: Page, name: string) {
  await page.getByRole("link", { name: "New community" }).click();
  await page.getByLabel("Community name").fill(name);
  await page.getByRole("button", { name: "Create community" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function openCommunity(page: Page, name = "Campus Volunteers") {
  await page.goto("/");
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function writeMessage(page: Page, text: string): Promise<string[]> {
  await openCommunity(page);
  await page.getByRole("link", { name: "Write" }).click();
  await expect(page.getByRole("heading", { name: "Write a message" })).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Create packet" }).click();
  await expect(page.getByText("Ready to pass this message along.")).toBeVisible();
  return readFrames(page);
}

/** Move the QR currently shown on `from` to `to` (paste fallback or fake camera). */
export type Transfer = (from: Page, to: Page) => Promise<void>;

/** Run the invitation → join request → approval handshake. */
export async function enroll(admin: Page, member: Page, memberName: string, transfer: Transfer) {
  await openCommunity(admin);
  await admin.getByRole("link", { name: "Invite" }).click();
  await admin.getByRole("button", { name: "Show invitation QR" }).click();
  await transfer(admin, member);
  await expect(member.getByRole("heading", { name: "Campus Volunteers" })).toBeVisible();
  await member.getByRole("button", { name: "Request to join" }).click();
  await expect(member.getByText("Join request", { exact: true })).toBeVisible();

  await transfer(member, admin);
  await expect(admin.getByRole("heading", { name: `Join request: ${memberName}` })).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText(`Show this approval only to ${memberName}.`)).toBeVisible();

  await transfer(admin, member);
  await expect(member.getByText("Member · key epoch 1")).toBeVisible();
}

/** The QR images exactly as the app displays them, one per frame, in order. */
export async function readFrameImages(page: Page): Promise<string[]> {
  const img = page.getByRole("img", { name: /^QR frame \d+ of \d+$/ });
  await expect(img).toBeVisible();
  const total = Number(/of (\d+)$/.exec((await img.getAttribute("alt"))!)![1]);
  const pause = page.getByRole("button", { name: "Pause" });
  if (await pause.isVisible()) await pause.click();
  const urls = new Map<number, string>();
  while (urls.size < total) {
    const alt = (await img.getAttribute("alt"))!;
    urls.set(Number(/QR frame (\d+)/.exec(alt)![1]), (await img.getAttribute("src"))!);
    if (urls.size < total) {
      await page.getByRole("button", { name: "Next frame" }).click();
      await expect(img).not.toHaveAttribute("alt", alt);
    }
  }
  return [...urls.entries()].sort(([a], [b]) => a - b).map(([, url]) => url);
}

/** "Scan" by pasting frame text into the scanner fallback. */
export async function pasteScan(page: Page, frames: string[]) {
  await page.goto("/scan");
  await page.getByText("Fallbacks: image upload or frame text").click();
  await page.getByRole("button", { name: "Paste frame text" }).click();
  await page.getByLabel(/Frame text \(one or more/).fill(frames.join("\n"));
  await page.getByRole("button", { name: "Import frame text" }).click();
}

export const pasteTransfer: Transfer = async (from, to) => pasteScan(to, await readFrames(from));

/**
 * Wait until the service worker is active, then reload so it controls the
 * page. Returns false if this browser build never activates one.
 */
export async function waitForServiceWorker(page: Page): Promise<boolean> {
  const active = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15_000));
    return Promise.race([navigator.serviceWorker.ready.then(() => true), timeout]);
  });
  if (!active) return false;
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  return true;
}
