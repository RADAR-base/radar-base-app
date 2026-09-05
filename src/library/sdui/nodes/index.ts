import { NodeRegistry } from '../NodeRegistry';

import { ActionNode } from './ActionNode';
import { AlertBannerNode } from './AlertBannerNode';
import { CalendarNode } from './CalendarNode';
import { CardNode } from './CardNode';
import { StatCardNode } from './card/StatCardNode';
import { TaskCardNode } from './card/TaskCardNode';
import { ToDoStatusNode } from './card/ToDoStatusNode';
import { DataWheelCardNode } from './card/DataWheelCardNode';
import { BarChartCardNode } from './card/BarChartCardNode';
import { ArcDataCardNode } from './card/ArcDataCardNode';
import { LineGraphCardNode } from './card/LineGraphCardNode';
import { CardSectionNode } from './section/CardSectionNode';
import { TaskListSectionNode } from './section/TaskListSectionNode';
import { NotificationListNode } from './section/NotificationListNode';
import { ConnectDevicesMenuNode } from './ConnectDevicesMenuNode';
import { HeaderNode } from './header/HeaderNode';
import { InboxItemListCoordinatorNode } from './InboxItemListCoordinatorNode';
import { InboxItemListNode } from './InboxItemListNode';
import { NavbarNode } from './navbar/NavbarNode';
import { QuestionnaireNode } from './QuestionnaireNode';
import { RelativeActivityTodayNode } from './RelativeActivityTodayNode';
import { SectionNode } from './SectionNode';
import { SurveyTaskListNode } from './SurveyTaskListNode';
import { TextNode } from './TextNode';
import { ViewNode } from './ViewNode';
import { GraphDataNode } from './GraphDataNode';

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
  registry.register('StatCardNode', StatCardNode);
  registry.register('TaskCardNode', TaskCardNode);
  registry.register('ToDoStatusNode', ToDoStatusNode);
  registry.register('DataWheelCardNode', DataWheelCardNode);
  registry.register('BarChartCardNode', BarChartCardNode);
  registry.register('ArcDataCardNode', ArcDataCardNode);
  registry.register('LineGraphCardNode', LineGraphCardNode);
  registry.register('CardSectionNode', CardSectionNode);
  registry.register('TaskListSectionNode', TaskListSectionNode);
  registry.register('NotificationListNode', NotificationListNode);

  // Header — HeaderBarNode / HeaderTextNode are internal building blocks; only the
  // composite HeaderNode is a blueprint-addressable node type.
  registry.register('HeaderNode', HeaderNode);

  // Navbar — NavbarItemNode is an internal building block; only NavbarNode is
  // blueprint-addressable.
  registry.register('NavbarNode', NavbarNode);

  // Content
  registry.register('TextNode', TextNode);
  registry.register('ActionNode', ActionNode);

  // Feature nodes
  registry.register('SurveyTaskListNode', SurveyTaskListNode);
  registry.register('QuestionnaireNode', QuestionnaireNode);
  registry.register('GraphDataNode', GraphDataNode);
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
  StatCardNode,
  TaskCardNode,
  ToDoStatusNode,
  DataWheelCardNode,
  BarChartCardNode,
  ArcDataCardNode,
  LineGraphCardNode,
  CardSectionNode,
  TaskListSectionNode,
  NotificationListNode,
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
};
