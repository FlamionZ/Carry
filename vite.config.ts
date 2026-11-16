/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

// Strict CSP for production builds only. The dev server needs an inline
// React-refresh preamble, so the policy is not applied during `vite dev`.
// The app uses no inline scripts or inline styles.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function productionCsp(): Plugin {
  return {
    name: "carry-production-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    productionCsp(),
    // `--mode https` serves dev/preview with a self-signed certificate so a phone
    // on the LAN gets a secure context for Web Crypto and the camera. Browsers
    // do not install service workers from untrusted certificates, so offline
    // mode still needs a real HTTPS host (see README).
    ...(mode === "https" ? [basicSsl()] : []),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: false, // we ship public/manifest.webmanifest ourselves
      includeAssets: ["icons/*.png", "icons/*.svg", "offline.html", "manifest.webmanifest"],
      workbox: {
        cacheId: "carry",
        // woff2 only: every browser that supports service workers also supports woff2.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        // No runtime caching: the app never calls the network for core data.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(
      `${process.env.npm_package_version ?? "0.0.0"}-${new Date().toISOString().slice(0, 10)}`,
    ),
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor groups change rarely, so an app update re-downloads only the app chunk.
        codeSplitting: {
          groups: [
            { name: "scanner", test: /node_modules[\\/]@zxing[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: "data", test: /node_modules[\\/](dexie|dexie-react-hooks|zod|qrcode)[\\/]/ },
          ],
        },
      },
    },
  },
  server: { host: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
}));
