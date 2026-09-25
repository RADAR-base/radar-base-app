import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Question } from '../../../../types';

/**
 * Chrome a speech question needs around its input, kept with the question type rather than in the
 * screen that happens to page through it.
 *
 * `SpeechInput` draws the recorder itself; this is everything the *page* has to do differently for a
 * speech question — the instruction that folds away while recording, the standing header when the
 * study wrote none, and the two lines the review screen shows in the passage's place.
 */

/** How long the heading takes to fold. Matches the questionnaire's page slide, so the two agree. */
const FOLD_MS = 260;

/**
 * Standing instruction above a speech question's passage, used when the study authored no
 * `section_header` for it.
 *
 * The passage is just the text to be read — on its own it never says what to do with it, so without
 * this the screen opens as a wall of prose above a record button. Studies that write their own
 * `section_header` keep it; this only fills the gap.
 */
export const SPEECH_DEFAULT_HEADER = 'Read the passage below aloud';

/**
 * Line under the heading on the speech review screen, where the passage used to be.
 *
 * The review screen drops the passage (there's nothing left to read) but keeps the heading, so the
 * participant still knows which task they're in — this says what the screen is now for.
 */
export const SPEECH_REVIEW_SUBTEXT = 'Take a listen. You can re-record if you would like another go';

/**
 * The same line for a study that doesn't allow playback — there's nothing to listen to, so it points
 * at the only two things the screen still offers.
 */
export const SPEECH_REVIEW_SUBTEXT_NO_REPLAY =
  'Your recording is saved. You can re-record if you would like another go';

/**
 * TESTING: force the no-replay screen on, regardless of what the definition says.
 *
 * `allow_replay_speech` isn't in the published questionnaire definitions yet, so flip this to true to
 * see the no-play-button variant. Leave it false — it's a development switch, not a study setting.
 */
const FORCE_NO_REPLAY_FOR_TESTING = false;

/**
 * Whether a speech question offers playback of the take just recorded.
 *
 * Absent means allowed: replay is the default, so definitions written before this field existed keep
 * the play button. Only an explicit negative removes it, accepted as a real boolean or as one of the
 * strings REDCap-style definitions use for one ('n', 'no', 'false', '0'), since a JSON definition
 * that came from a spreadsheet rarely carries true booleans.
 */
export function isReplayAllowed(question?: Question): boolean {
  if (FORCE_NO_REPLAY_FOR_TESTING) return false;
  const raw = question?.allow_replay_speech;
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'boolean') return raw;
  const value = String(raw).trim().toLowerCase();
  // An empty string is "unset" rather than "denied" — a blank spreadsheet cell shouldn't silently
  // strip the button from every speech question in the study.
  if (value === '') return true;
  return !['n', 'no', 'false', '0'].includes(value);
}

/**
 * A speech question's instruction, which folds away once recording starts.
 *
 * The instruction explains how to begin — "press Start, read the text, press Stop" — so by the time
 * the recorder is running it is spent, and on a long one it was what pushed the stop button off the
 * bottom of the screen. Reclaiming its whole height beats squeezing everything else around it.
 *
 * State lives here, per panel, rather than on the screen: `StepSlider` keeps neighbouring questions
 * mounted, so one shared height would be whatever the last question measured — a two-line heading
 * inheriting a seven-line one's, or worse.
 *
 * The measurement is taken *inside* the clipped view, on the content. Measuring the outer view
 * instead feeds the animated `maxHeight` straight back into what `onLayout` reports, and the block
 * walks itself shut a frame at a time. The inner content lays out at its natural size whatever the
 * parent is clipped to.
 */
export function CollapsibleHeading({
  collapsed,
  text,
  textStyle,
}: {
  collapsed: boolean;
  text?: string;
  textStyle: StyleProp<TextStyle>;
}) {
  const height = useSharedValue(0);
  const progress = useSharedValue(collapsed ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(collapsed ? 1 : 0, { duration: FOLD_MS });
  }, [collapsed, progress]);

  const style = useAnimatedStyle(() => {
    // Nothing measured yet — leave it at its natural size rather than pinning it shut.
    if (height.value === 0) return {};
    return {
      maxHeight: height.value * (1 - progress.value),
      opacity: 1 - progress.value,
    };
  });

  return (
    <Animated.View style={[styles.collapse, style]}>
      <View
        onLayout={(e) => {
          // Only while open. `maxHeight` above constrains this view too, so measuring mid-fold feeds
          // the animation straight back into its own target and the block walks itself shut.
          if (collapsed) return;
          // Read out here — React recycles the event before an updater would run.
          const measured = e.nativeEvent.layout.height;
          if (measured > 0 && Math.abs(measured - height.value) > 1) height.value = measured;
        }}
      >
        <Text style={textStyle}>{text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  collapse: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
});
