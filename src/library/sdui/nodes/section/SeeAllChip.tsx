import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { getColorTokens, textStyle, type ThemeColorOverrides, type ThemeMode } from '../../../../theme/theme';

/** A section header's "See All", styled as the devices card's "+ Add" chip. */
export function SeeAllChip({
  onPress,
  mode,
  brandColors,
  label = 'See All',
}: {
  onPress: () => void;
  mode: ThemeMode;
  brandColors?: ThemeColorOverrides;
  label?: string;
}) {
  const tokens = getColorTokens(mode, brandColors);
  const brand = brandColors?.brand ?? tokens.button.background;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: tokens.card.stats.openBadge },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, { color: brand }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  label: { ...textStyle(12, 16, 'semiBold'), fontWeight: '600' },
});
