import { useState } from "react";
import { useNavigate } from "react-router";
import { createCommunity } from "../../application/use-cases/communities";
import { useDevice } from "../../app/providers/DeviceProvider";
import { useAction } from "../../app/useAction";
import { PageHeader } from "../../components/AppShell";
import { ErrorNotice, Notice } from "../../components/Notice";
import { LIMITS } from "../../domain/limits";
import { requestPersistentStorage } from "../../infrastructure/pwa/readiness";

export function CreateCommunityPage() {
  const device = useDevice();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const { run, pending, error } = useAction(async (n: string) => {
    const community = await createCommunity(device, n);
    // Not awaited: Firefox answers with a permission prompt that may stay open.
    void requestPersistentStorage();
    navigate(`/c/${encodeURIComponent(community.id)}`, { replace: true });
  });

  return (
    <div className="space-y-4">
      <PageHeader title="New community" back="/" subtitle="You will be the administrator who approves members." />
      <Notice title="Before you start">
        Your community and messages stay on this device and are transferred directly by QR. CARRY does not use a
        message server. If you clear browser data or lose this device, your local data may be lost.
      </Notice>
      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(name);
        }}
      >
        <div>
          <label className="label" htmlFor="community-name">
            Community name
          </label>
          <input
            id="community-name"
            className="input"
            placeholder="Campus Volunteers"
            value={name}
            maxLength={LIMITS.maxNameLength}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <ErrorNotice error={error} />
        <button type="submit" className="btn-primary w-full" disabled={pending || !name.trim()}>
          {pending ? "Creating keys…" : "Create community"}
        </button>
      </form>
    </div>
  );
}
