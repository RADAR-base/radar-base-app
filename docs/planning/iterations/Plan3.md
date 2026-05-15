Great clarifications! Here’s how to **update the architecture and approach** to match your new requirements and the vision shown in the attached image:

---

## 1. **Plugin/Widget = Feature Module, Not Just UI Component**

- **Widgets/Plugins** are **feature-level modules** (e.g., `QuestionnaireWidget`, `VitalsWidget`, `SleepWidget`, `MedicationWidget`), not just UI elements.
- Each widget encapsulates:
  - **Business logic** (e.g., fetching, processing, and storing data)
  - **UI rendering** (configurable: Card, List, Chart, etc.)
  - **Navigation** (e.g., summary view vs. detailed view)
  - **Configurable UI presentation** (e.g., card, list, mini-chart, etc.)

---

## 2. **Configurable Presentation Layer**

- Each widget exposes **multiple UI modes** (e.g., summary card, list, detailed page).
- The **master config** specifies:
  - Which widget to use
  - Which UI mode to use for each context (e.g., home screen = card, detail screen = full page)
  - What data to show in each mode

**Example config:**
```json
{
  "homeScreen": {
    "blocks": [
      {
        "type": "QuestionnaireWidget",
        "config": {
          "presentation": "card",
          "questionnaireId": "PHQ8"
        }
      },
      {
        "type": "VitalsWidget",
        "config": {
          "presentation": "miniChart",
          "vitalType": "OxygenSaturation"
        }
      }
    ]
  },
  "detailScreens": {
    "QuestionnaireWidget": {
      "presentation": "fullPage"
    },
    "VitalsWidget": {
      "presentation": "detailedChart"
    }
  }
}
```

---

## 3. **Separation of Task/Survey Definitions and Schedules**

- **Definitions** (e.g., what a questionnaire is, what questions it contains) are stored in **definition files** (JSON/YAML).
- **Schedules** (e.g., when to show which task) are stored in **schedule files**.
- **Widgets** receive IDs or references to these definitions/schedules and fetch/subscribe to them at runtime.

---

## 4. **Widget Library & Plug-and-Play Experience**

- **Widget Library**: A collection of feature widgets (e.g., Questionnaire, Vitals, Sleep, Medication, Articles, etc.).
- **Widget Catalog UI**: Like your attached image, users/researchers can browse, search, and add widgets to their app configuration.
- **Plug-and-Play**: Adding a widget to the config instantly adds it to the app, with the desired presentation and data source.

---

## 5. **Updated Plugin/Widget Interface (React/TypeScript)**

```typescript
export interface WidgetProps {
  config: any; // includes presentation, data source, etc.
  context?: any; // for event bus, navigation, etc.
  onNavigate?: (widgetType: string, detailConfig: any) => void;
}
export type WidgetComponent = React.FC<WidgetProps>;
```

---

## 6. **Widget Example: QuestionnaireWidget**

- **Summary Card**: Shows title, next due, quick stats.
- **List Item**: Shows in a list with other questionnaires.
- **Full Page**: Shows the full questionnaire for completion.
- **Config** determines which mode to render.

```typescript
const QuestionnaireWidget: WidgetComponent = ({ config, onNavigate }) => {
  // Fetch definition and schedule using config.questionnaireId
  // Render based on config.presentation
  switch (config.presentation) {
    case "card":
      return <QuestionnaireCard ... />;
    case "list":
      return <QuestionnaireListItem ... />;
    case "fullPage":
      return <QuestionnaireFullPage ... />;
    default:
      return null;
  }
};
```

---

## 7. **Widget Manager (Dynamic Loader)**

- Reads config, loads widgets, passes config and context.
- Handles navigation (e.g., clicking a card opens the full page view).

---

## 8. **Widget Library Catalog UI**

- A searchable, categorized list of available widgets.
- Each entry shows a preview, description, and “Add” button.
- Adding a widget updates the master config (could be via UI or config file).

---

## 9. **Directory Structure Example**

```
/src
  /widgets
    QuestionnaireWidget.tsx
    VitalsWidget.tsx
    SleepWidget.tsx
    MedicationWidget.tsx
    ...
  /widgetLibrary
    WidgetCatalog.tsx
  /definitions
    questionnaires.json
    vitals.json
    ...
  /schedules
    schedules.json
  /components
    WidgetManager.tsx
    ...
  /config
    masterConfig.json
  App.tsx
```

---

## 10. **Summary Table**

| Aspect                        | Implementation Approach                                  |
|-------------------------------|---------------------------------------------------------|
| Widget = Feature Module       | Encapsulates logic, UI, navigation, config              |
| Configurable Presentation     | Widget renders different UIs based on config            |
| Task/Survey Definitions       | Separate files, referenced by widgets                   |
| Schedules                     | Separate files, referenced by widgets                   |
| Widget Library                | Catalog UI, plug-and-play via config                    |
| Dynamic UI                    | All driven by master config and widget library          |

---

## 11. **How This Matches Your Image and Requirements**

- **Widget Library**: Users can browse and add widgets (like in your image).
- **Feature Widgets**: Each widget is a full feature, not just a UI element.
- **Configurable UI**: Each widget can be shown as a card, list, chart, or full page.
- **Separation of Concerns**: Definitions and schedules are decoupled from UI.
- **Plug-and-Play**: Researchers can build custom app experiences by picking widgets and configuring their presentation.

---

**This approach will give you a scalable, flexible, and user-friendly system for building custom research apps with reusable, feature-rich widgets.**  
Let me know if you want a sample code snippet for the Widget Manager, a widget, or the catalog UI!