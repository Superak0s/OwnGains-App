jest.mock("@shared/services/apiClient", () => ({
  apiCall: jest.fn(),
  parseApiResponse: jest.fn((res: { body: unknown }) => Promise.resolve(res.body)),
}));
jest.mock("@shared/services/authenticatedFetch", () => ({
  authenticatedFetch: jest.fn(),
}));

import { apiCall } from "@shared/services/apiClient";
import { authenticatedFetch } from "@shared/services/authenticatedFetch";
import { sharingApi } from "../sharing";

const mockApiCall = apiCall as jest.Mock;
const mockFetch = authenticatedFetch as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("getFriendSessionsWithTimings", () => {
  it("returns the sessions when every one has its set timings", async () => {
    const sessions = [{ id: 1, setTimings: [] }, { id: 2, setTimings: [{}] }];
    mockApiCall.mockResolvedValueOnce({ sessions });
    await expect(sharingApi.getFriendSessionsWithTimings("f1", 60)).resolves.toBe(sessions);
    expect(mockApiCall).toHaveBeenCalledWith(
      "/api/sharing/sessions/friend/f1?limit=60&includeTimings=true",
    );
  });

  it("returns null from a server that ignores includeTimings", async () => {
    mockApiCall.mockResolvedValueOnce({ sessions: [{ id: 1 }] });
    await expect(sharingApi.getFriendSessionsWithTimings("f1")).resolves.toBeNull();
  });
});

describe("getFriendSessionStatuses", () => {
  it("maps every requested friend, defaulting omitted ones to inactive", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      body: { statuses: { a: { hasActiveSession: true } } },
    });
    await expect(sharingApi.getFriendSessionStatuses(["a", "b"])).resolves.toEqual({
      a: true,
      b: false,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/sharing/joint-sessions/status?friendIds=a,b",
    );
  });

  it("returns null from a server without the batch route", async () => {
    mockFetch.mockResolvedValueOnce({ status: 404 });
    await expect(sharingApi.getFriendSessionStatuses(["a"])).resolves.toBeNull();
  });
});

describe("getReceivedPermissions", () => {
  it("fetches each payload the server left out of the list", async () => {
    mockApiCall
      .mockResolvedValueOnce({
        permissions: [
          { id: 1, permissionType: "program", payload: { programData: {} }, hasPayload: true },
          { id: 2, permissionType: "program", payload: null, hasPayload: true },
          { id: 3, permissionType: "history", payload: null, hasPayload: false },
        ],
      })
      .mockResolvedValueOnce({ success: true, payload: { programData: { name: "P" } } });

    const received = await sharingApi.getReceivedPermissions();

    expect(mockApiCall).toHaveBeenNthCalledWith(
      1,
      "/api/sharing/permissions/received?includePayload=true",
    );
    expect(mockApiCall).toHaveBeenNthCalledWith(2, "/api/sharing/permissions/2/payload");
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(received.map((p) => p.payload)).toEqual([
      { programData: {} },
      { programData: { name: "P" } },
      null,
    ]);
  });

  it("treats an inlined payload from an older server as present", async () => {
    mockApiCall.mockResolvedValueOnce({
      permissions: [{ id: 1, permissionType: "program", payload: { programData: {} } }],
    });
    const [permission] = await sharingApi.getReceivedPermissions();
    expect(permission.hasPayload).toBe(true);
    expect(mockApiCall).toHaveBeenCalledTimes(1);
  });

  it("keeps the rest of the list when one payload can't be fetched", async () => {
    mockApiCall
      .mockResolvedValueOnce({
        permissions: [{ id: 2, permissionType: "program", payload: null, hasPayload: true }],
      })
      .mockRejectedValueOnce(new Error("404"));
    const [permission] = await sharingApi.getReceivedPermissions();
    expect(permission.payload).toBeNull();
  });
});
