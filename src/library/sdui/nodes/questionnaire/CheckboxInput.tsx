import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SelectChoice } from '../../../../types';
import CheckIcon from '../../../../theme/icons/check.svg';
import {
  INDICATOR_BORDER,
  INDICATOR_SIZE,
  ON_ACCENT,
  OPTION_RADIUS,
  PRESSED_OPACITY,
  RING_ALPHA,
  SELECTED_RING,
  SELECT_MS,
  optionShadow,
} from './optionCard';
import { fontFamily, tracking, withAlpha } from '../../../../theme/theme';

interface CheckboxInputProps {
  choices: SelectChoice[];
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  /** Fill for a checked chip (the manifest accent). */
  accentColor: string;
  /** Surface for unchecked chips. */
  surfaceColor: string;
  textColor: string;
}

/**
 * The gap between chips, which is not the gap you see.
 *
 * Each chip reserves `SELECTED_RING` all the way round for its halo whether or not it is showing one,
 * so two neighbours already sit `SELECTED_RING * 2` apart before this is added. Tune it against the
 * total rather than on its own.
 */
const CHIP_GAP = 4;

/** A chip hugs its contents — roomier across than down, so short words still read as buttons. */
const CHIP_PAD_X = 16;
const CHIP_PAD_Y = 12;

/**
 * Between the indicator and the label, inside a chip — not to be confused with `CHIP_GAP`, which is
 * the space between chips.
 *
 * Tighter than `RadioInput`'s 16, which is spacing a full-width row's two ends apart. Here the pair
 * sit together in the middle of a chip sized around them, so the same figure would read as a gap in
 * the middle of one object rather than as the space between two.
 */
const CHIP_CONTENT_GAP = 10;

/**
 * How large the tick glyph is drawn, against the 24pt indicator it sits in.
 *
 * Far larger, because `check.svg` is mostly padding — its stroke spans the middle third of the
 * viewBox, so drawn at the indicator's own size it would come out about 8pt across and read as thin
 * beside the radio's 16pt dot. At 36 the visible stroke lands around 13pt, which fills the indicator
 * to about the weight that dot has, and since the glyph is centred in its viewBox the rest overflows
 * evenly and invisibly either side.
 */
const TICK_GLYPH = 36;

/**
 * The tick drawn at exactly the weight of the circle around it.
 *
 * A stroke is in the glyph's own units, so how thick it comes out depends on how far the viewBox has
 * been scaled — at `TICK_GLYPH` the icon's own 4 renders nearer 3.3pt, heavier than the 2pt outline
 * it sits inside. Dividing back out by that scale gives whatever thickness the circle has, and keeps
 * giving it if either the glyph's size or the outline's weight is ever changed.
 *
 * `check.svg` carries its stroke width on the root rather than on the path, so this overrides it and
 * the icon's other caller keeps the default.
 */
const TICK_VIEWBOX = 43;
const TICK_STROKE = (INDICATOR_BORDER * TICK_VIEWBOX) / TICK_GLYPH;

/**
 * Multiple-choice options as a cloud of chips.
 *
 * Where `RadioInput` gives each option a full-width row, these are sized to their labels and wrap,
 * centred, into as many lines as they need. That suits what checkbox questions actually ask — a long
 * list of short options, any number of which may be on — where full-width rows would run a dozen
 * near-empty bars down the page and put the reading far from the tapping.
 *
 * Inside, it is `RadioInput`'s row: the indicator and the label centred together with padding around
 * them, the circle always drawn and empty until checked. A tick grows into it where the radio grows a
 * dot, and the chip fills with the accent and gains the translucent halo — which matters more here
 * than on a row, since it is what gives a filled chip its edge against the page.
 */
export function CheckboxInput({
  choices,
  value = [],
  onChange,
  accentColor,
  surfaceColor,
  textColor,
}: CheckboxInputProps) {
  const toggle = (code: string) => {
    onChange(value.includes(code) ? value.filter((v) => v !== code) : [...value, code]);
  };

  return (
    <View style={styles.container}>
      {choices.map((choice) => (
        <Chip
          key={choice.code}
          label={choice.label}
          checked={value.includes(choice.code)}
          onPress={() => toggle(choice.code)}
          accentColor={accentColor}
          surfaceColor={surfaceColor}
          textColor={textColor}
        />
      ))}
    </View>
  );
}

/**
 * One chip, animating between its two states rather than snapping.
 *
 * A component per chip because each needs its own shared value, and hooks can't be created in a loop.
 * Fill, halo and label all run off a single 0→1 progress, so they arrive together.
 */
function Chip({
  label,
  checked,
  onPress,
  accentColor,
  surfaceColor,
  textColor,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
}) {
  const progress = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, {
      duration: SELECT_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [checked, progress]);

  // Two layers, not a border: React Native paints an element's background *underneath* its border,
  // so a translucent accent border over an accent fill blends into the same color and vanishes. The
  // halo is the outer view's own background instead, which sits on the page.
  //
  // It fades from the same color at zero alpha rather than from `transparent`, which would interpolate
  // through black and grey the ring on its way in.
  //
  // Both endpoints are resolved out here, on the JS thread. `useAnimatedStyle` bodies are worklets
  // running on the UI thread, which can only call other worklets — calling `withAlpha` inside one
  // throws. Plain strings close over into the worklet fine.
  const ringClear = withAlpha(accentColor, 0);
  const ringVisible = withAlpha(accentColor, RING_ALPHA);
  const ringStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [ringClear, ringVisible]),
  }));
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [surfaceColor, accentColor]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textColor, ON_ACCENT]),
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [textColor, ON_ACCENT]),
  }));
  /**
   * The tick, kept mounted and scaled from nothing so it grows into place instead of appearing whole.
   *
   * Its colour is fixed rather than interpolated: an SVG's stroke is a prop, not a style, so it can't
   * be driven from the UI thread — and it doesn't need to be, since the tick is only ever visible on
   * the accent fill it is drawn to read against.
   */
  const tickStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }));

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      {/* Unchecked reserves the halo's padding with a clear background, so checking a chip doesn't
          widen it — which on a wrapping row would push its neighbours onto the next line. */}
      <Animated.View style={[styles.ring, ringStyle]}>
        <Animated.View style={[styles.chip, optionShadow, fillStyle]}>
          {/* Always drawn, empty until checked — which is what `RadioInput`'s indicator does, and
              what lets the pair sit in the chip's row rather than having to be hidden somewhere that
              costs no width. An empty circle is a checkbox; there is nothing to reserve. */}
          <Animated.View style={[styles.indicator, indicatorStyle]}>
            <Animated.View style={tickStyle}>
              <CheckIcon
                width={TICK_GLYPH}
                height={TICK_GLYPH}
                strokeWidth={TICK_STROKE}
                color={ON_ACCENT}
              />
            </Animated.View>
          </Animated.View>

          <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * The cloud: chips at their own widths, wrapping and centred.
   *
   * Centred rather than left-aligned because the last line is almost never full, and a ragged left
   * edge at the bottom of a block reads as a mistake where a centred one reads as a shape.
   */
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: CHIP_GAP,
  },
  /**
   * No `flexBasis` or `flexGrow`: a chip is as wide as its label and no wider.
   *
   * `maxWidth` so a long option still fits the page — it wraps inside its own chip rather than running
   * off the edge, which is what an unbounded content-sized row does.
   */
  pressable: {
    maxWidth: '100%',
  },
  /** The translucent halo around a checked chip — see the note at the render site. */
  ring: {
    padding: SELECTED_RING,
    borderRadius: OPTION_RADIUS,
  },
  /**
   * The indicator and the label as one centred group — `RadioInput`'s row, sized to its contents.
   *
   * Carries `optionShadow` too, the same lift the radio's rows get. That is the app's `cardShadow`
   * with its rightward offset dropped, which suits these better than the shared one would: a chip is
   * small enough that an 8pt sideways offset reads as the chip being crooked rather than raised.
   */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: CHIP_CONTENT_GAP,
    paddingHorizontal: CHIP_PAD_X,
    paddingVertical: CHIP_PAD_Y,
    borderRadius: OPTION_RADIUS,
  },
  /**
   * The circle, at the radio's own size so the two inputs read as one family.
   *
   * Nothing clips the tick inside it: the glyph's overflow is its own transparent margin, and the
   * stroke it actually draws stays within the circle.
   */
  indicator: {
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    borderWidth: INDICATOR_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
  label: {
    // Yields before the indicator does, so a long option wraps inside its chip rather than squeezing
    // the circle out of shape.
    flexShrink: 1,
    fontSize: 16,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android.
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
});
