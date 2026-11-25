import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import { fontFamily, navbarLayout, layout as layoutTokens } from '../../../../theme/theme';

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
    // Pressable, not TouchableOpacity: a tap re-styles the tab mid-press (it becomes selected), and on
    // the new architecture that re-render could strand TouchableOpacity's native fade at its dim value.
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        selected && { backgroundColor: selectedBg, borderRadius: layoutTokens.radiusPill },
        pressed && styles.pressed,
      ]}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    width: 80,
    height: navbarLayout.itemHeight,
    borderRadius: layoutTokens.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  labelWrapper: {
    height: 12,
    justifyContent: 'center',
  },
  label: {
    fontSize: layoutTokens.captionFontSize,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
});
