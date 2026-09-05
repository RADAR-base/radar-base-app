import React, { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  getColorTokens,
  layout,
  PageHeader,
  StepSlider,
  useSlideOverlay,
  useStepFlow,
  type ThemeColorOverrides,
  type ThemeMode,
} from '@radarbase/app-kit';

import { ChooseMethodView } from './ChooseMethodView';
import { QrInstructionsView } from './QrInstructionsView';
import { CameraScanScreen } from './CameraScanScreen';

/**
 * Registration flow — a single screen that steps through its views under one persistent header, so
 * the progress bar animates continuously instead of jumping between separate screens. Steps:
 *
 *   0. ChooseMethodView   — pick QR scan (advances) or Enter Login Details (OAuth redirect)
 *   1. QrInstructionsView — Scan button opens the camera view
 *
 * The "Enrolment Complete" screen is NOT a step here — it's an auth gate shown by AppRoot once
 * authentication succeeds (RegistrationCompleteScreen). Today only "Enter Login Details" authenticates
 * (the QR path will drive auth later). The camera view is a frontend modal launched from the QR step
 * (its own cross header, not on the progress track). The step controller + slider + animated header
 * are the reusable bits a questionnaire flow could adopt.
 */
export interface RegistrationFlowProps {
  /** Back out of the first step — returns to the welcome screen. */
  onExit: () => void;
  /** Enter-login-details — run the OAuth redirect. */
  onEnterLoginDetails: () => void;
  /** Cancel an in-progress login (see `useAuth.cancelLogin`); fired on any step/camera change. */
  onResetLogin?: () => void;
  /** Reflects `status === 'authenticating'`. */
  isAuthenticating?: boolean;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

/** Per-step progress-bar values (Figma 3060:3307 / 3062:3408). */
const STEP_PROGRESS = [1 / 3, 0.6];

export function RegistrationFlow({
  onExit,
  onEnterLoginDetails,
  onResetLogin,
  isAuthenticating = false,
  mode,
  brandColors,
}: RegistrationFlowProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const flow = useStepFlow(STEP_PROGRESS.length);
  const camera = useSlideOverlay(); // frontend camera view, pushed in from the right

  // Any step change is a "page change", so cancel an in-progress login (fires on mount too — a no-op
  // when nothing is authenticating). This replaces the prop-threaded reset the old screens needed.
  useEffect(() => {
    onResetLogin?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.index]);

  const handleBack = () => {
    if (flow.isFirst) {
      onResetLogin?.();
      onExit();
    } else {
      flow.back();
    }
  };

  const openCamera = () => {
    onResetLogin?.();
    camera.open();
  };
  const closeCamera = () => {
    onResetLogin?.();
    camera.close();
  };

  return (
    <View style={[styles.root, { backgroundColor: tokens.background.primary }]}>
      <PageHeader
        onBack={handleBack}
        progress={STEP_PROGRESS[flow.index]}
        mode={mode}
        brandColors={brandColors}
      />

      <StepSlider index={flow.index}>
        {(i) =>
          i === 0 ? (
            <ChooseMethodView
              onScanQr={flow.next}
              onEnterLoginDetails={onEnterLoginDetails}
              isAuthenticating={isAuthenticating}
              mode={mode}
              brandColors={brandColors}
            />
          ) : (
            <QrInstructionsView onScan={openCamera} mode={mode} brandColors={brandColors} />
          )
        }
      </StepSlider>

      {camera.visible && (
        <Animated.View
          {...camera.panHandlers}
          style={[StyleSheet.absoluteFill, styles.roundedOverlay, camera.overlayStyle]}
        >
          <CameraScanScreen
            onBack={closeCamera}
            // Frontend only: returns to the QR step for now; wire to the login-token flow later.
            onEnterToken={closeCamera}
            brandColors={brandColors}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Rounds the sliding camera overlay so it reads as a rounded card over the flow behind it.
  roundedOverlay: {
    borderRadius: layout.radiusScreen,
    overflow: 'hidden',
  },
  root: {
    flex: 1,
    // No padding here: the header and each step view own their own insets, and the StepSlider needs
    // the full window width so its panels slide fully off-screen. Views are transparent over this bg.
  },
});
