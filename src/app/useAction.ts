import { useCallback, useState } from "react";

/** Runs an async use case, tracking pending state and the last error. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, setError };
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
