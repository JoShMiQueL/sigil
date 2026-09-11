# Data Model: Server Lifecycle (R9)

## New Table: `servers`

```sql
CREATE TABLE servers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  node_id      UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  template_id  UUID REFERENCES templates(id) ON DELETE SET NULL,
  allocation_id UUID REFERENCES allocations(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'offline',
  config       JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (node_id, name)
);
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | Server unique identifier |
| `name` | TEXT | User-facing name, unique per node |
| `node_id` | UUID FK → nodes | Which node this server runs on |
| `template_id` | UUID FK → templates (nullable) | Which template was used to create this server |
| `allocation_id` | UUID FK → allocations (nullable) | Primary allocation assigned to this server |
| `status` | TEXT | Server lifecycle state (see state machine below) |
| `config` | JSONB | Full `ServerConfiguration` sent to the daemon (image, startup, env, ports, limits, volume) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp (state changes, config changes) |

### Indexes

```sql
CREATE INDEX idx_servers_node_id ON servers(node_id);
CREATE INDEX idx_servers_status ON servers(status);
CREATE INDEX idx_servers_template_id ON servers(template_id);
CREATE UNIQUE INDEX idx_servers_node_name ON servers(node_id, name);
```

### Drizzle Schema (packages/db/src/schema/servers.ts)

```ts
import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { nodes } from "./nodes";
import { templates } from "./templates";
import { allocations } from "./allocations";

export const servers = pgTable(
  "servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: "set null" }),
    allocationId: uuid("allocation_id").references(() => allocations.id, { onDelete: "set null" }),
    status: text("status").notNull().default("offline"),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_servers_node_name").on(t.nodeId, t.name),
    index("idx_servers_node_id").on(t.nodeId),
    index("idx_servers_status").on(t.status),
    index("idx_servers_template_id").on(t.templateId),
  ],
);
```

## State Machine

```
                    ┌──────────┐
                    │  offline  │ ←── create (container created, not started)
                    └────┬─────┘
                         │ start
                         ▼
                    ┌──────────┐
        ┌───────────│ starting │
        │           └────┬─────┘
        │                │ daemon: running
        │                ▼
        │           ┌──────────┐
        │   restart │  running  │
        │           └────┬─────┘
        │                │ stop
        │                ▼
        │           ┌──────────┐
        └───────────│ stopping  │
                    └────┬─────┘
                         │ daemon: stopped
                         ▼
                    ┌──────────┐
                    │  stopped  │
                    └──────────┘

    Terminal states:
    ┌──────────┐     ┌─────────────────┐
    │ crashed  │     │ creation_failed │
    └──────────┘     └─────────────────┘
```

### Valid transitions

| From | Action | To |
|------|--------|----|
| (none) | create | offline |
| offline | start | starting |
| stopped | start | starting |
| crashed | start | starting |
| creation_failed | start | starting |
| starting | daemon: running | running |
| starting | daemon: crashed | crashed |
| running | stop | stopping |
| starting | stop | (rejected — 409) |
| stopping | daemon: stopped | stopped |
| stopping | daemon: running | running (race) |
| running | daemon: crashed | crashed |
| running | restart | stopping → starting |
| any | delete | (record deleted) |

### Daemon state mapping

| Daemon ContainerState | Panel status |
|----------------------|--------------|
| `creating` | `starting` |
| `running` | `running` |
| `stopped` | `stopped` |
| `crashed` | `crashed` |
| `removing` | `offline` (transient, then record deleted) |
| `missing` | `crashed` (container disappeared) |

## Shared Contracts (packages/shared/src/server/record.ts)

```ts
export const ServerStatusEnum = z.enum([
  "offline",
  "starting",
  "running",
  "stopping",
  "stopped",
  "crashed",
  "creation_failed",
]);

export const ServerRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  nodeId: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  allocationId: z.string().uuid().nullable(),
  status: ServerStatusEnum,
  config: ServerConfigurationSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ServerCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  nodeId: z.string().uuid(),
  templateId: z.string().uuid(),
  variables: z.record(z.string(), z.string()).default({}),
});

export const ServerListResponseSchema = z.object({
  servers: z.array(ServerRecordSchema),
  total: z.number().int(),
});

export const ServerPowerActionSchema = z.enum(["start", "stop", "restart"]);
```

## SSE Events (packages/shared/src/sse/events.ts)

New event types added:

```ts
"server.create"  // payload: { serverId, nodeId, name, status }
"server.update"  // payload: { serverId, nodeId, status, previousStatus }
"server.delete"  // payload: { serverId, nodeId, deleted: true }
```

## Validation Rules

- Server name: 1-100 chars, unique per node
- Node must exist and be online (daemon reachable) for creation
- Template must be active for creation
- Node must have available allocations for creation
- Power actions validated against current state (see state machine)
- Deletion requires daemon to be reachable (no orphaned containers)
