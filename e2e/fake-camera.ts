/**
 * Page init scripts (serialized by Playwright, so they must be self-contained).
 *
 * installFakeCamera replaces only navigator.mediaDevices.getUserMedia. It
 * returns a 1280×720 canvas stream (the resolution the app requests) showing
 * QR images the way a handheld phone sees another screen: the QR fills about
 * three quarters of the frame height, slightly blurred, tilted 2–6° and
 * drifting, with frames cycling every 600 ms. The video element, ZXing
 * decoding and the app's scanner all run unmodified. Real optics (focus,
 * glare, moiré) are not emulated.
 */

declare global {
  interface Window {
    __carryFakeCamera?: {
      show(urls: string[]): void;
      opened(): number;
      tracksStopped(): boolean;
    };
  }
}

export function installFakeCamera(): void {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  let images: HTMLImageElement[] = [];
  let index = 0;
  let switchedAt = 0;
  const tracks: MediaStreamTrack[] = [];

  const draw = (t: number) => {
    if (images.length > 1 && t - switchedAt > 600) {
      index = (index + 1) % images.length;
      switchedAt = t;
    }
    ctx.fillStyle = "#4b4f4e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = images[index];
    if (img && img.complete && img.naturalWidth > 0) {
      // Hand movement: slow drift, tilt between 2° and 6°, ±3% distance change.
      const size = 540 * (1 + 0.03 * Math.sin(t / 700));
      ctx.save();
      ctx.translate(canvas.width / 2 + Math.sin(t / 400) * 6, canvas.height / 2 + Math.cos(t / 530) * 4);
      ctx.rotate(((4 + 2 * Math.sin(t / 900)) * Math.PI) / 180);
      ctx.filter = "blur(0.6px)";
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  window.__carryFakeCamera = {
    show(urls) {
      images = urls.map((u) => {
        const img = new Image();
        img.src = u;
        return img;
      });
      index = 0;
    },
    opened: () => tracks.length,
    tracksStopped: () => tracks.length > 0 && tracks.every((t) => t.readyState === "ended"),
  };

  const mediaDevices = {
    async getUserMedia(constraints?: MediaStreamConstraints) {
      if (!constraints?.video) throw new DOMException("Video required", "NotFoundError");
      const stream = canvas.captureStream(15);
      for (const track of stream.getTracks()) {
        // Camera tracks expose capabilities; ZXing probes them for a torch.
        if (typeof track.getCapabilities !== "function") {
          Object.defineProperty(track, "getCapabilities", { value: () => ({}) });
        }
        tracks.push(track);
      }
      return stream;
    },
    async enumerateDevices() {
      return [{ deviceId: "fake-camera", groupId: "fake", kind: "videoinput", label: "Fake camera" }];
    },
  };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: mediaDevices });
}

/** A browser where the user refuses camera permission. */
export function installDeniedCamera(): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      },
    },
  });
}
