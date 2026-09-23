import React, { useCallback, useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import type { ThemeColorOverrides } from '../../theme/theme';
import { useNotificationService, useHealthKitService } from '../../core/CoreServicesContext';
import type { EnrolmentManifest } from '../contracts/ManifestSchema';
import { ConnectHealthScreen } from './ConnectHealthScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { StepSlider } from './StepSlider';
import { useStepFlow } from './useStepFlow';
import { RegistrationCompleteScreen } from './RegistrationCompleteScreen';

let WebBrowser: { openBrowserAsync?: (url: string) => Promise<unknown> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebBrowser = require('expo-web-browser');
} catch {
  WebBrowser = null;
}

/** Known built-in enrolment step types. */
type BuiltInStepType = 'enrolment_complete' | 'notifications' | 'connect_health';

const DEFAULT_STEPS: { type: BuiltInStepType }[] = [
  { type: 'enrolment_complete' },
  { type: 'notifications' },
  { type: 'connect_health' },
];

/**
 * Post-enrolment flow shown once after a fresh authentication. Steps are driven by the
 * `enrolment.steps` array in the app manifest (defaults to all three when omitted):
 *
 *   - `enrolment_complete` — Start advances; View Privacy Policy opens an in-app browser
 *   - `notifications`      — Enable requests the OS permission; No Thanks skips
 *   - `connect_health`     — Connect / Connect Later; both finish the flow
 *
 * Step order and inclusion are fully configurable via the manifest.
 */
export interface PostEnrolmentFlowProps {
  /** Finish the flow and enter the app. */
  onDone: () => void;
  /** Enrolment config from the manifest. */
  enrolment?: EnrolmentManifest;
  brandColors?: ThemeColorOverrides;
}

export function PostEnrolmentFlow({ onDone, enrolment, brandColors }: PostEnrolmentFlowProps) {
  const steps = enrolment?.steps ?? DEFAULT_STEPS;
  const flow = useStepFlow(steps.length);
  const notifications = useNotificationService();
  const healthKit = useHealthKitService();

  const privacyPolicyUrl = enrolment?.privacyPolicyUrl;

  const openPrivacyPolicy = useCallback(async () => {
    if (!privacyPolicyUrl) return;
    try {
      if (WebBrowser?.openBrowserAsync) {
        await WebBrowser.openBrowserAsync(privacyPolicyUrl);
      } else {
        await Linking.openURL(privacyPolicyUrl);
      }
    } catch {
      // Silently fail — the URL may be unreachable or the browser unavailable.
    }
  }, [privacyPolicyUrl]);

  const handleEnableNotifications = useCallback(async () => {
    await notifications.requestPermission();
    flow.next();
  }, [notifications, flow]);

  const handleConnectHealth = useCallback(async () => {
    await healthKit.requestPermission();
  }, [healthKit]);

  // Whether to advance or finish depends on the step's position in the list.
  const advanceOrDone = useCallback(
    (i: number) => (i < steps.length - 1 ? flow.next : onDone),
    [steps.length, flow, onDone],
  );

  // Memoize the step type lookup for the render function.
  const stepTypes = useMemo(() => steps.map((s) => s.type), [steps]);

  return (
    <View style={styles.root}>
      <StepSlider index={flow.index} count={steps.length}>
        {(i) => {
          const type = stepTypes[i];
          if (type === 'enrolment_complete') {
            return (
              <RegistrationCompleteScreen
                onStart={advanceOrDone(i)}
                onViewPolicy={privacyPolicyUrl ? openPrivacyPolicy : undefined}
                brandColors={brandColors}
              />
            );
          }
          if (type === 'notifications') {
            return (
              <NotificationsScreen
                onEnable={handleEnableNotifications}
                onSkip={advanceOrDone(i)}
                brandColors={brandColors}
              />
            );
          }
          if (type === 'connect_health') {
            const advance = advanceOrDone(i);
            return (
              <ConnectHealthScreen
                onConnect={async () => { await handleConnectHealth(); advance(); }}
                onConnectLater={advance}
                brandColors={brandColors}
              />
            );
          }
          // Unknown step type — skip it.
          return null;
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
