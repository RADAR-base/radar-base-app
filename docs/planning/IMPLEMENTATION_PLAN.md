# RADAR Plugin Architecture App Implementation Plan

## **Overview**
This document outlines the detailed implementation plan for converting the RADARhealth research app into a plugin/widget-based architecture using React Native with TypeScript.

## **Phase 1: Foundation & Core Services (Week 1-2)**

### **1.1 Project Setup ✅**
- [x] Initialize React Native project with TypeScript
- [x] Configure package.json with required dependencies
- [x] Set up TypeScript configuration with path aliases
- [x] Create core type definitions
- [x] Add ESLint + Prettier + `.editorconfig` for consistent style
- [x] Add Jest + `@testing-library/react-native` for unit testing
- [x] Add `zod` for config schema validation
- [x] Create `src/index.ts` barrel export (build validates from day one)
- [x] Create GitHub Actions CI workflow (typecheck + lint + test on every PR)
- [x] Pin all dependency versions for reproducible builds

### **1.2 Core Services Implementation**

#### **EventBus Service ✅**
- [x] Implement EventBus using mitt library
- [x] Define common event constants
- [x] Create type-safe event interfaces

#### **DataService Implementation**
- [x] Create DataService interface and mock implementation
- [ ] Integrate AsyncStorage for local storage
- [ ] Integrate Keychain for secure storage
- [ ] Add data encryption/decryption utilities
- [ ] Implement cache management

#### **NavigationService Implementation**
- [ ] Set up React Navigation v6
- [ ] Create NavigationService wrapper
- [ ] Implement deep linking support
- [ ] Add navigation event handling

#### **ApiService Implementation**
- [x] Create HTTP client (fetch-based)
- [ ] Implement request/response interceptors
- [x] Add authentication token management (TokenService provider)
- [ ] Implement retry logic and error handling

#### **AuthService Implementation**
- [x] Create authentication service interface & implementation (RADAR-style)
- [x] Add token refresh mechanism
- [ ] Implement login/logout UI flow
- [ ] Integrate with secure storage

#### **NotificationService Implementation**
- [x] Set up Firebase Cloud Messaging (Expo config + background handler)
- [x] Implement token retrieval and refresh
- [ ] Implement local notification scheduling
- [x] Add notification permission management (iOS request)
- [ ] Create notification event handlers

### **1.3 Configuration System — SDUI Multi-File**
> **Design updated:** see [`SDUI_CONFIG_DESIGN.md`](./SDUI_CONFIG_DESIGN.md). The single `masterConfig.yaml` is replaced by `app-manifest.json` + per-screen blueprint JSON files.

- [x] Design SDUI multi-file config format (manifest + blueprints)
- [x] Define Zod schemas: `ManifestSchema`, `BlueprintSchema`, `NodeSchema`
- [ ] Implement `ManifestLoader` with strategy chain (Remote → Bundled → Cache)
- [ ] Implement `BlueprintLoader` with per-screen lazy fetching and caching
- [ ] Write unit tests for schema validation (valid + invalid manifests)
- [ ] Create bundled fallback manifests and blueprints for offline use
- [ ] Implement `configSchemaVersion` migration handler (v1 → v2 upgrade path)
- [x] Add theme configuration support (in manifest `theme` block)
- [x] Introduce strategy-based configuration loader (Local/URL/Server)

## **Phase 2: Widget System & Plugin Manager (Week 3-4)**

### **2.1 Widget Registry**
- [x] Create widget registration system (WidgetRegistry)
- [x] Implement dynamic widget loading (lazy registration)
- [x] Add widget lifecycle management (mount/update/unmount events)
- [x] Create widget validation system (basic presence validation)
- [ ] Register all SDUI node types (see node catalog in `SDUI_CONFIG_DESIGN.md`)

### **2.2 SDUI Engine (Route Resolver + Load & Render)**
> Replaces the simple `PluginManager` block-renderer with a full SDUI pipeline.
- [x] Implement PluginManager component (base)
- [x] Add recursive widget rendering
- [x] Create widget context provider
- [x] Implement error boundaries for widgets (per-node `ErrorBoundary`)
- [ ] Implement `RouteResolver`: maps `tab.viewPath` → fetch blueprint
- [ ] Implement `NodeRenderer`: walks node tree, resolves type via `WidgetRegistry`
- [ ] Implement `{{variable}}` template interpolation in node props
- [ ] Implement secondary view navigation (ActionNode → `OpenCustomView`)
- [ ] Add blueprint caching (stale-while-revalidate, TTL-based)
- [ ] Write unit tests for `RouteResolver` and `NodeRenderer`

### **2.3 Core Components**
- [x] Create AppShell component
- [x] Implement Header component (config from manifest `header` block)
- [x] Create TabBar component (tabs from manifest `tabs[]`)
- [x] Add Screen container component

### **2.4 Theme System**
- [x] Create ThemeProvider component
- [x] Implement dynamic theme switching (runtime updates)
- [x] Add theme validation
- [x] Create theme utilities and hooks (useTheme)

## **Phase 3: Core Widgets Implementation (Week 5-6)**

### **3.1 SurveyTaskListNode** (replaces `QuestionnaireWidget`)
- [x] Create base component (was QuestionnaireWidget)
- [x] Implement `singleCard` variant
- [x] Implement `multiCard` variant
- [x] Create full-page secondary view via `ActionNode`
- [ ] Wire `filter.status` prop (incomplete/complete/all)
- [ ] Integrate with questionnaire definitions from data layer
- [x] Add progress tracking
- [ ] Implement auto-submit functionality
- [ ] Write unit tests for all variants

### **3.2 VitalsChartNode** (replaces `VitalsWidget`)
- [x] Create base component (was VitalsWidget)
- [x] Implement `mini` variant (inline chart)
- [x] Implement `detailed` variant (full chart)
- [ ] Wire `vitalType` prop to health data layer
- [ ] Add trend analysis
- [ ] Implement time range filtering
- [ ] Write unit tests

### **3.3 ConnectDevicesMenuNode + ConnectEhrNode** (replaces `DeviceStatusWidget`)
- [x] Create `ConnectDevicesMenuNode` component
- [x] Implement device connection status
- [x] Add sync status display
- [x] Create auto-refresh functionality
- [ ] Add device management actions (pair, forget, reconnect)
- [ ] Create `ConnectEhrNode` for EHR provider connection
- [ ] Write unit tests

### **3.4 CalendarNode** (replaces `CalendarWidget`)
- [x] Create base component
- [ ] Implement `calendar` variant
- [x] Implement `agenda` variant
- [ ] Integrate with task scheduling
- [ ] Add event filtering
- [x] Implement date navigation
- [ ] Write unit tests

### **3.5 New SDUI Layout Nodes**
- [ ] Implement `InboxItemListCoordinatorNode` (tabbed coordinator)
- [ ] Implement `InboxItemListNode` (per-category list)
- [ ] Implement `RelativeActivityTodayNode` (activity ring)
- [ ] Implement `ActionNode` with all action types (`OpenCustomView`, `OpenExternalUrl`, `Navigate`, `TriggerEvent`)
- [ ] Write unit tests for each node type

## **Phase 4: Data Layer & Integration (Week 7-8)**

### **4.1 Data Models**
- [ ] Define questionnaire data models
- [ ] Create task/schedule data models
- [ ] Implement user profile models
- [ ] Add device data models
- [x] Create vitals data models

### **4.2 Data Providers**
- [ ] Create questionnaire data provider
- [ ] Implement task scheduling provider
- [ ] Add user profile provider
- [ ] Create device data provider
- [x] Implement vitals data provider (mock)

### **4.3 API Integration**
- [ ] Integrate with RADAR-base backend APIs
- [ ] Implement data synchronization (KafkaService wired)
- [x] Add offline data handling (CacheService)
- [ ] Create conflict resolution
- [x] Implement data validation (config/theme)

### **4.4 File System Integration**
- [ ] Load questionnaire definitions from files
- [ ] Load schedule configurations from files
- [ ] Implement configuration hot-reloading
- [ ] Add file system watching

## **Phase 5: Native Integrations (Week 9-10)**

### **5.1 Health Kit Integration (iOS)**
- [ ] Set up HealthKit permissions
- [ ] Implement health data reading
- [ ] Add health data writing
- [ ] Create health data synchronization

### **5.2 Google Fit Integration (Android)**
- [ ] Set up Google Fit permissions
- [ ] Implement fitness data reading
- [ ] Add fitness data writing
- [ ] Create fitness data synchronization

### **5.3 Wearable Device Integration**
- [ ] Implement Bluetooth connectivity
- [ ] Add device pairing functionality
- [ ] Create data collection from wearables
- [ ] Implement device status monitoring

### **5.4 Push Notifications**
- [x] Set up Firebase Cloud Messaging (Expo plugins configured)
- [ ] Implement push notification handling (foreground/background listeners)
- [ ] Add notification scheduling
- [ ] Create notification action handling

## **Phase 6: Widget Library & Admin Interface (Week 11-12)**

### **6.1 Widget Catalog**
- [ ] Create widget library interface
- [ ] Implement widget search functionality
- [ ] Add widget categorization
- [ ] Create widget preview system

### **6.2 Configuration Editor**
- [ ] Create visual configuration editor
- [ ] Implement drag-and-drop interface
- [ ] Add real-time preview
- [ ] Create configuration validation

### **6.3 Widget Store**
- [ ] Implement widget marketplace
- [ ] Add widget installation system
- [ ] Create widget versioning
- [ ] Implement widget updates

## **Phase 7: E2E & Performance Testing (Week 13-14)**
> Unit tests are written alongside each phase (not deferred). This phase covers only E2E and performance profiling.

### **7.1 E2E Testing**
- [ ] Create user journey tests (questionnaire completion, device pairing)
- [ ] Test manifest + blueprint loading end-to-end
- [ ] Test secondary view navigation via `ActionNode`
- [ ] Validate offline fallback (blueprint cache + bundled fallback)
- [ ] Test error scenarios (malformed blueprint, missing node type)

### **7.2 Performance Testing**
- [ ] Profile node tree render time (target: <100ms)
- [ ] Profile blueprint fetch + parse time
- [ ] Test memory usage under 150MB
- [ ] Validate app startup time <3 seconds
- [ ] Optimize bundle size (<50MB)

## **Phase 8: Documentation & Deployment (Week 15-16)**

### **8.1 Documentation**
- [ ] Create widget development guide
- [ ] Write API documentation
- [ ] Create configuration reference
- [ ] Add troubleshooting guide

### **8.2 Developer Tools**
- [ ] Create widget development CLI
- [ ] Add debugging tools
- [ ] Create configuration validator
- [ ] Implement hot reloading

### **8.3 Deployment**
- [ ] Set up CI/CD pipeline
- [ ] Create app store builds
- [ ] Implement over-the-air updates
- [ ] Set up monitoring and analytics

## **Key Deliverables**

### **Technical Deliverables**
1. **Core Architecture**
   - Plugin/widget system
   - Core services (Data, API, Auth, Navigation, Notifications)
   - Event bus for inter-widget communication
   - Configuration-driven UI system

2. **Widget Library**
   - QuestionnaireWidget
   - VitalsWidget
   - DeviceStatusWidget
   - CalendarWidget
   - TaskListWidget

3. **Configuration System (SDUI)**
   - `app-manifest.json` (app name, version, theme, tabs, secondary views)
   - Per-screen blueprint JSON files (node trees, lazy-loaded)
   - Zod schema validation for manifest and blueprints
   - Strategy-based blueprint loader (Remote → Bundled → Cache)
   - `configSchemaVersion` migration handling

4. **Native Integrations**
   - HealthKit/Google Fit integration
   - Wearable device connectivity
   - Push notifications
   - Secure storage

### **User Experience Deliverables**
1. **Dynamic UI**
   - Configuration-driven screens
   - Multiple presentation modes per widget
   - Responsive design
   - Accessibility support

2. **Widget Catalog**
   - Searchable widget library
   - Plug-and-play installation
   - Widget preview system
   - Configuration editor

## **Risk Mitigation**

### **Technical Risks**
1. **Performance Issues**
   - Mitigation: Implement lazy loading, code splitting
   - Monitoring: Performance profiling, memory usage tracking

2. **Configuration Complexity**
   - Mitigation: Comprehensive validation, fallback configurations
   - Testing: Automated configuration testing

3. **Native Integration Challenges**
   - Mitigation: Platform-specific implementations, fallback modes
   - Testing: Device-specific testing matrix

### **Project Risks**
1. **Scope Creep**
   - Mitigation: Clear phase definitions, MVP approach
   - Management: Regular sprint reviews, stakeholder alignment

2. **Timeline Delays**
   - Mitigation: Parallel development tracks, early integration
   - Monitoring: Weekly progress reviews, risk assessments

## **Success Metrics**

### **Technical Metrics**
- App startup time < 3 seconds
- Widget rendering time < 100ms
- Memory usage < 150MB
- Bundle size < 50MB
- 99.9% configuration validation accuracy

### **User Experience Metrics**
- Widget installation time < 30 seconds
- Configuration change reflection < 1 second
- User satisfaction score > 4.5/5
- Crash rate < 0.1%

### **Business Metrics**
- 50% reduction in development time for new features
- 80% of customizations achievable through configuration
- 90% code reusability across different studies
- 100% backward compatibility with existing data 

