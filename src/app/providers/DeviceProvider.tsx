import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { type Device, systemClock } from "../../application/device";
import { runCleanup } from "../../application/use-cases/maintenance";
import { CarryDb } from "../../infrastructure/db/db";

const db = new CarryDb("carry");
const device: Device = { db, now: systemClock };

const DeviceContext = createContext<Device>(device);

type StorageState = "opening" | "ready" | "error";

/** Opens IndexedDB once, runs retention cleanup, and blocks the UI if storage fails. */
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StorageState>("opening");

  useEffect(() => {
    let cancelled = false;
    db.open()
      .then(() => runCleanup(device).catch(() => undefined))
      .then(() => !cancelled && setState("ready"))
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "opening") {
    return <div className="p-6 text-center muted">Opening local storage…</div>;
  }
  if (state === "error") {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="card border-alert">
          <h1 className="text-xl text-alert">Local storage is unavailable</h1>
          <p className="mt-2">
            CARRY keeps communities and keys in this browser's IndexedDB. It could not be opened, so actions that
            could lose data are blocked. Private browsing modes or full storage can cause this.
          </p>
        </div>
      </div>
    );
  }
  return <DeviceContext.Provider value={device}>{children}</DeviceContext.Provider>;
}

export function useDevice(): Device {
  return useContext(DeviceContext);
}
