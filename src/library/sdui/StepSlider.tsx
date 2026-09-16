import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { StepDirection } from './useStepFlow';

export interface StepSliderProps {
  /** Current step index. */
  index: number;
  /**
   * @deprecated No longer needed — slide direction is derived automatically from the index change
   * (forward slides in from the right, back from the left). Kept for API compatibility.
   */
  direction?: StepDirection;
  /** Transition duration in ms. */
  duration?: number;
  /** Renders the content for a given step index. */
  children: (index: number) => React.ReactNode;
}

/**
 * Slides between step views horizontally: on an index change the incoming view enters from the side
 * (right when advancing, left when going back) while the outgoing view exits the opposite way, then
 * the outgoing view is dropped. Only the content moves — a persistent header above (or a background
 * behind) stays put. Pair with `useStepFlow`, which supplies `index`.
 *
 * Positions are driven by a single `position` shared value that animates between absolute step
 * indices — it is **not** reset per transition. That's deliberate: when the incoming panel first
 * mounts, `position` still holds the previous index, which already places the panel off-screen, so
 * there's no reset-to-0 for the first paint to race with (the source of a one-frame blink otherwise).
 */
export function StepSlider({ index, duration = 260, children }: StepSliderProps) {
  const { width } = useWindowDimensions();
  const position = useSharedValue(index);
  // `to` is the settling step; during a transition `from` is the outgoing one (else `from === to`).
  const [panels, setPanels] = useState<{ from: number; to: number }>({ from: index, to: index });

  useEffect(() => {
    if (index === panels.to) return;
    setPanels(p => ({ from: p.to, to: index }));
    // Only react to index changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  /**
   * The slide starts a couple of frames after the incoming panel mounts, not in the same commit.
   *
   * Anything that sizes itself from `onLayout` — every slider here does, holding its track in state
   * that starts at zero — paints one empty frame before its geometry arrives. Start the slide on the
   * mounting commit and that empty frame is already on screen, so the panel slides in visibly blank
   * and then snaps to full size: the flicker.
   *
   * Waiting costs nothing, because the incoming panel is *already off-screen* the moment it mounts —
   * `position` still holds the previous index, which is exactly where its transform puts it. So these
   * frames happen out of sight. Two of them, because the geometry needs a full round trip: paint,
   * `onLayout`, the state write it causes, then the commit that renders at the real size.
   */
  useEffect(() => {
    if (panels.from === panels.to) return;
    const target = panels.to;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        position.value = withTiming(target, { duration }, finished => {
          // Drop the outgoing panel once fully settled (a new transition sets finished=false, so only
          // the last one collapses the panels).
          if (finished) runOnJS(setPanels)({ from: target, to: target });
        });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels.from, panels.to]);

  /**
   * Both panels are keyed by the step they show.
   *
   * Without keys React reconciles these two slots by position, and a transition changes what is in each
   * slot rather than adding one: the slot that held the settled step keeps its mounted instance and
   * merely swaps its children for the incoming step. Anything stateful inside — a slider's index, its
   * measured track, its shared values — therefore carries over from the *outgoing* question while the
   * props are the incoming one's, and the outgoing panel mounts a fresh copy that re-measures from
   * zero. That mismatch is what made every slider distort and flicker on a question change.
   *
   * Keyed, each step owns its own subtree: the incoming one mounts clean, the outgoing one keeps the
   * state it already had until it is dropped.
   */
  return (
    <View style={styles.viewport}>
      {panels.from !== panels.to && (
        <StepPanel
          key={panels.from}
          step={panels.from}
          origin={panels.from}
          position={position}
          width={width}
          pointerEvents="none"
        >
          {children(panels.from)}
        </StepPanel>
      )}
      <StepPanel
        key={panels.to}
        step={panels.to}
        origin={panels.from}
        position={position}
        width={width}
      >
        {children(panels.to)}
      </StepPanel>
    </View>
  );
}

interface StepPanelProps {
  /** The step this panel shows. Fixed for the panel's whole life — it is also its key. */
  step: number;
  /** The index `position` holds when this panel mounts, which is where its first paint belongs. */
  origin: number;
  /** Shared across panels: the step currently being displayed, fractional mid-slide. */
  position: SharedValue<number>;
  width: number;
  pointerEvents?: 'none' | 'auto';
  children: React.ReactNode;
}

/**
 * One panel, owning its own animated style for its whole life.
 *
 * This is why it is a component rather than two `useAnimatedStyle` calls in the parent. Hooks belong
 * to the component that calls them, so a parent holding one "incoming" and one "outgoing" style has
 * exactly two of them to share between panels — and on every transition they *swap views*: the panel
 * that was settled hands its style back and takes the outgoing one, while the incoming style is
 * handed to a view that did not exist a moment ago. Reassigning an animated style to a different view
 * re-registers it against a new view tag on the UI thread, and a view caught mid-reassignment paints
 * with no animated props at all — at translateX 0, centre screen, on top of the question being left.
 * That was the flash.
 *
 * Keyed by step and holding its own hook, a panel's style is created with it, addresses only its view,
 * and is never reassigned. `step` is constant too, so the worklet's dependencies never change and it
 * is never even rebuilt.
 */
function StepPanel({ step, origin, position, width, pointerEvents, children }: StepPanelProps) {
  /**
   * Where this panel sits before its animated style has had a chance to run.
   *
   * Captured once, at mount: `position` holds `origin` at that moment, so this is the same offset the
   * animated style is about to compute. Belt and braces — it costs nothing and means the very first
   * paint cannot land anywhere but the right place.
   */
  const [initialX] = useState(() => (step - origin) * width);

  // The panel sits at (its step − the current position) × width: it enters from whichever side it is
  // on as `position` advances toward it, and rests at 0 once `position` reaches its step.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (step - position.value) * width }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { transform: [{ translateX: initialX }] }, style]}
      pointerEvents={pointerEvents}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
});
