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
  "clinicalTemplate": "hypertension",
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
      "id": "tab_learn",
      "label": "Learn",
      "icon": "book-open",
      "viewPath": "views/learn.json"
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
    "questionnaire_full": "views/secondary/questionnaire.json",
    "health_coach": "views/secondary/health-coach.json",
    "appointment_booking": "views/secondary/appointment-booking.json"
  },
  "alerts": {
    "enabled": true,
    "rules": [
      {
        "id": "high_bp",
        "metric": "bloodPressureSystolic",
        "condition": "gt",
        "threshold": 140,
        "severity": "warning",
        "message": "Blood pressure reading is above normal range"
      }
    ]
  },
  "roles": {
    "participant": "views/home.json",
    "caregiver": "views/caregiver-home.json"
  },
  "cms": {
    "articlesEndpoint": "https://cms.radar-base.org/articles",
    "cacheTTLMinutes": 60
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

#### Monitoring & Data Collection
| Type | Description | Key Props |
|---|---|---|
| `SurveyTaskListNode` | List of ePRO / questionnaire tasks | `variant` (`singleCard`/`multiCard`), `filter`, `title` |
| `VitalsChartNode` | Vitals trend chart | `vitalType`, `variant` (`mini`/`detailed`) |
| `SymptomTrackerNode` | Symptom logging with severity levels | `symptoms[]`, `variant` (`card`/`detailed`) |
| `MedicationAdherenceNode` | Dose schedule + adherence tracking | `medicationId`, `showStreak` |
| `RelativeActivityTodayNode` | Today's activity progress ring | — |
| `AirQualityNode` | Ambient air quality by geolocation | `showMap` |

#### Connectivity
| Type | Description | Key Props |
|---|---|---|
| `ConnectEhrNode` | EHR connection prompt/status | `provider` |
| `ConnectDevicesMenuNode` | Device pairing menu | — |
| `HealthCoachNode` | Messaging thread with care team | `variant` (`preview`/`full`) |
| `AppointmentBookingNode` | Schedule / view upcoming appointments | `calendarIntegration` |
| ~~`TeleHealthNode`~~ | *(backlog — audio/video call with provider)* | — |

#### Content & Engagement
| Type | Description | Key Props |
|---|---|---|
| `FeaturedArticleNode` | Personalised learning resources from CMS | `category`, `variant` (`card`/`list`) |
| `CalendarNode` | Schedule calendar view | `variant` (`calendar`/`agenda`) |
| `InboxItemListCoordinatorNode` | Tabbed inbox container | `isCanvas`, `children` |
| `InboxItemListNode` | Single category inbox list | `category` |

#### Utility
| Type | Description | Key Props |
|---|---|---|
| `AlertBannerNode` | Flagged reading or urgent message | `severity` (`info`/`warning`/`critical`) |
| `PDFExportNode` | Generate + share PDF health summary | `dataRange`, `sections[]` |
| `ProxyEntryNode` | Caregiver/proxy data entry mode toggle | `relationship` |

### Action Types (for `ActionNode`)

| Action | Description |
|---|---|
| `OpenCustomView` | Opens a secondary view by `viewUrl` key from manifest |
| `OpenExternalUrl` | Opens browser to an external URL |
| `Navigate` | In-app navigation to a tab by `tabId` |
| `TriggerEvent` | Emits an event on the EventBus by `eventName` |
| `BookAppointment` | Opens appointment booking flow |
| `ExportPDF` | Triggers PDF health summary generation |
| ~~`StartTeleHealth`~~ | *(backlog)* |

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

## 9. Clinical Templates

Pre-built manifest + blueprint sets for common therapeutic areas. Setting `clinicalTemplate` in the manifest causes the SDUI engine to merge template defaults before applying study-specific overrides (template < study config < runtime config).

| Template ID | Condition | Pre-loaded Node Types |
|---|---|---|
| `hypertension` | Hypertension | `VitalsChartNode` (BP), `MedicationAdherenceNode`, `AlertBannerNode` |
| `oncology` | Cancer / Oncology | `SymptomTrackerNode`, `SurveyTaskListNode` (ePRO), `FeaturedArticleNode` |
| `copd` | COPD / Asthma | `VitalsChartNode` (SpO2), `AirQualityNode`, `MedicationAdherenceNode` |
| `diabetes` | Diabetes | `VitalsChartNode` (glucose), `MedicationAdherenceNode`, `RelativeActivityTodayNode` |
| `post_surgery` | Post-surgical recovery | `SurveyTaskListNode`, `AppointmentBookingNode`, `HealthCoachNode` |

Templates ship as bundled blueprints in the library so a study can go live with zero custom blueprint authoring.

---

## 10. Role-Based Views

The `roles` map in the manifest lets a single deployment serve different home screens to different user types without separate builds.

```json
"roles": {
  "participant": "views/home.json",
  "caregiver": "views/caregiver-home.json",
  "clinician": "views/clinician-dashboard.json"
}
```

The SDUI engine resolves the correct blueprint at login time based on the authenticated user's role from the RADAR-base auth token. Role is re-evaluated on each app foreground in case it changes server-side.

`ProxyEntryNode` can be placed in any blueprint to let a caregiver temporarily submit data on behalf of a participant without switching roles at the account level.

---

## 11. Automated Alerting

Alert rules live in the manifest `alerts.rules[]` array and are evaluated by the SDUI engine after every data submission. Each rule specifies a **condition** and one or more **actions** to execute when that condition is met.

```json
"alerts": {
  "enabled": true,
  "rules": [
    {
      "id": "high_bp",
      "metric": "bloodPressureSystolic",
      "condition": "gt",
      "threshold": 140,
      "actions": [
        {
          "type": "ShowBanner",
          "severity": "warning",
          "message": "Blood pressure reading is above normal range"
        },
        {
          "type": "SendNotification",
          "title": "High blood pressure recorded",
          "body": "Your latest reading was above 140 mmHg."
        }
      ]
    },
    {
      "id": "missed_medication",
      "metric": "medicationAdherence",
      "condition": "lt",
      "threshold": 0.7,
      "windowDays": 7,
      "actions": [
        {
          "type": "ShowBanner",
          "severity": "info",
          "message": "Medication adherence has dropped below 70% this week"
        },
        {
          "type": "AddTask",
          "taskType": "MedicationReview",
          "title": "Review your medication schedule",
          "dueOffsetDays": 1
        }
      ]
    },
    {
      "id": "low_spo2",
      "metric": "oxygenSaturation",
      "condition": "lt",
      "threshold": 92,
      "actions": [
        {
          "type": "ShowBanner",
          "severity": "critical",
          "message": "Oxygen saturation is critically low"
        },
        {
          "type": "SendNotification",
          "title": "Critical SpO₂ reading",
          "body": "Please contact your care team immediately."
        },
        {
          "type": "OpenView",
          "viewUrl": "health_coach"
        }
      ]
    }
  ]
}
```

### Alert Action Types

| Type | Description | Key Props |
|---|---|---|
| `ShowBanner` | Renders `AlertBannerNode` at top of relevant screen | `severity` (`info`/`warning`/`critical`), `message` |
| `SendNotification` | Fires a push notification | `title`, `body` |
| `AddTask` | Creates a new task in the participant's task list | `taskType`, `title`, `dueOffsetDays` |
| `OpenView` | Navigates to a secondary view | `viewUrl` (key from `manifest.secondaryViews`) |
| `TriggerEvent` | Emits an event on the EventBus for custom widget handling | `eventName`, `payload` |
| `FlagForReview` | Marks the submission for clinician review in the portal | `priority` (`routine`/`urgent`) |

Multiple actions can be combined on a single rule — they execute in array order.

Alert rules are intentionally kept declarative (no scripting) to support safe over-the-air updates without code review.

---

## 12. CMS-Driven Content

`FeaturedArticleNode` fetches content from the endpoint defined in `manifest.cms.articlesEndpoint`. Articles are filtered by `category` and personalised by the user's study phase and engagement history.

```json
"cms": {
  "articlesEndpoint": "https://cms.radar-base.org/articles",
  "cacheTTLMinutes": 60
}
```

The CMS contract returns a list of article cards:
```json
[
  {
    "id": "art_001",
    "title": "Managing Blood Pressure Through Diet",
    "category": "hypertension",
    "thumbnailUrl": "...",
    "readTimeMinutes": 4,
    "deepLink": "views/secondary/article-art_001.json"
  }
]
```

Article body blueprints follow the same node tree format — meaning rich article layouts (text, images, callout cards, embedded videos) are fully SDUI-rendered without any native code changes.

---

## 13. Why This Approach

| Concern | Single `masterConfig.yaml` | SDUI Multi-file |
|---|---|---|
| Update screens OTA | Redeploy full config | Redeploy only changed blueprint |
| Add a new screen | Edit one large file | Add one new JSON file + manifest entry |
| Offline support | All-or-nothing fallback | Per-screen bundled fallback |
| Config size growth | File grows unbounded | Each file stays small |
| Tooling / IDE support | YAML (limited schema) | JSON + Zod (full type inference) |
| Deep linking | Manual mapping needed | Secondary views are first-class |
| Analytics / targeting | No stable node IDs | Stable node `id` on every node |
