import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ArrowUpRightIcon from '../../../../theme/icons/arrowupright.svg';
import NoteMedicalIcon from '../../../../theme/icons/notemedical.svg';
import {
  cardShadow,
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  tracking,
} from '../../../../theme/theme';
import type { NodeProps } from '../../types';
import { ON_DEMAND_VIEW } from '../section/OnDemandTaskListNode';

/**
 * The entry point to a study's on-demand tasks (Figma 4297:3002). Opens the built-in task list, or
 * the study's own view when the blueprint sets `viewPath`.
 */
export function OnDemandCardNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Notice a change?';
  const description =
    typeof node.description === 'string'
      ? node.description
      : 'Let us know about any changes to your health';
  const showDescription = node.showDescription !== false && !!description;
  const viewPath =
    typeof node.viewPath === 'string' && node.viewPath ? node.viewPath : ON_DEMAND_VIEW;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors).card
    .onDemand;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={showDescription ? `${title}. ${description}` : title}
      onPress={() =>
        context.dispatch({
          type: 'OpenCustomView',
          viewUrl: viewPath,
          params: { title, description: showDescription ? description : '' },
        })
      }
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tokens.background },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: tokens.badge }]}>
          <NoteMedicalIcon width={18} height={19} />
        </View>
        <View style={[styles.arrowChip, { backgroundColor: tokens.badge }]}>
          <ArrowUpRightIcon width={18} height={18} color={tokens.arrow} />
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: tokens.title }]}>{title}</Text>
        {showDescription && (
          <Text style={[styles.description, { color: tokens.description }]}>{description}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusCard,
    gap: layoutTokens.gap,
    ...cardShadow,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  copy: {
    gap: 4,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
