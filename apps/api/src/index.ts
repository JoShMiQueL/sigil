import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { type AuthContext, authMiddleware } from "./middleware/auth";
import authRoutes from "./routes/auth";

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

export default app;
