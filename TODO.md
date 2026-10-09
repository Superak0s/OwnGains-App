# TODO

Last updated: 2026-10-06

## In progress

-

## Next

### App-wide

Pressing on a chart should enlarge it and have different settings just like home assistant and the settings should be kept on device when zooming out.

- **Expanded chart view.** Tapping any `ProgressChart` opens it full screen in a sheet. Settings are saved per chart in `sqliteStorage` and also apply to the small widget chart once it closes.
  - Axis scale: the Y axis is automatic, starts at zero, or uses a min/max you type in. X axis density (fewer or more labels) and the label font size.
  - Rotate: a button switches to landscape for a wider X axis. The app is locked to portrait in `app.json`, so this needs `expo-screen-orientation`, unlocked only while the expanded view is open.
  - Time range chips: 1W, 1M, 3M, 6M, 1Y, All, plus a custom date range. Hevy, Strong and Home Assistant all offer this.
  - Pinch to zoom and drag to pan along the X axis. Double tap resets the zoom (Libra, Home Assistant history explorer).
  - Tap or scrub a point to see its exact value and date in a tooltip, and jump to that workout or log entry.
  - Metric switcher for exercise charts: heaviest weight, estimated 1RM, best set volume, session volume, total reps (Hevy).
  - Trend line: a 7 day moving average or an exponential trend over the raw points, with the option to hide raw points (Libra, Happy Scale).
  - Goal line on weight, body fat and measurement charts, with an estimated date to reach it at the current rate.
  - PR markers on exercise charts.
  - Compare: overlay the previous period or the same period last year (Home Assistant Advanced History).
  - Chart type: line, bar or area. Toggle dots and the area fill.
  - Share or export: save the chart as an image (`react-native-view-shot` plus the installed `expo-sharing`) or the points as CSV.
  - Min, max, average and change over the visible range shown under the chart.
  - Reset to defaults button.
- **Decision needed:** `react-native-chart-kit` has no zoom, pan, scrub tooltip or reference lines. Either draw those in SVG over it, or move to a chart library built on Skia or SVG with gesture support (victory-native or react-native-gifted-charts). Settle this before building the zoom, tooltip and trend line items.
- Suggested order: expanded sheet with saved settings, time range, Y axis and tooltip first. Then rotation, trend and goal lines. Then compare, PR markers and export.

Better health tracking data.
Supplement history should be better with more data.

-

### Plan

-

### Friends

-

### Settings

-

## Blocked / needs a decision

-

## Known issues

-
