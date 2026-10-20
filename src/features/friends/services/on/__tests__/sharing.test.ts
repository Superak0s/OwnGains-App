jest.mock("@shared/services/apiClient", () => ({
  apiCall: jest.fn(),
  parseApiResponse: jest.fn((res: { body: unknown }) => Promise.resolve(res.body)),
}));

import { apiCall } from "@shared/services/apiClient";
import { sharingApi } from "../sharing";

const mockApiCall = apiCall as jest.Mock;

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

});

describe("getFriendSessionStatuses", () => {
  it("maps every requested friend, defaulting omitted ones to inactive", async () => {
    mockApiCall.mockResolvedValueOnce({ statuses: { a: { hasActiveSession: true } } });
    await expect(sharingApi.getFriendSessionStatuses(["a", "b"])).resolves.toEqual({
      a: true,
      b: false,
    });
    expect(mockApiCall).toHaveBeenCalledWith(
      "/api/sharing/joint-sessions/status?friendIds=a,b",
    );
  });
});

describe("getReceivedPermissions", () => {
  it("fetches each payload the server left out of the list", async () => {
    mockApiCall
      .mockResolvedValueOnce({
        permissions: [
          { id: 2, permissionType: "program", hasPayload: true },
          { id: 3, permissionType: "history", hasPayload: false },
        ],
      })
      .mockResolvedValueOnce({ success: true, payload: { programData: { name: "P" } } });

    const received = await sharingApi.getReceivedPermissions();

    expect(mockApiCall).toHaveBeenNthCalledWith(
      1,
      "/api/sharing/permissions/received",
    );
    expect(mockApiCall).toHaveBeenNthCalledWith(2, "/api/sharing/permissions/2/payload");
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(received.map((p) => p.payload)).toEqual([
      { programData: { name: "P" } },
      null,
    ]);
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
