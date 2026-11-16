import { expect, type Page, test } from "@playwright/test";
import { installDeniedCamera, installFakeCamera } from "./fake-camera";
import { createCommunity, enroll, phone, readFrameImages, type Transfer, watch, writeMessage } from "./helpers";

/** Point the fake camera at the QR images shown on `from`, then tap "Open camera" on `to`. */
const cameraTransfer: Transfer = async (from, to) => {
  const urls = await readFrameImages(from);
  await to.goto("/scan");
  await to.evaluate((u) => window.__carryFakeCamera!.show(u), urls);
  await to.getByRole("button", { name: "Open camera" }).click();
};

async function expectCameraReleased(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__carryFakeCamera!.tracksStopped())).toBe(true);
}

test("camera: join and a multi-frame message through the real scanner pipeline", async ({ browser }) => {
  const w = watch();
  const A = await phone(browser, "Alex", w, installFakeCamera);
  const canStream = await A.page.evaluate(() => typeof HTMLCanvasElement.prototype.captureStream === "function");
  test.skip(!canStream, "This browser build has no canvas.captureStream, so the fake camera cannot run.");
  const B = await phone(browser, "Sam", w, installFakeCamera);

  await createCommunity(A.page, "Campus Volunteers");
  await enroll(A.page, B.page, "Sam", cameraTransfer);
  await expectCameraReleased(B.page);

  const text = "Meet at the north entrance. Bring the first-aid kit.";
  const frames = await writeMessage(A.page, text);
  expect(frames.length, "the demo message needs several frames").toBeGreaterThan(1);
  await cameraTransfer(A.page, B.page);
  await expect(B.page.getByText(text)).toBeVisible({ timeout: 30_000 });
  // The scanner page navigated away; the camera must be released.
  await expectCameraReleased(B.page);

  expect(w.external).toEqual([]);
  expect(w.problems).toEqual([]);
});

test("image upload fallback decodes screenshots of the displayed QR", async ({ browser }) => {
  const w = watch();
  const A = await phone(browser, "Alex", w);
  const B = await phone(browser, "Sam", w);
  await createCommunity(A.page, "Campus Volunteers");
  await A.page.getByRole("link", { name: "Invite" }).click();
  await A.page.getByRole("button", { name: "Show invitation QR" }).click();
  const images = await readFrameImages(A.page);

  await B.page.goto("/scan");
  await B.page.getByText("Fallbacks: image upload or frame text").click();
  for (const [i, url] of images.entries()) {
    await B.page.getByLabel("Scan a QR image").setInputFiles({
      name: `frame-${i + 1}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(url.slice(url.indexOf(",") + 1), "base64"),
    });
    if (i < images.length - 1) {
      await expect(B.page.getByText(`${i + 1} of ${images.length} QR frames scanned.`)).toBeVisible();
    }
  }
  await expect(B.page.getByRole("heading", { name: "Campus Volunteers" })).toBeVisible();
  await expect(B.page.getByRole("button", { name: "Request to join" })).toBeVisible();

  expect(w.external).toEqual([]);
  expect(w.problems).toEqual([]);
});

test("denied camera permission is explained and fallbacks stay available", async ({ browser }) => {
  const w = watch();
  const B = await phone(browser, "Sam", w, installDeniedCamera);
  await B.page.goto("/scan");
  await B.page.getByRole("button", { name: "Open camera" }).click();
  await expect(B.page.getByText("Camera permission was denied.", { exact: false })).toBeVisible();
  await expect(B.page.getByText("Fallbacks: image upload or frame text")).toBeVisible();
  await expect(B.page.getByRole("button", { name: "Open camera" })).toBeEnabled();
  expect(w.problems).toEqual([]);
});
