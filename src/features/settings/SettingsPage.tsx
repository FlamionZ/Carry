import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { normalizeName, updateDisplayName } from "../../application/use-cases/identity";
import { clearLocalData } from "../../application/use-cases/maintenance";
import { buildExpiredFixture } from "../../application/use-cases/packets";
import { buildCorruptedFixture, buildQrTransfer } from "../../application/use-cases/transfer";
import { useDevice } from "../../app/providers/DeviceProvider";
import {
  CHUNK_OPTIONS,
  getChunkSize,
  getRehearsalStart,
  setChunkSize,
  setRehearsalStart,
} from "../../app/settings";
import { formatTime, useAction } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice, Notice } from "../../components/Notice";
import { useOfflineReadiness } from "../../components/OfflineBadge";
import { QrFrameDisplay } from "../../components/QrFrameDisplay";
import { CarryError } from "../../domain/errors";
import { LIMITS } from "../../domain/limits";
import { requestPersistentStorage } from "../../infrastructure/pwa/readiness";
import { useFingerprint } from "../../app/useFingerprint";

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className={`text-xs font-semibold ${ok ? "text-teal-dark" : "text-amber-dark"}`}>{ok ? "Yes" : "No"}</span>
    </li>
  );
}

function IdentitySection() {
  const device = useDevice();
  const identity = useLiveQuery(() => device.db.localIdentity.get("local"), []);
  const fp = useFingerprint(identity?.signingPublicJwk);
  const [name, setName] = useState<string | null>(null);
  const save = useAction(async () => {
    await updateDisplayName(device, normalizeName(name ?? ""));
    setName(null);
  });
  if (!identity) return null;

  return (
    <section className="card space-y-3">
      <h2 className="text-lg">This device</h2>
      <div>
        <label className="label" htmlFor="settings-name">
          Display name for new join requests and communities
        </label>
        <div className="flex gap-2">
          <input
            id="settings-name"
            className="input"
            value={name ?? identity.displayName}
            maxLength={LIMITS.maxNameLength}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={name === null || save.pending}
            onClick={() => void save.run()}
          >
            Save
          </button>
        </div>
        <p className="mt-1 text-xs muted">Existing membership certificates keep the name they were issued with.</p>
      </div>
      <ErrorNotice error={save.error} />
      <div className="text-sm">
        <p className="font-semibold">Signing key fingerprint</p>
        <p className="mono">{fp}</p>
      </div>
    </section>
  );
}

function ReadinessSection() {
  const [state, refresh] = useOfflineReadiness();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(false));
  }, []);

  return (
    <section className="card space-y-3">
      <h2 className="text-lg">Offline readiness</h2>
      {state && (
        <ul className="space-y-1 text-sm">
          <Check ok={state.supported} label="Service workers supported" />
          <Check ok={state.controlled} label="Page controlled by the CARRY service worker" />
          <Check ok={state.precacheFound} label="App precache present" />
          <Check ok={state.shellCached} label={`App shell cached (${state.cachedEntries} files)`} />
          <Check
            ok={state.requiredAssets > 0 && state.missingAssets.length === 0}
            label={`Files this page uses are cached (${state.requiredAssets - state.missingAssets.length} of ${state.requiredAssets})`}
          />
          <Check ok={!!persisted} label="Persistent storage granted" />
        </ul>
      )}
      {state && !state.ready && (
        <Notice tone="attention">
          Open the installed (production) build once while online and reload it. The development server does not
          cache the app for offline use.
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={refresh}>
          Check again
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void requestPersistentStorage().then(setPersisted)}
        >
          Request persistence
        </button>
      </div>
    </section>
  );
}

function QrSection() {
  const [chunk, setChunk] = useState(getChunkSize());
  return (
    <section className="card space-y-2">
      <h2 className="text-lg">QR frame size</h2>
      <p className="text-sm muted">
        Smaller frames are easier for older cameras to read but a message needs more of them.
      </p>
      <select
        className="input"
        value={chunk}
        aria-label="Characters per QR frame"
        onChange={(e) => {
          const v = Number(e.target.value);
          setChunk(v);
          setChunkSize(v);
        }}
      >
        {CHUNK_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o} characters per frame{o === LIMITS.maxChunk ? " (default)" : ""}
          </option>
        ))}
      </select>
    </section>
  );
}

function DiagnosticsSection() {
  const device = useDevice();
  const communities = useLiveQuery(() => device.db.communities.toArray(), []);
  const [communityId, setCommunityId] = useState("");
  const [fixture, setFixture] = useState<{ label: string; frames: string[] } | null>(null);
  const selected = communityId || communities?.[0]?.id || "";

  const expired = useAction(async () => {
    const payload = await buildExpiredFixture(device, selected);
    setFixture({
      label: "TEST FIXTURE · expired packet (validly signed, expiry in the past)",
      // Frames are intact; only the signed expiry is in the past.
      frames: await buildQrTransfer(payload, getChunkSize()),
    });
  });
  const corrupt = useAction(async () => {
    const latest = (await device.db.packets.where("communityId").equals(selected).sortBy("createdAt")).at(-1);
    if (!latest) throw new CarryError("NOT_FOUND", "Write or receive a message in this community first.");
    setFixture({
      label: "TEST FIXTURE · corrupted frame (one character changed)",
      frames: await buildCorruptedFixture(latest.encodedEnvelope, getChunkSize()),
    });
  });

  if (!communities?.length) return null;
  return (
    <section className="card space-y-3">
      <h2 className="text-lg">Integrity tests</h2>
      <p className="text-sm muted">
        Clearly labelled test QR codes for demonstrating that another device rejects bad packets. Scan them on a
        member device; they should be rejected.
      </p>
      {communities.length > 1 && (
        <select className="input" value={selected} onChange={(e) => setCommunityId(e.target.value)} aria-label="Community">
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={() => void corrupt.run()} disabled={corrupt.pending}>
          Corrupted frame
        </button>
        <button type="button" className="btn-secondary" onClick={() => void expired.run()} disabled={expired.pending}>
          Expired packet
        </button>
      </div>
      <ErrorNotice error={corrupt.error ?? expired.error} />
      {fixture && (
        <>
          <Notice tone="attention" title={fixture.label} />
          <QrFrameDisplay frames={fixture.frames} />
          <button type="button" className="btn-ghost w-full" onClick={() => setFixture(null)}>
            Hide test QR
          </button>
        </>
      )}
    </section>
  );
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Counts from local audit events, to record rehearsals (DEMO_PLAN.md §8). */
function RehearsalSection() {
  const device = useDevice();
  const [since, setSince] = useState(getRehearsalStart);
  const events = useLiveQuery(
    () =>
      device.db.auditEvents
        .where("timestamp")
        .aboveOrEqual(since)
        .filter((e) => e.eventType === "TRANSFER_COMPLETED" || e.eventType === "TRANSFER_REJECTED")
        .toArray(),
    [since],
  );
  if (!events) return null;

  const done = events.filter((e) => e.eventType === "TRANSFER_COMPLETED");
  const ofType = (type: string) => done.filter((e) => e.details.payloadType === type);
  const messages = ofType("MESSAGE");
  const rejectedCodes = new Map<string, number>();
  for (const e of events) {
    if (e.eventType !== "TRANSFER_REJECTED") continue;
    const code = String(e.details.code);
    rejectedCodes.set(code, (rejectedCodes.get(code) ?? 0) + 1);
  }
  const duplicates = rejectedCodes.get("PACKET_DUPLICATE") ?? 0;
  rejectedCodes.delete("PACKET_DUPLICATE");
  const framesPerMessage = mean(messages.map((e) => Number(e.details.frames)));
  const secondsPerTransfer = mean(done.map((e) => Number(e.details.durationMs) / 1000));

  const rows: [string, string | number][] = [
    ["Invitations scanned", ofType("INVITE").length],
    ["Join requests scanned", ofType("JOIN_REQUEST").length],
    ["Approvals accepted", ofType("JOIN_APPROVAL").length],
    ["Messages received", messages.length],
    ["…of which arrived by relay", messages.filter((e) => Number(e.details.hopCount) > 0).length],
    ["Mean frames per message", framesPerMessage === null ? "–" : framesPerMessage.toFixed(1)],
    ["Mean seconds per transfer", secondsPerTransfer === null ? "–" : secondsPerTransfer.toFixed(1)],
    ["Acknowledgements returned to sender", ofType("ACK").filter((e) => e.details.ackReturned === true).length],
    ["Duplicates detected", duplicates],
  ];

  return (
    <section className="card space-y-3">
      <h2 className="text-lg">Rehearsal measurements</h2>
      <p className="text-sm muted">
        Scans counted on this device since {since ? formatTime(since) : "setup"}. Use them to tune the QR frame size.
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {rejectedCodes.size > 0 && (
        <div className="text-sm">
          <p className="font-semibold">Rejected transfers</p>
          <ul className="mono text-xs">
            {[...rejectedCodes].map(([code, n]) => (
              <li key={code}>
                {code}: {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="btn-secondary w-full"
        onClick={() => {
          const start = device.now();
          setRehearsalStart(start);
          setSince(start);
        }}
      >
        Start a new rehearsal
      </button>
    </section>
  );
}

function DangerSection() {
  const device = useDevice();
  const [confirm, setConfirm] = useState("");
  const clear = useAction(async () => {
    await clearLocalData(device);
    window.location.assign("/");
  });
  return (
    <section className="card space-y-3 border-alert/50">
      <h2 className="text-lg text-alert">Clear local data</h2>
      <p className="text-sm">
        This deletes every community, message, membership and key stored on this device. CARRY has no cloud backup,
        so this cannot be undone. Type <span className="mono font-semibold">DELETE</span> to confirm.
      </p>
      <input
        className="input"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        aria-label="Type DELETE to confirm"
      />
      <ErrorNotice error={clear.error} />
      <button
        type="button"
        className="btn-danger w-full"
        disabled={confirm !== "DELETE" || clear.pending}
        onClick={() => void clear.run()}
      >
        Delete all local data
      </button>
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <IdentitySection />
      <ReadinessSection />
      <QrSection />
      <DiagnosticsSection />
      <RehearsalSection />
      <section className="card space-y-2 text-sm">
        <h2 className="text-lg">What CARRY does and does not do</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Messages are encrypted for approved community members and signed by the sender.</li>
          <li>Packets move only when someone shows a QR and someone else scans it. There is no automatic mesh.</li>
          <li>Delivery is not guaranteed. A message counts as acknowledged only after an ACK is scanned back.</li>
          <li>Members are identified by their certificate; CARRY is private, not anonymous.</li>
          <li>Do not rely on CARRY as the only channel for life-critical emergencies.</li>
          <li>The protocol has not been independently audited.</li>
        </ul>
      </section>
      <DangerSection />
      <div className="space-y-1 text-center text-xs muted">
        <p>
          CARRY · protocol CARRY/1 · build <span className="mono">{__APP_VERSION__}</span>
        </p>
        <p>
          {/* New tab: an installed iOS app has no back button. */}
          <a className="underline" href="/licenses.txt" target="_blank" rel="noopener noreferrer">
            Open-source licenses
          </a>
        </p>
      </div>
    </div>
  );
}
