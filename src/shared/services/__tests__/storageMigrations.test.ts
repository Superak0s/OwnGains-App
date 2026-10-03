import {
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
