import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock EventSource
type EventSourceListener = (event: MessageEvent) => void;
class MockEventSource {
  static instances: MockEventSource[] = [];
  static lastInstance: MockEventSource | null = null;

  url: string;
  listeners = new Map<string, EventSourceListener>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    MockEventSource.lastInstance = this;
  }

  addEventListener(type: string, listener: EventSourceListener): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  simulateEvent(type: string, data: unknown): void {
    const listener = this.listeners.get(type);
    if (listener) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
}

vi.stubGlobal("EventSource", MockEventSource);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useSSE event dispatch", () => {
  let useSSE: typeof import("./useSSE").useSSE;

  beforeEach(async () => {
    vi.resetModules();
    MockEventSource.instances = [];
    MockEventSource.lastInstance = null;
    vi.stubGlobal("EventSource", MockEventSource);
    const mod = await import("./useSSE");
    useSSE = mod.useSSE;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches events to registered handlers with correct payload", async () => {
    const nodeHandler = vi.fn();
    const regionHandler = vi.fn();

    const { unmount } = renderHook(
      () =>
        useSSE({
          handlers: {
            "node.update": nodeHandler,
            "region.update": regionHandler,
          },
        }),
      { wrapper: createWrapper() },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const es = MockEventSource.lastInstance;
    expect(es).not.toBeNull();

    const nodePayload = { id: "node-1", status: "online" };
    const regionPayload = { id: "region-1", name: "EU" };

    es!.simulateEvent("node.update", nodePayload);
    es!.simulateEvent("region.update", regionPayload);

    expect(nodeHandler).toHaveBeenCalledWith(nodePayload);
    expect(regionHandler).toHaveBeenCalledWith(regionPayload);

    unmount();
  });

  it("silently ignores events with no registered handler", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = renderHook(() => useSSE({ handlers: { "node.update": vi.fn() } }), {
      wrapper: createWrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const es = MockEventSource.lastInstance;
    expect(es).not.toBeNull();
    es!.simulateEvent("user.update", { id: "user-1" });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    unmount();
  });

  it("triggers query invalidation on registered event types", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { unmount } = renderHook(
      () =>
        useSSE({
          invalidations: {
            "node.update": [["nodes"]],
          },
        }),
      { wrapper: Wrapper },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const es = MockEventSource.lastInstance;
    expect(es).not.toBeNull();
    es!.simulateEvent("node.update", { id: "node-1" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["nodes"] });

    unmount();
    invalidateSpy.mockRestore();
  });

  it("handles multiple handlers for the same event type", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { unmount } = renderHook(
      () =>
        useSSE({
          handlers: { "node.update": handler1 },
        }),
      { wrapper: createWrapper() },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const { unmount: unmount2 } = renderHook(
      () =>
        useSSE({
          handlers: { "node.update": handler2 },
        }),
      { wrapper: createWrapper() },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const es = MockEventSource.lastInstance;
    expect(es).not.toBeNull();
    const payload = { id: "node-1" };
    es!.simulateEvent("node.update", payload);

    expect(handler1).toHaveBeenCalledWith(payload);
    expect(handler2).toHaveBeenCalledWith(payload);

    unmount();
    unmount2();
  });
});
