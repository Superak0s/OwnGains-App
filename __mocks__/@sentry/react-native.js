// Importing the real SDK starts a module-level setInterval (AsyncExpiringMap in
// its time-to-display fallback) that is never cleared, so every suite that
// reached it left jest a worker that "failed to exit gracefully".
const noop = () => {};

module.exports = {
  init: noop,
  wrap: (component) => component,
  reactNavigationIntegration: () => ({
    name: "ReactNavigation",
    registerNavigationContainer: noop,
  }),
  captureException: noop,
  addBreadcrumb: noop,
  setUser: noop,
  setTag: noop,
  logger: {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  },
  metrics: { count: noop, gauge: noop, distribution: noop },
  startSpan: (_context, callback) =>
    callback({ setAttribute: noop, setStatus: noop, end: noop }),
  flush: async () => true,
  getClient: () => undefined,
};
