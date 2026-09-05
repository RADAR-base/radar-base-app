import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ConnectHealthScreen,
  NotificationsScreen,
  StepSlider,
  useStepFlow,
  type ThemeColorOverrides,
} from '@radarbase/app-kit';

import { RegistrationCompleteScreen } from './RegistrationCompleteScreen';

/**
 * Post-enrolment flow shown once after a fresh authentication. Steps slide in from the right (same
 * StepSlider used by the registration flow):
 *
 *   0. Enrolment Complete  — Start advances
 *   1. Enable Notifications — Enable (requests the OS permission) or No Thanks; both advance
 *   2. Connect to Health    — Connect / Connect Later; both finish the flow (onDone → the app)
 *
 * The study-tasks carousel is skipped for now (it would slot in before notifications).
 */
export interface PostEnrolmentFlowProps {
  /** Finish the flow and enter the app. */
  onDone: () => void;
  brandColors?: ThemeColorOverrides;
}

export function PostEnrolmentFlow({ onDone, brandColors }: PostEnrolmentFlowProps) {
  const flow = useStepFlow(3); // complete → notifications → connect health

  return (
    <View style={styles.root}>
      <StepSlider index={flow.index}>
        {(i) => {
          if (i === 0) {
            return <RegistrationCompleteScreen onStart={flow.next} brandColors={brandColors} />;
          }
          if (i === 1) {
            return (
              <NotificationsScreen
                onEnable={() => {
                  // TODO: request the OS notification permission here (needs `expo-notifications`
                  // added + a rebuild), then advance regardless of the result.
                  flow.next();
                }}
                onSkip={flow.next}
                brandColors={brandColors}
              />
            );
          }
          return (
            <ConnectHealthScreen
              // For now both actions just finish the flow and enter the app (home).
              onConnect={onDone}
              onConnectLater={onDone}
              brandColors={brandColors}
            />
          );
        }}
      </StepSlider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
