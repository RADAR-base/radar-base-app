import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  cardShadow,
  ensureContrast,
  layout as layoutTokens,
  textStyle,
  withAlpha,
  type ThemeMode,
} from '../../../../theme/theme';
import AlarmIcon from '../../../../theme/icons/alarm.svg';
import ArrowDownIcon from '../../../../theme/icons/arrowdown.svg';
import CalendarIcon from '../../../../theme/icons/calendar.svg';
import { REFUSAL_DISTANCE, refusalKnock } from './choicePress';
import { FAILED_COLOR } from './QuestionError';

export type DateTimeKind = 'date' | 'time' | 'datetime';

/** The REDCap validations drawn with a native picker, and what each one picks. */
const KIND_BY_VALIDATION: Record<string, DateTimeKind> = {
  date_dmy: 'date',
  time: 'time',
  datetime_dmy: 'datetime',
};

interface PickerModule {
  default: React.ComponentType<Record<string, unknown>>;
  DateTimePickerAndroid: { open: (args: Record<string, unknown>) => void };
}

/** `@react-native-community/datetimepicker`, if the host app installed it. Optional, like `expo-video`. */
const pickerModule = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-community/datetimepicker') as PickerModule;
  } catch {
    return null;
  }
})();

/** The picker this validation calls for, or undefined when it's plain text or no picker is installed. */
export function dateTimeKind(validation?: string): DateTimeKind | undefined {
  return pickerModule ? KIND_BY_VALIDATION[validation?.trim() ?? ''] : undefined;
}

// The answer format RADAR-Questionnaire saves, so both apps produce the same data: a JSON string of
// parts, the month as an English short name and the hour on a 12-hour clock.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function toAnswer(date: Date, kind: DateTimeKind): string {
  const parts: Record<string, string> = {};
  if (kind !== 'time') {
    parts.day = pad(date.getDate());
    parts.month = MONTHS[date.getMonth()];
    parts.year = String(date.getFullYear());
  }
  if (kind !== 'date') {
    parts.hour = pad(date.getHours() % 12 || 12);
    parts.minute = pad(date.getMinutes());
    parts.second = '00';
    parts.ampm = date.getHours() < 12 ? 'AM' : 'PM';
  }
  return JSON.stringify(parts);
}

function fromAnswer(value: string | undefined): Date | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, string>;
    const date = new Date();
    if (p.year && p.month && p.day) {
      const month = MONTHS.indexOf(p.month);
      if (month < 0) return null;
      date.setFullYear(Number(p.year), month, Number(p.day));
    }
    if (p.hour && p.minute) {
      const hour = (Number(p.hour) % 12) + (p.ampm === 'PM' ? 12 : 0);
      date.setHours(hour, Number(p.minute), Number(p.second ?? 0), 0);
    }
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/** A REDCap bound: `today`, `now`, or a fixed `YYYY-MM-DD[ HH:mm[:ss]]`. Piped references are ignored. */
function parseBound(bound: string | undefined, role: 'min' | 'max'): Date | undefined {
  const raw = bound?.trim().toLowerCase();
  if (raw === 'now') return new Date();
  if (raw === 'today') {
    const d = new Date();
    if (role === 'min') d.setHours(0, 0, 0, 0);
    else d.setHours(23, 59, 59, 999);
    return d;
  }
  const m = raw && /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/i.exec(raw);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(v => Number(v ?? 0));
  return new Date(y, mo - 1, d, h, mi, s);
}

function clamp(date: Date, min?: Date, max?: Date): Date {
  if (min && date < min) return new Date(min);
  if (max && date > max) return new Date(max);
  return date;
}

function describe(date: Date, kind: DateTimeKind): string {
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return kind === 'date' ? day : kind === 'time' ? time : `${day}, ${time}`;
}

const COPY: Record<DateTimeKind, { label: string; placeholder: string }> = {
  date: { label: 'Date', placeholder: 'Choose a date' },
  time: { label: 'Time', placeholder: 'Choose a time' },
  datetime: { label: 'Date and time', placeholder: 'Choose a date and time' },
};

interface Part {
  type: string;
  value: string;
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
const WEEKDAY_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'long' };
const formatters = new Map<Intl.DateTimeFormatOptions, Intl.DateTimeFormat>();

/** The date split the locale's way (day, month, hour…), so each piece can change on its own. */
function formatParts(date: Date, options: Intl.DateTimeFormatOptions): Part[] {
  try {
    let format = formatters.get(options);
    if (!format) formatters.set(options, (format = new Intl.DateTimeFormat(undefined, options)));
    return format.formatToParts(date);
  } catch {
    return [{ type: 'whole', value: date.toLocaleString(undefined, options) }];
  }
}

const RADIUS = 32;
const RING_WIDTH = 5;
const BORDER_WIDTH = 2;
const RING_ALPHA = 0.5;
const RING_MS = 180;
const BADGE_SIZE = 36;
const VALUE_MS = 260;
const VALUE_SHIFT = 10;
const EXPAND_MS = 300;
const easeOut = (duration: number) => ({ duration, easing: Easing.out(Easing.cubic) });
const DRAWER_TIMING = { duration: EXPAND_MS, easing: Easing.inOut(Easing.cubic) };

/** Rises into place each time `key` changes, but not when first shown. */
function useRise(key: unknown) {
  const rise = useSharedValue(1);
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    rise.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, easeOut(VALUE_MS)));
  }, [key, rise]);
  return useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * VALUE_SHIFT }],
  }));
}

function RollingText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  return <Animated.Text style={[style, useRise(text)]}>{text}</Animated.Text>;
}

function RollingParts({ parts, style }: { parts: Part[]; style: StyleProp<TextStyle> }) {
  return (
    <View style={styles.parts}>
      {parts.map((part, i) =>
        part.type === 'literal' ? (
          <Text key={i} style={style}>
            {part.value}
          </Text>
        ) : (
          <RollingText key={`${part.type}-${i}`} text={part.value} style={style} />
        ),
      )}
    </View>
  );
}

interface DateTimeQuestionInputProps {
  kind: DateTimeKind;
  value: string | undefined;
  onChange: (value: string) => void;
  textValidationMin?: string;
  textValidationMax?: string;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
  accentColor?: string;
  surfaceColor?: string;
  mode?: ThemeMode;
  submitAttempt?: number;
  onValidityChange?: (valid: boolean, reason?: string | null) => void;
  errorMessage?: string | null;
}

/**
 * A date, time or date-and-time answer, shown as a card and picked with the platform's own picker:
 * Android opens the system dialog, iOS shows the picker inside the card.
 * Nothing is recorded until the participant acts, so a skipped question stays unanswered.
 */
export function DateTimeQuestionInput({
  kind,
  value,
  onChange,
  textValidationMin,
  textValidationMax,
  primaryColor,
  textColor,
  textSecondaryColor,
  accentColor,
  surfaceColor,
  mode = 'light',
  submitAttempt = 0,
  onValidityChange,
  errorMessage,
}: DateTimeQuestionInputProps) {
  const picker = pickerModule!;
  const min = useMemo(() => parseBound(textValidationMin, 'min'), [textValidationMin]);
  const max = useMemo(() => parseBound(textValidationMax, 'max'), [textValidationMax]);
  const selected = useMemo(() => fromAnswer(value), [value]);
  const [open, setOpen] = useState(false);
  // Only iOS shows the picker in the card; Android's dialogs have nothing to collapse.
  const collapsible = Platform.OS === 'ios';

  // A picker can't produce a malformed answer; whether an empty one is allowed is the screen's call.
  useEffect(() => {
    onValidityChange?.(true, null);
  }, [onValidityChange]);

  const select = (date: Date) => onChange(toAnswer(clamp(date, min, max), kind));
  const start = () => selected ?? clamp(new Date(), min, max);

  const openAndroid = () =>
    picker.DateTimePickerAndroid.open({
      value: start(),
      mode: kind === 'time' ? 'time' : 'date',
      ...(kind !== 'time' && { minimumDate: min, maximumDate: max }),
      onValueChange: (_: unknown, date: Date) => {
        if (kind !== 'datetime') return select(date);
        // No combined dialog on Android: the date first, then the time on that day.
        picker.DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onValueChange: (__: unknown, time: Date) => {
            const merged = new Date(date);
            merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
            select(merged);
          },
        });
      },
    });

  const handlePress = () => {
    if (!collapsible) return openAndroid();
    // Opening the picker is the choice: it starts on a real value, so "today" needs no extra tap.
    if (!open && !selected) select(start());
    setOpen(o => !o);
  };

  const accent = accentColor ?? primaryColor;
  const surface = surfaceColor ?? '#FFFFFF';
  const failed = !!errorMessage;
  const edge = failed ? FAILED_COLOR : accent;
  const tint = withAlpha(accent, 0.25);
  // iOS draws today's number and the chosen day in this colour, so it has to read as text.
  const pickerAccent = useMemo(() => ensureContrast(accent, surface, 4.5), [accent, surface]);

  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withTiming(failed || open ? 1 : 0, { duration: RING_MS });
  }, [failed, open, ring]);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (submitAttempt === 0 || !failed) return;
    shake.value = refusalKnock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempt, shake]);
  const edgeOff = withAlpha(edge, 0);
  const haloOn = withAlpha(edge, RING_ALPHA);
  const haloStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ring.value, [0, 1], [edgeOff, haloOn]),
    transform: [{ translateX: shake.value }],
  }));
  const edgeStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ring.value, [0, 1], [edgeOff, edge]),
  }));

  // The first value replaces the placeholder as a whole; after that each part animates on its own.
  const valueStyle = useRise(!!selected);

  // One value drives the arrow and the drawer, eased the same both ways. The picker stays mounted
  // until the close finishes, and the first open waits for its height so it doesn't jump.
  const [pickerMounted, setPickerMounted] = useState(false);
  const pickerHeight = useSharedValue(0);
  const expand = useSharedValue(0);
  const animateDrawer = useCallback(
    (to: 0 | 1) => {
      expand.value = withTiming(to, DRAWER_TIMING, finished => {
        if (finished && to === 0) runOnJS(setPickerMounted)(false);
      });
    },
    [expand],
  );
  useEffect(() => {
    if (!collapsible) return;
    if (!open) return animateDrawer(0);
    setPickerMounted(true);
    if (pickerHeight.value > 0) animateDrawer(1);
  }, [open, collapsible, animateDrawer, pickerHeight]);
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expand.value * 180}deg` }],
  }));
  const drawerStyle = useAnimatedStyle(() => ({
    height: pickerHeight.value * expand.value,
    opacity: expand.value,
  }));

  const Picker = picker.default;
  const Icon = kind === 'time' ? AlarmIcon : CalendarIcon;
  const time = selected ? formatParts(selected, TIME_FORMAT) : [];
  const period = time.find(p => p.type === 'dayPeriod')?.value;
  const clock = time.filter(p => p.type !== 'dayPeriod' && p.value.trim() !== '');
  const primary = { color: textColor };
  const secondary = { color: textSecondaryColor };

  return (
    <Animated.View style={[styles.halo, cardShadow, haloStyle]}>
      <Animated.View style={[styles.field, { backgroundColor: surface }, edgeStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${COPY[kind].label}: ${selected ? describe(selected, kind) : 'not chosen'}`}
          accessibilityHint={open ? 'Hides the picker' : COPY[kind].placeholder}
          accessibilityState={{ expanded: open }}
          onPress={handlePress}
          style={styles.body}
        >
          <View style={styles.topRow}>
            <View style={[styles.badge, { backgroundColor: tint }]}>
              <Icon color={primaryColor} />
            </View>
            <Text style={[styles.label, secondary]}>{COPY[kind].label}</Text>
            {collapsible && (
              <Animated.View style={[styles.badge, { backgroundColor: tint }, arrowStyle]}>
                <ArrowDownIcon color={primaryColor} />
              </Animated.View>
            )}
          </View>

          <Animated.View style={valueStyle}>
            {!selected ? (
              <Text style={[styles.placeholder, secondary]}>{COPY[kind].placeholder}</Text>
            ) : kind === 'time' ? (
              <View style={styles.hero}>
                <RollingParts parts={clock} style={[styles.numeral, primary]} />
                {!!period && <RollingText text={period} style={[styles.unit, secondary]} />}
              </View>
            ) : (
              <View style={styles.hero}>
                <RollingText text={String(selected.getDate())} style={[styles.numeral, primary]} />
                <View style={styles.stack}>
                  <RollingParts
                    parts={formatParts(selected, MONTH_FORMAT)}
                    style={[styles.primaryLine, primary]}
                  />
                  <RollingParts
                    parts={[
                      ...formatParts(selected, WEEKDAY_FORMAT),
                      ...(kind === 'datetime' ? [{ type: 'literal', value: ' · ' }, ...time] : []),
                    ]}
                    style={[styles.secondaryLine, secondary]}
                  />
                </View>
              </View>
            )}
          </Animated.View>
        </Pressable>

        {pickerMounted && (
          <Animated.View style={[styles.drawer, drawerStyle]}>
            <View
              onLayout={e => {
                const first = pickerHeight.value === 0;
                pickerHeight.value = e.nativeEvent.layout.height;
                if (first && open) animateDrawer(1);
              }}
              style={[styles.inline, { borderTopColor: withAlpha(textSecondaryColor, 0.2) }]}
            >
              <Picker
                value={selected ?? start()}
                mode={kind}
                display={kind === 'time' ? 'spinner' : 'inline'}
                minimumDate={kind === 'time' ? undefined : min}
                maximumDate={kind === 'time' ? undefined : max}
                themeVariant={mode}
                accentColor={pickerAccent}
                textColor={textColor}
                onValueChange={(_: unknown, date: Date) => select(date)}
              />
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  halo: {
    borderWidth: RING_WIDTH,
    borderRadius: RADIUS + RING_WIDTH,
    marginHorizontal: REFUSAL_DISTANCE,
  },
  field: { borderWidth: BORDER_WIDTH, borderRadius: RADIUS, overflow: 'hidden' },
  body: { padding: layoutTokens.cardPadding, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, ...textStyle(14, 20, 'medium') },
  placeholder: textStyle(20, 28, 'light'),
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  numeral: { ...textStyle(44, 48, 'light'), letterSpacing: -1 },
  unit: textStyle(18, 30, 'regular'),
  parts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  stack: { flex: 1, paddingBottom: 4 },
  primaryLine: textStyle(16, 22, 'semiBold'),
  secondaryLine: textStyle(14, 20, 'regular'),
  drawer: { overflow: 'hidden' },
  inline: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: layoutTokens.cardPadding,
    paddingBottom: 8,
  },
});
