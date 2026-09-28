import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';
import { PillButton } from './PillButton';

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
  brandColors?: ThemeColorOverrides;
}

const DESCRIPTION_COLOR = '#686868';

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  brandColors,
}: ConfirmModalProps) {
  const deviceScheme = useColorScheme();
  const mode: ThemeMode = deviceScheme === 'dark' ? 'dark' : 'light';
  const tokens = getColorTokens(mode, brandColors);

  const brand = tokens.button.background;
  const onBrand = tokens.navbar.text.primary;
  const cardBg = tokens.background.primary;
  const closeChip = tokens.card.stats.openBadge;
  const closeIcon = tokens.card.stats.openIcon;
  const errorColor = tokens.button.error;

  const handleConfirm = () => {
    onClose();
    onConfirm();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.center}>
          <Pressable style={[styles.card, { backgroundColor: cardBg }]} onPress={() => {}}>
            <View style={styles.closeRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
                {({ pressed }) => (
                  <CloseIcon
                    circleColor={pressed ? brand : closeChip}
                    iconColor={pressed ? onBrand : closeIcon}
                  />
                )}
              </Pressable>
            </View>

            <Text style={[styles.title, { color: destructive ? errorColor : brand }]}>{title}</Text>
            <Text style={styles.description}>{description}</Text>

            <View style={styles.actions}>
              <PillButton
                label={confirmLabel}
                variant="primary"
                onPress={handleConfirm}
                brandColors={destructive ? { ...brandColors, brand: errorColor } as ThemeColorOverrides : brandColors}
              />
              <PillButton
                label={cancelLabel}
                variant="outline"
                onPress={onClose}
                brandColors={brandColors}
              />
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function CloseIcon({
  size = 36,
  circleColor,
  iconColor,
}: {
  size?: number;
  circleColor: string;
  iconColor: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Rect width="36" height="36" rx="18" fill={circleColor} />
      <Path
        d="M26 25.9955L10 10M26 10L10 25.9955"
        stroke={iconColor}
        strokeWidth={1.875}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 420,
    gap: 16,
    padding: 32,
    borderRadius: 24,
  },
  closeRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: tracking.bold,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '300',
    fontFamily: fontFamily.light,
    letterSpacing: tracking.light,
    textAlign: 'center',
    color: DESCRIPTION_COLOR,
    includeFontPadding: false,
  },
  actions: {
    width: '100%',
    gap: 9,
    marginTop: 16,
  },
});
