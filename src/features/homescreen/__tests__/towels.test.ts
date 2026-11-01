jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"));

import { countTowelUse, loadTowels, saveTowels, washTowel, type Towel } from "../towels";

const towel = (id: string, uses: number): Towel => ({
  id,
  name: id,
  photoUri: null,
  washAfter: 5,
  uses,
  lastUsed: null,
});

describe("towels", () => {
  it("a finished workout adds one use to the current towel only, past its limit too", async () => {
    await saveTowels("u1", { towels: [towel("a", 5), towel("b", 1)], currentId: "a" });

    await countTowelUse("u1", new Date("2026-11-01T10:00:00Z"));

    expect((await loadTowels("u1")).towels).toEqual([
      { ...towel("a", 6), lastUsed: "2026-11-01T10:00:00.000Z" },
      towel("b", 1),
    ]);
  });

  it("counts nothing when no towel is current", async () => {
    const rack = { towels: [towel("a", 2)], currentId: null };
    await saveTowels("u2", rack);

    await countTowelUse("u2");

    expect(await loadTowels("u2")).toEqual(rack);
  });

  it("an account with no towels yet loads an empty rack", async () => {
    expect(await loadTowels("u3")).toEqual({ towels: [], currentId: null });
  });

  it("washing resets the count and keeps the last-used date", () => {
    const rack = { towels: [{ ...towel("a", 6), lastUsed: "2026-10-30T09:00:00.000Z" }], currentId: "a" };

    expect(washTowel(rack, "a").towels[0]).toMatchObject({
      uses: 0,
      lastUsed: "2026-10-30T09:00:00.000Z",
    });
  });
});
