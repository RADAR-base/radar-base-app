/**
 * Public surface of the SDUI engine. Hosts typically only need `SDUIShell` plus the
 * helpers to wire bundled blueprints; advanced consumers can register custom node types
 * directly with `NodeRegistry`.
 */

export { SDUIShell } from './SDUIShell';
export type { SDUIShellProps } from './SDUIShell';

export { NodeRegistry } from './NodeRegistry';
export type { NodeComponent, NodeProps, SDUIContext, TemplateContext, ActionPayload } from './types';

export {
  ManifestLoader,
  parseManifest,
} from './ManifestLoader';
export type { ManifestSource } from './ManifestLoader';

export {
  BlueprintLoader,
  parseBlueprint,
  createBundledBlueprintSource,
} from './BlueprintLoader';
export type { BlueprintSource } from './BlueprintLoader';

export { interpolate, interpolateDeep } from './templating';
export { createActionDispatcher } from './ActionDispatcher';
export { NodeErrorBoundary } from './NodeErrorBoundary';
export { NodeRenderer } from './NodeRenderer';

// Reusable chart primitives + data-resolution hook. Surfaced so consumer-defined nodes
// can render minimal numeric visualizations without pulling in a charting library.
export { BarChart, Sparkline } from './Charts';
export type { ChartProps } from './Charts';
export { useDashboardData } from './useDashboardData';
export type { ResolvedSeries, DashboardDataState } from './useDashboardData';
export type { StatCardType, StatCardSize } from './nodes/card/StatCardNode';
export type { TaskCardType } from './nodes/card/TaskCardNode';
export type { DataWheelSize } from './nodes/card/DataWheelCardNode';
export type { BarChartSize } from './nodes/card/BarChartCardNode';
export type { LineGraphXAxis } from './nodes/card/LineGraphCardNode';

export {
  registerBuiltInNodes,
  ActionNode,
  AlertBannerNode,
  CalendarNode,
  CardNode,
  StatCardNode,
  TaskCardNode,
  ToDoStatusNode,
  DataWheelCardNode,
  BarChartCardNode,
  ArcDataCardNode,
  LineGraphCardNode,
  CardSectionNode,
  TaskListSectionNode,
  ConnectDevicesMenuNode,
  HeaderNode,
  InboxItemListCoordinatorNode,
  InboxItemListNode,
  NavbarNode,
  QuestionnaireNode,
  RelativeActivityTodayNode,
  SectionNode,
  SurveyTaskListNode,
  TextNode,
  ViewNode,
  GraphDataNode,
} from './nodes';

// Questionnaire sub-components (for custom questionnaire UIs)
export {
  RadioInput,
  CheckboxInput,
  RangeInput,
  SliderInput,
  TextQuestionInput,
  InfoScreen,
  QuestionRenderer,
  evaluateBranchingLogic,
} from './nodes/questionnaire';
