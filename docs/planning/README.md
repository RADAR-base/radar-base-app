# Planning Documentation

This folder contains all planning and design documents for the RADAR App Kit project.

## Active Documents

### [Implementation Plan](./IMPLEMENTATION_PLAN.md)
16-week development roadmap with phase-by-phase tasks, deliverables, and success metrics. **This is the source of truth for current work.**

### [SDUI Config Design](./SDUI_CONFIG_DESIGN.md)
Specification for the Server-Driven UI multi-file configuration system: `app-manifest.json`, per-screen blueprint JSON files, node type catalog, the SDUI engine (Route Resolver + Load & Render), Zod schema definitions, and migration guide from the old `masterConfig.yaml`. **Start here before implementing anything in the config or rendering layer.**

### [RADAR Services Design](./RADAR_SERVICES_MIGRATION.md)
Design specification for the 8 core services: TokenService, AnalyticsService, CacheService, KafkaService, ConfigService, AuthService, NotificationService, and CoreServicesContext.

## Archived Documents

The [`archive/`](./archive/) folder contains earlier architectural explorations. They are preserved for history but are **superseded** by the active documents above — do not use them as implementation references.

- `Plan1.md` — Initial tech stack evaluation (Flutter vs React Native vs Ionic)
- `Plan2.md` — First React plugin architecture sketch
- `Plan3.md` — Feature-module widgets with configurable presentations
- `Plan4.md` — Comprehensive plan with YAML config and code skeletons
- `Plan5.md` — Theme config + EventBus integration

## Quick Links

- [Back to Main README](../../README.md)
- [Implementation Plan](./IMPLEMENTATION_PLAN.md)
- [SDUI Config Design](./SDUI_CONFIG_DESIGN.md)
- [Project Root](../../)
