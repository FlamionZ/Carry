import { Link, Route, Routes } from "react-router";
import { AppShell, PageHeader } from "../../components/AppShell";
import { CommunityPage } from "../../features/communities/CommunityPage";
import { CreateCommunityPage } from "../../features/communities/CreateCommunityPage";
import { HomePage } from "../../features/communities/HomePage";
import { InvitePage } from "../../features/membership/InvitePage";
import { JoinPendingPage } from "../../features/membership/JoinPendingPage";
import { ReviewRequestPage } from "../../features/membership/ReviewRequestPage";
import { ComposePage } from "../../features/messages/ComposePage";
import { PacketRoute } from "../../features/messages/PacketPage";
import { ScanPage } from "../../features/packet-transfer/ScanPage";
import { SettingsPage } from "../../features/settings/SettingsPage";

function NotFound() {
  return (
    <div>
      <PageHeader title="Page not found" />
      <Link className="btn-primary" to="/">
        Go home
      </Link>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="communities/new" element={<CreateCommunityPage />} />
        <Route path="c/:communityId" element={<CommunityPage />} />
        <Route path="c/:communityId/invite" element={<InvitePage />} />
        <Route path="c/:communityId/compose" element={<ComposePage />} />
        <Route path="join/:requestId" element={<JoinPendingPage />} />
        <Route path="requests/:requestId" element={<ReviewRequestPage />} />
        <Route path="p/:recordId" element={<PacketRoute />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
