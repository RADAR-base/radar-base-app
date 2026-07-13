import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import { navbarLayout, layout as layoutTokens } from '../../../../theme/theme';

/**
 * One tab of the bottom `Navbar` (Figma node 1795:434) — an icon, optional label, and a
 * pill-shaped highlight when selected. Internal building block for `NavbarNode`, not a
 * blueprint-addressable node itself (mirrors the header nodes' HeaderBarNode/
 * HeaderTextNode split).
 */
export function NavbarItemNode({
  Icon,
  label,
  selected,
  showLabel,
  selectedBg,
  selectedColor,
  unselectedColor,
  onPress,
}: {
  Icon: ComponentType<SvgProps>;
  label: string;
  selected: boolean;
  showLabel: boolean;
  selectedBg: string;
  selectedColor: string;
  unselectedColor: string;
  onPress: () => void;
}) {
  const color = selected ? selectedColor : unselectedColor;
  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.item, selected && { backgroundColor: selectedBg, borderRadius: layoutTokens.radiusPill }]}
    >
      <Icon width={24} height={24} color={color} />
      {showLabel && (
        // A fixed-height wrapper + justifyContent: 'center' avoids relying on
        // `lineHeight` to control vertical space — iOS's native Text adds extra
        // leading above/below the glyph based on the font's ascender/descender
        // metrics that `lineHeight` alone doesn't suppress (react-native-web has no
        // such leading, which is why this only showed up on iOS).
        <View style={styles.labelWrapper}>
          <Text style={[styles.label, { color }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: {
    width: 80,
    height: navbarLayout.itemHeight,
    borderRadius: layoutTokens.radiusCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrapper: {
    height: 12,
    justifyContent: 'center',
  },
  label: {
    fontSize: layoutTokens.captionFontSize,
  },
});
