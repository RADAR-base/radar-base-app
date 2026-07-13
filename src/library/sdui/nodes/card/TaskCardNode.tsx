import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import QuestionnaireIcon from '../../../../theme/icons/questionnaire.svg';
import SpeechIcon from '../../../../theme/icons/speech.svg';
import PhysicalIcon from '../../../../theme/icons/physical.svg';
import MedicationIcon from '../../../../theme/icons/medicine.svg';
import ReminderIcon from '../../../../theme/icons/reminder.svg';
import ExpiryIcon from '../../../../theme/icons/expiry.svg';
import DurationIcon from '../../../../theme/icons/duration.svg';
import QuantityIcon from '../../../../theme/icons/quantity.svg';
import MedicineQuantityIcon from '../../../../theme/icons/medicinequantitiy.svg';
import MedicineDoseIcon from '../../../../theme/icons/medicinedose.svg';
import { getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import type { NodeProps } from '../../types';

export type TaskCardType = 'questionnaire' | 'speech' | 'physical' | 'medication';

type TaskTypeTokenKey = 'medication' | 'questionnaire' | 'physical' | 'speech';

const ICON: Record<TaskCardType, ComponentType<SvgProps>> = {
  questionnaire: QuestionnaireIcon,
  speech: SpeechIcon,
  physical: PhysicalIcon,
  medication: MedicationIcon,
};

/**
 * Reminder pills only exist on questionnaire/speech/physical (per Figma's `reminder`
 * variant) — medication tasks don't have one.
 */
const SUPPORTS_REMINDER: Record<TaskCardType, boolean> = {
  questionnaire: true,
  speech: true,
  physical: true,
  medication: false,
};

/**
 * Task card — matches the Figma `TaskPill` component set (node 2266:2740), which has a
 * `taskType` variant (questionnaire / speech / physical / medication) and an optional
 * `reminder` variant that adds a time pill next to the task name.
 *
 * Secondary badges: `time` has no icon (per Figma); `expirationTime` uses the hourglass
 * (`expiry.svg`), `duration` the clock (`duration.svg`), and `questionNumber` the list
 * icon (`quantity.svg`) for questionnaire/speech/physical. `medication` swaps the last
 * two for its own pill icon (`medicinequantitiy.svg`) and repeat icon
 * (`medicinedose.svg`).
 */
export function TaskCardNode({ node, context }: NodeProps) {
  const taskType: TaskCardType =
    node.taskType === 'speech' || node.taskType === 'physical' || node.taskType === 'medication'
      ? node.taskType
      : 'questionnaire';
  const taskName = typeof node.taskName === 'string' ? node.taskName : 'Task Name';
  const time = typeof node.time === 'string' ? node.time : '9 AM';
  const expirationTime = typeof node.expirationTime === 'string' ? node.expirationTime : '24H 00M';
  const duration = typeof node.duration === 'string' ? node.duration : '10 min';
  const questionNumber = typeof node.questionNumber === 'string' ? node.questionNumber : 'x8';
  const medicationQuantity =
    typeof node.medicationQuantity === 'string' ? node.medicationQuantity : 'Quantity';
  const medicationDose = typeof node.medicationDose === 'string' ? node.medicationDose : 'Dose';
  const reminder = node.reminder === true && SUPPORTS_REMINDER[taskType];
  const reminderTime = typeof node.reminderTime === 'string' ? node.reminderTime : '12:00 PM';

  const tokens = getColorTokens(context.colorScheme ?? 'light');
  const tokenKey: TaskTypeTokenKey = taskType;
  const typeTokens = tokens.card.task.taskType[tokenKey];
  const badgeColor = typeTokens.badge;
  const iconColor = typeTokens.icon;
  // Figma special-cases physical's reminder-pill text to its own `badgeText` token
  // instead of the shared `reminderText` used by questionnaire/speech.
  const reminderTextColor =
    taskType === 'physical' ? tokens.card.task.taskType.physical.badgeText : tokens.card.task.taskType.reminderText;
  const Icon = ICON[taskType];

  const pill = (label: string, PillIcon?: ComponentType<SvgProps>) => (
    <View style={[styles.pill, { backgroundColor: badgeColor }]}>
      {PillIcon && <PillIcon width={12} height={12} color={iconColor} />}
      <View style={styles.pillTextWrapper}>
        <Text style={[styles.pillText, { color: iconColor }]}>{label}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: tokens.card.task.background }]}>
      <View style={styles.nameRow}>
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Icon width={32} height={32} color={iconColor} />
        </View>
        <Text style={[styles.taskName, { color: tokens.text.primary }]} numberOfLines={1}>
          {taskName}
        </Text>
        {reminder && (
          <View style={[styles.reminderPill, { backgroundColor: iconColor }]}>
            <ReminderIcon width={10} height={10} color={reminderTextColor} />
            <View style={styles.pillTextWrapper}>
              <Text style={[styles.pillText, { color: reminderTextColor }]}>{reminderTime}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.badgeRow}>
        {pill(time)}
        {taskType === 'medication' ? (
          <>
            {pill(medicationQuantity, MedicineQuantityIcon)}
            {pill(medicationDose, MedicineDoseIcon)}
          </>
        ) : (
          <>
            {pill(`${expirationTime} Left`, ExpiryIcon)}
            {pill(duration, DurationIcon)}
            {pill(questionNumber, QuantityIcon)}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: layoutTokens.gap,
    borderRadius: layoutTokens.radiusCard,
    gap: layoutTokens.gap,
    shadowColor: '#085041',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutTokens.gap,
    width: '100%',
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: layoutTokens.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskName: {
    flex: 1,
    fontSize: layoutTokens.headingFontSize,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: layoutTokens.letterSpacing,
  },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: layoutTokens.gap,
    width: '100%',
  },
  pill: {
    height: 20,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A fixed-height wrapper + justifyContent: 'center' avoids relying on `lineHeight` to
  // control vertical space — iOS's native Text adds extra leading above/below the glyph
  // based on the font's ascender/descender metrics that `lineHeight` alone doesn't
  // suppress, which otherwise reads as visually off-center next to the pill icons (same
  // fix as `StatCardNode`'s value/badge row).
  pillTextWrapper: {
    height: 12,
    justifyContent: 'center',
  },
  pillText: {
    fontSize: layoutTokens.captionFontSize,
    letterSpacing: layoutTokens.letterSpacing,
  },
});
