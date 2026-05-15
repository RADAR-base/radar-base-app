# @radarbase/app-kit

A plugin-based React Native **library** of widgets, components, and services for building configuration-driven health research apps.

The repo root **is the library**. A runnable host template lives in [`starter-kit/`](./starter-kit) and consumes the library exactly the way any other study app would — clone, rename, drop in a config, ship.

```text
radar-base-app/                 <- the library (publishable as @radarbase/app-kit)
├── src/                        <- library source (TypeScript)
│   ├── core/                   <- services: ApiService, ConfigService, AuthService, EventBus, ...
│   ├── library/
│   │   ├── app-shell/          <- AppShell, ThemeProvider, PluginManager
│   │   ├── config/             <- configLoader + strategies + validation
│   │   └── contracts/          <- type-only public contracts
│   ├── widgets/                <- built-in widgets + WidgetFactory + WidgetRegistry
│   └── index.ts                <- public API surface
├── lib/                        <- tsc build output (what consumers import)
├── starter-kit/                <- clone-and-rename host template (consumes the library)
├── docs/
├── scripts/dev.sh
├── package.json                <- main: lib/index.js, types: lib/index.d.ts
└── tsconfig.json               <- rootDir: src, outDir: lib
```

## Features

- **Widget system**: `WidgetFactory` + `WidgetRegistry` for plug-and-play UI from JSON/YAML config.
- **Built-in widgets**: Questionnaire, TaskList, Dashboard, DeviceStatus, Calendar.
- **App shell**: `AppShell`, `ThemeProvider`, `PluginManager` for composing a configurable host app.
- **Core services**: `CoreServicesProvider` + `useCoreServices()` for `ApiService`, `ConfigService`, `AuthService`, `EventBus`, `DataService`, etc.
- **Configuration-driven**: `configLoader` with `LocalFileStrategy`, `RemoteUrlStrategy`, `ServerStrategy`; runtime validation via `validateAppConfig` + `defaultConfig`.
- **TypeScript-first**: full type definitions for all config and props.

## Installation (consumer)

```bash
npm install @radarbase/app-kit
```

Peer dependencies (the host provides these — React Native projects already have most of them):

- `react >=16.8`, `react-native >=0.60`
- Optional peers used by certain services / widgets:
  - `@react-native-firebase/app`, `/analytics`, `/messaging`, `/remote-config`
  - `@react-native-async-storage/async-storage`
  - `react-native-keychain`

## Usage

Everything is imported from the package root. You should never reach into `lib/...` paths.

```tsx
import {
  AppShell,
  ThemeProvider,
  PluginManager,
  WidgetFactory,
  WidgetRegistry,
  CoreServicesProvider,
  useCoreServices,
  configLoader,
  validateAppConfig,
  defaultConfig,
  LocalFileStrategy,
  ServerStrategy,
} from '@radarbase/app-kit';
import type { AppConfig, WidgetConfig } from '@radarbase/app-kit';
```

### Minimal host app

```tsx
import React from 'react';
import {
  AppShell,
  ThemeProvider,
  CoreServicesProvider,
  validateAppConfig,
  defaultConfig,
} from '@radarbase/app-kit';
import appConfig from './config/myStudy.json';

export default function App() {
  const { valid, config } = validateAppConfig(appConfig);
  const resolved = valid ? config : defaultConfig;

  return (
    <CoreServicesProvider>
      <ThemeProvider theme={resolved.theme}>
        <AppShell config={resolved} />
      </ThemeProvider>
    </CoreServicesProvider>
  );
}
```

### Consuming core services from anywhere

```tsx
import { useCoreServices } from '@radarbase/app-kit';

function MyWidget() {
  const { api, config, auth, eventBus } = useCoreServices();
  // call api.get(...), config.get(...), auth.signIn(...), eventBus.emit(...)
}
```

### Registering a custom widget

```tsx
import { WidgetRegistry } from '@radarbase/app-kit';
import MyCustomWidget from './MyCustomWidget';

WidgetRegistry.getInstance().register('my-custom', MyCustomWidget);
```

Once registered, you can reference it from configuration by `type: 'my-custom'` and `WidgetFactory` will render it.

## Configuration

The library is fully configuration-driven. The `AppConfig` shape covers `theme`, `header`, and a nested `tabs → screens → widgets` tree.

### Example JSON

```json
{
  "theme": {
    "primary": "#007AFF",
    "secondary": "#5856D6",
    "background": "#FFFFFF",
    "text": "#000000"
  },
  "header": {
    "title": "Health Research App",
    "showBackButton": false,
    "showSettings": true
  },
  "tabs": [
    {
      "id": "dashboard",
      "label": "Dashboard",
      "icon": "📊",
      "screens": [
        {
          "id": "overview",
          "title": "Overview",
          "widgets": [
            {
              "id": "daily-check",
              "type": "questionnaire",
              "title": "Daily Health Check",
              "priority": 1,
              "config": {
                "questions": [
                  { "id": "sleep", "question": "How many hours did you sleep?", "type": "number", "min": 0, "max": 24 },
                  { "id": "mood",  "question": "How is your mood today?",      "type": "scale",  "min": 1, "max": 10 }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Loading strategies

- `LocalFileStrategy` — bundle a JSON config with the app (Phase 1, what the `starter-kit` uses today).
- `RemoteUrlStrategy` — fetch a JSON config from any HTTPS URL.
- `ServerStrategy` — fetch project configuration from a RADAR-Base appserver (Phase 2 target).

All strategies return the same validated `AppConfig`, so swapping strategies is a one-line change in the host.

## Built-in widgets

| Type                | Component               | Notes                                |
| ------------------- | ----------------------- | ------------------------------------ |
| `questionnaire`     | `QuestionnaireWidget`   | Multi-format surveys                                          |
| `task-list`         | `TaskListWidget`        | Task tracking with status                                     |
| `dashboard`         | `DashboardWidget`       | Config-driven charts (inline values, API source, range pills) |
| `device-status`     | `DeviceStatusWidget`    | Wearable / sensor connection status                           |
| `calendar`          | `CalendarWidget`        | Schedule of tasks / events                                    |

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
2. Edit `starter-kit/App.tsx` and `starter-kit/config/*.json` to experiment with new configs / widgets.

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
