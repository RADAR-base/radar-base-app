import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { textStyle, withAlpha } from '../../../../theme/theme';
import type { DataRange } from '../../dataRange';

const PERIOD_PHRASE: Record<DataRange, string> = { day: 'today', week: 'this week', month: 'this month' };

/** What an empty data card says, from its title: "No steps yet today", and when it will fill. */
export function emptyCopy(
  node: Record<string, unknown>,
  title: string,
  range: DataRange,
  { small = false, lastNight = false }: { small?: boolean; lastNight?: boolean } = {},
) {
  const noun = title.toLowerCase();
  const headline = small
    ? `No ${noun} yet`
    : lastNight
      ? `No ${noun} from last night yet`
      : `No ${noun} yet ${PERIOD_PHRASE[range]}`;
  const message = 'It shows here once the app has recorded some';
  return { headline, message };
}

/** A data card with nothing for the period (Figma 4827:1216): a centred headline and, on a large card, when it will fill. */
export function CardEmpty({
  headline,
  message,
  color,
  small = false,
  minHeight,
}: {
  headline: string;
  message?: string;
  color: string;
  small?: boolean;
  /** The height of what it stands in for, so the card keeps its size when empty. */
  minHeight?: number;
}) {
  const muted = withAlpha(color, 0.55);
  return (
    <View style={[styles.wrap, small ? styles.small : styles.large, minHeight != null && { minHeight }]}>
      <Text style={[styles.headline, { color: muted }]}>{headline}</Text>
      {!!message && <Text style={[styles.message, styles.messageLarge, { color: muted }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  /** Fills the square card's chart room, centred in it. */
  small: {
    flex: 1,
  },
  /** The large card fits its content, so the space is even above and below instead. */
  large: {
    paddingVertical: 12,
  },
  headline: { ...textStyle(16, 20, 'semiBold'), fontWeight: '600', textAlign: 'center' },
  message: { ...textStyle(12, 16, 'regular'), textAlign: 'center' },
  messageLarge: {
    maxWidth: 260,
  },
});
