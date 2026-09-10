import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { fontFamily, layout as layoutTokens, tracking, withAlpha } from '../../../../theme/theme';
import { FAILED_COLOR, QuestionError } from './QuestionError';

interface TextQuestionInputProps {
  validationType?: string;
  textValidationMin?: string;
  textValidationMax?: string;
  value: string | undefined;
  onChange: (value: string) => void;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
  /** Manifest accent — the focused ring. Falls back to `primaryColor` when unset. */
  accentColor?: string;
  /** Card surface the field is drawn on. Falls back to the theme's white card. */
  surfaceColor?: string;
  /**
   * How many times the participant has tried to move on. Zero keeps the field in its default state
   * however empty or wrong it is — nobody should be told off for a question they haven't reached the
   * end of.
   *
   * A count rather than a flag so a second attempt is distinguishable from the first: the field
   * shakes on each one, and a boolean that was already true would only ever shake once.
   */
  submitAttempt?: number;
  /** Reports whether the current answer would pass, so the screen knows to hold them here. */
  onValidityChange?: (valid: boolean) => void;
  /**
   * Why the screen refused this question, if it did — it owns the required rule, since it is the one
   * gating `Next`. Merged with this field's own format checks below.
   */
  errorMessage?: string | null;
}

/** Figma 3593:4092. Corner radius of the writing area. */
const RADIUS = 32;
/** Inset of the text from the card's edge. The design's 32 left a lot of empty margin around a
 *  smaller type size, so this takes the app's shared card padding instead — the same inset the
 *  passage card and the action cards use. */
const PADDING = layoutTokens.cardPadding;
/**
 * The two layers of the state ring: a 5pt translucent halo outside a 2pt solid edge.
 *
 * Both are present in every state and only ever change colour, fading between them. Reserving the
 * widths keeps the field exactly the same size focused, failed or idle — so tapping into it can't
 * nudge the rest of the page, and only paint changes.
 */
const RING_WIDTH = 5;
const BORDER_WIDTH = 2;
/** How translucent the outer halo is (design: the edge colour at 50%). */
const RING_ALPHA = 0.5;

/** How long the ring takes to settle in or out. Matches `RadioInput`'s select, so the questionnaire's
 *  inputs all respond at the same speed. */
const RING_MS = 180;

/**
 * How far the field swings when an answer is refused. The swing decays rather than repeating evenly,
 * so it reads as a knock rather than a wobble.
 *
 * The field also reserves this much margin either side. It fills the panel, and the panel sits in
 * `StepSlider`'s viewport, which clips — so without room to move into, the card's edge was sliced off
 * mid-swing. The margin is constant, so it costs nothing when the field isn't shaking.
 */
const SHAKE_DISTANCE = 6;
/** Total length of the knock, divided into the eight equal legs the sequence below uses. Stated as a
 *  total because that's the number worth tuning — the legs just have to add up to it. */
const SHAKE_MS = 220;
const SHAKE_STEP_MS = SHAKE_MS / 8;

/** Enough room to invite a few sentences, while still leaving the question above it visible. */
const MIN_HEIGHT = 200;
/** A single-line field (numbers, email, phone) doesn't need the writing area's height. */
const SINGLE_LINE_MIN_HEIGHT = 72;

/**
 * A softer, straight-down drop shadow.
 *
 * The design's is offset 8pt right, and the shared `cardShadow` matches it — but this field is
 * full-width inside a viewport that clips its overflow (the panel's ScrollView and `StepSlider`
 * both do), so a horizontal offset is sliced off at the edge. Dropping it leaves only the blur,
 * which reads the same. Android already draws straight down, so it matches there either way.
 */
const fieldShadow = Platform.select({
  android: { boxShadow: '0px 4px 12px rgba(121, 120, 127, 0.14)', elevation: 0 },
  default: {
    shadowColor: '#79787F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 0,
  },
});

/**
 * Free-text answer (Figma 3593:4092) — a card-sized writing area with three states:
 *
 *   - **Default** — a plain card with a soft drop shadow
 *   - **Focused** — accent edge inside a translucent accent halo, while they're typing
 *   - **Failed**  — the same treatment in red, with the reason underneath
 *
 * Validation only runs for the numeric types, and only once something has been typed: an empty field
 * is unanswered rather than wrong, so it stays in the default state.
 */
export function TextQuestionInput({
  validationType,
  textValidationMin,
  textValidationMax,
  value,
  onChange,
  primaryColor,
  textColor,
  textSecondaryColor,
  accentColor,
  surfaceColor,
  submitAttempt = 0,
  onValidityChange,
  errorMessage,
}: TextQuestionInputProps) {
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  /**
   * Why the answer wouldn't pass, or null if it would.
   *
   * `validationWarning` is the half that shows as you type — a number outside its range says so
   * immediately. The rest only surfaces on submit, which is why the two are separate: this is what
   * the screen is told about, and what it shows once they press Next.
   */
  // This field only judges *format* — a number outside its range, and it says so as you type. Whether
  // an empty answer is allowed is the screen's call, and arrives as `errorMessage`.
  const invalidReason = validationWarning;
  const warning = errorMessage ?? (submitAttempt > 0 ? invalidReason : validationWarning);

  useEffect(() => {
    onValidityChange?.(!invalidReason);
  }, [invalidReason, onValidityChange]);

  const isNumeric = validationType === 'number' || validationType === 'integer';
  const keyboardType = isNumeric ? ('numeric' as const) : ('default' as const);
  const multiline = !isNumeric && validationType !== 'email' && validationType !== 'phone';

  const handleChange = (text: string) => {
    onChange(text);

    if (isNumeric && text) {
      const num = Number(text);
      if (isNaN(num)) {
        setValidationWarning('Please enter a valid number');
        return;
      }
      if (textValidationMin && num < Number(textValidationMin)) {
        setValidationWarning(`Minimum value: ${textValidationMin}`);
        return;
      }
      if (textValidationMax && num > Number(textValidationMax)) {
        setValidationWarning(`Maximum value: ${textValidationMax}`);
        return;
      }
    }
    setValidationWarning(null);
  };

  const placeholder = isNumeric
    ? textValidationMin && textValidationMax
      ? `Enter value (${textValidationMin}–${textValidationMax})`
      : 'Enter number'
    : 'Write here';

  const accent = accentColor ?? primaryColor;
  const surface = surfaceColor ?? '#FFFFFF';

  // Failure outranks focus: a field that's both is still wrong, and the red says so.
  const active = !!warning || focused;
  const edge = warning ? FAILED_COLOR : accent;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: RING_MS });
  }, [active, progress]);

  // Every endpoint resolved out here, on the JS thread: `useAnimatedStyle` bodies are worklets, and
  // `withAlpha` is not one.
  //
  // Note the resting colour is the ring's own hue at zero alpha, not `'transparent'` —
  // `interpolateColor` reads that as transparent *black*, so the ring would darken on its way in.
  const edgeOff = withAlpha(edge, 0);
  const edgeOn = edge;
  const haloOff = withAlpha(edge, 0);
  const haloOn = withAlpha(edge, RING_ALPHA);

  // Knocked sideways each time an answer is refused. Keyed on the attempt count, so pressing Next
  // again on the same unchanged answer shakes again rather than sitting there looking inert.
  const shake = useSharedValue(0);
  useEffect(() => {
    if (submitAttempt === 0 || !warning) return;
    shake.value = withSequence(
      withTiming(-SHAKE_DISTANCE, { duration: SHAKE_STEP_MS }),
      withTiming(SHAKE_DISTANCE, { duration: SHAKE_STEP_MS * 2 }),
      withTiming(-SHAKE_DISTANCE * 0.6, { duration: SHAKE_STEP_MS * 2 }),
      withTiming(SHAKE_DISTANCE * 0.35, { duration: SHAKE_STEP_MS * 2 }),
      withTiming(0, { duration: SHAKE_STEP_MS }),
    );
    // `warning` is deliberately not a dependency: fixing the answer shouldn't shake the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempt, shake]);

  const haloStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [haloOff, haloOn]),
    transform: [{ translateX: shake.value }],
  }));
  const edgeStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [edgeOff, edgeOn]),
  }));

  return (
    <View style={styles.container}>
      {/* Two nested views rather than one bordered box: React Native paints a view's background
          *under* its border, so a translucent halo drawn over the card's own fill would be invisible.
          The outer view carries the halo, the inner one the solid edge and the fill. */}
      <Animated.View style={[styles.halo, fieldShadow, haloStyle]}>
        <Animated.View
          style={[
            styles.field,
            multiline ? styles.fieldMultiline : styles.fieldSingle,
            { backgroundColor: surface },
            edgeStyle,
          ]}
        >
          <TextInput
            style={[styles.input, { color: textColor }]}
            value={value ?? ''}
            onChangeText={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType={keyboardType}
            placeholder={placeholder}
            placeholderTextColor={textSecondaryColor}
            multiline={multiline}
            autoCapitalize={validationType === 'email' ? 'none' : 'sentences'}
            autoCorrect={validationType !== 'email'}
          />
        </Animated.View>
      </Animated.View>
      {/* Below the card, where it grows into empty space rather than displacing the field. Inset by
          the halo's width so it starts on the red border's left edge — flush with the container it
          belongs to, rather than with the translucent ring around it. */}
      <QuestionError message={warning} style={styles.warningRow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Matches the gap the other question types leave above their message.
    gap: 16,
  },
  halo: {
    borderWidth: RING_WIDTH,
    borderRadius: RADIUS + RING_WIDTH,
    // Room for the knock — see `SHAKE_DISTANCE`.
    marginHorizontal: SHAKE_DISTANCE,
  },
  field: {
    borderWidth: BORDER_WIDTH,
    borderRadius: RADIUS,
    padding: PADDING,
    // Keeps the text clipped to the rounded corners as it grows.
    overflow: 'hidden',
  },
  fieldMultiline: {
    minHeight: MIN_HEIGHT,
  },
  fieldSingle: {
    minHeight: SINGLE_LINE_MIN_HEIGHT,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    // 16 rather than the design's 20: this is a paragraph the participant writes, not a heading, and
    // it matches the body type used elsewhere (`InfoScreen`, the "Well done" copy). More words fit
    // before the field has to scroll, too.
    fontSize: 16,
    // Taller than the font size so descenders aren't clipped on Android — the design's 20/20 would.
    lineHeight: 22,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
    // Multiline fields centre their text vertically on Android without this.
    textAlignVertical: 'top',
  },
  warningRow: {
    // Starts where the red border does — past the field's own margin and its translucent halo, not
    // at the container's edge.
    paddingLeft: SHAKE_DISTANCE + RING_WIDTH,
  },
});
