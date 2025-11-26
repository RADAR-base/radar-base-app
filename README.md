# RADARBase App Library

A plugin-based React Native library for health research data collection apps with configuration-driven UI and flexible configuration loading.

## 🚀 Features

- **Feature-based Widget System**: Questionnaire, TaskList, MoodTracker, TrendAnalysis, GoalTracker
- **Configuration-Driven UI**: YAML/JSON configuration for dynamic layouts
- **Flexible Configuration Loading**: Support for local files, remote URLs, and server APIs
- **Core Services**: EventBus and DataService for widget communication
- **TypeScript Support**: Full type safety and IntelliSense
- **React Native Web**: Works on web, iOS, and Android


### Example Configuration

```yaml
theme:
  primary: '#007AFF'
  secondary: '#5856D6'
  background: '#FFFFFF'
  text: '#000000'

header:
  title: 'Health Research App'
  showBackButton: false
  showSettings: true

tabs:
  - id: dashboard
    label: Dashboard
    icon: '📊'
    screens:
      - id: overview
        title: Overview
        widgets:
          - id: daily-check
            type: questionnaire
            title: Daily Health Check
            description: Complete your daily assessment
            priority: 1
            config:
              questions:
                - id: sleep
                  question: 'How many hours did you sleep?'
                  type: number
                  min: 0
                  max: 24
                - id: mood
                  question: 'How is your mood today?'
                  type: scale
                  min: 1
                  max: 10
```

## 🧩 Widget System

### Available Widgets

- **QuestionnaireWidget**: Multi-format surveys and assessments
- **TaskListWidget**: Task management with status tracking
- **MoodTrackerWidget**: Mood and emotion tracking
- **TrendAnalysisWidget**: Data visualization and analytics
- **GoalTrackerWidget**: Goal setting and progress tracking

### Widget Configuration

Each widget supports custom configuration:

```typescript
{
  type: 'questionnaire',
  title: 'Health Assessment',
  config: {
    questions: [
      {
        id: 'pain_level',
        question: 'Rate your pain level',
        type: 'scale',
        min: 1,
        max: 10
      }
    ]
  }
}
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For questions and support, please open an issue on GitHub. 