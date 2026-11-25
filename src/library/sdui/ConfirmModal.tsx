import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import LinkOutIcon from '../../theme/icons/linkout.svg';
import {
  getColorTokens,
  readableTextColor,
  type ThemeColorOverrides,
  type ThemeMode,
  layout as layoutTokens,
} from '../../theme/theme';
import { PillButton } from './PillButton';
import { ModalHeader, ModalShell } from './ModalShell';

export interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use a destructive (error-colored) confirm button. */
  destructive?: boolean;
  /** A badge above the heading (Figma 4290:2407). */
  icon?: 'linkOut';
  /** Show the corner close button. Defaults to true. */
  showClose?: boolean;
  brandColors?: ThemeColorOverrides;
}

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  icon,
  showClose = true,
  brandColors,
}: ConfirmModalProps) {
  const deviceScheme = useColorScheme();
  const mode: ThemeMode = deviceScheme === 'dark' ? 'dark' : 'light';
  const tokens = getColorTokens(mode, brandColors);

  const errorColor = tokens.button.error;
  // The glyph stays readable if a manifest brand repaints the disc.
  const badgeFill = tokens.background.secondary;
  const badgeInk = readableTextColor(badgeFill, { preferred: tokens.button.text });

  const handleConfirm = () => {
    onClose();
    onConfirm();
  };

  return (
    <ModalShell visible={visible} onClose={onClose} brandColors={brandColors}>
      <ModalHeader
        title={title}
        subtitle={description}
        onClose={showClose ? onClose : undefined}
        titleColor={destructive ? errorColor : undefined}
        brandColors={brandColors}
        icon={
          icon === 'linkOut' && (
            <View style={[styles.badge, { backgroundColor: badgeFill }]}>
              <LinkOutIcon width={26} height={25} color={badgeInk} />
            </View>
          )
        }
      />

      <View style={styles.actions}>
        <PillButton
          label={confirmLabel}
          variant="primary"
          onPress={handleConfirm}
          brandColors={
            destructive
              ? ({ ...brandColors, brand: errorColor } as ThemeColorOverrides)
              : brandColors
          }
        />
        <PillButton
          label={cancelLabel}
          variant="outline"
          onPress={onClose}
          brandColors={brandColors}
        />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  /** Figma 4290:2407: a 16pt-padded disc around the 26x25 glyph. */
  badge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  actions: {
    width: '100%',
    gap: layoutTokens.gap,
  },
});
