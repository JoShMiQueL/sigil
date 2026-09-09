import { zValidator } from "@hono/zod-validator";
import { UserCreateSchema, UserUpdateSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import {
  createUser,
  getUserById,
  listUsers,
  suspendUser,
  updateUser,
} from "../services/user.service";

const users = new Hono<AuthContext>();

// Admin-only guard
users.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

users.post("/", zValidator("json", UserCreateSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    const user = await createUser(input);
    return c.json({ user }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      return c.json({ error: "Email or username already exists" }, 409);
    }
    throw err;
  }
});

users.get("/", async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 100);
  const search = c.req.query("search") ?? undefined;

  const result = await listUsers({ page, limit, search });
  return c.json(result);
});

users.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = await getUserById(id);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ user });
});

users.patch("/:id", zValidator("json", UserUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  if (input.status === "suspended") {
    const currentUserId = c.get("user")?.id;
    if (!currentUserId) return c.json({ error: "Unauthorized" }, 401);

    const result = await suspendUser(id, currentUserId);
    if ("error" in result) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ user: result.user });
  }

  const user = await updateUser(id, input);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ user });
});

export default users;
