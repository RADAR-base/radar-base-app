import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS } from '../../../../core/EventBus';
import type { ScreenBlueprint } from '../../../contracts/BlueprintSchema';
import type { OnDemandTask } from '../../../../types';
import {
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  tracking,
} from '../../../../theme/theme';
import type { NodeProps } from '../../types';
import { CalendarTaskCard } from '../card/CalendarTaskCard';
import { NoTasksEmptyState } from './NoTasksEmptyState';
import { inferTaskType } from './TaskDayList';

/** The page's side inset, matching the header and `TaskInstructionsScreen`. */
const PAGE_INSET = 16;
/** Tops the header's own 9 up to the 16 the instructions screen leaves above its heading. */
const HEADER_GAP = 16 - layoutTokens.gap;
/** Roughly the empty state's own height, so centring never squeezes it. */
const EMPTY_MIN = 330;

/** The view `OnDemandCardNode` opens when the study hasn't supplied one of its own. */
export const ON_DEMAND_VIEW = 'onDemandTasks';

/** The built-in screen for {@link ON_DEMAND_VIEW}: the task list as the whole page. */
export function onDemandBlueprint(title: string, description = ''): ScreenBlueprint {
  return {
    blueprintVersion: '1',
    root: { id: 'root_on_demand', type: 'OnDemandTaskListNode', title, description, fill: true },
  } as ScreenBlueprint;
}

/**
 * The tasks a participant can start at any time (Figma 4299:3131): the protocol's `on_demand`
 * assessments, or the "no tasks" illustration when there are none.
 */
export function OnDemandTaskListNode({ node, context }: NodeProps) {
  const { schedule, eventBus } = useCoreServices();
  // `fill`: this node is the whole page, so it scrolls itself and can centre its empty state.
  const fill = node.fill === true;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // The empty state sits below the header and intro; padding its bottom by that same offset centres
  // it on the screen itself, as long as there is room left for the illustration.
  const [emptyHeight, setEmptyHeight] = useState(0);
  const offsetAbove = Math.max(0, windowHeight - emptyHeight);
  const centring = emptyHeight > 0 ? Math.min(offsetAbove, Math.max(0, emptyHeight - EMPTY_MIN)) : 0;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const brand = context.theme.brandColors?.brand ?? tokens.button.background;
  const title = typeof node.title === 'string' ? node.title : '';
  const description = typeof node.description === 'string' ? node.description : '';
  // Same heading + description treatment as `TaskInstructionsScreen`.
  const intro =
    fill && (title || description) ? (
      <View>
        {!!title && <Text style={[styles.heading, { color: brand }]}>{title}</Text>}
        {!!description && (
          <Text style={[styles.description, { color: tokens.card.hint.text }]}>{description}</Text>
        )}
      </View>
    ) : null;
  const [tasks, setTasks] = useState<OnDemandTask[]>(() => schedule.getOnDemandTasks());

  // The protocol arrives with the schedule fetch, so re-read when that lands.
  const load = useCallback(() => setTasks(schedule.getOnDemandTasks()), [schedule]);
  useEffect(() => {
    load();
    eventBus.on(EVENTS.SCHEDULE_UPDATED, load);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, load);
  }, [eventBus, load]);

  const open = (task: OnDemandTask) => {
    eventBus.emit(EVENTS.OPEN_TASK_INSTRUCTIONS, {
      // Not a scheduled task, so there is nothing for the schedule to mark complete.
      taskId: `on_demand:${task.assessmentName}`,
      assessmentName: task.assessmentName,
      taskName: task.title,
      taskType: inferTaskType(task.title, task.taskType),
      startText: task.startText,
      endText: task.endText,
      duration: task.estimatedMinutes ? `${task.estimatedMinutes} min` : undefined,
      questionNumber: task.nQuestions ? `x${task.nQuestions}` : undefined,
    });
  };

  if (tasks.length === 0) {
    const empty = (
      <NoTasksEmptyState context={context} body="There are no tasks to start right now." />
    );
    if (!fill) return empty;
    return (
      <View style={styles.fillPage}>
        {intro}
        <View
          style={[styles.fillEmpty, { paddingBottom: centring }]}
          onLayout={(e) => setEmptyHeight(e.nativeEvent.layout.height)}
        >
          {empty}
        </View>
      </View>
    );
  }

  const list = (
    <View style={styles.list}>
      {tasks.map((task) => (
        <Pressable
          key={task.assessmentName}
          accessibilityRole="button"
          accessibilityLabel={task.title}
          onPress={() => open(task)}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
        >
          <CalendarTaskCard
            context={context}
            state="available"
            taskType={inferTaskType(task.title, task.taskType)}
            taskName={task.title}
            duration={task.estimatedMinutes ? `${task.estimatedMinutes} min` : undefined}
            expires={false}
            iconUrl={task.iconUrl}
          />
        </Pressable>
      ))}
    </View>
  );

  if (!fill) return list;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.fillList, { paddingBottom: insets.bottom + PAGE_INSET }]}
    >
      {intro}
      {list}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: layoutTokens.gap,
  },
  fillList: {
    paddingHorizontal: PAGE_INSET,
    paddingTop: HEADER_GAP,
    gap: 16,
  },
  fillPage: {
    flex: 1,
    paddingHorizontal: PAGE_INSET,
    paddingTop: HEADER_GAP,
  },
  fillEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
