# TODO

Last updated: 2026-10-19

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

### Short term

- **Fix theme switching.** Themes still have gaps that will hide problems in every later change. Audit each screen in light and dark mode, move hardcoded colors onto the theme tokens in `ThemeContext`, and check contrast on widget boards and charts. Done when no visible color ignores the active theme.

### Near term

- **Let users pick widget names, icons and other details.** Today a widget's title and icon are fixed in code. Users should be able to rename a widget and choose its icon (and anything else that makes sense, such as a short subtitle) from a picker, per placed widget. The choice is stored with the layout, so it survives updates, and the defaults stay as they are for anyone who doesn't change anything. Keep the stored widget `type` unchanged, since that is the key `useWidgets` matches on.
- **Turn the trainer mode screens into widgets.** The Clients, client page and trainer Track views are fixed screens today. Split them into widgets (client list, attention list, a client's week, recent sessions, progress, tracking) so trainers can arrange them on their own boards the same way as the personal screens. This needs its own widget boards and storage keys, and it follows the same rules as the other boards: register each widget and its default, and never rename a type without a migration.

### Medium term

- **Redesign the whole app.** Rework layout, navigation and visual language as one piece instead of screen by screen. Write the design direction down first (typography, spacing, density, tab structure), then rebuild one flow end to end as a reference, such as the workout screen, before applying it everywhere. The offline/online dispatch and widget boards must keep working through the change, since the redesign touches both.

### Later

- **Customizable UI with a marketplace.** Users change how screens look and where things sit, then share those setups. Start with a documented JSON format for a layout (screens, widget boards, theme tokens) that the app can import and export as a file. Next comes a sharing path: a browsable marketplace with downloads and ratings, which needs server work and an API spec in `api-requests.md`. Open questions: validate imported files so a bad layout cannot crash a screen, and decide whether a shared layout carries theme values only or widget config too. Widget types in a layout must use stable ids, because the renaming rule in `useWidgets` would otherwise break shared layouts.

### Much later

- **Fully modular app with custom widgets.** Users build their own widgets from building blocks (metrics, charts, lists) and place them on any board. This needs widget types to become data loaded from JSON instead of code in the registry. It depends on the marketplace format being stable, since custom widgets reuse it. Once users keep custom widgets, any type rename needs a migration in `storageMigrations.ts`.
