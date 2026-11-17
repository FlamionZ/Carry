import type { BrowserQRCodeReader } from "@zxing/browser";
import type * as QRCodeModule from "qrcode";
import type { QRCodeMaskPattern } from "qrcode";

type QRCodeApi = typeof QRCodeModule;

const OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: "#14201E", light: "#FFFFFF" },
} as const;

const MASKS: QRCodeMaskPattern[] = [0, 1, 2, 3, 4, 5, 6, 7];

let libs: Promise<{ QRCode: QRCodeApi; reader: BrowserQRCodeReader }> | undefined;

/** The QR libraries load on first use, so screens without QR codes start faster. */
function loadLibs() {
  libs ??= Promise.all([import("qrcode"), import("@zxing/browser")]).then(([qr, zxing]) => ({
    // qrcode is CommonJS; depending on the bundler it arrives as the namespace or as its default export.
    QRCode: ((qr as { default?: QRCodeApi }).default ?? qr) as QRCodeApi,
    reader: new zxing.BrowserQRCodeReader(),
  }));
  // Let a later call retry if loading failed (e.g. the app was not fully cached yet).
  libs.catch(() => {
    libs = undefined;
  });
  return libs;
}

/**
 * Render one frame string as a QR PNG data URL. Generated locally; no network.
 *
 * Every QR mask pattern is valid, but ZXing (CARRY's scanner) cannot read
 * about 30% of sharp renderings made with the default mask; measured
 * 56 of 80 360-character frames. So the rendering is decoded once, and if
 * ZXing cannot read it, it is re-rendered with the first mask that reads back
 * (80 of 80 in the same measurement). This matters most for screenshots and
 * the image-upload fallback; a live camera adds enough variation by itself.
 */
export async function renderQr(text: string, size = 360): Promise<string> {
  const { QRCode, reader } = await loadLibs();
  const readsBack = (canvas: HTMLCanvasElement) => {
    try {
      return reader.decodeFromCanvas(canvas).getText() === text;
    } catch {
      return false;
    }
  };

  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, { ...OPTIONS, width: size });
  if (readsBack(canvas)) return canvas.toDataURL("image/png");

  for (const maskPattern of MASKS) {
    await QRCode.toCanvas(canvas, text, { ...OPTIONS, width: size, maskPattern });
    if (readsBack(canvas)) return canvas.toDataURL("image/png");
  }
  // Not observed in testing. The default rendering is still a valid QR code for other scanners.
  await QRCode.toCanvas(canvas, text, { ...OPTIONS, width: size });
  return canvas.toDataURL("image/png");
}
