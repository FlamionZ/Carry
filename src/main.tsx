import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./app/styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { DeviceProvider } from "./app/providers/DeviceProvider";
import { AppRoutes } from "./app/routes/AppRoutes";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerServiceWorker } from "./infrastructure/pwa/register";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Last resort for errors outside a screen; screens have their own boundary in AppShell. */}
    <ErrorBoundary>
      <DeviceProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </DeviceProvider>
    </ErrorBoundary>
  </StrictMode>,
);
