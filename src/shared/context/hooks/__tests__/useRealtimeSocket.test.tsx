import React from "react";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { useRealtimeSocket } from "../useRealtimeSocket";

jest.mock("../../../services/appMode", () => ({
  isServerless: jest.fn().mockResolvedValue(false),
  onAppModeChange: { subscribe: () => () => {} },
}));

jest.mock("../../../services/config", () => ({
  getServerUrl: () => "https://server.test",
  assertSecureTransport: () => {},
}));

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

type Props = { token: string | null; accountId?: string | null };

const seen: { current?: ReturnType<typeof useRealtimeSocket> } = {};
function Harness({ token, accountId = "u1" }: Props) {
  seen.current = useRealtimeSocket({ token, accountId });
  return null;
}

const originalWebSocket = global.WebSocket;
let renderer: ReactTestRenderer;

async function mount(props: Props) {
  await act(async () => {
    renderer = create(<Harness {...props} />);
  });
}

async function rerender(props: Props) {
  await act(async () => {
    renderer.update(<Harness {...props} />);
  });
}

beforeEach(() => {
  FakeSocket.instances = [];
  global.WebSocket = FakeSocket as unknown as typeof WebSocket;
  jest.spyOn(console, "debug").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  act(() => renderer?.unmount());
  global.WebSocket = originalWebSocket;
  jest.restoreAllMocks();
});

describe("useRealtimeSocket", () => {
  it("authenticates with the token as the first message, not in the URL", async () => {
    await mount({ token: "t1" });
    const [ws] = FakeSocket.instances;
    act(() => ws.open());

    expect(ws.url).toBe("wss://server.test/ws");
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "auth", token: "t1" });
    expect(seen.current?.connected).toBe(true);
  });

  it("keeps the open socket when the token is refreshed", async () => {
    await mount({ token: "t1" });
    const [ws] = FakeSocket.instances;
    act(() => ws.open());

    await rerender({ token: "t2" });

    expect(FakeSocket.instances).toHaveLength(1);
    expect(ws.readyState).toBe(FakeSocket.OPEN);
    expect(seen.current?.connected).toBe(true);
    expect(JSON.parse(ws.sent[1])).toEqual({ type: "auth.refresh", token: "t2" });
  });

  it("reconnects with the new token when a server that ignored the refresh expires the old one", async () => {
    jest.useFakeTimers();
    try {
      await mount({ token: "t1" });
      const [ws] = FakeSocket.instances;
      act(() => ws.open());
      await rerender({ token: "t2" });

      act(() => ws.close(4001, "Unauthorized: Token expired"));
      act(() => jest.advanceTimersByTime(0));

      expect(seen.current?.authError).toBe(false);
      expect(FakeSocket.instances).toHaveLength(2);
      act(() => FakeSocket.instances[1].open());
      expect(JSON.parse(FakeSocket.instances[1].sent[0])).toEqual({ type: "auth", token: "t2" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("treats a close after an acknowledged refresh as a rejection of that token", async () => {
    await mount({ token: "t1" });
    const [ws] = FakeSocket.instances;
    act(() => ws.open());
    await rerender({ token: "t2" });
    act(() => ws.onmessage?.({ data: JSON.stringify({ type: "auth.refreshed" }) }));

    act(() => ws.close(4001, "Unauthorized: Token has been revoked"));

    expect(seen.current?.authError).toBe(true);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("does not pass the refresh acknowledgement to subscribers", async () => {
    await mount({ token: "t1" });
    const [ws] = FakeSocket.instances;
    act(() => ws.open());
    const handler = jest.fn();
    act(() => {
      seen.current!.subscribe(handler);
    });
    await rerender({ token: "t2" });
    act(() => ws.onmessage?.({ data: JSON.stringify({ type: "auth.refreshed" }) }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("reopens the socket when the account changes", async () => {
    await mount({ token: "t1", accountId: "u1" });
    const [first] = FakeSocket.instances;
    act(() => first.open());

    await rerender({ token: "t2", accountId: "u2" });

    expect(first.readyState).toBe(FakeSocket.CLOSED);
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => FakeSocket.instances[1].open());
    expect(JSON.parse(FakeSocket.instances[1].sent[0]).token).toBe("t2");
  });

  it("stops retrying a rejected token and reconnects once a new one arrives", async () => {
    await mount({ token: "bad" });
    const [ws] = FakeSocket.instances;
    act(() => ws.open());
    act(() => ws.close(4001, "invalid token"));

    expect(seen.current?.authError).toBe(true);
    expect(FakeSocket.instances).toHaveLength(1);

    await rerender({ token: "good" });

    expect(seen.current?.authError).toBe(false);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("disconnects when the token is cleared", async () => {
    await mount({ token: "t1" });
    const [ws] = FakeSocket.instances;
    act(() => ws.open());

    await rerender({ token: null });

    expect(ws.readyState).toBe(FakeSocket.CLOSED);
    expect(seen.current?.connected).toBe(false);
  });

  it("schedules a backoff retry after an unexpected close", async () => {
    jest.useFakeTimers();
    try {
      await mount({ token: "t1" });
      const [ws] = FakeSocket.instances;
      act(() => ws.open());
      act(() => ws.close(1006, "network"));
      expect(FakeSocket.instances).toHaveLength(1);

      act(() => jest.advanceTimersByTime(60_000));

      expect(FakeSocket.instances.length).toBeGreaterThan(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
