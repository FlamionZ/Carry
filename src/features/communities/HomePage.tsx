import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Plus, ScanLine, Shield } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { createIdentity } from "../../application/use-cases/identity";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatRemaining, useAction } from "../../app/useAction";
import { IosStorageNotice } from "../../components/IosStorageNotice";
import { Lantern } from "../../components/Lantern";
import { CarryMark } from "../../components/Logo";
import { ErrorNotice } from "../../components/Notice";
import { LIMITS } from "../../domain/limits";

function IdentitySetup() {
  const device = useDevice();
  const [name, setName] = useState("");
  const { run, pending, error } = useAction((n: string) => createIdentity(device, n));

  return (
    <div className="space-y-5">
      <section className="rounded-card bg-brand p-6 text-on-brand">
        <div className="flex items-end gap-3">
          <CarryMark size={56} onDark />
          <Lantern size={44} />
        </div>
        <h1 className="mt-4 text-3xl">Carry the message. Keep the community connected.</h1>
        <p className="mt-3 text-on-brand/85">
          CARRY helps your community share short, private updates without relying on an internet connection. Create
          a group, invite members with QR, and pass encrypted message packets from one device to another.
        </p>
        <p className="mt-3 border-l-2 border-signal pl-3 text-sm text-on-brand/85">
          In the 1980s, FidoNet carried messages from one computer to the next, night after night. CARRY brings that
          store-and-forward idea back, hand to hand by QR, with modern encryption and no server.
        </p>
      </section>
      <IosStorageNotice />
      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(name);
        }}
      >
        <h2 className="text-lg">Set up this device</h2>
        <p className="text-sm muted">
          Your display name is shown to community members after an administrator approves you. A signing key is
          created on this device and never leaves it.
        </p>
        <div>
          <label className="label" htmlFor="display-name">
            Display name
          </label>
          <input
            id="display-name"
            className="input"
            value={name}
            maxLength={LIMITS.maxNameLength}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            required
          />
        </div>
        <ErrorNotice error={error} />
        <button type="submit" className="btn-primary w-full" disabled={pending || !name.trim()}>
          Continue
        </button>
      </form>
    </div>
  );
}

export function HomePage() {
  const device = useDevice();
  const { db } = device;
  const identity = useLiveQuery(async () => (await db.localIdentity.get("local")) ?? null, []);
  const communities = useLiveQuery(() => db.communities.orderBy("createdAt").reverse().toArray(), []);
  const pendingJoins = useLiveQuery(
    () => db.pendingJoinRequests.where("status").equals("WAITING_FOR_APPROVAL").toArray(),
    [],
  );
  const counts = useLiveQuery(async () => {
    const all = await db.packets.where("packetType").equals("MESSAGE").toArray();
    const map: Record<string, number> = {};
    for (const p of all) map[p.communityId] = (map[p.communityId] ?? 0) + 1;
    return map;
  }, []);

  if (identity === undefined) return null;
  if (identity === null) return <IdentitySetup />;

  const now = device.now();
  const waiting = (pendingJoins ?? []).filter((p) => p.expiresAt > now);

  return (
    <div className="space-y-5">
      <div>
        <p className="muted">Hello, {identity.displayName}</p>
        <h1 className="text-2xl text-forest">Your communities</h1>
      </div>

      <IosStorageNotice />

      <div className="grid grid-cols-2 gap-3">
        <Link to="/communities/new" className="btn-primary">
          <Plus size={20} aria-hidden="true" /> New community
        </Link>
        <Link to="/scan" className="btn-secondary">
          <ScanLine size={20} aria-hidden="true" /> Scan QR
        </Link>
      </div>

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide muted">Waiting for approval</h2>
          {waiting.map((p) => (
            <Link key={p.id} to={`/join/${encodeURIComponent(p.id)}`} className="card flex items-center gap-3 border-amber">
              <Shield className="text-amber-dark" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-semibold">{p.communityName}</p>
                <p className="text-sm muted">Join request expires in {formatRemaining(p.expiresAt - now)}</p>
              </div>
              <ChevronRight aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-2">
        {communities?.length === 0 && (
          <div className="card text-center">
            <Lantern size={40} className="mx-auto" />
            <p className="mt-2 font-semibold">No communities on this device yet</p>
            <p className="mt-1 text-sm muted">Create one, or scan an invitation from an organizer you trust.</p>
          </div>
        )}
        {communities?.map((c) => (
          <Link key={c.id} to={`/c/${encodeURIComponent(c.id)}`} className="card flex items-center gap-3 hover:border-teal">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-forest/10 font-display font-bold text-forest">
              {c.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.name}</p>
              <p className="text-sm muted">
                {c.role === "ADMIN" ? "Administrator" : "Member"} · {counts?.[c.id] ?? 0} message
                {(counts?.[c.id] ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            <ChevronRight aria-hidden="true" />
          </Link>
        ))}
      </section>
    </div>
  );
}
