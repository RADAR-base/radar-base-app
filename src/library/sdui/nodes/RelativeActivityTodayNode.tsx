import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NodeProps } from '../types';

/**
 * Activity ring showing today's progress relative to a goal. MVP renders a placeholder
 * card with synthesized progress; a future iteration will plug in HealthKit / Google Fit
 * step counts via the data layer (Phase 5).
 */
export function RelativeActivityTodayNode({ node, context }: NodeProps) {
  const goalSteps = typeof node.goalSteps === 'number' ? node.goalSteps : 10000;
  // Demo: pick a deterministic-ish "today" value so the UI is stable across renders.
  const stepsSoFar = useTodayDemoSteps(goalSteps);
  const progress = Math.min(1, stepsSoFar / goalSteps);
  const theme = context.theme;

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceColor ?? '#fff' }]}>
      <Text style={[styles.title, { color: theme.textColor ?? '#000' }]}>Activity today</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${progress * 100}%`, backgroundColor: theme.primaryColor },
          ]}
        />
      </View>
      <Text style={[styles.body, { color: theme.textSecondaryColor ?? '#6D6D80' }]}>
        {stepsSoFar.toLocaleString()} / {goalSteps.toLocaleString()} steps ({Math.round(progress * 100)}%)
      </Text>
    </View>
  );
}

function useTodayDemoSteps(goal: number): number {
  // Use the day of year as a stable seed so a single session sees consistent demo data.
  const day = new Date().getDate();
  const fraction = ((day * 37) % 100) / 100;
  return Math.round(goal * (0.3 + fraction * 0.7));
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  barTrack: {
    height: 10,
    backgroundColor: '#e9ecef',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: {
    height: '100%',
  },
  body: {
    fontSize: 12,
  },
});
