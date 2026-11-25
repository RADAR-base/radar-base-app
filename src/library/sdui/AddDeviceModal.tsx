import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import ArrowUpRightIcon from '../../theme/icons/arrowupright.svg';
import {
  cardShadow,
  getColorTokens,
  layout,
  textStyle,
  withAlpha,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';
import { ModalHeader, ModalShell } from './ModalShell';
import { DeviceDisc } from './nodes/card/DeviceGlyph';
import type { DeviceKind } from './nodes/card/deviceTypes';

/** A device the study supports. `url` is where its sign-in starts. */
export interface AvailableDevice {
  name: string;
  kind: DeviceKind;
  url?: string;
}

export interface AddDeviceModalProps {
  visible: boolean;
  onClose: () => void;
  devices: AvailableDevice[];
  onSelect: (device: AvailableDevice) => void;
  /** Connect the phone's health app instead. Hidden when omitted. */
  onUseHealthApp?: () => void;
  brandColors?: ThemeColorOverrides;
}

const COLUMNS = 2;

/** "Which device do you want to connect?" (Figma 4583:1211): a grid of the study's devices. */
export function AddDeviceModal({
  visible,
  onClose,
  devices,
  onSelect,
  onUseHealthApp,
  brandColors,
}: AddDeviceModalProps) {
  const mode: ThemeMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const tokens = getColorTokens(mode, brandColors);
  const brand = brandColors?.brand ?? tokens.button.background;
  const text = tokens.text.primary;
  const healthApp = Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';

  const rows: AvailableDevice[][] = [];
  for (let i = 0; i < devices.length; i += COLUMNS) rows.push(devices.slice(i, i + COLUMNS));

  return (
    <ModalShell visible={visible} onClose={onClose} brandColors={brandColors}>
      <ModalHeader
        title="Connect a device"
        subtitle="Sign in to your device’s app to share its data. You can disconnect at any time."
        onClose={onClose}
        brandColors={brandColors}
      />

      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((device) => (
              <Pressable
                key={device.name}
                accessibilityRole="button"
                accessibilityLabel={`Connect ${device.name}`}
                onPress={() => onSelect(device)}
                style={({ pressed }) => [
                  styles.tile,
                  { backgroundColor: tokens.card.background },
                  cardShadow,
                  pressed && styles.pressed,
                ]}
              >
                {/* Says the tile leaves the app, without a chip of its own. */}
                <View style={styles.corner}>
                  <ArrowUpRightIcon width={18} height={18} color={withAlpha(brand, 0.6)} />
                </View>
                <DeviceDisc kind={device.kind} size={46} background={brand} color={tokens.button.icon} />
                <Text style={[styles.tileName, { color: text }]} numberOfLines={1}>
                  {device.name}
                </Text>
              </Pressable>
            ))}
            {/* Keeps a lone last tile at half width. */}
            {row.length < COLUMNS && <View style={styles.spacer} />}
          </View>
        ))}
      </View>

      {onUseHealthApp && (
        <Pressable accessibilityRole="button" onPress={onUseHealthApp} hitSlop={10}>
          <Text style={[styles.link, { color: brand }]}>Use {healthApp} instead</Text>
        </Pressable>
      )}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    gap: layout.gap,
  },
  row: {
    flexDirection: 'row',
    gap: layout.gap,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  spacer: {
    flex: 1,
  },
  /** Out of the flow, so the arrow takes no height of its own. */
  corner: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  tileName: {
    ...textStyle(14, 18, 'semiBold'),
    fontWeight: '600',
    textAlign: 'center',
  },
  link: {
    ...textStyle(14, 20, 'semiBold'),
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 4,
  },
});
