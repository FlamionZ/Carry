import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { prefersReducedMotion } from "../app/motion";
import { useScreenWakeLock } from "../app/useScreenWakeLock";
import { renderQr } from "../infrastructure/qr/encoder";

/**
 * Large QR surface for multi-frame transfers. Frames cycle automatically so
 * the scanner can collect them; users can pause and step manually.
 */
export function QrFrameDisplay({ frames, label }: { frames: string[]; label?: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => frames.length > 1 && !prefersReducedMotion());
  const [images, setImages] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = useMemo(() => frames.join("\n"), [frames]);
  useScreenWakeLock(true);

  useEffect(() => {
    let cancelled = false;
    setIndex(0);
    setImages([]);
    setFailed(false);
    Promise.all(frames.map((f) => renderQr(f, 720)))
      .then((urls) => {
        if (!cancelled) setImages(urls);
      })
      .catch(() => {
        // Frames are bounded (≤ 480 chars), so this means the QR code could not be loaded.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the joined frame text so a new array with the same frames does not re-render QR images.
  }, [key, attempt]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), 1400);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  const total = frames.length;
  const step = (delta: number) => {
    setPlaying(false);
    setIndex((i) => (i + delta + total) % total);
  };

  return (
    <div className="card flex flex-col items-center gap-3">
      {label && <p className="text-center text-sm font-semibold text-forest">{label}</p>}
      <div className="aspect-square w-full max-w-[min(88vw,420px)] rounded-control bg-white p-1">
        {images[index] ? (
          <img
            src={images[index]}
            alt={`QR frame ${index + 1} of ${total}`}
            className="h-full w-full [image-rendering:pixelated]"
          />
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center" role="alert">
            <p className="text-sm">
              The QR code could not be prepared. Open CARRY while online until it shows Offline-ready, then try
              again.
            </p>
            <button type="button" className="btn-secondary" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center muted">Preparing QR…</div>
        )}
      </div>

      <p className="font-display text-lg font-bold" aria-live="polite">
        Frame {index + 1} of {total}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {frames.map((_, i) => (
          <span key={i} className={`h-2 w-6 rounded-full ${i === index ? "bg-teal" : "bg-sage/30"}`} />
        ))}
      </div>

      {total > 1 && (
        <div className="flex w-full items-center justify-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => step(-1)} aria-label="Previous frame">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="btn-secondary min-w-28" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            {playing ? "Pause" : "Cycle"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => step(1)} aria-label="Next frame">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      <p className="text-center text-xs muted">
        Turn screen brightness up. The other person scans until every frame is collected.
      </p>

      <details className="w-full text-xs">
        <summary className="cursor-pointer muted">Frame text (diagnostics)</summary>
        <ol className="mt-2 space-y-2">
          {frames.map((f, i) => (
            <li key={i}>
              <textarea
                readOnly
                className="mono h-20 w-full rounded-control border border-sage/50 p-2 text-[11px]"
                value={f}
                aria-label={`Frame ${i + 1} text`}
                onFocus={(e) => e.currentTarget.select()}
              />
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
