import { safeFqdn, safePort, scanForLanServer } from "../lanDiscovery";

type Handler = (payload?: unknown) => void;

const mockInstances: MockZeroconf[] = [];
let mockScanThrows = false;

class MockZeroconf {
  handlers: Record<string, Handler> = {};
  scan = jest.fn(() => {
    if (mockScanThrows) throw new Error("no native module");
  });
  stop = jest.fn();
  removeAllListeners = jest.fn();
  constructor() {
    mockInstances.push(this);
  }
  on(event: string, handler: Handler) {
    this.handlers[event] = handler;
  }
}

jest.mock("react-native-zeroconf", () => ({
  __esModule: true,
  default: jest.fn(() => new MockZeroconf()),
}));
jest.mock("../crashReporting", () => ({
  log: { warn: jest.fn() },
  metric: { distribution: jest.fn() },
}));

beforeEach(() => {
  mockInstances.length = 0;
  mockScanThrows = false;
  jest.useFakeTimers();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const service = (overrides: Record<string, unknown> = {}) => ({
  name: "owngains",
  host: "box.local",
  port: 3000,
  addresses: ["fe80::1", "192.168.1.20"],
  txt: { fqdn: "owngains.example.com" },
  ...overrides,
});

describe("safeFqdn / safePort", () => {
  it("accepts a bare hostname and rejects anything that could reshape the URL", () => {
    expect(safeFqdn("owngains.example.com.")).toBe("owngains.example.com.");
    for (const bad of ["evil.com@good.com", "host:8080", "host/path", "a..b", "-bad.com", "", null, undefined])
      expect(safeFqdn(bad)).toBeNull();
    expect(safeFqdn(`${"a".repeat(63)}.`.repeat(4) + "com")).toBeNull();
  });

  it("accepts only integer ports in range", () => {
    expect(safePort(443)).toBe(443);
    for (const bad of [0, 65536, 3.5, "443", null]) expect(safePort(bad)).toBeNull();
  });
});

describe("scanForLanServer", () => {
  it("resolves the first private IPv4 advertisement and tears the scan down", async () => {
    const result = scanForLanServer();
    const zc = mockInstances[0];
    zc.handlers.resolved(service());
    await expect(result).resolves.toEqual({ ip: "192.168.1.20", port: 3000, fqdn: "owngains.example.com" });
    expect(zc.stop).toHaveBeenCalled();
    expect(zc.removeAllListeners).toHaveBeenCalled();
  });

  it("ignores public, IPv6-only and bad-port advertisements, then times out", async () => {
    const result = scanForLanServer();
    const zc = mockInstances[0];
    zc.handlers.resolved(service({ addresses: ["8.8.8.8"] }));
    zc.handlers.resolved(service({ addresses: ["fe80::1"] }));
    zc.handlers.resolved(service({ port: 70000 }));
    jest.advanceTimersByTime(4000);
    await expect(result).resolves.toBeNull();
  });

  it("drops an unsafe fqdn but keeps the server", async () => {
    const result = scanForLanServer();
    mockInstances[0].handlers.resolved(service({ txt: { fqdn: "evil.com@good.com" } }));
    await expect(result).resolves.toMatchObject({ ip: "192.168.1.20", fqdn: null });
  });

  it("resolves null at once, with no timer left behind, when the scan fails to start", async () => {
    mockScanThrows = true;
    await expect(scanForLanServer()).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
    expect(mockInstances[0].removeAllListeners).toHaveBeenCalled();
  });
});
