import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { type AuthContext, authMiddleware } from "./middleware/auth";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";

const app = new Hono<AuthContext>();

app.use(logger());
app.use(secureHeaders());
app.use(
  cors({
    origin: process.env.PANEL_URL ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(authMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/auth", authRoutes);
app.route("/api/admin/users", usersRoutes);

export default app;

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  import("@hono/node-server").then(({ serve }) => {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`API server running on http://localhost:${info.port}`);
    });
  });
}
