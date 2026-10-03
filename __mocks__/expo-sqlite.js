// expo-sqlite pulls in expo-asset, which isn't installed, so the real module
// can't load under jest at all. Suites that care about persistence mock
// @shared/services/sqliteStorage itself. This only keeps the import chain
// resolvable for the ones that don't.
const db = {
  execSync: () => {},
  runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
  getFirstSync: () => null,
  getAllSync: () => [],
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
  runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
  withTransactionSync: (fn) => fn(),
  withExclusiveTransactionAsync: async (fn) => fn(db),
  prepareSync: () => ({
    executeSync: () => ({ changes: 0, lastInsertRowId: 0 }),
    finalizeSync: () => {},
  }),
  prepareAsync: async () => ({
    executeAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    finalizeAsync: async () => {},
  }),
};

module.exports = { openDatabaseSync: () => db };
