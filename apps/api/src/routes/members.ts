import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@sigil/db";
import {
  AddMemberInputSchema,
  TransferOwnershipInputSchema,
  UpdateMemberPermissionsInputSchema,
} from "@sigil/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import {
  addMember,
  listMembers,
  removeMember,
  transferOwnership,
  updateMemberPermissions,
} from "../services/member.service";

const members = new Hono<AuthContext>();

// Permission guard: admin OR member with "members" permission
members.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Admins bypass
  if (user.role === "admin") {
    await next();
    return;
  }

  // Check member permission
  const serverId = c.req.param("serverId");
  if (!serverId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId" } }, 400);
  }

  const [member] = await db
    .select({
      role: schema.serverMembers.role,
      canMembers: schema.serverMembers.canMembers,
    })
    .from(schema.serverMembers)
    .where(eq(schema.serverMembers.userId, user.id))
    .limit(1);

  if (!member) {
    return c.json({ error: { code: "FORBIDDEN", message: "Not a member of this server" } }, 403);
  }

  if (member.role === "owner" || member.canMembers) {
    await next();
    return;
  }

  return c.json({ error: { code: "FORBIDDEN", message: "Missing permission: members" } }, 403);
});

// List members
members.get("/", async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId" } }, 400);
  }
  const memberList = await listMembers(serverId);
  return c.json({ members: memberList, total: memberList.length }, 200);
});

// Add member
members.post("/", zValidator("json", AddMemberInputSchema), async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId" } }, 400);
  }
  const input = c.req.valid("json");
  const user = c.get("user");

  const result = await addMember(serverId, input.email, input.permissions);

  if ("error" in result) {
    const status =
      result.code === "USER_NOT_FOUND" || result.code === "DUPLICATE_MEMBER" ? 400 : 500;
    return c.json({ error: { code: result.code, message: result.error } }, status as 400 | 500);
  }

  await logAudit({
    userId: user?.id,
    action: "member_add",
    targetType: "server",
    targetId: serverId,
    metadata: { memberId: result.id, email: input.email },
  });

  return c.json(result, 201);
});

// Update member permissions
members.put("/:memberId", zValidator("json", UpdateMemberPermissionsInputSchema), async (c) => {
  const serverId = c.req.param("serverId");
  const memberId = c.req.param("memberId");
  if (!serverId || !memberId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId or memberId" } }, 400);
  }
  const input = c.req.valid("json");
  const user = c.get("user");

  const result = await updateMemberPermissions(memberId, input.permissions);

  if ("error" in result) {
    const status =
      result.code === "MEMBER_NOT_FOUND" ? 404 : result.code === "CANNOT_MODIFY_OWNER" ? 403 : 500;
    return c.json(
      { error: { code: result.code, message: result.error } },
      status as 403 | 404 | 500,
    );
  }

  await logAudit({
    userId: user?.id,
    action: "member_update",
    targetType: "server",
    targetId: serverId,
    metadata: { memberId, permissions: input.permissions },
  });

  return c.json(result, 200);
});

// Remove member
members.delete("/:memberId", async (c) => {
  const serverId = c.req.param("serverId");
  const memberId = c.req.param("memberId");
  if (!serverId || !memberId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId or memberId" } }, 400);
  }
  const user = c.get("user");

  const result = await removeMember(memberId);

  if ("error" in result) {
    const status =
      result.code === "MEMBER_NOT_FOUND" ? 404 : result.code === "CANNOT_REMOVE_OWNER" ? 403 : 500;
    return c.json(
      { error: { code: result.code, message: result.error } },
      status as 403 | 404 | 500,
    );
  }

  await logAudit({
    userId: user?.id,
    action: "member_remove",
    targetType: "server",
    targetId: serverId,
    metadata: { memberId },
  });

  return c.json({ ok: true }, 200);
});

// Transfer ownership (admin OR owner only)
members.post("/transfer", zValidator("json", TransferOwnershipInputSchema), async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId" } }, 400);
  }
  const input = c.req.valid("json");
  const user = c.get("user");

  // Only admin or current owner can transfer
  if (user && user.role !== "admin") {
    const [ownerCheck] = await db
      .select({ role: schema.serverMembers.role })
      .from(schema.serverMembers)
      .where(
        and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, user.id)),
      )
      .limit(1);

    if (!ownerCheck?.role || ownerCheck.role !== "owner") {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Only the owner or admin can transfer ownership" } },
        403,
      );
    }
  }

  const result = await transferOwnership(serverId, input.newOwnerId);

  if ("error" in result) {
    const status =
      result.code === "MEMBER_NOT_FOUND" || result.code === "SERVER_NOT_FOUND"
        ? 404
        : result.code === "ALREADY_OWNER"
          ? 400
          : 500;
    return c.json(
      { error: { code: result.code, message: result.error } },
      status as 400 | 404 | 500,
    );
  }

  await logAudit({
    userId: user?.id,
    action: "member_transfer",
    targetType: "server",
    targetId: serverId,
    metadata: { newOwnerId: input.newOwnerId },
  });

  return c.json({ ok: true }, 200);
});

export default members;
