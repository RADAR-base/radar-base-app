import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NodeProps } from '../types';

type Severity = 'info' | 'warning' | 'critical';

const TONES: Record<Severity, { bg: string; border: string; text: string }> = {
  info: { bg: '#E8F0E0', border: '#8FA764', text: '#4A5D35' },
  warning: { bg: '#FFF3E0', border: '#E8A838', text: '#7A5B1E' },
  critical: { bg: '#FDECEA', border: '#E05A4F', text: '#8B2E26' },
};

/**
 * Inline banner used by the alert engine (Phase 4) to surface rule-driven messages.
 * Authors can also drop it directly in a blueprint for static notices (e.g. "Study
 * paused this week").
 */
export function AlertBannerNode({ node }: NodeProps) {
  const severity = (typeof node.severity === 'string' ? node.severity : 'info') as Severity;
  const title = typeof node.title === 'string' ? node.title : undefined;
  const message = typeof node.message === 'string' ? node.message : '';
  const tone = TONES[severity] ?? TONES.info;

  return (
    <View style={[styles.container, { backgroundColor: tone.bg, borderLeftColor: tone.border }]}>
      {title && <Text style={[styles.title, { color: tone.text }]}>{title}</Text>}
      <Text style={[styles.body, { color: tone.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
  },
});
