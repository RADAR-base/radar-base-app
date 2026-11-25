import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import LinkOutIcon from '../../theme/icons/linkout.svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  readableTextColor,
  type ThemeColorOverrides,
  type ThemeMode,
  layout as layoutTokens,
} from '../../theme/theme';
import { PillButton } from './PillButton';
import { ModalShell } from './ModalShell';

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
  icon,
  showClose = true,
  brandColors,
}: ConfirmModalProps) {
  const deviceScheme = useColorScheme();
  const mode: ThemeMode = deviceScheme === 'dark' ? 'dark' : 'light';
  const tokens = getColorTokens(mode, brandColors);

  const brand = tokens.button.background;
  const onBrand = tokens.navbar.text.primary;
  const closeChip = tokens.card.stats.openBadge;
  const closeIcon = tokens.card.stats.openIcon;
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
      {showClose && (
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
      )}

      {icon === 'linkOut' && (
        <View style={[styles.badge, { backgroundColor: badgeFill }]}>
          <LinkOutIcon width={26} height={25} color={badgeInk} />
        </View>
      )}

      <Text style={[styles.title, { color: destructive ? errorColor : brand }]}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

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
  /** Figma 4290:2407: a 16pt-padded disc around the 26x25 glyph. */
  badge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  closeRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: tracking.bold,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    color: DESCRIPTION_COLOR,
    includeFontPadding: false,
  },
  actions: {
    width: '100%',
    gap: layoutTokens.gap,
    marginTop: layoutTokens.gap,
  },
});
