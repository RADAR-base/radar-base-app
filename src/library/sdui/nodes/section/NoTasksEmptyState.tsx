import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontFamily, getColorTokens, tracking } from '../../../../theme/theme';
import NoTasksArt from '../../../../theme/icons/notasks.svg';
import type { SDUIContext } from '../../types';

const ART_WIDTH = 180;
const ART_ASPECT = 1445 / 1333;

/** The "no tasks" illustration with a line of copy under it. */
export function NoTasksEmptyState({
  context,
  title = 'Nothing to see here',
  body,
}: {
  context: SDUIContext;
  title?: string;
  body: string;
}) {
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  return (
    <View style={styles.empty}>
      <NoTasksArt
        width={ART_WIDTH}
        height={ART_WIDTH / ART_ASPECT}
        // The drawing's navy shapes take the brand-aware token; its other details stay as authored.
        color={tokens.background.secondary}
        // Decorative: the copy below says the same thing.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={[styles.title, { color: tokens.text.primary }]}>{title}</Text>
      <Text style={[styles.body, { color: tokens.card.stats.description }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    letterSpacing: tracking.bold,
  },
  body: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
    textAlign: 'center',
  },
});
