jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);
jest.mock("@features/plan/services/index", () => ({
  programApi: { deleteProgram: jest.fn(async () => {}) },
}));
jest.mock("expo-document-picker", () => ({
  __esModule: true,
  getDocumentAsync: jest.fn(),
}));

// Settings → Migrate to Offline writes the account's session history straight
// to this key and tells the user it was copied. If the key ever stops matching
// the offline store's legacy blob key, that migration silently loses every
// session while still reporting success.
describe("migration from the un-namespaced legacy blob", () => {
  it("adopts sessions written to @offline:workout:sessions", async () => {
    // A fresh registry: the record store's migration runs once per module load.
    jest.resetModules();
    const { kv, resetMemorySqlite } = require("test-utils/memorySqlite");
    resetMemorySqlite();
    kv["@offline:workout:sessions"] = JSON.stringify([
      {
        id: 91,
        split: "push",
        dayNumber: 1,
        dayTitle: "Chest day",
        startTime: "2024-03-01T10:00:00.000Z",
        endTime: "2024-03-01T11:00:00.000Z",
        setTimings: [],
        isDemo: false,
      },
    ]);

    const { workoutApi } = require("../workout");
    const history = await workoutApi.getSessionHistory("push");

    expect(history.map((s: { id: number }) => s.id)).toEqual([91]);
    expect(kv["@offline:workout:sessions"]).toBeUndefined();
  });
});
