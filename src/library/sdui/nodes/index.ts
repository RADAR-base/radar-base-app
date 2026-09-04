import { NodeRegistry } from '../NodeRegistry';

import { ActionNode } from './ActionNode';
import { AlertBannerNode } from './AlertBannerNode';
import { CalendarNode } from './CalendarNode';
import { CardNode } from './CardNode';
import { ConnectDevicesMenuNode } from './ConnectDevicesMenuNode';
import { InboxItemListCoordinatorNode } from './InboxItemListCoordinatorNode';
import { InboxItemListNode } from './InboxItemListNode';
import { QuestionnaireNode } from './QuestionnaireNode';
import { RelativeActivityTodayNode } from './RelativeActivityTodayNode';
import { SectionNode } from './SectionNode';
import { SurveyTaskListNode } from './SurveyTaskListNode';
import { TextNode } from './TextNode';
import { ViewNode } from './ViewNode';
import { VitalsChartNode } from './VitalsChartNode';

/**
 * Idempotently register every built-in node type in the `NodeRegistry` singleton. The
 * library's public `SDUIShell` calls this on first mount; tests and hosts can also call
 * it explicitly before constructing the shell.
 */
let registered = false;
export function registerBuiltInNodes(): void {
  if (registered) return;
  const registry = NodeRegistry.getInstance();

  // Layout
  registry.register('ViewNode', ViewNode);
  registry.register('SectionNode', SectionNode);
  registry.register('CardNode', CardNode);

  // Content
  registry.register('TextNode', TextNode);
  registry.register('ActionNode', ActionNode);

  // Feature nodes
  registry.register('SurveyTaskListNode', SurveyTaskListNode);
  registry.register('QuestionnaireNode', QuestionnaireNode);
  registry.register('VitalsChartNode', VitalsChartNode);
  registry.register('ConnectDevicesMenuNode', ConnectDevicesMenuNode);
  registry.register('CalendarNode', CalendarNode);

  // Stubs / future
  registry.register('InboxItemListCoordinatorNode', InboxItemListCoordinatorNode);
  registry.register('InboxItemListNode', InboxItemListNode);
  registry.register('RelativeActivityTodayNode', RelativeActivityTodayNode);
  registry.register('AlertBannerNode', AlertBannerNode);

  registered = true;
}

export {
  ActionNode,
  AlertBannerNode,
  CalendarNode,
  CardNode,
  ConnectDevicesMenuNode,
  InboxItemListCoordinatorNode,
  InboxItemListNode,
  QuestionnaireNode,
  RelativeActivityTodayNode,
  SectionNode,
  SurveyTaskListNode,
  TextNode,
  ViewNode,
  VitalsChartNode,
};
