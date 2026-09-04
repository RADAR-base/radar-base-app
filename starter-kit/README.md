# RADAR-Base Starter Kit

A clone-and-rename template for building a study app on top of [`@radarbase/app-kit`](../README.md).

The starter ships with:

- An Expo / React Native shell wired to `AppShell` from the library.
- A login flow and an authenticated app shell (`src/screens/`, `src/hooks/`).
- A **runnable demo** powered by [`config/healthResearchConfig.json`](./config/healthResearchConfig.json) — multi-tab study app with questionnaires, vitals, tasks, mood, calendar, device-status widgets.
- A **minimal** config in [`config/minimal.json`](./config/minimal.json) — one tab, one widget — that you can drop in to start clean.
- An example **custom widget** ([`CustomDemoWidget.tsx`](./CustomDemoWidget.tsx)) registered through `WidgetRegistry` at app boot, demonstrating the runtime extension point.

> Note: this directory currently lives **inside** the `@radarbase/app-kit` monorepo so it doubles as the library's local sandbox. Once the library is published, it is designed to be lifted out into its own repo — see [Extracting into its own repo](#extracting-into-its-own-repo) below.

## Quick start

Prerequisites: Node ≥ 18, Xcode (for iOS), Android Studio (for Android), and Expo CLI (`npm i -g expo` is no longer required — we use `npx expo`).

```bash
# from the starter-kit/ directory
npm install
npx expo start              # Metro dev server, choose i / a / w
# or:
npm run ios                 # native iOS build via Expo prebuild
npm run android             # native Android build
npm run web                 # web preview
npm run typecheck           # tsc --noEmit
```

The starter assumes `@radarbase/app-kit` is installable from your registry (the `package.json` pins `^1.0.0`). If you're hacking on the library locally, see [Local library development](#local-library-development).

## Clone and rename for a new study

1. **Copy the directory** (or `git clone` once this is its own repo) to a new location and rename it:

   ```bash
   cp -R starter-kit ../my-study-app
   cd ../my-study-app
   ```

2. **Update `package.json`**:

   - `name` → `"my-study-app"` (npm-safe).
   - `version` → `"0.1.0"` (your starting version).

3. **Update `app.json`** (Expo + native identifiers):

   - `expo.name` → `"My Study"`.
   - `expo.slug` → `"my-study"`.
   - `expo.ios.bundleIdentifier` → `"com.acme.mystudy"`.
   - `expo.ios.scheme` → `"com.acme.mystudy"`.
   - `expo.android.package` → `"com.acme.mystudy"`.
   - `expo.android.intentFilters[0].data[0].scheme` → `"com.acme.mystudy"`.

4. **Native projects** (`ios/` and `android/`) still contain Expo-prebuilt files named after the previous app (`exampleapp`, `org.radarbase.*`). The cleanest way to refresh them is:

   ```bash
   rm -rf ios android
   npx expo prebuild --clean
   ```

   That regenerates `ios/` and `android/` from your new `app.json`. If you've added custom native code, do a manual rename instead — see [Apple's docs on renaming targets](https://developer.apple.com/documentation/xcode/configuring-your-app-target) and `android/app/src/main/java/.../MainApplication.java`.

5. **Replace the bundled config** with your own. Either:

   - Drop a new JSON file into `config/` and update the import in `App.tsx` (line near the top: `import localHealthResearchConfig from './config/...'`).
   - Or keep the filename and swap its contents.

   Start from `config/minimal.json` if you want a clean slate, or `config/healthResearchConfig.json` if you want a multi-tab example to evolve.

6. **Update the Firebase credentials** (only if you're using Firebase features). Drop your `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) into the native projects, then re-run `npx expo prebuild`. The starter does **not** ship hardcoded Firebase credentials — see the `firebase.initializeApp` branch in `App.tsx`.

7. **`npm install` + run**.

That's the whole bootstrap. There is intentionally no rename script — the steps above are explicit so you can see what's happening per platform.

## Configuration

`App.tsx` boots the SDUI engine. It bundles `config/app-manifest.json` plus per-view blueprint JSON files, hands them to `SDUIShell`, and registers any host-defined custom node types in the `NodeRegistry`.

```tsx
import {
  CoreServicesProvider,
  NodeRegistry,
  SDUIShell,
  createBundledBlueprintSource,
} from '@radarbase/app-kit';
import appManifest from './config/app-manifest.json';
import homeBlueprint from './config/views/home.json';
import insightsBlueprint from './config/views/insights.json';
import CustomDemoNode from './CustomDemoNode';

NodeRegistry.getInstance().register('CustomDemoNode', CustomDemoNode);

const BUNDLED_BLUEPRINTS = {
  'views/home.json': homeBlueprint,
  'views/insights.json': insightsBlueprint,
};

export default function App() {
  return (
    <CoreServicesProvider>
      <SDUIShell
        manifestSource={async () => appManifest}
        blueprintSource={createBundledBlueprintSource(BUNDLED_BLUEPRINTS)}
      />
    </CoreServicesProvider>
  );
}
```

The manifest + blueprint shapes are described in `docs/planning/SDUI_CONFIG_DESIGN.md` and exported as runtime Zod schemas (`ManifestSchema`, `BlueprintSchema`, `NodeSchema`) plus the inferred types (`AppManifest`, `ScreenBlueprint`, `Node`).

### Adding a custom node

1. Create a component that accepts `NodeProps` from `@radarbase/app-kit`:

   ```tsx
   // MyNode.tsx
   import type { NodeProps } from '@radarbase/app-kit';
   export default function MyNode({ node, context }: NodeProps) {
     return /* ... use node.* fields and context.theme.* tokens ... */;
   }
   ```

2. Register it once at app startup, before `SDUIShell` renders:

   ```tsx
   import { NodeRegistry } from '@radarbase/app-kit';
   import MyNode from './MyNode';
   NodeRegistry.getInstance().register('MyNode', MyNode);
   ```

3. Reference it from a blueprint:

   ```json
   { "id": "demo", "type": "MyNode", "title": "My Node" }
   ```

   Optionally declare it in the manifest's `widgetsRegistry` so other parts of the engine can discover it.

The starter already does this for [`CustomDemoNode`](./CustomDemoNode.tsx) — open `App.tsx` and grep for `NodeRegistry.register` to see the pattern.

## Switching blueprints

Swap which blueprint drives a tab by editing `app-manifest.json` — change a `tab.viewPath` to point at a different JSON file under `config/views/`. No `App.tsx` edits required.

When you're ready to move to **server-side** project configuration, replace `createBundledBlueprintSource(...)` with a fetch-based `BlueprintSource` and have your `manifestSource` resolve the manifest from your server — the engine handles caching, request deduplication, and schema validation.

## Local library development

While developing inside this monorepo, the published `@radarbase/app-kit@^1.0.0` may not exist on a registry yet. Two options:

- **Option A: temporarily point at the workspace.** Edit `package.json`:

  ```json
  "@radarbase/app-kit": "file:../"
  ```

  Then `npm install` again. Don't commit this change.

- **Option B: `npm link`.** From the repo root run `npm link`, then from `starter-kit/` run `npm link @radarbase/app-kit`. Reverse with `npm unlink @radarbase/app-kit`.

Either option lets you edit `src/` in the parent repo, run `npm run build` at the root, and see updates here.

If you switch to `file:../`, also **uncomment the local-library-dev block at the bottom of `metro.config.js`**. That block pins React, React Native, and the web shims to the starter's own `node_modules`, which avoids the "two copies of React" error you otherwise get with linked deps. Re-comment it when you switch back to the published `^1.0.0` dep.

## Extracting into its own repo

Once the library is published and you want this starter to live in its own repository:

```bash
# from the monorepo root, create a sibling repo with this directory's history
git subtree split --prefix=starter-kit -b starter-kit-only
mkdir ../radar-base-starter-kit
cd ../radar-base-starter-kit
git init
git pull ../radar-base-app starter-kit-only

# inside the extracted repo, delete the commented "local library development"
# block at the bottom of metro.config.js (it's only meaningful inside the monorepo).

# create the GitHub repo and push
gh repo create radar-base-starter-kit --public --source=. --remote=origin --push
```

After extraction, `npm install` in the new repo will fetch `@radarbase/app-kit` from npm, the metro config can be simplified to the Expo defaults, and the directory is fully self-contained.

## Layout

```text
starter-kit/
├── App.tsx                 <- mounts AppShell, validates config, registers custom widgets
├── index.ts                <- registerRootComponent(App)
├── app.json                <- Expo + native identifiers (rename per study)
├── package.json            <- depends on @radarbase/app-kit ^1.0.0
├── tsconfig.json
├── metro.config.js         <- Firebase resolution + commented local-dev block
├── CustomDemoWidget.tsx    <- example custom widget (deletable)
├── config/
│   ├── healthResearchConfig.json   <- runnable multi-tab demo
│   └── minimal.json                <- one-tab clean start
├── src/
│   ├── screens/            <- LoginScreen, AuthSuccessScreen
│   ├── hooks/              <- useAuth
│   ├── services/           <- app-specific services
│   └── config/             <- app-side config helpers (if any)
├── assets/                 <- icon, splash, adaptive icon, favicon
├── ios/                    <- Expo prebuild output; regenerate after rename
└── android/                <- Expo prebuild output; regenerate after rename
```

## License

MIT — same as `@radarbase/app-kit`.
