import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

export type CameraError = "UNSUPPORTED" | "DENIED" | "NOT_FOUND" | "FAILED";

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

function classify(err: unknown): CameraError {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "DENIED";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "NOT_FOUND";
  return "FAILED";
}

export interface CameraScanner {
  stop(): void;
}

/**
 * Rear camera at 720p when available. Browsers often default to 640×480,
 * which leaves only ~4 px per module for a 360-character frame (QR version 16).
 */
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

/**
 * Start continuous scanning from the rear camera into `video`. The caller must
 * call stop() when done; this releases every camera track.
 */
export async function startCameraScan(
  video: HTMLVideoElement,
  onText: (text: string) => void,
): Promise<CameraScanner> {
  if (!cameraSupported()) throw Object.assign(new Error("Camera unsupported"), { cameraError: "UNSUPPORTED" });
  const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 });
  let controls: IScannerControls | undefined;
  try {
    controls = await reader.decodeFromConstraints(CAMERA_CONSTRAINTS, video, (result) => {
      if (result) onText(result.getText());
    });
  } catch (err) {
    throw Object.assign(new Error("Camera failed"), { cameraError: classify(err) });
  }
  return {
    stop() {
      controls?.stop();
      const stream = video.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

export function cameraErrorOf(err: unknown): CameraError {
  const code = (err as { cameraError?: CameraError } | null)?.cameraError;
  return code ?? "FAILED";
}

/**
 * Transforms tried in order on a still image. ZXing misses some perfectly
 * sharp, axis-aligned QR images, depending on the QR mask pattern; small
 * rotations and rescaling recover them. Measured on 450 generated frames
 * (120–360 chars, 360–1080 px): 354 decode on the first attempt, 449 with this list.
 * A live camera does not need this because every video frame differs slightly.
 */
const STILL_IMAGE_ATTEMPTS = [
  { scale: 1, deg: 0, blur: 0 },
  { scale: 1, deg: 3, blur: 0 },
  { scale: 0.5, deg: 0, blur: 0 },
  { scale: 1, deg: -3, blur: 0 },
  { scale: 1, deg: 0, blur: 1 },
  { scale: 0.75, deg: 6, blur: 0.5 },
  { scale: 0.75, deg: -6, blur: 0 },
  { scale: 1, deg: 1.5, blur: 0 },
  { scale: 0.6, deg: 10, blur: 0 },
  { scale: 1, deg: -8, blur: 0.5 },
] as const;

/** Large photos are scaled down first; decoding time grows with pixel count. */
const MAX_STILL_SIDE = 1600;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be read"));
    img.src = url;
  });
}

function drawAttempt(img: HTMLImageElement, a: (typeof STILL_IMAGE_ATTEMPTS)[number]): HTMLCanvasElement {
  const scale = a.scale * Math.min(1, MAX_STILL_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const pad = a.deg ? Math.round(Math.max(w, h) * 0.12) : 0;
  const canvas = document.createElement("canvas");
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (a.deg) ctx.rotate((a.deg * Math.PI) / 180);
  if (a.blur) ctx.filter = `blur(${a.blur}px)`; // ignored where unsupported
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvas;
}

/** Fallback: decode a QR from an uploaded image (screenshot or photo). */
export async function scanImageFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const reader = new BrowserQRCodeReader();
    for (const attempt of STILL_IMAGE_ATTEMPTS) {
      try {
        return reader.decodeFromCanvas(drawAttempt(img, attempt)).getText();
      } catch {
        // Not found with this transform; try the next one.
      }
    }
    throw new Error("No QR code found");
  } finally {
    URL.revokeObjectURL(url);
  }
}
