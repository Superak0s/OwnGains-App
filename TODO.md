# TODO

Last updated: 2026-10-26

## In progress

- Expanded chart view on `feat/chart-expand`, waiting for review and a device test.

## Next

### App-wide

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

## Roadmap

Grouped by when each item should start. Earlier groups come first, and a later group can depend on an earlier one.

### Medium term

- **Redesign the whole app.** Rework layout, navigation and visual language as one piece instead of screen by screen. Write the design direction down first (typography, spacing, density, tab structure), then rebuild one flow end to end as a reference, such as the workout screen, before applying it everywhere. The offline/online dispatch and widget boards must keep working through the change, since the redesign touches both.

### Much later

- **Fully modular app with custom widgets.** Users build their own widgets from building blocks (metrics, charts, lists) and place them on any board. This needs widget types to become data loaded from JSON instead of code in the registry. It depends on the marketplace format being stable, since custom widgets reuse it. Once users keep custom widgets, any type rename needs a migration in `storageMigrations.ts`.
