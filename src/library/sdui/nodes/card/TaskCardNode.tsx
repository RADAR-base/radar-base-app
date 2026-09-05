import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import DurationIcon from '../../../../theme/icons/duration.svg';
import MedicineQuantityIcon from '../../../../theme/icons/medicinequantitiy.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens, cardShadow, withAlpha } from '../../../../theme/theme';
import type { NodeProps } from '../../types';
import { TaskIcon } from './TaskIcon';
import { TYPE_COLORS, TASK_TINT, type TaskCardType } from './taskTypes';

// Re-exported for back-compat: these moved to `./taskTypes` so `TaskIcon` and this file can both use
// them without a circular import.
export { TYPE_COLORS, TASK_TINT } from './taskTypes';
export type { TaskCardType } from './taskTypes';

const NEW_TASK_GREEN = '#9CB167';
/** Grey scrim laid over a not-yet-available task to read it as disabled/greyed-out. */
const UNAVAILABLE_SCRIM = 'rgba(202, 203, 212, 0.5)';

function normalizeType(value: unknown): TaskCardType {
  return value === 'speech' || value === 'physical' || value === 'medication'
    ? value
    : 'questionnaire';
}

/**
 * Task card — the reduced-clutter V3 design (Figma node 3530:7243): a task-type icon badge, the task
 * name with an optional "New Task!" pill, and two info pills. The first pill shows time-left
 * (`{expirationTime} Left`, hourglass) when the task is available, or `Available at {time}` when it's
 * not yet due; the second shows the duration (clock) — or, for medication, the quantity (pill icon).
 * A not-yet-available task (`available: false`) is greyed out with a translucent scrim.
 */
export function TaskCardNode({ node, context }: NodeProps) {
  const taskType = normalizeType(node.taskType);
  const taskName = typeof node.taskName === 'string' ? node.taskName : 'Task Name';
  const available = node.available !== false;
  const newTask = node.newTask === true;
  const duration = typeof node.duration === 'string' ? node.duration : '10 min';
  const expirationTime = typeof node.expirationTime === 'string' ? node.expirationTime : '24H 00M';
  const time = typeof node.time === 'string' ? node.time : '9:00';
  const medicationQuantity =
    typeof node.medicationQuantity === 'string' ? node.medicationQuantity : 'Quantity';
  const iconUrl = typeof node.iconUrl === 'string' ? node.iconUrl : undefined;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const c = TYPE_COLORS[taskType];

  const pill = (label: string, PillIcon?: ComponentType<SvgProps>) => (
    <View style={[styles.pill, { backgroundColor: withAlpha(c, TASK_TINT) }]}>
      {PillIcon && <PillIcon width={12} height={12} color={c} />}
      <Text style={[styles.pillText, { color: c }]}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: tokens.card.task.background }]}>
      <View style={styles.row}>
        <TaskIcon taskType={taskType} iconUrl={iconUrl} size={64} />

        <View style={styles.content}>
          <View style={styles.nameRow}>
            <Text style={[styles.taskName, { color: tokens.text.primary }]} numberOfLines={1}>
              {taskName}
            </Text>
            {newTask && (
              <View style={[styles.newPill, { backgroundColor: NEW_TASK_GREEN }]}>
                <Text style={styles.newPillText}>New Task!</Text>
              </View>
            )}
          </View>

          <View style={styles.pillRow}>
            {available ? pill(`Expires in ${expirationTime}`) : pill(`Available at ${time}`)}
            {taskType === 'medication'
              ? pill(medicationQuantity, MedicineQuantityIcon)
              : pill(duration, DurationIcon)}
          </View>
        </View>
      </View>

      {!available && <View style={styles.scrim} pointerEvents="none" />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: layoutTokens.gap,
    borderRadius: 24,
    ...cardShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutTokens.gap,
    width: '100%',
  },
  content: {
    flex: 1,
    gap: layoutTokens.gap,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutTokens.gap,
    width: '100%',
  },
  taskName: {
    flex: 1,
    fontSize: layoutTokens.headingFontSize,
    // Slightly taller than the font size so tall glyphs aren't clipped on Android.
    lineHeight: 20,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  newPill: {
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
  },
  newPillText: {
    fontSize: layoutTokens.captionFontSize,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
    color: '#FFFFFF',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pill: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
  },
  pillText: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: UNAVAILABLE_SCRIM,
    borderRadius: 24,
  },
});
