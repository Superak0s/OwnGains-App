// The real charts start a 500ms setTimeout on mount that can fire after the
// suite's environment is torn down and crash an unrelated test.
module.exports = { BarChart: () => null, LineChart: () => null }
