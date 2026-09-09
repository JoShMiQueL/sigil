import { afterEach, describe, expect, it } from "vitest";
import {
  addSubscriber,
  emit,
  getSubscriberCount,
  removeSubscriber,
  shutdownSSE,
} from "./sse.service";

describe("sse.service", () => {
  afterEach(() => {
    shutdownSSE();
  });

  it("addSubscriber registers and returns a subscriber with id", () => {
    const sub = addSubscriber({
      userId: "user-1",
      role: "admin",
      send: () => {},
      close: () => {},
    });
    expect(sub.id).toBeDefined();
    expect(getSubscriberCount()).toBe(1);
    removeSubscriber(sub.id);
    expect(getSubscriberCount()).toBe(0);
  });

  it("emit delivers events to admin subscribers", () => {
    const received: string[] = [];
    const sub = addSubscriber({
      userId: "user-1",
      role: "admin",
      send: (event) => received.push(event.type),
      close: () => {},
    });
    emit("node.create", { id: "test", test: true });
    expect(received).toContain("node.create");
    removeSubscriber(sub.id);
  });

  it("emit does not deliver to non-admin subscribers", () => {
    const received: string[] = [];
    const sub = addSubscriber({
      userId: "user-1",
      role: "user",
      send: (event) => received.push(event.type),
      close: () => {},
    });
    emit("node.create", { id: "test" });
    expect(received).toHaveLength(0);
    removeSubscriber(sub.id);
  });

  it("node.update events are debounced (max 1/sec per node)", async () => {
    const received: number[] = [];
    const sub = addSubscriber({
      userId: "user-1",
      role: "admin",
      send: (event) => {
        if (event.type === "node.update") received.push(Date.now());
      },
      close: () => {},
    });

    const nodeId = "node-debounce-test";
    emit("node.update", { id: nodeId, cpuUsage: 10 });
    emit("node.update", { id: nodeId, cpuUsage: 20 });
    emit("node.update", { id: nodeId, cpuUsage: 30 });

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(received).toHaveLength(1);
    removeSubscriber(sub.id);
  });

  it("non-node events are not debounced", () => {
    const received: string[] = [];
    const sub = addSubscriber({
      userId: "user-1",
      role: "admin",
      send: (event) => received.push(event.type),
      close: () => {},
    });
    emit("region.update", { id: "r1", name: "test" });
    emit("user.update", { id: "u1" });
    expect(received).toContain("region.update");
    expect(received).toContain("user.update");
    removeSubscriber(sub.id);
  });

  it("removeSubscriber prevents further events", () => {
    const received: string[] = [];
    const sub = addSubscriber({
      userId: "user-1",
      role: "admin",
      send: (event) => received.push(event.type),
      close: () => {},
    });
    removeSubscriber(sub.id);
    emit("node.create", { id: "test" });
    expect(received).toHaveLength(0);
  });
});
