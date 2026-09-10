import { db, schema } from "@sigilpanel/db";
import type { Group, GroupCreate, GroupUpdate } from "@sigilpanel/shared";
import { count, eq } from "drizzle-orm";
import { emit } from "./sse.service";

function toGroup(row: typeof schema.groups.$inferSelect): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createGroup(input: GroupCreate): Promise<Group> {
  const [row] = await db
    .insert(schema.groups)
    .values({
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
    })
    .returning();

  const group = toGroup(row);
  emit("group.create", group);
  return group;
}

export async function listGroups(): Promise<Group[]> {
  const rows = await db.select().from(schema.groups).orderBy(schema.groups.createdAt);
  return rows.map(toGroup);
}

export async function getGroupById(id: string): Promise<Group | null> {
  const [row] = await db.select().from(schema.groups).where(eq(schema.groups.id, id)).limit(1);
  return row ? toGroup(row) : null;
}

export async function updateGroup(id: string, input: GroupUpdate): Promise<Group | null> {
  const updates: Partial<typeof schema.groups.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description ?? null;
  if (input.icon !== undefined) updates.icon = input.icon ?? null;

  const [row] = await db
    .update(schema.groups)
    .set(updates)
    .where(eq(schema.groups.id, id))
    .returning();

  if (!row) return null;
  const group = toGroup(row);
  emit("group.update", group);
  return group;
}

export async function deleteGroup(id: string): Promise<{ ok: true } | { error: string }> {
  const [templateCount] = await db
    .select({ value: count() })
    .from(schema.templates)
    .where(eq(schema.templates.groupId, id));

  if ((templateCount?.value ?? 0) > 0) {
    return { error: "Cannot delete a group that contains templates" };
  }

  const [deleted] = await db
    .delete(schema.groups)
    .where(eq(schema.groups.id, id))
    .returning({ id: schema.groups.id });

  if (!deleted) return { error: "Group not found" };

  emit("group.delete", { id, deleted: true });
  return { ok: true };
}
