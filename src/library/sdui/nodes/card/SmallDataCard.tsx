import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import { cardShadow, getColorTokens, layout as layoutTokens, textStyle, type ThemeMode } from '../../../../theme/theme';
import type { NodeProps } from '../../types';

/** `size: "small"` on a data card: one grid column wide, as tall as a large stat card. */
export function isSmall(node: NodeProps['node']): boolean {
  return node.size === 'small';
}

/** Cards whose small size is as tall as a large card, so the grid gives them a whole column, not half. */
export const SQUARE_SMALL_TYPES = new Set([
  'GoalProgressCardNode',
  'TrendCardNode',
  'BarCardNode',
  'DataWheelCardNode',
]);

interface SmallDataCardProps {
  context: NodeProps['context'];
  title: string;
  periodLabel: string;
  viewPath?: string;
  showOpenButton?: boolean;
  /** The goal card's met state takes the accent; otherwise the card colour. */
  surface?: string;
  ink?: string;
  accessibilityLabel: string;
  /** The headline figure, under the period label. */
  value: React.ReactNode;
  /** The chart or bar, resting on the card's bottom edge. */
  children: React.ReactNode;
}

/** The 1×1 data card (Figma 4664:1091): title and open button, the figure, and a chart without axes. */
export function SmallDataCard({
  context,
  title,
  periodLabel,
  viewPath,
  showOpenButton = true,
  surface,
  ink,
  accessibilityLabel,
  value,
  children,
}: SmallDataCardProps) {
  const mode: ThemeMode = context.colorScheme ?? 'light';
  const tokens = getColorTokens(mode, context.theme.brandColors);
  const color = ink ?? tokens.text.primary;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface ?? tokens.card.stats.background, minHeight: layoutTokens.cardHeightLarge },
        cardShadow,
      ]}
    >
      <View style={styles.header}>
        <Text style={[smallText.small, styles.title, { color }]} numberOfLines={1}>
          {title}
        </Text>
        {showOpenButton && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${title}`}
            disabled={!viewPath}
            onPress={() => viewPath && context.dispatch({ type: 'OpenCustomView', viewUrl: viewPath })}
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

      <View accessible accessibilityLabel={accessibilityLabel} style={styles.summary}>
        <Text style={[smallText.small, { color }]} numberOfLines={1}>
          {periodLabel}
        </Text>
        {value}
      </View>

      <View style={styles.visual}>{children}</View>
    </View>
  );
}

export const smallText = StyleSheet.create({
  small: textStyle(12, 16, 'regular'),
  value: { ...textStyle(28, 32, 'bold'), fontWeight: '700' },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
});

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
  title: {
    flex: 1,
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
    gap: 2,
  },
  visual: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
