import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NodeProps } from '../types';

type TextStyle = 'heading1' | 'heading2' | 'heading3' | 'body' | 'caption' | 'markdown';

/**
 * Static or interpolated text. The `style` prop selects a typographic preset; templating
 * is already handled by the engine before this node sees it (so `text` may contain a
 * resolved `{{var}}` substitution).
 *
 * The `markdown` style currently renders as plain text — a future iteration can plug in
 * `react-native-markdown-display` if richer formatting is needed.
 */
export function TextNode({ node, context }: NodeProps) {
  const text = typeof node.text === 'string' ? node.text : '';
  const styleKey = (typeof node.style === 'string' ? node.style : 'body') as TextStyle;
  const theme = context.theme;
  const color =
    styleKey === 'caption' ? theme.textSecondaryColor ?? '#6D6D80' : theme.textColor ?? '#000';

  return <Text style={[styles.base, presets[styleKey] ?? presets.body, { color }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  base: {
    marginBottom: 4,
  },
});

const presets: Record<TextStyle, { fontSize: number; fontWeight?: '400' | '600' | '700' }> = {
  heading1: { fontSize: 28, fontWeight: '700' },
  heading2: { fontSize: 22, fontWeight: '700' },
  heading3: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15 },
  caption: { fontSize: 12 },
  markdown: { fontSize: 15 },
};
