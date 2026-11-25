import React from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import {
  cardShadow,
  getColorTokens,
  layout as layoutTokens,
  textStyle,
  withAlpha,
  type ThemeMode,
} from '../../../../theme/theme';
import { MAX_FONT_SCALE } from '../../../../theme/fontScaling';
import type { NodeProps } from '../../types';
import type { InfoRowSpec } from '../../ModalInfoRow';
import { CardInfo, headerIcons } from './CardInfo';
import { openDataDetail } from './DataDetail';

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

/** A square card's header row: the title, and the ⓘ or the 28pt arrow. */
export const CARD_HEADER_HEIGHT = 28;
/** The square data wheel's ring, sized so header, gap and ring fill the card as the others do. */
export const WHEEL_RING_SIZE = 126;
export const WHEEL_RING_STROKE = 16;

/**
 * The height every square card shares, the data wheel included. The larger of the stat-card height
 * (which follows the text size) and the wheel's (whose ring doesn't), so they stay level at any size.
 */
export function squareCardHeight(): number {
  const textScale = Math.min(PixelRatio.getFontScale(), MAX_FONT_SCALE);
  const header = Math.max(CARD_HEADER_HEIGHT, 16 * textScale);
  const wheel = layoutTokens.cardPadding * 2 + header + layoutTokens.gap + WHEEL_RING_SIZE;
  return Math.max(layoutTokens.cardHeightLarge, wheel);
}

interface SmallDataCardProps {
  context: NodeProps['context'];
  title: string;
  viewPath?: string;
  /** `true` shows the arrow to the card's detail page (see `headerIcons`). */
  showOpenButton?: unknown;
  /** Opens from the ⓘ beside the title, when there's no page to open. */
  info?: string;
  /** Explanation rows under the info, e.g. the sleep stages. */
  infoRows?: InfoRowSpec[];
  /** The goal card's met state takes the accent; otherwise the card colour. */
  surface?: string;
  ink?: string;
  accessibilityLabel: string;
  /** The headline figure, under the title. */
  value: React.ReactNode;
  /** The chart or bar, resting on the card's bottom edge. */
  children: React.ReactNode;
}

/** The 1×1 data card (Figma 4664:1091): title and open button, the figure, and a chart without axes. */
export function SmallDataCard({
  context,
  title,
  viewPath,
  showOpenButton,
  info,
  infoRows,
  surface,
  ink,
  accessibilityLabel,
  value,
  children,
}: SmallDataCardProps) {
  const mode: ThemeMode = context.colorScheme ?? 'light';
  const tokens = getColorTokens(mode, context.theme.brandColors);
  const color = ink ?? tokens.text.primary;
  const { showInfo, showOpen } = headerIcons(info, viewPath, showOpenButton);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface ?? tokens.card.stats.background, minHeight: squareCardHeight() },
        cardShadow,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[smallText.small, styles.title, { color }]} numberOfLines={1}>
            {title}
          </Text>
          {showInfo && info && <CardInfo title={title} info={info} color={withAlpha(color, 0.55)} context={context} rows={infoRows} />}
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

      <View accessible accessibilityLabel={accessibilityLabel} style={styles.summary}>
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
    minHeight: CARD_HEADER_HEIGHT,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
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
    gap: 2,
  },
  visual: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
