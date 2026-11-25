import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import {
  DEFAULT_ACCENT,
  cardShadow,
  getColorTokens,
  layout as layoutTokens,
  readableTextColor,
  textStyle,
  withAlpha,
  type ThemeMode,
} from '../../../../theme/theme';
import { useDataRange, useRangedNode, type DataRange } from '../../dataRange';
import type { NodeProps } from '../../types';
import { RisingText } from '../../RisingText';
import { useLocalMetric } from '../../useLocalMetric';
import { SmallDataCard, smallText, isSmall } from './SmallDataCard';
import { CardInfo, headerIcons } from './CardInfo';
import { openDataDetail } from './DataDetail';
import { CardEmpty, emptyCopy } from './CardEmpty';
import { PERIOD_LABELS, compactNumber, pillText, valueLabel } from './chartAxis';

const FILL_MS = 450;
/** The figure, bar and line the empty state stands in for, so the card keeps its height. */
const BODY_HEIGHT = 40 + layoutTokens.gap + 16 + layoutTokens.gap + 16;

/** How the copy names the goal, for each Day / Week / Month filter setting. */
const PERIODS: Record<DataRange, { goal: string; met: string }> = {
  day: { goal: 'today’s goal', met: 'today' },
  week: { goal: 'this week’s goal', met: 'this week' },
  month: { goal: 'this month’s goal', met: 'this month' },
};

/**
 * A value against its goal (Figma 4517:145): "6,240 / 10,000 steps", a bar, the percent, and how far
 * is left. Once the goal is met the card turns to the accent.
 *
 * Not tied to steps: `title`, `unit` and the copy are the blueprint's, and the figures come from
 * `value` / `target`, written per Day / Week / Month to follow the data filter, or from a local
 * `metric` (e.g. `task_completed`). `remainingText` and `goalMetText` replace the copy;
 * `{remaining}` and `{unit}` are filled in. `size: "small"` is the 1×1 version (Figma 4664:1092).
 */
export function GoalProgressCardNode(props: NodeProps) {
  return isSmall(props.node) ? <SmallGoalCard {...props} /> : <GoalProgressCard {...props} />;
}

function GoalProgressCard({ node: blueprintNode, context }: NodeProps) {
  const {
    title,
    unit,
    viewPath,
    showOpenButton,
    info,
    value,
    target,
    progress,
    message,
    surface,
    valueInk,
    ink,
    trackColor,
    barColor,
    a11yPeriod,
    barStyle,
    tokens,
    empty,
  } = useGoal(blueprintNode, context, false);
  const { showInfo, showOpen } = headerIcons(info, viewPath, showOpenButton);

  const summary = `${value.toLocaleString()} of ${target.toLocaleString()}${unit ? ` ${unit}` : ''}`;

  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${a11yPeriod}. ${empty ? `${empty.headline}. ${empty.message}` : `${summary}. ${message}`}`}
      style={[styles.card, { backgroundColor: surface }, cardShadow]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: ink }]} numberOfLines={1}>
            {title}
          </Text>
          {showInfo && info && <CardInfo title={title} info={info} color={withAlpha(ink, 0.55)} context={context} />}
        </View>
        {showOpen && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${title}`}
            onPress={() => openDataDetail(context, title, viewPath)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.open,
              { backgroundColor: tokens.card.stats.openBadge },
              pressed && styles.pressed,
            ]}
          >
            <ArrowRightIcon width={13} height={12} color={tokens.card.stats.openIcon} />
          </Pressable>
        )}
      </View>

      {empty ? (
        <CardEmpty headline={empty.headline} message={empty.message} color={ink} minHeight={BODY_HEIGHT} />
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.valueRow}>
              {/* New figures (the filter changing period) rise into place; the bar eases. */}
              <RisingText style={[styles.value, { color: valueInk }]}>{value.toLocaleString()}</RisingText>
              <Text style={[styles.small, { color: ink }]}>
                / {target.toLocaleString()}
                {unit ? ` ${unit}` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.progress}>
            <View style={[styles.track, { backgroundColor: trackColor }]}>
              <Animated.View style={[styles.bar, { backgroundColor: barColor }, barStyle]} />
            </View>
            <RisingText style={[styles.percent, { color: ink }]}>{`${Math.round(progress * 100)}%`}</RisingText>
          </View>

          <Text style={[styles.small, { color: ink }]}>{pillText(message)}</Text>
        </>
      )}
    </View>
  );
}

/** The figure, "out of" the goal, the bar and what's left: no pill, so it fits one column. */
function SmallGoalCard({ node: blueprintNode, context }: NodeProps) {
  const goal = useGoal(blueprintNode, context, true);
  const { title, unit, a11yPeriod, value, target, progress, message, valueInk, ink, empty } = goal;
  const targetText = `out of ${compactNumber(target)}`;

  return (
    <SmallDataCard
      context={context}
      title={title}
      viewPath={goal.viewPath}
      showOpenButton={goal.showOpenButton}
      info={goal.info}
      surface={goal.surface}
      ink={ink}
      accessibilityLabel={`${title}, ${a11yPeriod}. ${empty ? `${empty.headline}. ${empty.message}` : `${value.toLocaleString()} of ${target.toLocaleString()}${unit ? ` ${unit}` : ''}. ${message}`}`}
      value={
        empty ? (
          <Text style={[smallText.small, { color: ink }]}>{goal.periodName}</Text>
        ) : (
          <View>
            <RisingText style={[smallText.value, { color: valueInk }]} numberOfLines={1}>
              {value.toLocaleString()}
            </RisingText>
            <Text style={[smallText.small, { color: ink }]} numberOfLines={1}>
              {targetText}
            </Text>
          </View>
        )
      }
    >
      {empty ? (
        <CardEmpty headline={empty.headline} color={ink} small />
      ) : (
        <View style={styles.smallVisual}>
          <View style={[styles.progress, styles.smallProgress]}>
            <View style={[styles.track, { backgroundColor: goal.trackColor }]}>
              <Animated.View style={[styles.bar, { backgroundColor: goal.barColor }, goal.barStyle]} />
            </View>
            <RisingText style={[styles.percent, { color: ink }]}>{`${Math.round(progress * 100)}%`}</RisingText>
          </View>
          <Text style={[smallText.small, { color: withAlpha(ink, 0.6) }]} numberOfLines={1}>
            {pillText(message)}
          </Text>
        </View>
      )}
    </SmallDataCard>
  );
}

/** The goal's figures and colours, shared by both sizes. `small` picks the shorter copy. */
function useGoal(blueprintNode: NodeProps['node'], context: NodeProps['context'], small: boolean) {
  const range = useDataRange();
  const node = useRangedNode(blueprintNode);
  const period = PERIODS[range];

  const mode: ThemeMode = context.colorScheme ?? 'light';
  const brandColors = context.theme.brandColors;
  const tokens = getColorTokens(mode, brandColors);
  const brand = brandColors?.brand ?? tokens.button.background;
  const accent = brandColors?.accent ?? DEFAULT_ACCENT;

  const title = typeof node.title === 'string' ? node.title : 'Goal';
  const unit = typeof node.unit === 'string' ? node.unit : '';
  const periodLabel = valueLabel(node.periodLabel, 'total', range);
  const viewPath = typeof node.viewPath === 'string' && node.viewPath ? node.viewPath : undefined;
  const info = typeof node.info === 'string' && node.info ? node.info : undefined;
  const showOpenButton = node.showOpenButton;

  const local = useLocalMetric(typeof node.metric === 'string' ? node.metric : '');
  const value = local?.value ?? (typeof node.value === 'number' ? node.value : 0);
  const target =
    typeof node.target === 'number' && node.target > 0 ? node.target : local?.target && local.target > 0 ? local.target : 1;

  const progress = value / target;
  const goalMet = progress >= 1;
  const remaining = Math.max(0, Math.ceil(target - value));

  const fill = (text: string) =>
    text.replace(/\{remaining\}/g, remaining.toLocaleString()).replace(/\{unit\}/g, unit);
  const message = goalMet
    ? fill(
        typeof node.goalMetText === 'string'
          ? node.goalMetText
          : small
            ? 'Goal reached'
            : `Goal reached ${period.met}`,
      )
    : fill(
        typeof node.remainingText === 'string'
          ? node.remainingText
          : `{remaining}${unit ? ' {unit}' : ''} ${small ? 'to go' : `to reach ${period.goal}`}`,
      );

  // The bar is the brand, as the bar charts' bars are; once met the card takes the accent, as in
  // Figma's "Goal met" state.
  const surface = goalMet ? accent : tokens.card.stats.background;
  const text = tokens.text.primary;
  const valueInk = goalMet ? readableTextColor(accent, { preferred: text }) : text;
  const ink = goalMet ? readableTextColor(accent, { preferred: brand }) : text;
  const trackColor = withAlpha(valueInk, goalMet ? 0.55 : 0.08);
  const barColor = brand;
  const a11yPeriod = `${PERIOD_LABELS[range]}${periodLabel ? `, ${periodLabel}` : ''}`;
  const empty = node.noData === true ? emptyCopy(node, title, range, { small }) : null;

  // Eases to the new length when the figures change, e.g. switching Day / Week / Month.
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(Math.min(1, Math.max(0, progress)), {
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, shown]);
  const barStyle = useAnimatedStyle(() => ({ width: `${shown.value * 100}%` }));

  return {
    title,
    unit,
    viewPath,
    showOpenButton,
    info,
    value,
    target,
    progress,
    message,
    surface,
    valueInk,
    ink,
    trackColor,
    barColor,
    a11yPeriod,
    barStyle,
    tokens,
    empty,
    periodName: PERIOD_LABELS[range],
  };
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    gap: layoutTokens.gap,
    padding: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...textStyle(12, 16, 'regular'),
    flexShrink: 1,
  },
  open: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  summary: {
    gap: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 4,
  },
  value: { ...textStyle(36, 40, 'bold'), fontWeight: '700' },
  small: textStyle(12, 16, 'regular'),
  /** A neutral chip for the card's one-line summary, sized to its text. */
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    height: 8,
    borderRadius: 4,
  },
  percent: { ...textStyle(12, 16, 'bold'), fontWeight: '700' },
  smallVisual: {
    gap: 6,
  },
  smallProgress: {
    gap: 8,
  },
});
