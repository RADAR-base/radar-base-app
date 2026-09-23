import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  type ThemeColorOverrides,
} from '../../theme/theme';
import { HintCard } from './HintCard';
import { useTopInset } from './useTopInset';

// ---------------------------------------------------------------------------
// Optional expo-camera — gracefully degrades to a placeholder when not installed.
// ---------------------------------------------------------------------------

let CameraView: React.ComponentType<any> | null = null;
let useCameraPermissions: (() => [any, () => Promise<any>]) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-camera');
  CameraView = mod.CameraView ?? null;
  useCameraPermissions = mod.useCameraPermissions ?? null;
} catch {
  // expo-camera not installed
}

/**
 * Camera / QR scan view — Figma node 3066:3803. Shows a live camera preview with barcode
 * scanning. When a QR code is detected, `onCodeScanned` is called with the parsed data.
 *
 * Falls back to a static placeholder when `expo-camera` is not installed.
 */
export interface CameraScanScreenProps {
  /** Return to the QR-scan page. */
  onBack: () => void;
  /** Called when a QR code is successfully scanned. */
  onCodeScanned?: (data: string) => void;
  /** HintCard action — "Enter Login Token" instead of scanning. */
  onEnterToken?: () => void;
  /** Manifest brand colors, threaded to the HintCard button. */
  brandColors?: ThemeColorOverrides;
}

export function CameraScanScreen({ onBack, onCodeScanned, onEnterToken, brandColors }: CameraScanScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = useTopInset();
  const { width } = useWindowDimensions();

  const dark = getColorTokens('dark', brandColors);
  const chromeText = dark.card.hint.text;
  const crossColor = dark.header.buttonIcon;
  const crossPressedBg = 'rgba(181, 223, 242, 0.20)';

  const windowSize = Math.min(width * 0.82, 340);

  return (
    <View style={styles.root}>
      {/* Camera layer — behind the scrim */}
      <CameraLayer
        onCodeScanned={onCodeScanned}
      />

      <View
        style={[
          styles.content,
          { paddingTop: topInset, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.topRegion}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onBack}
              hitSlop={8}
              style={({ pressed }) => [
                styles.close,
                pressed && { backgroundColor: crossPressedBg },
              ]}
            >
              <CrossIcon color={crossColor} />
            </Pressable>
            <Text style={[styles.title, { color: chromeText }]}>Registration</Text>
          </View>

          <Text style={[styles.instruction, { color: chromeText }]}>
            Place the QR Code at the centre of the screen
          </Text>
        </View>

        {/* Cut-out frame — transparent when camera is active, opaque placeholder otherwise */}
        <View
          style={[
            styles.window,
            {
              width: windowSize,
              height: windowSize,
              borderColor: chromeText,
              backgroundColor: CameraView ? 'transparent' : WINDOW_FILL,
            },
          ]}
        />

        <View style={styles.bottomRegion}>
          <HintCard
            mode="light"
            brandColors={brandColors}
            style={styles.hint}
            title="Having trouble scanning?"
            subtitle="Try entering the login token instead"
            actionLabel="Enter Login Token"
            onAction={onEnterToken}
          />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Camera layer — handles permission + preview + barcode detection
// ---------------------------------------------------------------------------

function CameraLayer({
  onCodeScanned,
}: {
  onCodeScanned?: (data: string) => void;
}) {
  // Guard: no expo-camera
  if (!CameraView || !useCameraPermissions) return null;

  return (
    <CameraLayerInner
      onCodeScanned={onCodeScanned}
    />
  );
}

function CameraLayerInner({
  onCodeScanned,
}: {
  onCodeScanned?: (data: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions!();
  const [scanned, setScanned] = useState(false);
  const scanLock = useRef(false);

  // Request permission on mount if not yet determined
  React.useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcodeScanned = useCallback(
    (result: { data: string; type: string }) => {
      if (scanLock.current || scanned) return;
      scanLock.current = true;
      setScanned(true);
      onCodeScanned?.(result.data);
    },
    [onCodeScanned, scanned],
  );

  if (!permission) {
    return (
      <View style={styles.cameraPlaceholder}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.permissionText}>Camera permission is required to scan QR codes</Text>
      </View>
    );
  }

  const Camera = CameraView!;
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{
        barcodeTypes: ['qr'],
      }}
      onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
    />
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CrossIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M16.9375 16.933L0.937498 0.9375M16.9375 0.9375L0.937498 16.933"
        stroke={color}
        strokeWidth={1.875}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SCRIM = 'rgba(11, 13, 18, 0.92)';
const WINDOW_FILL = '#0A0B0F';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SCRIM,
  },
  content: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 16,
  },
  topRegion: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 36,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  instruction: {
    alignSelf: 'center',
    maxWidth: 320,
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  window: {
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 1.5,
  },
  bottomRegion: {
    flex: 1,
    alignItems: 'center',
  },
  hint: {
    marginTop: 32,
    opacity: 0.8,
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
