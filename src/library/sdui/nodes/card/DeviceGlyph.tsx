import React from 'react';
import { StyleSheet, View } from 'react-native';
import PhoneIcon from '../../../../theme/icons/devicephone.svg';
import RingIcon from '../../../../theme/icons/devicering.svg';
import WatchIcon from '../../../../theme/icons/devicewatch.svg';
import type { DeviceKind } from './deviceTypes';

// Native sizes of the Figma device icons (4580:956 / 961 / 971).
const GLYPHS = {
  phone: { Icon: PhoneIcon, width: 17.0435, height: 28 },
  watch: { Icon: WatchIcon, width: 46, height: 46 },
  ring: { Icon: RingIcon, width: 46, height: 48 },
} as const;

/** Bands and unknown devices share the watch: the designs draw Fitbit, Garmin and Empatica that way. */
function glyphFor(kind: DeviceKind) {
  return kind === 'phone' || kind === 'ring' ? GLYPHS[kind] : GLYPHS.watch;
}

/** A device's icon on a brand disc. The phone keeps its 28pt height at every disc size, as in Figma. */
export function DeviceDisc({
  kind,
  size,
  background,
  color,
}: {
  kind: DeviceKind;
  size: 44 | 46 | 64;
  background: string;
  color: string;
}) {
  const glyph = glyphFor(kind);
  const height = kind === 'phone' ? glyph.height : size - 18;
  const width = (glyph.width / glyph.height) * height;
  return (
    <View style={[styles.disc, { width: size, height: size, backgroundColor: background }]}>
      <glyph.Icon width={width} height={height} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
