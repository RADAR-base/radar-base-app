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
- **Built-in nodes**: layout (`ViewNode`, `SectionNode`, `CardNode`), content (`TextNode`, `ActionNode`), feature (`SurveyTaskListNode`, `QuestionnaireNode`, `VitalsChartNode`, `ConnectDevicesMenuNode`, `CalendarNode`), plus stubs for inbox / activity / alert nodes.
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
| `VitalsChartNode`                 | Single-metric chart (`mini` sparkline / `detailed` bar)                 |
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
| `CardSectionNode`                 | Generic titled card list — vertical, horizontal-scroll, or 2-col grid   |
| `TaskListSectionNode`             | `ScheduleService`-driven task list, rendered as `TaskCardNode`s          |
| `HeaderNode`                       | Dashboard header — logo/avatar, sync/notifications/settings, greeting   |
| `NavbarNode`                       | Floating bottom tab bar, driven by the manifest's `tabs`                |

### New node props

- **`StatCardNode`** — `statsType` (`checkIn`/`activeDays`/`currentStreak`/`longestStreak`), `size` (`large`/`small`), `value`, `label`, `showKeepItUp`, `keepItUpLabel`
- **`TaskCardNode`** — `taskType` (`questionnaire`/`speech`/`physical`/`medication`), `taskName`, `time`, `expirationTime`, `duration`, `questionNumber`, `medicationQuantity`, `medicationDose`, `reminder`, `reminderTime`
- **`ToDoStatusNode`** — `completed`, `total` (numbers; the banner state is derived from these, not set directly)
- **`DataWheelCardNode`** — `size` (`small`/`large`), `title`, `description` (large only), `value`/`values`, `target`, `metric`/`unit`/`dataSource` (wires to a real wearable API via `useDashboardData`), `viewPath`
- **`CardSectionNode`** — `title`, `showSeeAll`, `viewPath`, `layout` (`vertical`/`horizontal`/`grid`), `children`
- **`TaskListSectionNode`** — `title`, `showSeeAll`, `viewPath`, `variant` (`singleCard`/`multiCard`), `filter` (`{ status, category }`)
- **`HeaderNode`** — `title`, `name`, `showName`, `description`, `profileIcon` (avatar vs. RadarBase logo), `showActions`, `lastSyncedLabel`, `notificationCount`, `showEditButton`, `editLabel`, plus `*Color`/`*EventName` overrides for styling and the sync/notifications/settings/edit action hooks
- **`NavbarNode`** — `tabs` (usually sourced from the manifest, not hand-written per screen), `selectedTabId`, `showLabels`, plus `backgroundColor`/`selectedBackgroundColor`/`textColor`/`selectedTextColor`/`borderColor` overrides

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
