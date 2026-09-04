import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Node } from '../../contracts/NodeSchema';
import type { NodeProps } from '../types';

/**
 * Logical grouping with an optional header and optional "See All" link.
 * Supports `layout: "horizontal"` for a horizontally scrolling row of children.
 */
export function SectionNode({ node, context, render }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : undefined;
  const showSeeAll = node.showSeeAll === true;
  const layout = node.layout === 'horizontal' ? 'horizontal' : 'vertical';
  const theme = context.theme;

  const children = asNodeArray(node.children);

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.textColor ?? '#1C3549' }]}>{title}</Text>
          {showSeeAll && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                if (typeof node.seeAllAction === 'string') {
                  context.dispatch({
                    type: 'OpenCustomView',
                    viewUrl: node.seeAllAction as string,
                  });
                }
              }}
            >
              <View style={styles.seeAllPill}>
                <Text style={[styles.seeAllText, { color: theme.textSecondaryColor ?? '#8E8E93' }]}>
                  See All
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}
      {layout === 'horizontal' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalContent}
        >
          {render(children)}
        </ScrollView>
      ) : (
        <View>{render(children)}</View>
      )}
    </View>
  );
}

function asNodeArray(value: unknown): Node[] | undefined {
  return Array.isArray(value) ? (value as Node[]) : undefined;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  seeAllPill: {
    borderWidth: 1,
    borderColor: '#C8CDD3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  horizontalContent: {
    paddingRight: 16,
  },
});
