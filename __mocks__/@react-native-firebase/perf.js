/* global jest */
// The real module needs the native Firebase app, which jest doesn't have.
const span = { putAttribute: jest.fn(), putMetric: jest.fn(), start: jest.fn(), stop: jest.fn() };
const performance = { dataCollectionEnabled: false };
module.exports = {
  span,
  getPerformance: jest.fn(() => performance),
  trace: jest.fn(() => span),
};
