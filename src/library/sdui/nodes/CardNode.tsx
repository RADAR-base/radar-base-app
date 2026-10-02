import React from 'react';
import { View } from 'react-native';
import { cardShadow, layout } from '../../../theme/theme';
import type { Node } from '../../contracts/NodeSchema';
import type { NodeProps } from '../types';

/**
 * Rounded container with the theme's surface color. Holds one or more child nodes.
 *
 * Blueprint props:
 *   - `flat` (boolean) — when true, no elevation/shadow
 *   - `paddingHorizontal` (number) — overrides default horizontal padding
 *   - `paddingVertical` (number) — overrides default vertical padding
 */
const CARD_RADIUS = layout.radiusCard;

export function CardNode({ node, context, render }: NodeProps) {
  const theme = context.theme;
  const flat = node.flat === true;
  const ph = typeof node.paddingHorizontal === 'number' ? node.paddingHorizontal : layout.cardPadding;
  const pv = typeof node.paddingVertical === 'number' ? node.paddingVertical : layout.cardPadding;

  return (
    <View
      style={[
        !flat && cardShadowStyle,
        {
          backgroundColor: theme.surfaceColor ?? '#fff',
          borderRadius: theme.button?.borderRadius ?? CARD_RADIUS,
          paddingHorizontal: ph,
          paddingVertical: pv,
        },
      ]}
    >
      {render(asNodeArray(node.children))}
    </View>
  );
}

function asNodeArray(value: unknown): Node[] | undefined {
  return Array.isArray(value) ? (value as Node[]) : undefined;
}

const cardShadowStyle = cardShadow;
