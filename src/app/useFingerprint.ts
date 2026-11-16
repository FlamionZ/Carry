import { useEffect, useState } from "react";
import type { PublicJwk } from "../domain/packet/schemas";
import { fingerprint } from "../infrastructure/crypto/webcrypto";

/** Display fingerprint of a public key; empty while computing or if hashing fails. */
export function useFingerprint(jwk: PublicJwk | undefined): string {
  const [value, setValue] = useState("");
  // Live queries return a new object on every change; depend on the key material only.
  const key = jwk ? `${jwk.x}.${jwk.y}` : "";
  useEffect(() => {
    let cancelled = false;
    setValue("");
    if (!jwk) return;
    fingerprint(jwk)
      .then((fp) => {
        if (!cancelled) setValue(fp);
      })
      .catch(() => {
        // e.g. the page is being left; nothing to show.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return value;
}
