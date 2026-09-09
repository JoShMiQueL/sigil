import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { type AuthContext, authMiddleware } from "./middleware/auth";
import { cspMiddleware } from "./middleware/security-headers";
import apiKeysRoutes from "./routes/api-keys";
import authRoutes from "./routes/auth";
import nodesRoutes from "./routes/nodes";
import { adminPairing, heartbeatApp, default as pairingRoutes } from "./routes/pairing";
import regionsRoutes from "./routes/regions";
import sseRoutes from "./routes/sse";
import testCleanupRoutes from "./routes/test-cleanup";
import usersRoutes from "./routes/users";

const app = new Hono<AuthContext>();

app.use(logger());
app.use(secureHeaders());
app.use(cspMiddleware);
app.use(
  cors({
    origin: process.env.PANEL_URL ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(authMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));

// Test-only cleanup endpoint — NEVER available in production
if (process.env.NODE_ENV !== "production") {
  app.route("/test", testCleanupRoutes);
}

app.route("/api/auth", authRoutes);
app.route("/api/admin/users", usersRoutes);
app.route("/api/admin/regions", regionsRoutes);
app.route("/api/admin/nodes", nodesRoutes);
app.route("/api/admin/pairing", adminPairing);
app.route("/api", pairingRoutes);
app.route("/api", heartbeatApp);
app.route("/api", sseRoutes);
app.route("/api/api-keys", apiKeysRoutes);

export default app;

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  import("@hono/node-server").then(({ serve }) => {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`API server running on http://localhost:${info.port}`);
    });
  });

  // Start heartbeat timeout sweep (every 30s)
  import("./services/heartbeat.service").then(({ startHeartbeatSweep }) => {
    startHeartbeatSweep(30);
  });

  // Start expired pairing token cleanup (every 5 min)
  import("./services/pairing.service").then(({ cleanupExpiredPairingTokens }) => {
    setInterval(
      () => {
        cleanupExpiredPairingTokens().catch((err) => {
          console.error("Failed to cleanup expired pairing tokens:", err);
        });
      },
      5 * 60 * 1000,
    );
  });
}
