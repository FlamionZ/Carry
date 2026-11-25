import { Home, ScanLine, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { applyServiceWorkerUpdate, subscribeServiceWorker } from "../infrastructure/pwa/register";
import { ErrorBoundary } from "./ErrorBoundary";
import { Wordmark } from "./Logo";
import { OfflineBadge } from "./OfflineBadge";

const NAV = [
  { to: "/", label: "Home", Icon: Home, end: true },
  { to: "/scan", label: "Scan", Icon: ScanLine, end: false },
  { to: "/settings", label: "Settings", Icon: Settings, end: false },
];

export function AppShell() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => subscribeServiceWorker((s) => setNeedRefresh(s.needRefresh)), []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-brand text-on-brand">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
          <Link to="/" aria-label="CARRY home" className="rounded-control">
            <Wordmark onDark />
          </Link>
          <OfflineBadge />
        </div>
      </header>

      {!window.isSecureContext && (
        <div className="bg-danger px-4 py-2 text-center text-sm text-on-danger" role="alert">
          This page is not on a secure connection. Open CARRY from HTTPS or localhost to use encryption, the camera
          and offline mode.
        </div>
      )}

      {/* Floats above the navigation so it never shifts the page under a finger. */}
      {needRefresh && (
        <div
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 pb-2"
          role="status"
        >
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-control bg-signal px-4 py-2 text-sm text-on-signal shadow-md">
            <span>A new version of CARRY is cached.</span>
            <button
              type="button"
              className="min-h-11 shrink-0 font-semibold underline"
              onClick={applyServiceWorkerUpdate}
            >
              Reload to update
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-5">
        {/* Keyed on the path: navigating away from a failed screen shows the new screen normally. */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line/30 bg-surface pb-[env(safe-area-inset-bottom)]"
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
                    isActive ? "text-accent" : "text-muted"
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
