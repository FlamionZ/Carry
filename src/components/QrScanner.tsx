import { Camera, ClipboardPaste, ImageUp, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type CameraScanner,
  cameraSupported,
  type ScannerError,
  scanImageFile,
  scannerErrorOf,
  startCameraScan,
} from "../infrastructure/qr/scanner";
import { Notice } from "./Notice";

const LOAD_FAILED =
  "The QR scanner could not be loaded. Open CARRY while online until it shows Offline-ready, then try again.";

const CAMERA_MESSAGES: Record<Exclude<ScannerError, "NO_QR">, string> = {
  UNSUPPORTED: "This browser cannot open the camera here. Camera access needs HTTPS (or localhost).",
  DENIED: "Camera permission was denied. Allow camera access in browser settings, or use image upload below.",
  NOT_FOUND: "No camera was found on this device. Use image upload or paste frame text below.",
  FAILED: "The camera could not be started. Use image upload or paste frame text below.",
  LOAD_FAILED,
};

/**
 * Camera is requested only after an explicit tap. Every track is stopped when
 * scanning ends, the component unmounts, or the app goes to the background.
 */
export function QrScanner({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<CameraScanner | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<keyof typeof CAMERA_MESSAGES | null>(null);
  const [pausedInBackground, setPausedInBackground] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");

  const stopCamera = () => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => stopCamera, []);
  useEffect(() => {
    if (disabled) stopCamera();
  }, [disabled]);
  // Never keep the camera running while CARRY is in the background.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && scannerRef.current) {
        stopCamera();
        setPausedInBackground(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setPausedInBackground(false);
    if (!videoRef.current) return;
    setCameraOn(true);
    try {
      scannerRef.current = await startCameraScan(videoRef.current, (t) => onTextRef.current(t));
    } catch (err) {
      setCameraOn(false);
      const code = scannerErrorOf(err);
      setCameraError(code === "NO_QR" ? "FAILED" : code);
    }
  };

  const onImage = async (file: File | undefined) => {
    setImageError(null);
    if (!file) return;
    try {
      onTextRef.current(await scanImageFile(file));
    } catch (err) {
      setImageError(scannerErrorOf(err) === "LOAD_FAILED" ? LOAD_FAILED : "No QR code was found in that image.");
    }
  };

  const submitPaste = () => {
    // Accept one frame per line so several frames can be pasted at once.
    pasted
      .split(/\s+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => onTextRef.current(line));
    setPasted("");
  };

  return (
    <div className="space-y-3">
      <div className={`overflow-hidden rounded-card bg-ink ${cameraOn ? "" : "hidden"}`}>
        <div className="relative">
          <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 rounded-card border-4 border-teal/80" aria-hidden="true" />
        </div>
        {/* Inset focus ring: the panel's overflow-hidden would clip an outer one. */}
        <button
          type="button"
          className="btn-ghost w-full rounded-none text-white hover:bg-white/10 focus-visible:outline-offset-[-5px]"
          onClick={stopCamera}
        >
          <X size={18} aria-hidden="true" /> Stop camera
        </button>
      </div>

      {!cameraOn && (
        <div className="card space-y-3">
          <div className="flex items-start gap-3">
            <ScanLine className="mt-1 shrink-0 text-teal-dark" aria-hidden="true" />
            <p className="text-sm">
              CARRY uses the camera only to read QR frames shown on another phone. Nothing is recorded or sent
              anywhere. Your browser will ask for permission.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={startCamera}
            disabled={disabled || !cameraSupported()}
          >
            <Camera size={20} aria-hidden="true" /> Open camera
          </button>
        </div>
      )}

      {(cameraError || !cameraSupported()) && (
        <Notice tone="attention">{CAMERA_MESSAGES[cameraError ?? "UNSUPPORTED"]}</Notice>
      )}
      {pausedInBackground && !cameraOn && (
        <Notice>The camera was turned off while CARRY was in the background. Frames already scanned are kept.</Notice>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold text-forest">Fallbacks: image upload or frame text</summary>
        <div className="mt-3 space-y-3">
          <label className="btn-secondary w-full cursor-pointer">
            <ImageUp size={18} aria-hidden="true" /> Scan a QR image
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                void onImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {imageError && <p className="text-sm text-alert-dark">{imageError}</p>}

          {!pasteOpen ? (
            <button type="button" className="btn-ghost w-full" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste size={18} aria-hidden="true" /> Paste frame text
            </button>
          ) : (
            <div className="space-y-2">
              <label className="label" htmlFor="frame-text">
                Frame text (one or more C1:… frames)
              </label>
              <textarea
                id="frame-text"
                className="input mono h-28 py-2 text-xs"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                spellCheck={false}
              />
              <button type="button" className="btn-secondary w-full" onClick={submitPaste} disabled={!pasted.trim()}>
                Import frame text
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
