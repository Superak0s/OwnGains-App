import {
  appendWidgetTypes,
  mergeWidgetTypes,
  runMigrations,
  takeMigrationFailure,
  type MigrationDb,
} from "../storageMigrations";

const fakeDb = (initialVersion = 0) => {
  let version = initialVersion;
  const db: MigrationDb = {
    getFirstSync: <T,>() => ({ user_version: version }) as T,
    execSync: (sql) => {
      const set = /PRAGMA user_version = (\d+)/.exec(sql);
      if (set) version = Number(set[1]);
    },
    withTransactionSync: (task) => {
      const before = version;
      try {
        task();
      } catch (error) {
        version = before;
        throw error;
      }
    },
  };
  return { db, version: () => version };
};

describe("runMigrations", () => {
  it("runs every pending migration in order and records the version", () => {
    const { db, version } = fakeDb();
    const ran: number[] = [];

    const reached = runMigrations(db, [() => ran.push(1), () => ran.push(2)]);

    expect(ran).toEqual([1, 2]);
    expect(reached).toBe(2);
    expect(version()).toBe(2);
  });

  it("skips migrations the stored version already covers", () => {
    const { db } = fakeDb(1);
    const first = jest.fn();
    const second = jest.fn();

    runMigrations(db, [first, second]);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops at a failing migration without advancing past it", () => {
    const { db, version } = fakeDb();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const later = jest.fn();

    const reached = runMigrations(db, [
      () => {},
      () => {
        throw new Error("disk full");
      },
      later,
    ]);

    expect(reached).toBe(1);
    expect(version()).toBe(1);
    expect(later).not.toHaveBeenCalled();
    expect(takeMigrationFailure()).toEqual({
      step: 2,
      error: new Error("disk full"),
    });
    expect(takeMigrationFailure()).toBeNull();
    warn.mockRestore();
  });

  it("starts from an explicit baseline for pre-versioning installs", () => {
    const { db, version } = fakeDb();
    const first = jest.fn();

    runMigrations(db, [first], 1);

    expect(first).not.toHaveBeenCalled();
    expect(version()).toBe(0);
  });
});

describe("mergeWidgetTypes", () => {
  const replacements = {
    weight_progress: "one_rep_max",
    set_data: "personal_records",
    reps_progress: null,
  };
  const layout = (...types: string[]) =>
    JSON.stringify(
      types.map((type, order) => ({ id: type, type, size: "large", order })),
    );
  const typesOf = (json: string) =>
    (JSON.parse(json) as { type: string; order: number }[]).map(
      (w) => `${w.order}:${w.type}`,
    );

  it("renames a retired type, drops removed ones and reindexes", () => {
    expect(
      typesOf(
        mergeWidgetTypes(
          layout("select_exercise", "reps_progress", "weight_progress"),
          replacements,
        ),
      ),
    ).toEqual(["0:select_exercise", "1:one_rep_max"]);
  });

  it("does not duplicate a replacement already on the board", () => {
    expect(
      typesOf(
        mergeWidgetTypes(
          layout("weight_progress", "one_rep_max", "set_data"),
          replacements,
        ),
      ),
    ).toEqual(["0:one_rep_max", "1:personal_records"]);
  });

  it("leaves untouched layouts and non-layout values as they are", () => {
    const untouched = layout("one_rep_max");
    expect(mergeWidgetTypes(untouched, replacements)).toBe(untouched);
    expect(mergeWidgetTypes("not json", replacements)).toBe("not json");
    expect(mergeWidgetTypes('{"a":1}', replacements)).toBe('{"a":1}');
  });
});

describe("appendWidgetTypes", () => {
  const layout = JSON.stringify([
    { id: "a", type: "one_rep_max", size: "large", order: 0 },
  ]);

  it("adds only the missing types after the existing ones", () => {
    const next = JSON.parse(
      appendWidgetTypes(layout, [
        { type: "one_rep_max", size: "large" },
        { type: "weekly_volume", size: "medium" },
      ]),
    ) as { type: string; order: number }[];
    expect(next.map((w) => `${w.order}:${w.type}`)).toEqual([
      "0:one_rep_max",
      "1:weekly_volume",
    ]);
  });

  it("puts added types first and renumbers the rest when atStart is set", () => {
    const next = JSON.parse(
      appendWidgetTypes(
        JSON.stringify([
          { id: "b", type: "weekly_volume", size: "medium", order: 1 },
          { id: "a", type: "one_rep_max", size: "large", order: 0 },
        ]),
        [{ type: "friends_search", size: "medium" }],
        true,
      ),
    ) as { type: string; order: number }[];
    expect(next.map((w) => `${w.order}:${w.type}`)).toEqual([
      "0:friends_search",
      "1:one_rep_max",
      "2:weekly_volume",
    ]);
  });

  it("leaves a complete layout and non-layout values unchanged", () => {
    expect(
      appendWidgetTypes(layout, [{ type: "one_rep_max", size: "large" }]),
    ).toBe(layout);
    expect(appendWidgetTypes("oops", [])).toBe("oops");
  });
});
