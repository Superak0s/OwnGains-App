/* global jest */
// The real module needs the native Firebase app, which jest doesn't have.
module.exports = {
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(),
  logScreenView: jest.fn(async () => {}),
  setAnalyticsCollectionEnabled: jest.fn(async () => {}),
  setUserProperty: jest.fn(async () => {}),
};
