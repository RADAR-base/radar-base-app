# @radarbase/app-kit

A plugin-based React Native **library** of SDUI nodes, core services, and configuration contracts for building manifest-driven health research apps.

The repo root **is the library**. A runnable host template lives in [`starter-kit/`](./starter-kit) and consumes the library exactly the way any other study app would — clone, rename, drop in a config, ship.

```text
radar-base-app/                 <- the library (publishable as @radarbase/app-kit)
├── src/                        <- library source (TypeScript)
│   ├── core/                   <- services: Auth, Token, Analytics, RemoteConfig, Schedule, ...
│   ├── library/
│   │   ├── sdui/               <- SDUI engine: SDUIShell, AppShell, NodeRegistry, loaders, screens
│   │   └── contracts/          <- Zod schemas + type-only public contracts
│   ├── theme/                  <- design tokens, icons, font scaling
│   └── index.ts                <- public API surface
├── lib/                        <- tsc build output (what consumers import)
├── starter-kit/                <- clone-and-rename host template (consumes the library)
├── docs/
├── scripts/dev.sh
├── package.json                <- main: lib/index.js, types: lib/index.d.ts
└── tsconfig.json               <- rootDir: src, outDir: lib
```

## Features

- **SDUI engine**: `SDUIShell` / `AppShell` consumes a manifest + per-screen blueprint JSON files and renders the UI through a node-tree walker (`NodeRenderer`) with per-node error isolation.
- **Built-in nodes**: layout, content, feature, and settings nodes — see [Built-in nodes](#built-in-nodes) below.
- **Custom nodes**: register your own with `NodeRegistry.getInstance().register(...)`; nodes receive their blueprint slice, theme, dispatch, and template variables.
- **Zod-validated configs**: `ManifestSchema`, `BlueprintSchema`, and `NodeSchema` guard every load.
- **Pluggable loaders**: `ManifestLoader` and `BlueprintLoader` accept any async source (bundled JSON, remote fetch, hybrid) with primary + fallback strategies and in-memory caching.
- **Core services**: `CoreServicesProvider` + `useCoreServices()` — extensible service architecture with Firebase and no-op base implementations.
- **Auth flow**: Built-in `LoginScreen`, `RegistrationFlow`, `PostEnrolmentFlow` — fully manifest-driven via the `auth` and `login` blocks.
- **Task flow**: `TaskInstructionsScreen` → `QuestionnaireNode` → `TaskCompletionScreen` — driven by `ScheduleService` and protocol config.
- **Extensible services**: Each service follows a base + Firebase subclass pattern (e.g. `DefaultAnalyticsService` / `FirebaseAnalyticsService`). Hosts can subclass or swap implementations.
- **TypeScript-first**: full type definitions for the public surface.

## Installation (consumer)

```bash
npm install @radarbase/app-kit
```

Peer dependencies (the host provides these — React Native projects already have most of them):

- `react >=16.8`, `react-native >=0.60`
- `react-native-reanimated`, `react-native-safe-area-context`, `react-native-svg`
- Optional peers used by certain services / built-in nodes:
  - `@react-native-firebase/app`, `/analytics`, `/messaging`, `/remote-config`
  - `@react-native-async-storage/async-storage`
  - `react-native-keychain`
  - `@shopify/react-native-skia` (for `GradientMeshBackground`)
  - `expo-camera` (for `CameraScanScreen` QR scanning)

## Usage

Everything is imported from the package root. You should never reach into `lib/...` paths.

```tsx
import {
  AppShell,
  NodeRegistry,
  createAsyncStorageService,
  useCoreServices,
  eventBus,
} from '@radarbase/app-kit';
import type { NodeProps, CoreServiceOverrides } from '@radarbase/app-kit';
```

### Minimal host app

```tsx
import React, { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShell, createAsyncStorageService } from '@radarbase/app-kit';
import appConfig from './config';

export default function App() {
  const storage = useMemo(() => createAsyncStorageService(), []);
  return (
    <SafeAreaProvider>
      <AppShell manifest={appConfig} storage={storage} />
    </SafeAreaProvider>
  );
}
```

The `manifest` object combines the `app-manifest.json` with a `blueprints` map of all bundled view JSON files — see the starter-kit's [`config/index.ts`](./starter-kit/config/index.ts) for the pattern.

### Consuming core services from anywhere

```tsx
import { useCoreServices } from '@radarbase/app-kit';

function MyNode() {
  const { api, config, auth, schedule, eventBus } = useCoreServices();
  // call api.get(...), config.get(...), auth.isAuthenticated(), schedule.getUpcomingTasks()
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

Reference it from any blueprint by `"type": "MyCustomNode"` — the `NodeRenderer` will resolve and render it.

## Configuration

The library is fully configuration-driven via the SDUI multi-file format.

- **`app-manifest.json`** — lightweight entry point: app name, theme, header, tabs (each with a `viewPath` pointer), secondary views, custom node registry, auth config, login config, roles.
- **`views/*.json`** — per-screen blueprints, each a `ScreenBlueprint` containing a node tree under `root`.

### Manifest schema

| Field | Type | Description |
|-------|------|-------------|
| `appName` | string | Display name |
| `description` | string | App description |
| `version` | string | App version |
| `theme` | object | `brandColors` (brand, accent, background) |
| `header` | object | Dashboard header config (title, subtitle, settings/notifications paths) |
| `tabs` | array | Tab definitions (`id`, `label`, `icon`, `viewPath`) |
| `secondaryViews` | object | Named secondary view paths |
| `widgetsRegistry` | array | Custom node type declarations |
| `auth` | object | OAuth config (`clientId`, `endpoint`, `scopes`, `audience`, `redirectUri`, etc.) |
| `login` | object | Login screen config (`showSignUp`) |
| `roles` | object | Role-based view assignments |

### Loading strategies

`ManifestLoader` and `BlueprintLoader` accept any async `() => Promise<unknown>` source:

- **Bundled JSON** — `createBundledBlueprintSource({ 'views/home.json': home, … })` for static imports.
- **Remote fetch** — `async (path) => (await fetch(\`\${cdn}/\${path}\`)).json()` for OTA updates.
- **Hybrid** — a primary `source` + `fallback` chain (e.g. remote → bundled offline copy).

Validation against the Zod schemas runs on every load; invalid blueprints throw before they reach the renderer.

## Core services

All services are created and provided via `CoreServicesProvider`. Each follows an extensible base class + Firebase subclass pattern with auto-selecting factories.

| Service | Base class | Firebase class | Factory |
|---------|-----------|---------------|---------|
| Analytics | `DefaultAnalyticsService` | `FirebaseAnalyticsService` | `analyticsServiceFactory` |
| Remote Config | `DefaultRemoteConfigService` | `FirebaseRemoteConfigService` | `remoteConfigServiceFactory` |
| Notifications | `DefaultNotificationService` | `FirebaseNotificationService` | `notificationServiceFactory` |
| Token | `DefaultTokenService` | — | `tokenServiceFactory` |
| Auth | `DefaultAuthService` | — | `authServiceFactory` |
| Cache | `DefaultCacheService` | — | `cacheServiceFactory` |
| Kafka | `DefaultKafkaService` | — | `kafkaServiceFactory` |
| Config | `DefaultConfigService` | — | `configServiceFactory` |
| Schedule | `AppserverScheduleService` | — | `scheduleServiceFactory` |
| AppServer | `DefaultAppServerService` | — | `appServerServiceFactory` |
| SubjectConfig | `ManagementPortalSubjectConfigService` | — | `subjectConfigServiceFactory` |
| QuestionnaireData | `DefaultQuestionnaireDataService` | — | `questionnaireDataServiceFactory` |
| DataPipeline | `DefaultDataPipeline` | — | `dataPipelineFactory` |

Hosts can override services via `CoreServiceOverrides` (passed to `AppShell` or `CoreServicesProvider`):

```tsx
<AppShell
  manifest={config}
  storage={myStorageService}     // required for persistence
  // Optional overrides:
  // logger, localization, remoteConfig, subjectConfig
/>
```

## Task flow

The full task lifecycle, from schedule to completion:

1. **Schedule** — `ScheduleService` fetches tasks from the AppServer, maps protocol `startText`/`endText` onto each task.
2. **Task card** — `TaskListSectionNode` / `CalendarNode` renders tasks. Tapping emits `OPEN_TASK_INSTRUCTIONS`.
3. **Instructions** — `TaskInstructionsScreen` slides in with the task's `startText` (or `description`), duration, question count, expiry.
4. **Questionnaire** — `QuestionnaireNode` renders questions with branching logic, progress tracking, and per-question timestamps.
5. **Completion** — `TaskCompletionScreen` shows a celebration with the task's `endText` (or a default message). Buttons: Home / Calendar.
6. **Data pipeline** — `QuestionnaireDataService` submits results through `DataPipelineService` → `ConverterFactory` (ms → seconds) → `KafkaService`.

## Built-in nodes

| Type | Purpose |
|------|---------|
| **Layout** | |
| `ViewNode` | Root scroll container for a screen |
| `SectionNode` | Logical grouping with optional header + "See All" |
| `CardNode` | Elevated surface for a child cluster |
| `CardSectionNode` | Generic titled card list — vertical, horizontal-scroll, or 2-col grid |
| **Content** | |
| `TextNode` | Static / interpolated text (`{{user.firstName}}` etc.) |
| `ActionNode` | Tappable button — `OpenCustomView`, `Navigate`, `OpenExternalUrl`, `TriggerEvent` |
| **Task & Schedule** | |
| `TaskListSectionNode` | `ScheduleService`-driven task list, rendered as `TaskCardNode`s |
| `TaskCardNode` | Single task pill (questionnaire / speech / physical / medication) |
| `ToDoStatusNode` | End-of-day status banner, derived from completed/total counts |
| `CalendarNode` | Schedule of tasks / events (`calendar` / `agenda` variants) |
| `SurveyTaskListNode` | ePRO task list (`singleCard` / `multiCard` variants) |
| `QuestionnaireNode` | Full-page questionnaire form with branching logic |
| **Data & Charts** | |
| `DataRangeNode` | Day / Week / Month filter that the data cards on the page follow |
| `GoalProgressCardNode` | A figure against its goal, with a progress bar (e.g. steps) — see [Data cards](#data-cards) |
| `TrendCardNode` | A reading across the period as a line, with an optional usual range (e.g. heart rate) |
| `BarCardNode` | Bars across the period, single or stacked; a sleep timeline under Day (e.g. sleep, phone use) |
| `StatCardNode` | Engagement stat card (check-in / streak / active days) |
| `DataWheelCardNode` | Circular progress ring for a wearable metric, or a night's sleep stages |
| `ArcDataCardNode` | 180° gauge that fills by value |
| `BarChartCardNode` | Seven-day bar chart with a dashed average line |
| `LineGraphCardNode` | Time-series line with drag-to-scrub tooltip |
| `GraphDataNode` | Single-metric chart (`mini` sparkline / `detailed` bar) |
| **Settings** | |
| `SettingsRowNode` | Flexible settings row — 4 variants: `value`, `toggle`, `link`, `action` |
| **Dashboard** | |
| `HeaderNode` | Dashboard header — logo/avatar, sync/notifications/settings, greeting |
| `NavbarNode` | Floating bottom tab bar, driven by the manifest's `tabs` |
| **Other** | |
| `ConnectDevicesMenuNode` | Wearable / sensor connection status |
| `AlertBannerNode` | Inline banner (`info` / `warning` / `critical`) |
| `InboxItemListCoordinatorNode` | Tabbed coordinator across multiple `InboxItemListNode`s |
| `InboxItemListNode` | Filtered inbox list |
| `RelativeActivityTodayNode` | Activity progress ring |
| `NotificationListNode` | AppServer notification list (past/expired only) |

## Data cards

`GoalProgressCardNode`, `TrendCardNode`, `BarCardNode` and `DataWheelCardNode` make up the data page. They share these settings:

| Setting | Description |
|---------|-------------|
| `title` | The card's title. The empty state is worded from it ("No steps yet today"). |
| `size` | `"small"` for the square, one-column version, laid out by a `CardSectionNode` with `layout: "grid"`. Large by default. |
| `info` | Adds an ⓘ beside the title that opens a dialog with this text. Sleep cards also explain each sleep stage. |
| `showOpenButton` | `true` shows an arrow, in place of the ⓘ, that opens the card's [detail page](#detail-page). Off by default. |
| `viewPath` | A blueprint for the arrow to open instead of the standard detail page. |

```json
{
  "id": "trend_heart_rate",
  "type": "TrendCardNode",
  "title": "Heart rate",
  "unit": "bpm",
  "info": "Your resting heart rate, measured by your watch or ring while you are still.",
  "showOpenButton": false,
  "values": { "day": [62, 64, null, 61], "week": [58, 60, 57, 59, 61, 58, 60] },
  "usualRange": [55, 62]
}
```

### Day / Week / Month

A `DataRangeNode` on the page adds the filter, and every data card on the page follows it. `defaultRange` (`"day"`, `"week"` or `"month"`) sets where it starts. These settings can be written once for every range or per range, as `{ "day": …, "week": …, "month": … }`: `values`, `value`, `target`, `title`, `description`, `labels`, `summary`, `periodLabel`, `highlight`, `reference`, `usualRange`, `stages` and `barColor`. A range that's left out falls back to `week`.

Day runs 00–24 by the hour, Week Monday to Sunday, and Month by week (W1, W2, …).

### Per card

| Card | Settings |
|------|----------|
| `GoalProgressCardNode` | `value`, `target`, `unit`; `metric` for an app-computed figure (e.g. `task_completed`); `remainingText` / `goalMetText` replace the line under the bar, with `{remaining}` and `{unit}` filled in |
| `TrendCardNode` | `values` (`null` leaves that hour, day or week empty); `value` for the headline, otherwise the last reading under Day and the average under Week and Month (`aggregate: "total"` for a total); `usualRange` (`[low, high]`) shades the participant's usual range; `summary`; `axisPadding` |
| `BarCardNode` | `values`, one number per bar or a list per bar, stacked bottom up and named by `segments` (`[{ "label", "color" }]`); `valueFormat: "duration"` reads figures as minutes ("7h 20m"); `highlight`, `reference` (a dashed line), `barColor`, `aggregate`, `summary`; `stages` and `bedtime` under Day draw the night as a sleep timeline |
| `DataWheelCardNode` | `value` / `values`, `target`, `metric`, `showTotal`, `reverse`; `stages` turns the ring into the night's sleep stages |

Dragging across a large card's chart shows each point's figure and label in the headline; letting go returns to the period's figure. On the sleep timeline it shows the stage, how long it lasted and when.

### Empty state

When a trend or bar card has no `values` for the period, it says so in place of its figure and chart, and keeps its height:

- **Large:** "No heart rate yet today" (or "this week", "this month"), with "It shows here once the app has recorded some" under it.
- **Small:** just the headline, "No heart rate yet".

### Detail page

With `showOpenButton: true`, the arrow opens the built-in `dataDetail` page, titled with the card's title. The page is a placeholder for now. A study can supply its own for every card by mapping it in the manifest, or for one card with `viewPath`:

```json
"secondaryViews": { "dataDetail": "views/secondary/data-detail.json" }
```

## Screens (built-in)

| Screen | Purpose |
|--------|---------|
| `LoginScreen` | Login / sign-up gate with `WelcomeCard` (configurable via `login.showSignUp`) |
| `RegistrationFlow` | QR scan or manual enrolment |
| `PostEnrolmentFlow` | Post-login onboarding (notifications, health connect) |
| `TaskInstructionsScreen` | Pre-task briefing with task details and illustration |
| `TaskCompletionScreen` | Post-task celebration with Home/Calendar navigation |
| `NotificationsScreen` | AppServer notifications (fetched, filtered to past only) |
| `ConnectHealthScreen` | Apple Health / Health Connect permission flow |
| `InfoScreen` | Generic information screen |
| `LoadingScreen` | Loading state with animated dots |
| `CameraScanScreen` | QR code scanner for enrolment |

## Development

```bash
./scripts/dev.sh install     # install library + starter-kit deps
./scripts/dev.sh build       # compile src/ -> lib/
./scripts/dev.sh typecheck   # tsc --noEmit on the library
./scripts/dev.sh starter     # run the starter-kit (Expo)
./scripts/dev.sh clean       # remove lib/
```

Equivalent npm scripts at the repo root:

```bash
npm run build        # tsc + copy assets
npm run typecheck    # tsc --noEmit
npm run clean        # rm -rf lib
```

### Editing the library

1. Edit files under `src/`.
2. Run `npm run build` at the repo root to refresh `lib/`.
3. The starter-kit consumes the library via `"file:../"` — changes are picked up after a rebuild.

### Editing the starter-kit

1. `cd starter-kit && npx expo start` (or `./scripts/dev.sh starter`).
2. Edit `starter-kit/App.tsx` and `starter-kit/config/**/*.json`.

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
