import { useEffect, useState } from "react";
import { buildQrTransfer } from "../../application/use-cases/transfer";
import { getChunkSize } from "../../app/settings";

/** Build QR frames once per payload (one transfer ID per display). */
export function useFrames(payload: string | null | undefined): { frames: string[] | null; error: unknown } {
  const [frames, setFrames] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let cancelled = false;
    setFrames(null);
    setError(null);
    if (!payload) return;
    buildQrTransfer(payload, getChunkSize())
      .then((f) => !cancelled && setFrames(f))
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [payload]);
  return { frames, error };
}
