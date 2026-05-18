# Server-Driven UI (SDUI) Configuration Design

## Overview

The configuration system uses a **multi-file SDUI** approach inspired by competitive apps in the health research space. Instead of a single monolithic `masterConfig.yaml`, the app loads a lightweight **manifest** at startup and fetches individual **screen blueprints** on demand — enabling over-the-air screen changes without a release.

```
┌─────────────────────────────────────────────────────┐
│                  app-manifest.json                  │
│  AppName, Version, Tabs → view files, SecondaryViews│
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │  React Native Runtime   │
          │  App & SDUI Engine      │
          │  ┌──────────────────┐   │
          │  │  Route Resolver  │   │
          │  └────────┬─────────┘   │
          │           │             │
          │  ┌────────▼─────────┐   │
          │  │  Load & Render   │   │
          │  └──────────────────┘   │
          └─────────────────────────┘
               │        │        │
         home.json  tasks.json  secondaryView1.json
```

---

## 1. File Structure

```
config/
├── app-manifest.json          ← entry point, always loaded at startup
└── views/
    ├── home.json              ← Home tab blueprint
    ├── tasks.json             ← Tasks tab blueprint
    ├── profile.json           ← Profile tab blueprint
    └── secondary/
        ├── inbox-history.json ← Secondary view (drawer/modal)
        └── questionnaire.json ← Full-page secondary view
```

Blueprints can be:
- **Bundled** — shipped with the app as local assets (fallback / offline)
- **Remote** — fetched from a CDN or the RADAR-base config server (live updates)

The `ConfigService` loads the manifest first, then resolves blueprints via a strategy chain: `Remote → Bundled → Cache`.

---

## 2. `app-manifest.json`

The manifest is the only file the SDUI engine requires at cold start.

```json
{
  "appName": "RADAR Health",
  "version": "1.0.0",
  "configSchemaVersion": "1",
  "theme": {
    "primaryColor": "#1976d2",
    "secondaryColor": "#424242",
    "backgroundColor": "#f5f5f5",
    "fontFamily": "Inter, Arial, sans-serif",
    "fontSize": 16,
    "button": { "borderRadius": 8 }
  },
  "header": {
    "title": "RADAR Health",
    "showSettings": true
  },
  "tabs": [
    {
      "id": "tab_home",
      "label": "Home",
      "icon": "home",
      "viewPath": "views/home.json"
    },
    {
      "id": "tab_tasks",
      "label": "Tasks",
      "icon": "clipboard-list",
      "viewPath": "views/tasks.json"
    },
    {
      "id": "tab_profile",
      "label": "Profile",
      "icon": "user",
      "viewPath": "views/profile.json"
    }
  ],
  "secondaryViews": {
    "inbox_history": "views/secondary/inbox-history.json",
    "questionnaire_full": "views/secondary/questionnaire.json"
  }
}
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `appName` | string | Display name shown in header/OS |
| `version` | string | SemVer app version |
| `configSchemaVersion` | string | Schema version for migration handling |
| `theme` | `ThemeConfig` | Global theme applied to all views |
| `header` | `HeaderConfig` | AppShell header configuration |
| `tabs` | `TabConfig[]` | Bottom navigation tabs and their view paths |
| `secondaryViews` | `Record<string, string>` | Named secondary views opened by `ActionNode` |

---

## 3. Screen Blueprint Format

Each screen is a **node tree** — a JSON document describing a hierarchical structure of typed UI nodes. Every node has a stable `id` (used for analytics, targeting, and incremental updates), a `type`, and type-specific properties.

### Root structure

```json
{
  "blueprintVersion": "1",
  "root": {
    "id": "root_home",
    "type": "ViewNode",
    "isCanvas": true,
    "children": [ ... ]
  }
}
```

### `home.json` — Home Screen Blueprint

```json
{
  "blueprintVersion": "1",
  "root": {
    "id": "root_home",
    "type": "ViewNode",
    "isCanvas": true,
    "children": [
      {
        "id": "section_welcome",
        "type": "SectionNode",
        "children": [
          {
            "id": "text_greeting",
            "type": "TextNode",
            "text": "Hello, {{user.firstName}}",
            "style": "heading2"
          }
        ]
      },
      {
        "id": "survey_tasks_home",
        "type": "SurveyTaskListNode",
        "variant": "singleCard",
        "filter": { "status": "incomplete" }
      },
      {
        "id": "card_activity",
        "type": "CardNode",
        "isCanvas": true,
        "children": [
          {
            "id": "relative_activity",
            "type": "RelativeActivityTodayNode"
          }
        ]
      },
      {
        "id": "card_connect_ehr",
        "type": "CardNode",
        "isCanvas": true,
        "children": [
          {
            "id": "ehr_connect",
            "type": "ConnectEhrNode"
          }
        ]
      },
      {
        "id": "card_devices",
        "type": "CardNode",
        "isCanvas": true,
        "children": [
          {
            "id": "devices_menu",
            "type": "ConnectDevicesMenuNode"
          }
        ]
      }
    ]
  }
}
```

### `tasks.json` — Tasks Screen Blueprint

```json
{
  "blueprintVersion": "1",
  "root": {
    "id": "root_tasks",
    "type": "ViewNode",
    "isCanvas": true,
    "title": "Tasks",
    "children": [
      {
        "id": "survey_incomplete",
        "type": "SurveyTaskListNode",
        "variant": "multiCard",
        "title": "To Do",
        "filter": { "status": "incomplete" }
      },
      {
        "id": "survey_complete",
        "type": "SurveyTaskListNode",
        "variant": "multiCard",
        "title": "Completed",
        "filter": { "status": "complete" }
      }
    ]
  }
}
```

### `secondary/inbox-history.json` — Inbox Secondary View

```json
{
  "blueprintVersion": "1",
  "root": {
    "id": "root_inbox",
    "type": "ViewNode",
    "isCanvas": true,
    "children": [
      {
        "id": "text_inbox_title",
        "type": "TextNode",
        "text": "## Inbox",
        "style": "markdown"
      },
      {
        "id": "inbox_list_coordinator",
        "type": "InboxItemListCoordinatorNode",
        "isCanvas": true,
        "children": [
          {
            "id": "inbox_messages",
            "type": "InboxItemListNode",
            "category": "Messages"
          },
          {
            "id": "inbox_surveys",
            "type": "InboxItemListNode",
            "category": "Surveys"
          },
          {
            "id": "inbox_resources",
            "type": "InboxItemListNode",
            "category": "Resources"
          },
          {
            "id": "inbox_recent",
            "type": "InboxItemListNode",
            "category": "Recent"
          }
        ]
      },
      {
        "id": "card_view_history",
        "type": "CardNode",
        "isCanvas": true,
        "children": [
          {
            "id": "action_view_history",
            "type": "ActionNode",
            "title": "View inbox history",
            "action": "OpenCustomView",
            "viewUrl": "inbox_history"
          }
        ]
      }
    ]
  }
}
```

---

## 4. Node Type Catalog

Each node type maps to a registered React Native component in the `WidgetRegistry`.

### Layout Nodes

| Type | Description | Key Props |
|---|---|---|
| `ViewNode` | Root screen container, scrollable | `isCanvas`, `title`, `children` |
| `SectionNode` | Logical grouping with optional header | `title`, `children` |
| `CardNode` | Elevated card container | `isCanvas`, `children` |

### Content Nodes

| Type | Description | Key Props |
|---|---|---|
| `TextNode` | Static or templated text | `text` (supports `{{var}}`), `style` |
| `ActionNode` | Tappable button / link | `title`, `action`, `viewUrl`, `icon` |

### Feature Nodes (map to Widgets)

| Type | Description | Key Props |
|---|---|---|
| `SurveyTaskListNode` | List of questionnaire tasks | `variant` (`singleCard`/`multiCard`), `filter`, `title` |
| `RelativeActivityTodayNode` | Today's activity progress ring | — |
| `ConnectEhrNode` | EHR connection prompt/status | `provider` |
| `ConnectDevicesMenuNode` | Device pairing menu | — |
| `InboxItemListCoordinatorNode` | Tabbed inbox container | `isCanvas`, `children` |
| `InboxItemListNode` | Single category inbox list | `category` |
| `VitalsChartNode` | Vitals trend chart | `vitalType`, `variant` (`mini`/`detailed`) |
| `CalendarNode` | Schedule calendar view | `variant` (`calendar`/`agenda`) |

### Action Types (for `ActionNode`)

| Action | Description |
|---|---|
| `OpenCustomView` | Opens a secondary view by `viewUrl` key from manifest |
| `OpenExternalUrl` | Opens browser to an external URL |
| `Navigate` | In-app navigation to a tab by `tabId` |
| `TriggerEvent` | Emits an event on the EventBus by `eventName` |

---

## 5. Templating

Node properties support simple `{{variable}}` interpolation resolved at render time:

```json
{ "text": "Hello, {{user.firstName}}" }
{ "text": "Study: {{study.name}}" }
{ "title": "Week {{schedule.currentWeek}} of {{schedule.totalWeeks}}" }
```

Supported template scopes:

| Scope | Variables |
|---|---|
| `user` | `firstName`, `lastName`, `id` |
| `study` | `name`, `id`, `phase` |
| `schedule` | `currentWeek`, `totalWeeks`, `nextTask` |

---

## 6. SDUI Engine — Runtime Flow

```
App Start
    │
    ▼
Load app-manifest.json (bundled fallback if remote unavailable)
    │
    ▼
Validate manifest against ManifestSchema (Zod)
    │
    ▼
Render AppShell (Header + TabBar from manifest)
    │
    ▼
User selects tab  ─────────────────────────────────────┐
    │                                                   │
    ▼                                                   │
Route Resolver: tab.viewPath → fetch blueprint JSON     │
    │                                                   │
    ▼                                                   │
Validate blueprint against BlueprintSchema (Zod)       │
    │                                                   │
    ▼                                                   │
Walk node tree, resolve each node via WidgetRegistry    │
    │                                                   │
    ▼                                                   │
Render nodes top-down (ErrorBoundary per node)          │
    │                                                   │
ActionNode tapped → action = OpenCustomView ────────────┘
    │
    ▼
Route Resolver: manifest.secondaryViews[viewUrl] → fetch + render
```

### Blueprint caching

- Blueprints are cached by `viewPath` in `CacheService` (TTL: 1 hour for remote, indefinite for bundled).
- If remote fetch fails, the cached or bundled version is used (stale-while-revalidate).
- A `blueprintVersion` field on each file allows the engine to skip re-parsing unchanged content.

---

## 7. Schema Validation (Zod)

All config files are validated via Zod schemas defined in `src/contracts/`:

```typescript
// src/contracts/ManifestSchema.ts
import { z } from 'zod';

export const TabConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  viewPath: z.string(),
});

export const ManifestSchema = z.object({
  appName: z.string(),
  version: z.string(),
  configSchemaVersion: z.string(),
  theme: ThemeConfigSchema,
  header: HeaderConfigSchema,
  tabs: z.array(TabConfigSchema).min(1),
  secondaryViews: z.record(z.string()).optional(),
});

export type AppManifest = z.infer<typeof ManifestSchema>;
```

```typescript
// src/contracts/BlueprintSchema.ts
import { z } from 'zod';

export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    isCanvas: z.boolean().optional(),
    children: z.array(NodeSchema).optional(),
  }).passthrough(),
);

export const BlueprintSchema = z.object({
  blueprintVersion: z.string(),
  root: NodeSchema,
});

export type ScreenBlueprint = z.infer<typeof BlueprintSchema>;
```

---

## 8. Migration from `masterConfig.yaml`

The previous single-file YAML approach is superseded by this design. Migration steps:

1. Extract `theme` and `header` into `app-manifest.json`
2. Extract `tabs` → manifest `tabs[]` with `viewPath` references
3. Convert each `screens.<name>.blocks[]` into a `ViewNode` tree in its own `views/<name>.json`
4. Map old block `type` values to new node types:
   - `QuestionnaireWidget` → `SurveyTaskListNode`
   - `VitalsWidget` → `VitalsChartNode`
   - `DeviceStatusWidget` → `ConnectDevicesMenuNode`
   - `CalendarWidget` → `CalendarNode`
5. Replace the `ConfigLoader` YAML strategy with a JSON fetch + Zod validation pipeline

---

## 9. Why This Approach

| Concern | Single `masterConfig.yaml` | SDUI Multi-file |
|---|---|---|
| Update screens OTA | Redeploy full config | Redeploy only changed blueprint |
| Add a new screen | Edit one large file | Add one new JSON file + manifest entry |
| Offline support | All-or-nothing fallback | Per-screen bundled fallback |
| Config size growth | File grows unbounded | Each file stays small |
| Tooling / IDE support | YAML (limited schema) | JSON + Zod (full type inference) |
| Deep linking | Manual mapping needed | Secondary views are first-class |
| Analytics / targeting | No stable node IDs | Stable node `id` on every node |
