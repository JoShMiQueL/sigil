import type { SSEEventType } from "@sigilpanel/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AuthContext } from "../middleware/auth";
import { addSubscriber, removeSubscriber } from "../services/sse.service";

const sseApp = new Hono<AuthContext>();

sseApp.get("/sse", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  }

  return streamSSE(c, async (stream) => {
    let aborted = false;

    const subscriber = addSubscriber({
      userId: user.id,
      role: user.role,
      send: (event: { type: SSEEventType; payload: unknown; timestamp: string }) => {
        if (aborted) return;
        try {
          stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.payload),
            id: event.timestamp,
          });
        } catch {
          aborted = true;
        }
      },
      close: () => {
        aborted = true;
      },
    });

    try {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ connectionId: subscriber.id, userId: user.id }),
        id: new Date().toISOString(),
      });

      const heartbeat = setInterval(() => {
        if (aborted) return;
        try {
          stream.writeSSE({ data: "heartbeat" });
        } catch {
          aborted = true;
        }
      }, 15000);

      stream.onAbort(() => {
        aborted = true;
        clearInterval(heartbeat);
        removeSubscriber(subscriber.id);
      });

      while (!aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      clearInterval(heartbeat);
      removeSubscriber(subscriber.id);
    } catch {
      aborted = true;
      removeSubscriber(subscriber.id);
    }
  });
});

export default sseApp;
