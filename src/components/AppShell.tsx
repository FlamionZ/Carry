import { Home, ScanLine, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { applyServiceWorkerUpdate, subscribeServiceWorker } from "../infrastructure/pwa/register";
import { Wordmark } from "./Logo";
import { OfflineBadge } from "./OfflineBadge";

const NAV = [
  { to: "/", label: "Home", Icon: Home, end: true },
  { to: "/scan", label: "Scan", Icon: ScanLine, end: false },
  { to: "/settings", label: "Settings", Icon: Settings, end: false },
];

export function AppShell() {
  const [needRefresh, setNeedRefresh] = useState(false);
  useEffect(() => subscribeServiceWorker((s) => setNeedRefresh(s.needRefresh)), []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-forest text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
          <Link to="/" aria-label="CARRY home" className="rounded-control">
            <Wordmark onDark />
          </Link>
          <OfflineBadge />
        </div>
      </header>

      {!window.isSecureContext && (
        <div className="bg-alert px-4 py-2 text-center text-sm text-white" role="alert">
          This page is not on a secure connection. Open CARRY from HTTPS or localhost to use encryption, the camera
          and offline mode.
        </div>
      )}

      {needRefresh && (
        <div className="bg-amber px-4 py-2 text-center text-sm text-ink">
          A new version of CARRY is cached.{" "}
          <button type="button" className="font-semibold underline" onClick={applyServiceWorkerUpdate}>
            Reload to update
          </button>
        </div>
      )}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-5">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-3">
          {NAV.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                    isActive ? "text-teal-dark" : "text-sage-dark"
                  }`
                }
              >
                <Icon size={22} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) {
  return (
    <div className="mb-4">
      {back && (
        <Link to={back} className="mb-2 inline-block text-sm font-semibold text-forest underline-offset-2 hover:underline">
          ← Back
        </Link>
      )}
      <h1 className="text-2xl text-forest">{title}</h1>
      {subtitle && <p className="mt-1 muted">{subtitle}</p>}
    </div>
  );
}
