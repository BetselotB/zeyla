import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { createAppRouter } from "./app.js";
import { env } from "./config/env.js";
import { captureRawBody } from "./lib/raw-body.js";
import { errorMiddleware, fail } from "./lib/respond.js";
import { attachRealtime } from "./modules/realtime/socket.js";

/**
 * Built PWA, when this process is the single-service deploy that serves both
 * halves. Resolves to apps/web/dist from either src/ (tsx) or dist/ (node).
 */
const webDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/dist",
);
const serveWeb = existsSync(path.join(webDist, "index.html"));

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
// 12mb: base64 KYC images inflate ~33%. verify keeps the raw bytes so payment
// webhooks can be HMAC-checked against exactly what was sent.
app.use(express.json({ limit: "12mb", verify: captureRawBody }));
app.use("/api", createAppRouter());
// Unmatched /api paths answer in the envelope even when the SPA fallback below
// is live, so a typo'd endpoint never resolves to index.html.
app.use("/api", (_req, res) => res.status(404).json(fail("not_found")));

if (serveWeb) {
  app.use(
    express.static(webDist, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything under assets/, so those are safe to pin
        // forever. The shell and the service worker must revalidate or clients
        // stay pinned to the build they first installed.
        res.setHeader(
          "Cache-Control",
          filePath.includes(`${path.sep}assets${path.sep}`)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    }),
  );
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.use((_req, res) => res.status(404).json(fail("not_found")));
app.use(errorMiddleware);

const server = http.createServer(app);
attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(`Zeyla API listening on http://localhost:${env.PORT}`);
  console.log(`  health → http://localhost:${env.PORT}/api/health`);
  console.log(`  demoMode=${env.DEMO_MODE}`);
  console.log(`  web=${serveWeb ? webDist : "not built (API only)"}`);
});
