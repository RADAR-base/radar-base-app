import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import ArrowRightIcon from '../../../theme/icons/arrowright.svg';
import { fontFamily, tracking, getColorTokens } from '../../../theme/theme';
import { TabActiveContext } from '../TabActiveContext';
import { CalendarTaskView } from './section/CalendarTaskView';
import type { NodeProps } from '../types';

/**
 * Calendar page — a date header + week-strip date selector (Figma `CalendarDateSelector`,
 * node 2715:4063) over the selected day's task list. Tapping a day switches the list to that
 * day; the arrows page a week at a time (keeping the same weekday). A teal dot under a day marks
 * **today** (the current day). The task list itself is the shared `TaskDayList`, the same body
 * `TaskListSectionNode` renders for today.
 *
 * The selector is a fixed navy component in both light and dark (matching the Figma), so its colors
 * are local constants rather than theme tokens — only the date-header text keys off the theme.
 */

/** navy/800 — the pill container fill. */
const SELECTOR_BG = '#1D3557';
/** navy/600 — the circular arrow buttons. */
const ARROW_BG = '#2C4F6B';
/** cyan/300 — today's dot. */
const CYAN = '#7EC8E8';
const DAY_TEXT = '#FFFFFF';
/**
 * Selected-day highlight: cyan/300 at 50% pre-blended over the navy selector background, as an
 * *opaque* color. It's visually identical to `rgba(126,200,232,0.5)` on the navy, but avoids an
 * Android bug where a semi-transparent background + borderRadius paints as a square, not a circle.
 * (The selector background is always this fixed navy, so the pre-blend stays correct.)
 */
const SELECTED_BG = '#4E7FA0';

/** How far (px) the day strip slides in from when paging to another week. */
const WEEK_SLIDE = 32;

/** Mon-first, matching the Figma strip (M T W T F S S). */
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** The Monday of the week containing `d` (weeks run Mon→Sun to match the strip). */
function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun … 6=Sat
  const offset = (day + 6) % 7; // days since Monday
  return startOfDay(addDays(d, -offset));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Monday 19 August" — weekday + day-of-month + month, matching the Figma date header. */
function formatDateHeader(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

export function CalendarNode({ context }: NodeProps) {
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);

  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [today, setToday] = useState<Date>(() => startOfDay(new Date()));

  // Whenever the calendar tab comes into view, snap back to today. Tabs stay mounted (they aren't
  // re-created on switch — see TabActiveContext), so without this the page would keep whatever day
  // you'd navigated to on a previous visit. Also refreshes `today` in case the app crossed midnight
  // while parked on another tab.
  const isActive = useContext(TabActiveContext);
  useEffect(() => {
    if (!isActive) return;
    const t = startOfDay(new Date());
    setToday(t);
    setSelectedDate(t);
  }, [isActive]);

  const weekStart = useMemo(() => mondayOf(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Selector range, aligned to whole Mon–Sun weeks: two full weeks back, this week, and one full week
  // forward. `minDate` is the Monday two weeks before this week; `maxDate` is the Sunday of next week.
  // Aligning to week boundaries (rather than a rolling ±N days) means paging back always lands on a
  // full Mon–Sun week — e.g. from a Tuesday you can still reach last Monday. Days outside
  // [minDate, maxDate] aren't selectable and the arrows stop at the edges; the schedule generates this
  // same window so there's nothing to show beyond it.
  const minDate = useMemo(() => addDays(mondayOf(today), -14), [today]);
  const maxDate = useMemo(() => addDays(mondayOf(today), 13), [today]);
  const canPrev = weekStart.getTime() > minDate.getTime();
  const canNext = addDays(weekStart, 6).getTime() < maxDate.getTime();

  // Week-change animation: the strip of day cells slides in from the side it came from (next → from
  // the right, prev → from the left) and fades, so paging weeks reads as motion instead of the strip
  // silently swapping to identical-looking letters. Manual shared values (not layout animations) —
  // see the reanimated note about entering/exiting stranding a touch overlay.
  const stripX = useSharedValue(0);
  const stripOpacity = useSharedValue(1);
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: stripX.value }],
    opacity: stripOpacity.value,
  }));

  // Arrows page a whole week, keeping the selected weekday (so the highlight and list move together).
  const shiftWeek = (delta: number) => {
    setSelectedDate((current) => {
      const next = addDays(current, delta * 7);
      if (next.getTime() < minDate.getTime()) return minDate;
      if (next.getTime() > maxDate.getTime()) return maxDate;
      return next;
    });
    stripX.value = delta > 0 ? WEEK_SLIDE : -WEEK_SLIDE;
    stripOpacity.value = 0.35;
    stripX.value = withTiming(0, { duration: 240 });
    stripOpacity.value = withTiming(1, { duration: 240 });
  };

  // Sliding selection highlight: one circle that animates its x from the previously-selected day to
  // the tapped one, instead of the background instantly hopping between cells. Each cell reports its
  // x via onLayout (daysRow has no border, so an absolute child's left:0 shares that origin), so we
  // don't hard-code the flex spacing.
  const selectedIndex = weekDays.findIndex((d) => sameDay(d, selectedDate));
  const cellX = useRef<number[]>([]);
  const indicatorX = useSharedValue(0);
  const indicatorReady = useSharedValue(0);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    opacity: indicatorReady.value,
  }));

  const handleCellLayout = (index: number) => (e: LayoutChangeEvent) => {
    cellX.current[index] = e.nativeEvent.layout.x;
    // First time we know where the selected cell is, place the highlight there without animating in.
    if (index === selectedIndex && indicatorReady.value === 0) {
      indicatorX.value = e.nativeEvent.layout.x;
      indicatorReady.value = 1;
    }
  };

  useEffect(() => {
    const x = cellX.current[selectedIndex];
    if (selectedIndex < 0 || x == null) return;
    indicatorX.value = withTiming(x, { duration: 220 });
  }, [selectedIndex, indicatorX]);

  return (
    <View style={styles.container}>
      <View style={styles.selectorBlock}>
        <Text style={[styles.dateHeader, { color: tokens.text.primary }]}>
          {formatDateHeader(selectedDate)}
        </Text>

        <View style={styles.selectorRow}>
          <ArrowButton direction="prev" onPress={() => shiftWeek(-1)} disabled={!canPrev} />

          <Animated.View style={[styles.daysRow, stripStyle]}>
            {/* Single highlight circle behind the letters; slides between days (see indicatorStyle). */}
            <Animated.View style={[styles.selectedIndicator, indicatorStyle]} pointerEvents="none" />
            {weekDays.map((day, i) => {
              const selected = sameDay(day, selectedDate);
              const isToday = sameDay(day, today);
              const inRange =
                day.getTime() >= minDate.getTime() && day.getTime() <= maxDate.getTime();
              return (
                <Pressable
                  key={day.getTime()}
                  accessibilityRole="button"
                  accessibilityLabel={formatDateHeader(day)}
                  accessibilityState={{ selected, disabled: !inRange }}
                  disabled={!inRange}
                  hitSlop={6}
                  onLayout={handleCellLayout(i)}
                  onPress={() => setSelectedDate(startOfDay(day))}
                >
                  <View style={styles.dayCircle}>
                    <Text style={[styles.dayLetter, !inRange && styles.dayLetterDisabled]}>
                      {DAY_LETTERS[i]}
                    </Text>
                    {/* Teal dot marks today — absolutely positioned just under the centered letter, so
                        it doesn't add height (keeps the circle level with the arrows). */}
                    {isToday && <View style={styles.dot} />}
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>

          <ArrowButton direction="next" onPress={() => shiftWeek(1)} disabled={!canNext} />
        </View>
      </View>

      <CalendarTaskView context={context} date={selectedDate} />
    </View>
  );
}

/** Circular navy arrow button. Reuses the single `arrowright` glyph, mirrored for "prev". */
function ArrowButton({
  direction,
  onPress,
  disabled,
}: {
  direction: 'prev' | 'next';
  onPress: () => void;
  disabled?: boolean;
}) {
  const isPrev = direction === 'prev';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPrev ? 'Previous week' : 'Next week'}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrowBtn,
        disabled && styles.arrowBtnDisabled,
        pressed && styles.arrowBtnPressed,
      ]}
    >
      {/* The glyph sits ~0.5px left of its box (empty space on the right of the viewBox), so it reads
          slightly off-center — and flipping it for "prev" mirrors that to the other side. This outer
          nudge re-centers each direction; the inner view does the flip so the two don't compound. */}
      <View style={isPrev ? styles.arrowNudgePrev : styles.arrowNudgeNext}>
        <View style={isPrev ? styles.flip : undefined}>
          <ArrowRightIcon width={15} height={14} color={DAY_TEXT} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 16,
    // Pull the date header up under the shell's "Calendar" title. `ViewNode` gives every tab a
    // header→body gap (headerTitle paddingBottom 16 + body paddingTop 15 + the 40px title's line
    // leading), which reads as dead space between that title and this date header. This negative
    // margin is scoped to the calendar page, so home/profile keep their normal spacing.
    marginTop: -20,
  },
  selectorBlock: {
    width: '100%',
    gap: 8,
  },
  dateHeader: {
    fontSize: 24,
    // Taller than the font size: with includeFontPadding:false, a 1:1 line height clips descenders
    // (the g/y tails in "Wednesday…August") on Android. ~1.25x gives them room.
    lineHeight: 30,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  selectorRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SELECTOR_BG,
    borderRadius: 26,
    padding: 6,
  },
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    // Clip the horizontal slide so cells don't spill past the arrows during the week-change animation.
    overflow: 'hidden',
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ARROW_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnPressed: {
    opacity: 0.7,
  },
  // Dimmed at the ±1-week bounds (can't page further).
  arrowBtnDisabled: {
    opacity: 0.3,
  },
  flip: {
    transform: [{ scaleX: -1 }],
  },
  // Re-center the off-center arrow glyph, outward per direction (see ArrowButton). Tunable if a
  // future icon swap changes the glyph's offset.
  arrowNudgeNext: {
    transform: [{ translateX: 0.5 }],
  },
  arrowNudgePrev: {
    transform: [{ translateX: -0.5 }],
  },
  // The one highlight circle, sitting behind the letters; its translateX is animated to the selected
  // cell's measured x. top:0 aligns with the cells (daysRow is exactly one circle tall).
  selectedIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SELECTED_BG,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // Reinforces the rounded clip on Android (belt-and-suspenders alongside the opaque SELECTED_BG).
    overflow: 'hidden',
  },
  dayLetter: {
    fontSize: 18,
    // Line height == circle height so the single glyph sits dead-center in the circle. A single
    // centered child (like the app's other round badges) also keeps Android rounding the background
    // as a circle rather than a square. textAlign centers horizontally; no letterSpacing so a lone
    // char isn't nudged off-center by trailing advance.
    lineHeight: 36,
    textAlign: 'center',
    color: DAY_TEXT,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
  // A day outside the ±1-week window: dimmed and not selectable.
  dayLetterDisabled: {
    opacity: 0.3,
  },
  // Absolutely positioned just below the centered letter (horizontally centered by the circle's
  // alignItems). Out of flow, so it doesn't grow the circle or push it off the arrows' level. Nudge
  // `bottom` to fine-tune the gap under the letter.
  dot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: CYAN,
  },
});
