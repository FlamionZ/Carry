/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

// Content Security Policy. The app uses no inline scripts, inline styles or eval.
// It is not applied during `vite dev`, which needs an inline React-refresh preamble.
const CSP_DIRECTIVES = [
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
];
// Browsers ignore frame-ancestors in a <meta> CSP (and warn), so only the header carries it.
// The <meta> copy protects hosts that cannot set headers.
const META_CSP = CSP_DIRECTIVES.join("; ");
const HEADER_CSP = [...CSP_DIRECTIVES, "frame-ancestors 'none'"].join("; ");

/**
 * Response headers for every file. Written to dist/_headers (read by Netlify
 * and Cloudflare Pages) and applied by `vite preview`, so the browser tests run
 * with the production headers. HSTS is left to the host.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": HEADER_CSP,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

/** Hashed assets never change; the service worker script must always be revalidated. */
const CACHE_RULES: [path: string, cacheControl: string][] = [
  ["/assets/*", "public, max-age=31536000, immutable"],
  ["/sw.js", "no-cache"],
];

function productionHeaders(): Plugin {
  const block = (path: string, headers: Record<string, string>) =>
    [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join("\n");
  return {
    name: "carry-production-headers",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${META_CSP}" />`);
    },
    generateBundle() {
      const rules = [
        block("/*", SECURITY_HEADERS),
        ...CACHE_RULES.map(([path, cacheControl]) => block(path, { "Cache-Control": cacheControl })),
      ];
      this.emitFile({ type: "asset", fileName: "_headers", source: `${rules.join("\n\n")}\n` });
    },
  };
}

function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/** e.g. "0.1.0+968af49"; ".dirty" marks a local build with uncommitted changes. */
function buildVersion(): string {
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  // Netlify, Cloudflare Pages and GitHub Actions build a clean checkout and expose its SHA.
  const hostSha = process.env.COMMIT_REF || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || undefined;
  const sha = (hostSha ?? git("rev-parse HEAD"))?.slice(0, 7);
  if (!sha) return version;
  const dirty = !hostSha && git("status --porcelain") ? ".dirty" : "";
  return `${version}+${sha}${dirty}`;
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    productionHeaders(),
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
        // txt: the third-party license file linked from Settings.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest,txt}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        // The first visit becomes offline-ready without a reload. Updates still
        // wait for the user ("Reload to update"), because skipWaiting stays off.
        clientsClaim: true,
        // No runtime caching: the app never calls the network for core data.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    // Licenses of every bundled dependency, served at /licenses.txt.
    license: { fileName: "licenses.txt" },
    rolldownOptions: {
      output: {
        // Vendor groups change rarely, so an app update re-downloads only the app chunk.
        // "qr" is loaded on demand: only screens that show or scan QR codes need it.
        codeSplitting: {
          groups: [
            { name: "qr", test: /node_modules[\\/](@zxing|qrcode)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: "data", test: /node_modules[\\/](dexie|dexie-react-hooks|zod)[\\/]/ },
          ],
        },
      },
    },
  },
  server: { host: true },
  preview: { headers: SECURITY_HEADERS },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
}));
