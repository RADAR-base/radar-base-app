import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Node } from '../../contracts/NodeSchema';
import type { NodeProps } from '../types';
import { fontFamily } from '../../../theme/theme';

/**
 * Tabbed coordinator for multiple `InboxItemListNode` children. Each child is shown as
 * a tab; the active tab's subtree is rendered below the tab strip.
 */
export function InboxItemListCoordinatorNode({ node, context, render }: NodeProps) {
  const children = Array.isArray(node.children) ? (node.children as Node[]) : [];
  const [activeId, setActiveId] = useState<string | null>(children[0]?.id ?? null);
  const active = useMemo(() => children.find((c) => c.id === activeId) ?? children[0], [children, activeId]);
  const theme = context.theme;

  if (children.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {children.map((child) => {
          const isActive = child.id === active?.id;
          const label = typeof child.title === 'string' ? child.title : child.id;
          return (
            <TouchableOpacity
              key={child.id}
              accessibilityRole="tab"
              onPress={() => setActiveId(child.id)}
              style={[
                styles.tab,
                isActive && { backgroundColor: theme.primaryColor },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? '#fff' : theme.textColor ?? '#000' },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View>{active && render([active])}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#e9ecef',
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
  },
});
