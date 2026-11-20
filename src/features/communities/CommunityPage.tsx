import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, MessageSquare, PenLine, Repeat, ScanLine, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { canShareRecord } from "../../application/use-cases/packets";
import { useDevice } from "../../app/providers/DeviceProvider";
import { formatTime } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import type { JoinRequestRecord } from "../../infrastructure/db/db";
import { PacketRow } from "../messages/PacketRow";
import { LedgerTab } from "./LedgerTab";

type Tab = "messages" | "relay" | "ledger" | "members";

const REQUEST_STATUS: Record<JoinRequestRecord["status"], string> = {
  PENDING: "Waiting for your review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

function EmptyCard({ Icon, title, text }: { Icon: typeof Repeat; title: string; text: string }) {
  return (
    <div className="card text-center">
      <Icon className="mx-auto text-sage" size={32} aria-hidden="true" />
      <p className="mt-2 font-semibold">{title}</p>
      <p className="text-sm muted">{text}</p>
    </div>
  );
}

export function CommunityPage() {
  const { communityId = "" } = useParams();
  const device = useDevice();
  const { db } = device;
  const [tab, setTab] = useState<Tab>("messages");

  const community = useLiveQuery(async () => (await db.communities.get(communityId)) ?? null, [communityId]);
  const packets = useLiveQuery(() => db.packets.where("communityId").equals(communityId).toArray(), [communityId]);
  const members = useLiveQuery(
    () => db.memberships.where("communityId").equals(communityId).sortBy("displayName"),
    [communityId],
  );
  const requests = useLiveQuery(
    async () =>
      (await db.joinRequests.where("communityId").equals(communityId).toArray()).sort(
        (a, b) => b.receivedAt - a.receivedAt,
      ),
    [communityId],
  );

  const { messages, relayQueue } = useMemo(() => {
    const all = packets ?? [];
    const now = device.now();
    return {
      messages: all.filter((p) => p.packetType === "MESSAGE").sort((a, b) => b.createdAt - a.createdAt),
      relayQueue: all.filter((p) => canShareRecord(p, now)).sort((a, b) => b.lastActionAt - a.lastActionAt),
    };
  }, [packets, device]);

  if (community === undefined) return null;
  if (community === null) {
    return <PageHeader title="Community not found" back="/" subtitle="It is not stored on this device." />;
  }

  const isAdmin = community.role === "ADMIN";
  const pendingCount = requests?.filter((r) => r.status === "PENDING").length ?? 0;
  const tabs: { id: Tab; label: string; badge: number; badgeLabel: string }[] = [
    { id: "messages", label: "Messages", badge: 0, badgeLabel: "" },
    { id: "relay", label: "Relay", badge: relayQueue.length, badgeLabel: "packets to pass along" },
    { id: "ledger", label: "Ledger", badge: 0, badgeLabel: "" },
    { id: "members", label: "Members", badge: isAdmin ? pendingCount : 0, badgeLabel: "join requests to review" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={community.name}
        back="/"
        subtitle={`${isAdmin ? "You are the administrator" : "Member"} · key epoch ${community.keyEpoch}`}
      />

      <div className={`grid gap-3 ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
        <Link to={`/c/${encodeURIComponent(community.id)}/compose`} className="btn-primary px-2">
          <PenLine size={18} aria-hidden="true" /> Write
        </Link>
        <Link to="/scan" className="btn-secondary px-2">
          <ScanLine size={18} aria-hidden="true" /> Scan
        </Link>
        {isAdmin && (
          <Link to={`/c/${encodeURIComponent(community.id)}/invite`} className="btn-secondary px-2">
            <UserPlus size={18} aria-hidden="true" /> Invite
          </Link>
        )}
      </div>

      <div role="tablist" aria-label="Community sections" className="flex gap-1 rounded-control bg-forest/5 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control text-sm font-semibold ${
              tab === t.id ? "bg-white text-forest shadow-sm" : "text-sage-dark"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1.5 text-xs text-ink">
                {t.badge}
                <span className="sr-only"> {t.badgeLabel}</span>
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "messages" && (
        <section className="space-y-3" role="tabpanel" id="panel-messages" aria-labelledby="tab-messages">
          {messages.length === 0 && (
            <EmptyCard
              Icon={MessageSquare}
              title="No messages yet"
              text="Messages move when people do. Write one or scan a packet."
            />
          )}
          {messages.map((m) => (
            <PacketRow key={m.id} record={m} />
          ))}
        </section>
      )}

      {tab === "relay" && (
        <section className="space-y-3" role="tabpanel" id="panel-relay" aria-labelledby="tab-relay">
          <p className="text-sm muted">
            Messages and acknowledgements on this device that you can show to the next person. A relay passes on the
            same encrypted packet; only its hop count changes.
          </p>
          {relayQueue.length === 0 && (
            <EmptyCard Icon={Repeat} title="Nothing to pass along" text="Expired packets and packets at their relay limit are not listed." />
          )}
          {relayQueue.map((p) => (
            <PacketRow key={p.id} record={p} />
          ))}
        </section>
      )}

      {tab === "ledger" && <LedgerTab communityId={communityId} packets={packets} />}

      {tab === "members" && (
        <section className="space-y-5" role="tabpanel" id="panel-members" aria-labelledby="tab-members">
          {isAdmin && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide muted">Join requests</h2>
              {requests?.length === 0 && (
                <p className="card text-sm muted">
                  No join requests yet. Show an invitation, then scan the person's join request QR.
                </p>
              )}
              {requests?.map((r) => (
                <Link
                  key={r.id}
                  to={`/requests/${encodeURIComponent(r.id)}`}
                  className={`card flex items-center gap-3 ${r.status === "PENDING" ? "border-amber" : ""}`}
                >
                  <div className="flex-1">
                    <p className="font-semibold">{r.displayName}</p>
                    <p className="text-sm muted">
                      {REQUEST_STATUS[r.status]} · {formatTime(r.receivedAt)}
                    </p>
                  </div>
                  <ChevronRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide muted">Members</h2>
            <p className="text-sm muted">
              {isAdmin
                ? "Members you approved on this device."
                : "Members this device has verified, from your approval and from received packets."}
            </p>
            {members?.map((m) => (
              <div key={m.id} className="card flex items-center justify-between">
                <span className="font-semibold">{m.displayName}</span>
                <span className="text-xs font-semibold uppercase tracking-wide muted">{m.role.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
