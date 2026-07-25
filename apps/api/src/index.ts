import http from "node:http";
import cors from "cors";
import express from "express";
import { createAppRouter } from "./app.js";
import { env } from "./config/env.js";
import { captureRawBody } from "./lib/raw-body.js";
import { errorMiddleware, fail } from "./lib/respond.js";
import { attachRealtime } from "./modules/realtime/socket.js";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
// 12mb: base64 KYC images inflate ~33%. verify keeps the raw bytes so payment
// webhooks can be HMAC-checked against exactly what was sent.
app.use(express.json({ limit: "12mb", verify: captureRawBody }));
app.use("/api", createAppRouter());
app.use((_req, res) => res.status(404).json(fail("not_found")));
app.use(errorMiddleware);

const server = http.createServer(app);
attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(`Zeyla API listening on http://localhost:${env.PORT}`);
  console.log(`  health → http://localhost:${env.PORT}/api/health`);
  console.log(`  demoMode=${env.DEMO_MODE}`);
});
