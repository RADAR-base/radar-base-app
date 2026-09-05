import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NodeProps } from '../types';
import { fontFamily, cardShadow } from '../../../theme/theme';

/**
 * Activity summary grid matching the Figma "My Activity" design.
 * Shows daily check-in count, current streak, and longest streak
 * in a card grid layout.
 */
export function RelativeActivityTodayNode({ node, context }: NodeProps) {
  const goalSteps = typeof node.goalSteps === 'number' ? node.goalSteps : 10000;
  const stepsSoFar = useTodayDemoSteps(goalSteps);
  const checkIns = Math.max(1, Math.floor(stepsSoFar / 3000));
  const theme = context.theme;
  const secondary = theme.secondaryColor ?? '#8FA764';
  const text = theme.textColor ?? '#1C3549';
  const textSec = theme.textSecondaryColor ?? '#8E8E93';
  const surface = theme.surfaceColor ?? '#fff';
  const radius = theme.button?.borderRadius ?? 12;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Daily Check-ins — tall left card */}
        <View style={[styles.cardTall, { backgroundColor: surface, borderRadius: radius }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: text }]}>Daily Check-ins</Text>
            <View style={[styles.iconCircle, { backgroundColor: '#E8F0E0' }]}>
              <Text style={styles.iconEmoji}>{'\u2705'}</Text>
            </View>
          </View>
          <Text style={[styles.bigNumber, { color: text }]}>{checkIns}</Text>
          <View style={[styles.badge, { backgroundColor: '#E8F0E0' }]}>
            <Text style={[styles.badgeText, { color: secondary }]}>Keep it up!</Text>
          </View>
        </View>

        {/* Right column — two stacked cards */}
        <View style={styles.rightColumn}>
          <View style={[styles.cardSmall, { backgroundColor: surface, borderRadius: radius }]}>
            <Text style={[styles.cardLabel, { color: textSec }]}>Current Streak</Text>
            <View style={styles.streakRow}>
              <Text style={[styles.streakNumber, { color: text }]}>2</Text>
              <Text style={styles.streakIcon}>{'\u{1F525}'}</Text>
            </View>
          </View>
          <View style={[styles.cardSmall, { backgroundColor: surface, borderRadius: radius }]}>
            <Text style={[styles.cardLabel, { color: textSec }]}>Longest Streak</Text>
            <View style={styles.streakRow}>
              <Text style={[styles.streakNumber, { color: text }]}>2</Text>
              <Text style={styles.streakIcon}>{'\u{1F3C5}'}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function useTodayDemoSteps(goal: number): number {
  const day = new Date().getDate();
  const fraction = ((day * 37) % 100) / 100;
  return Math.round(goal * (0.3 + fraction * 0.7));
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  cardTall: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
    ...cardShadow,
    minHeight: 140,
  },
  rightColumn: {
    flex: 1,
    gap: 10,
  },
  cardSmall: {
    flex: 1,
    padding: 14,
    ...cardShadow,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
  bigNumber: {
    fontSize: 36,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
  },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  streakNumber: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
  },
  streakIcon: {
    fontSize: 22,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
});
