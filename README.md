# @radarbase/app-kit

A plugin-based React Native **library** of SDUI nodes, core services, and configuration contracts for building manifest-driven health research apps.

The repo root **is the library**. A runnable host template lives in [`starter-kit/`](./starter-kit) and consumes the library exactly the way any other study app would — clone, rename, drop in a config, ship.

```text
radar-base-app/                 <- the library (publishable as @radarbase/app-kit)
├── src/                        <- library source (TypeScript)
│   ├── core/                   <- services: ApiService, ConfigService, AuthService, EventBus, ...
│   ├── library/
│   │   ├── sdui/               <- SDUI engine: SDUIShell, NodeRegistry, loaders, built-in nodes
│   │   └── contracts/          <- Zod schemas + type-only public contracts
│   └── index.ts                <- public API surface
├── lib/                        <- tsc build output (what consumers import)
├── starter-kit/                <- clone-and-rename host template (consumes the library)
├── docs/
├── scripts/dev.sh
├── package.json                <- main: lib/index.js, types: lib/index.d.ts
└── tsconfig.json               <- rootDir: src, outDir: lib
```

## Features

- **SDUI engine**: `SDUIShell` consumes a manifest + per-screen blueprint JSON files and renders the UI through a node-tree walker (`NodeRenderer`) with per-node error isolation.
- **Built-in nodes**: layout (`ViewNode`, `SectionNode`, `CardNode`), content (`TextNode`, `ActionNode`), feature (`SurveyTaskListNode`, `QuestionnaireNode`, `GraphDataNode`, `ConnectDevicesMenuNode`, `CalendarNode`), plus stubs for inbox / activity / alert nodes.
- **Custom nodes**: register your own with `NodeRegistry.getInstance().register(...)`; nodes receive their blueprint slice, theme, dispatch, and template variables.
- **Zod-validated configs**: `ManifestSchema`, `BlueprintSchema`, and `NodeSchema` guard every load.
- **Pluggable loaders**: `ManifestLoader` and `BlueprintLoader` accept any async source (bundled JSON, remote fetch, hybrid) with primary + fallback strategies and in-memory caching.
- **Core services**: `CoreServicesProvider` + `useCoreServices()` for `ApiService`, `ConfigService`, `AuthService`, `EventBus`, `DataService`, etc.
- **TypeScript-first**: full type definitions for the public surface.

## Installation (consumer)

```bash
npm install @radarbase/app-kit
```

Peer dependencies (the host provides these — React Native projects already have most of them):

- `react >=16.8`, `react-native >=0.60`
- Optional peers used by certain services / built-in nodes:
  - `@react-native-firebase/app`, `/analytics`, `/messaging`, `/remote-config`
  - `@react-native-async-storage/async-storage`
  - `react-native-keychain`

## Usage

Everything is imported from the package root. You should never reach into `lib/...` paths.

```tsx
import {
  SDUIShell,
  NodeRegistry,
  CoreServicesProvider,
  createBundledBlueprintSource,
  useCoreServices,
  eventBus,
} from '@radarbase/app-kit';
import type { NodeProps, CoreServiceOverrides } from '@radarbase/app-kit';
```

### Minimal host app

```tsx
import React from 'react';
import {
  CoreServicesProvider,
  SDUIShell,
  createBundledBlueprintSource,
} from '@radarbase/app-kit';
import manifest from './config/app-manifest.json';
import home from './config/views/home.json';
import insights from './config/views/insights.json';

const BUNDLED_BLUEPRINTS = {
  'views/home.json': home,
  'views/insights.json': insights,
};

export default function App() {
  return (
    <CoreServicesProvider>
      <SDUIShell
        manifestSource={async () => manifest}
        blueprintSource={createBundledBlueprintSource(BUNDLED_BLUEPRINTS)}
      />
    </CoreServicesProvider>
  );
}
```

### Consuming core services from anywhere

```tsx
import { useCoreServices } from '@radarbase/app-kit';

function MyNode() {
  const { api, config, auth, eventBus } = useCoreServices();
  // call api.get(...), config.get(...), auth.signIn(...), eventBus.emit(...)
}
```

### Registering a custom node

```tsx
import { NodeRegistry } from '@radarbase/app-kit';
import type { NodeProps } from '@radarbase/app-kit';
import { Text, View } from 'react-native';

function MyCustomNode({ node, context }: NodeProps) {
  return (
    <View>
      <Text style={{ color: context.theme.textColor }}>
        {String(node.title ?? 'Hello')}
      </Text>
    </View>
  );
}

NodeRegistry.getInstance().register('MyCustomNode', MyCustomNode);
```

Reference it from any blueprint by `"type": "MyCustomNode"` — the `NodeRenderer` will resolve and render it. Optionally declare it in your manifest's `widgetsRegistry` (discovery metadata for tooling; the component must still be registered in `NodeRegistry` at runtime):

```json
"widgetsRegistry": [
  { "type": "MyCustomNode", "module": "./MyCustomNode" }
]
```

## Configuration

The library is fully configuration-driven via the SDUI multi-file format. See [`docs/planning/SDUI_CONFIG_DESIGN.md`](./docs/planning/SDUI_CONFIG_DESIGN.md) for the full spec.

- **`app-manifest.json`** — lightweight entry point: app name, theme, header, tabs (each with a `viewPath` pointer), secondary views, custom node registry, alerts, roles, CMS endpoints.
- **`views/*.json`** — per-screen blueprints, each a `ScreenBlueprint` containing a node tree under `root`.

### Loading strategies

`ManifestLoader` and `BlueprintLoader` accept any async `() => Promise<unknown>` source, so hosts can plug in:

- **Bundled JSON** — `createBundledBlueprintSource({ 'views/home.json': home, … })` for static imports (used by the starter kit today).
- **Remote fetch** — `async (path) => (await fetch(\`\${cdn}/\${path}\`)).json()` for OTA updates.
- **Hybrid** — a primary `source` + `fallback` chain (e.g. remote → bundled offline copy).

Validation against the Zod schemas runs on every load; invalid blueprints throw before they reach the renderer.

## Built-in nodes

| Type                              | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `ViewNode`                        | Root scroll container for a screen                                      |
| `SectionNode`                     | Logical grouping with an optional header                                |
| `CardNode`                        | Elevated surface for a child cluster                                    |
| `TextNode`                        | Static / interpolated text (`{{user.firstName}}` etc.)                  |
| `ActionNode`                      | Tappable button — `OpenCustomView`, `Navigate`, `OpenExternalUrl`, `TriggerEvent` |
| `SurveyTaskListNode`              | ePRO task list (`singleCard` / `multiCard` variants)                    |
| `QuestionnaireNode`               | Inline or full-page questionnaire form                                  |
| `GraphDataNode`                 | Single-metric chart (`mini` sparkline / `detailed` bar)                 |
| `ConnectDevicesMenuNode`          | Wearable / sensor connection status                                     |
| `CalendarNode`                    | Schedule of tasks / events (`calendar` / `agenda` variants)             |
| `InboxItemListCoordinatorNode`    | Tabbed coordinator across multiple `InboxItemListNode`s                 |
| `InboxItemListNode`               | Filtered inbox list (stub until data layer lands)                       |
| `RelativeActivityTodayNode`       | Activity progress ring (stub demo data)                                 |
| `AlertBannerNode`                 | Inline banner (`info` / `warning` / `critical`)                         |
| `StatCardNode`                    | Engagement stat card (check-in / streak / active days)                  |
| `TaskCardNode`                    | Single task pill (questionnaire / speech / physical / medication)       |
| `ToDoStatusNode`                  | End-of-day status banner, derived from completed/total counts           |
| `DataWheelCardNode`                | Circular progress ring for a wearable metric (`small` / `large`)        |
| `ArcDataCardNode`                  | 180° gauge that fills by value, color derived from fill % (red/amber/green) |
| `BarChartCardNode`                 | Seven-day bar chart with a dashed average line (`small` / `large`)      |
| `LineGraphCardNode`                | Time-series line with a drag-to-scrub tooltip (`day` / `week` axis)     |
| `CardSectionNode`                 | Generic titled card list — vertical, horizontal-scroll, or 2-col grid   |
| `TaskListSectionNode`             | `ScheduleService`-driven task list, rendered as `TaskCardNode`s          |
| `HeaderNode`                       | Dashboard header — logo/avatar, sync/notifications/settings, greeting   |
| `NavbarNode`                       | Floating bottom tab bar, driven by the manifest's `tabs`                |

### New node props

Every node also takes a `type` (the string it's registered under) and an optional `id`. The
parameters below are set as sibling keys on the same node object in a blueprint. `—` in the
Default column means the parameter is optional with no fallback.

**Data-driven cards** (`DataWheelCardNode`, `ArcDataCardNode`, `BarChartCardNode`,
`LineGraphCardNode`) resolve their numbers through `useDashboardData`: pass inline
`value`/`values` to show real data, otherwise synthesized placeholder data is rendered so
the card is never empty in previews. `metric` names the series so a future API/wearable
fetch can target it.

#### `StatCardNode` — engagement stat card

| Parameter       | Type                                                              | Default          | Description                                                        |
| --------------- | ---------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `statsType`     | `checkIn` / `activeDays` / `currentStreak` / `longestStreak`      | `checkIn`        | Which engagement metric this card represents (sets default label). |
| `size`          | `large` / `small`                                                 | `large`          | Card size variant.                                                |
| `fillWidth`     | boolean                                                           | `false`          | Stretch to fill the parent cell instead of the fixed 176px width (for grid layouts). |
| `value`         | string / number                                                   | `0`              | The stat value shown.                                             |
| `label`         | string                                                            | per `statsType`  | Caption under the value.                                          |
| `showKeepItUp`  | boolean                                                           | `true`           | Show the "Keep it up!" encouragement line.                       |
| `keepItUpLabel` | string                                                            | `"Keep it up!"`  | Text for that line.                                              |

#### `TaskCardNode` — single task pill

| Parameter            | Type                                                     | Default        | Description                                                    |
| -------------------- | -------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| `taskType`           | `questionnaire` / `speech` / `physical` / `medication`   | `questionnaire`| Task category — drives the icon and which fields show.        |
| `taskName`           | string                                                   | `"Task Name"`  | Task title.                                                   |
| `time`               | string                                                   | `"9 AM"`       | Scheduled time label.                                         |
| `expirationTime`     | string                                                   | `"24H 00M"`    | Countdown / expiry label.                                     |
| `duration`           | string                                                   | `"10 min"`     | Estimated duration.                                           |
| `questionNumber`     | string                                                   | `"x8"`         | Question-count badge (questionnaire).                        |
| `medicationQuantity` | string                                                   | `"Quantity"`   | Quantity label (medication).                                 |
| `medicationDose`     | string                                                   | `"Dose"`       | Dose label (medication).                                     |
| `reminder`           | boolean                                                  | `false`        | Enable a reminder (only for task types that support one).    |
| `reminderTime`       | string                                                   | `"12:00 PM"`   | Reminder time label.                                         |

#### `ToDoStatusNode` — end-of-day status banner

| Parameter   | Type   | Default | Description                                                              |
| ----------- | ------ | ------- | ----------------------------------------------------------------------- |
| `completed` | number | `0`     | Number of completed tasks.                                              |
| `total`     | number | `0`     | Total tasks. The banner message/state is derived from these two counts. |

#### `DataWheelCardNode` — circular progress ring

| Parameter     | Type              | Default            | Description                                                   |
| ------------- | ----------------- | ------------------ | ------------------------------------------------------------ |
| `size`        | `small` / `large` | `small`            | Card size variant.                                           |
| `title`       | string            | `"Title"`          | Card heading.                                               |
| `description` | string            | `""`               | Sub-text (`large` only).                                    |
| `value`       | number            | —                  | Single inline reading.                                      |
| `values`      | number[]          | —                  | Inline series; the last entry is the current value (wins over `value`). |
| `target`      | number (> 0)      | `100`              | Full-scale value; fill % = value ÷ target.                 |
| `reverse`     | boolean           | `false`            | Flip the red/amber/green mapping for "less is better" metrics. |
| `metric`      | string            | `"wearable_metric"`| Series id resolved via `useDashboardData`.                 |
| `unit`        | string            | —                  | Unit label shown beside the value.                         |
| `viewPath`    | string            | —                  | Blueprint opened via the arrow badge (`OpenCustomView`); badge disabled when omitted. |

#### `ArcDataCardNode` — 180° gauge

| Parameter  | Type              | Default            | Description                                                          |
| ---------- | ----------------- | ------------------ | ------------------------------------------------------------------- |
| `title`    | string            | `"Title"`          | Card heading.                                                      |
| `value`    | number            | —                  | Single inline reading.                                             |
| `values`   | number[]          | —                  | Inline series; the last entry is the gauge value (wins over `value`). |
| `target`   | number (> 0)      | `100`              | Full-scale value; fill fraction = value ÷ target.                 |
| `reverse`  | boolean           | `false`            | Flip the low→bad / high→good color mapping for "less is better" metrics. |
| `metric`   | string            | `"wearable_metric"`| Series id resolved via `useDashboardData`.                        |
| `unit`     | string            | —                  | Unit label rendered beside the value.                             |
| `viewPath` | string            | —                  | Blueprint opened via the arrow badge (`OpenCustomView`).          |

> The arc color (red / amber / green) is derived from the fill percentage, not passed as a prop.

#### `BarChartCardNode` — seven-day bar chart

| Parameter         | Type              | Default            | Description                                                        |
| ----------------- | ----------------- | ------------------ | ----------------------------------------------------------------- |
| `size`            | `small` / `large` | `small`            | `small` = square (bars above labels); `large` = bars beside a title/description block. |
| `title`           | string            | `"Title"`          | Card heading.                                                    |
| `description`     | string            | `""`               | Sub-text (`large` only).                                        |
| `values`          | number[]          | —                  | Daily values; the last 7 form the week (Mon–Sun).               |
| `currentDayIndex` | number (0–6)      | today              | Highlighted weekday column (0 = Mon … 6 = Sun). Pin it for fixed previews/reports. |
| `metric`          | string            | `"wearable_metric"`| Series id resolved via `useDashboardData`.                      |
| `unit`            | string            | —                  | Unit label.                                                     |
| `viewPath`        | string            | —                  | Blueprint opened via the arrow badge (`OpenCustomView`).        |

#### `LineGraphCardNode` — time-series line with drag-to-scrub

| Parameter  | Type              | Default            | Description                                                            |
| ---------- | ----------------- | ------------------ | --------------------------------------------------------------------- |
| `title`    | string            | `"Title"`          | Card heading.                                                        |
| `values`   | number[]          | —                  | The plotted series.                                                 |
| `xAxis`    | `day` / `week`    | `day`              | Time granularity (hours-in-a-day vs days-in-a-week); drives labelling. |
| `metric`   | string            | `"wearable_metric"`| Series id resolved via `useDashboardData`.                          |
| `unit`     | string            | —                  | Unit shown in the scrub tooltip (falls back to `metric`).           |
| `viewPath` | string            | —                  | Blueprint opened via the arrow badge (`OpenCustomView`).            |

#### `SectionNode` — logical grouping with an optional "See All" header

| Parameter      | Type                     | Default    | Description                                                             |
| -------------- | ------------------------ | ---------- | ---------------------------------------------------------------------- |
| `title`        | string                   | —          | Section heading (optional; the header row only renders with a title).  |
| `showSeeAll`   | boolean                  | `false`    | Show a "See All" link next to the title.                              |
| `seeAllTab`    | string                   | —          | A tab `id` — "See All" **switches to that primary tab** (full header, navbar highlights it). |
| `seeAllAction` | string                   | —          | A blueprint path — "See All" **pushes it as a secondary view** (Back button, current tab kept). Used only when `seeAllTab` is absent. |
| `layout`       | `vertical` / `horizontal`| `vertical` | How the children are arranged.                                         |
| `children`     | node[]                   | `[]`       | Child nodes to render.                                                 |

> **`seeAllTab` vs `seeAllAction`:** the "See All" handler checks `seeAllTab` **first** — if set, it
> navigates to that tab and `seeAllAction` is ignored. To open a secondary/detail view instead, omit
> `seeAllTab` and set `seeAllAction` to a bundled blueprint path (a key in the host's `blueprintSource`,
> e.g. `"views/secondary/todo-all.json"`). This is distinct from `CardSectionNode` / `TaskListSectionNode`,
> which have no tab option — their `viewPath` always opens a secondary view.

#### `CardSectionNode` — generic titled card list

| Parameter    | Type                              | Default    | Description                                     |
| ------------ | --------------------------------- | ---------- | ----------------------------------------------- |
| `title`      | string                            | —          | Section heading (optional).                     |
| `showSeeAll` | boolean                           | `false`    | Show a "See All" link in the header.           |
| `viewPath`   | string                            | —          | Blueprint the "See All" link opens, pushed as a secondary view (`OpenCustomView`). |
| `layout`     | `vertical` / `horizontal` / `grid`| `vertical` | How the child cards are arranged.               |
| `children`   | node[]                            | `[]`       | Child card nodes to render.                     |

#### `TaskListSectionNode` — schedule-driven task list

| Parameter    | Type                          | Default      | Description                                                    |
| ------------ | ----------------------------- | ------------ | ------------------------------------------------------------- |
| `title`      | string                        | —            | Section heading (optional).                                   |
| `showSeeAll` | boolean                       | `false`      | Show a "See All" link.                                       |
| `viewPath`   | string                        | —            | Blueprint the "See All" link opens, pushed as a secondary view (`OpenCustomView`). |
| `variant`    | `singleCard` / `multiCard`    | `singleCard` | One card containing the tasks, or one card per task.         |
| `filter`     | object `{ status, category }` | `{}`         | Filters which `ScheduleService` tasks are shown.             |

#### `HeaderNode` — dashboard header

| Parameter                | Type    | Default | Description                                              |
| ------------------------ | ------- | ------- | ------------------------------------------------------- |
| `title`                  | string  | —       | Greeting / title text.                                  |
| `name`                   | string  | —       | User name (shown when `showName`).                      |
| `showName`               | boolean | —       | Whether to render the name.                             |
| `description`            | string  | —       | Sub-text under the title.                               |
| `profileIcon`            | boolean | `true`  | Show the avatar (`true`) vs. the RadarBase logo.        |
| `showActions`            | boolean | `true`  | Show the sync / notifications / settings buttons.       |
| `lastSyncedLabel`        | string  | —       | "Last synced" caption.                                  |
| `notificationCount`      | number  | —       | Badge count on the notifications button.                |
| `showEditButton`         | boolean | —       | Show the edit button.                                   |
| `editLabel`              | string  | —       | Edit button label.                                      |
| `backgroundColor`        | string  | theme   | Header background color override.                       |
| `textColor`              | string  | theme   | Title / name text color override.                       |
| `descriptionColor`       | string  | theme   | Description text color override.                        |
| `buttonBackgroundColor`  | string  | theme   | Action-button background override.                      |
| `buttonIconColor`        | string  | theme   | Action-button icon / text color override.               |
| `syncEventName` · `notificationsEventName` · `settingsEventName` · `editEventName` | string | — | EventBus event names emitted when those buttons are tapped. |

#### `NavbarNode` — floating bottom tab bar

| Parameter                 | Type    | Default  | Description                                                     |
| ------------------------- | ------- | -------- | -------------------------------------------------------------- |
| `tabs`                    | tab[]   | manifest | Tab definitions — usually sourced from the manifest's `tabs`, not hand-written per screen. |
| `selectedTabId`           | string  | —        | Which tab `id` is active.                                      |
| `showLabels`              | boolean | `true`   | Show the tab text labels.                                      |
| `backgroundColor`         | string  | theme    | Bar background override.                                       |
| `selectedBackgroundColor` | string  | theme    | Active-tab background override.                                |
| `textColor`               | string  | theme    | Inactive-tab text / icon color override.                       |
| `selectedTextColor`       | string  | theme    | Active-tab text / icon color override.                         |
| `borderColor`             | string  | theme    | Bar border color override.                                     |

## Development

The repo is laid out as a library + a sibling consumer app for fast feedback.

```bash
./scripts/dev.sh install     # install library + starter-kit deps
./scripts/dev.sh build       # compile src/ -> lib/
./scripts/dev.sh typecheck   # tsc --noEmit on the library
./scripts/dev.sh starter     # run the starter-kit (Expo)
./scripts/dev.sh clean       # remove lib/
```

Equivalent npm scripts at the repo root:

```bash
npm run build        # tsc
npm run typecheck    # tsc --noEmit
npm run clean        # rm -rf lib
npm run prepublishOnly  # clean + build (runs automatically on `npm publish`)
```

### Editing the library

1. Edit files under `src/`.
2. Run `npm run build` at the repo root to refresh `lib/`.
3. The `starter-kit/` pins `"@radarbase/app-kit": "^1.0.0"`. While the library is unpublished, point the starter at the workspace via either `"@radarbase/app-kit": "file:../"` (temporary edit, don't commit) or `npm link` — see [`starter-kit/README.md`](./starter-kit/README.md#local-library-development).

### Editing the starter-kit

1. `cd starter-kit && npm start` (or `./scripts/dev.sh starter` from root).
2. Edit `starter-kit/App.tsx` and `starter-kit/config/**/*.json` to experiment with manifests, blueprints, and custom nodes.

## Publishing

`prepublishOnly` runs `clean && build` so that `npm publish` ships a fresh `lib/` and `lib/index.d.ts`. Only the `lib/` directory and `README.md` are included in the published tarball (see the `files` field in `package.json`).

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make your changes under `src/` and add a usage example in `starter-kit/` if relevant.
4. Run `npm run typecheck` and `npm run build` at the repo root before opening a PR.
5. Submit a pull request.

## Support

For questions and support, please open an issue on GitHub.
