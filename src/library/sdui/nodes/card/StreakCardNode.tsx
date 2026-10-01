import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import StreakDoneIcon from '../../../../theme/icons/streakdone.svg';
import StreakMissedIcon from '../../../../theme/icons/streakmissed.svg';
import StreakPendingIcon from '../../../../theme/icons/streakpending.svg';
import FireOutlineIcon from '../../../../theme/icons/fireoutline.svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  cardShadow,
  readableTextColor,
  withAlpha,
} from '../../../../theme/theme';
import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS } from '../../../../core/EventBus';
import { STREAK_WINDOW_DAYS } from '../../../../core/ScheduleService';
import type { StreakDay } from '../../../../types';
import type { NodeProps } from '../../types';

/**
 * Indexed by `Date.getDay()` (0 = Sunday), not by position in the strip.
 *
 * The strip is a rolling window ending today, so which weekday sits in which cell changes daily — a
 * fixed M T W T F S S row would label the wrong days on six days out of seven.
 */
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The Figma cell: a 24 circle with 4 between it and the next. Kept as the reference the ratios below
 * are taken from, and as the size drawn on the first frame, before the strip has been measured. The
 * circles grow past it whenever the row has room — see `daySizeFor`.
 */
const DAY_BASE = 24;
const DAY_GAP = 4;
/**
 * How large a circle may grow once the strip has room to spare.
 *
 * The strip takes the whole width the disc leaves it, which on a wide card is a good deal more than
 * the 192 Figma drew. Past this the circles stop growing and `space-between` spreads them instead —
 * seven discs the size of the flame badge would read as a second row of buttons, not a week.
 */
const DAY_MAX = 40;

/**
 * Half a point of slack between the outermost edge drawn and the SVG's own bounds.
 *
 * An `Svg` clips to its box, so a circle whose edge lands exactly on it loses its antialiased outer
 * pixel — the disc reads as flattened on four sides and the rings as nicked. Pulling every outer
 * radius in by half a point costs a point of diameter, which is invisible, and leaves the curve
 * somewhere to fade out.
 */
const EDGE_BLEED = 0.5;

/** Everything inside a cell is a fraction of its diameter, so the whole thing scales as one. */
const RING_STROKE_RATIO = 2 / DAY_BASE;
/** How far a completed day's inner disc sits inside its halo (Figma: a 20 disc in a 24 halo). */
const DISC_INSET_RATIO = 2 / DAY_BASE;
/** The flame glyph inside a day circle, at the Figma asset's own aspect (12.44 x 14). */
const GLYPH_WIDTH_RATIO = 12.44 / DAY_BASE;
const GLYPH_HEIGHT_RATIO = 14 / DAY_BASE;
/**
 * The "!" a day with work left carries (Figma 4259:2037), at its own 4 x 16.7714 aspect.
 *
 * Drawn to the same *height* as the flames rather than to its own natural size, so the three marked
 * states sit on one visual scale — a glyph that filled more of its circle than the others would read
 * as a louder state rather than a different one.
 */
const PENDING_GLYPH_ASPECT = 4.00005 / 16.7714;

/**
 * The amber disc beside the strip.
 *
 * Every point it takes comes off the left block, and from there off the day circles — so its size is
 * really a split with the strip. Dropping the window to six days freed a cell's worth of width, which
 * is what lets this be the size it is without the rings shrinking for it. Bounded rather than
 * free-flexing so a wide card doesn't grow tall to match it.
 */
const BADGE_MAX = 104;
const BADGE_MIN = 72;

/**
 * The width the card falls back to when nothing has told it how wide the page is.
 *
 * It spans the page everywhere it is placed — that is how the design draws it. Under a `ViewNode` or
 * in a grid column, `width: '100%'` says so. A horizontally-scrolling `CardSectionNode` is the one
 * parent that cannot be a percentage of anything (its content container is as wide as its children
 * make it), so it passes the page's content width down as `availableWidth` instead. This is only for
 * the frame before that measurement arrives, and for a caller that passes neither: Figma's 192 strip
 * and the disc at its compact size, inside the card's padding.
 */
const STRIP_NATURAL = DAY_BASE * STREAK_WINDOW_DAYS + DAY_GAP * (STREAK_WINDOW_DAYS - 1);
const NATURAL_WIDTH =
  layoutTokens.cardPadding * 2 + STRIP_NATURAL + layoutTokens.gap + BADGE_MIN;

/**
 * Corner radius: the task cards' 24, which every card surface in the app shares.
 *
 * Figma draws this card at 16, but the app answered that question with 24 and matching what it is
 * stacked with wins over matching the frame it was drawn in.
 */
const CARD_RADIUS = layoutTokens.radiusCard;

/** The flame's height as a fraction of the disc, leaving the Figma padding around it. */
const FLAME_SCALE = 0.55;
/** Aspect of `fireoutline.svg` (41 x 58.7692), so the flame's width follows its height. */
const FLAME_ASPECT = 41 / 58.7692;

/**
 * The circle diameter that fits the window's cells and the gaps between them into `width`, capped at
 * `DAY_MAX`.
 *
 * No floor beyond a positive number: clamping the minimum is what would make the strip wider than
 * the space it was given, and a row that overflows under the flame disc is worse than one drawn
 * small. `width <= 0` is the frame before layout has run, which takes the Figma size.
 */
function daySizeFor(width: number): number {
  if (width <= 0) return DAY_BASE;
  return Math.max(
    1,
    Math.min(DAY_MAX, (width - DAY_GAP * (STREAK_WINDOW_DAYS - 1)) / STREAK_WINDOW_DAYS),
  );
}

/**
 * Names a past day the way someone would say it out loud.
 *
 * "Yesterday" where that is what it is, otherwise the weekday — and a date once a weekday name stops
 * being unambiguous, because the Tuesday a reader pictures is this week's, not one nine days ago.
 *
 * Lives here with the card that draws the strip; `SDUIShell` imports it so the prompt names the day
 * the same way the card does.
 */
export function unfinishedDayName(timestamp: number, now: Date = new Date()): string {
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today.getTime() - day.getTime()) / 86400000);

  if (daysAgo === 1) return 'yesterday';
  if (daysAgo > 1 && daysAgo < 7) return DAY_NAMES[day.getDay()];
  return day.toDateString().slice(4, 10).trim();
}

interface StreakWeek {
  streak: number;
  days: StreakDay[];
}

const DAY_STATES: StreakDay['state'][] = ['complete', 'missed', 'pending', 'open'];

/**
 * A week of day states named by the blueprint instead of read off the schedule.
 *
 * Every combination the strip can draw takes a real week to produce — a completed day, a missed one,
 * and the days still to come only line up by living through them — which makes the card the hardest
 * thing on the page to look at while designing it or showing it to someone. `previewWeek` states the
 * seven cells outright:
 *
 * ```json
 * { "type": "StreakCardNode", "previewWeek": ["complete", "complete", "missed", "open", "open", "open", "open"] }
 * ```
 *
 * The entries run oldest to newest, matching the window `getStreakWeek` returns: the last is today,
 * the first is six days back. The dates are real, so the weekday letters still line up with the
 * calendar; only the statuses are made up.
 *
 * Returns `null` for anything that isn't exactly seven known states, so a typo shows the real week
 * rather than an empty strip — and `null` is also the normal case, since no production blueprint sets
 * this.
 */
function parsePreviewWeek(value: unknown, reference: Date): StreakDay[] | null {
  if (!Array.isArray(value) || value.length !== STREAK_WINDOW_DAYS) return null;
  if (!value.every(v => typeof v === 'string' && DAY_STATES.includes(v as StreakDay['state']))) {
    return null;
  }

  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (STREAK_WINDOW_DAYS - 1));

  return value.map((state, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return {
      key: `preview-${i}`,
      timestamp: date.getTime(),
      state: state as StreakDay['state'],
    };
  });
}

/**
 * The streak a previewed week implies, so the number agrees with the circles under it.
 *
 * A second implementation of `ScheduleService.getCurrentStreak`'s walk — complete days counting back
 * from the last judged one, a single miss forgiven, two in a row ending it — because the real one
 * reads a service this card is deliberately not consulting while previewing. Exported so a test can
 * hold the two against each other; that check is what keeps this from drifting, and if the rule ever
 * moves, `getCurrentStreak` is the copy that is right.
 */
export function previewStreakFor(days: StreakDay[]): number {
  const judged = days.filter(d => d.state !== 'open');
  let streak = 0;
  for (let i = judged.length - 1; i >= 0; i -= 1) {
    if (judged[i].state === 'complete') {
      streak += 1;
      continue;
    }
    if (i > 0 && judged[i - 1].state === 'missed') break;
    if (i === 0) break;
  }
  return streak;
}

/**
 * The current streak and this week's days, read together off `ScheduleService`.
 *
 * One hook rather than reusing `useLocalMetric('current_streak')` alongside a second subscription:
 * the count and the strip are two readings of the same day history, and a card whose big number
 * disagreed with the row of circles under it would be the obvious bug. Live-updates on
 * `SCHEDULE_UPDATED`, which the service emits after settling days — so the strip moves the moment a
 * task completes, not on the next launch.
 */
function useStreakWeek(): StreakWeek {
  const { schedule, eventBus } = useCoreServices();
  const [week, setWeek] = useState<StreakWeek>({ streak: 0, days: [] });

  const load = useCallback(() => {
    setWeek({
      streak: schedule.getCurrentStreak(),
      days: schedule.getStreakWeek(),
    });
  }, [schedule]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => load();
    eventBus.on(EVENTS.SCHEDULE_UPDATED, handler);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, handler);
  }, [eventBus, load]);

  return week;
}

interface DayCellProps {
  letter: string;
  label: string;
  day: StreakDay;
  /** Circle diameter — see `daySizeFor`; everything inside the cell is a fraction of it. */
  size: number;
  caption: string;
  disc: string;
  flame: string;
  missed: string;
}

/**
 * One day of the strip.
 *
 * The two outlined states are drawn with `react-native-svg` rather than a `borderStyle` on a rounded
 * `View`: iOS renders a dashed border as solid once `borderRadius` is set, which would lose the only
 * thing separating a lost day from an untouched one.
 */
function DayCell({
  letter,
  label,
  day,
  size,
  caption,
  disc,
  flame,
  missed,
}: DayCellProps) {
  const stroke = size * RING_STROKE_RATIO;
  const centre = size / 2;
  /** The outermost edge anything in this cell reaches — see `EDGE_BLEED`. */
  const outer = centre - EDGE_BLEED;
  // A stroke straddles its path, so the ring's own radius sits half a stroke inside that edge.
  const radius = outer - stroke / 2;
  // A dash pattern that divides the circumference exactly, so the ring closes on a dash instead of
  // leaving a ragged overlap wherever the last one lands.
  const dash = (2 * Math.PI * radius) / 24;
  const glyphWidth = size * GLYPH_WIDTH_RATIO;
  const glyphHeight = size * GLYPH_HEIGHT_RATIO;

  return (
    <View style={styles.dayCell} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Text style={[styles.dayLetter, { color: caption }]}>{letter}</Text>
      <View style={[styles.dayCircle, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          {day.state === 'complete' ? (
            <>
              <Circle cx={centre} cy={centre} r={outer} fill={withAlpha(disc, 0.5)} />
              <Circle cx={centre} cy={centre} r={outer - size * DISC_INSET_RATIO} fill={disc} />
            </>
          ) : (
            <Circle
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              // Two questions, answered separately: the colour says which kind of day it is, and the
              // dash says whether it is settled. So a day still to come is a solid amber ring, one
              // with work left on it the same amber dashed (Figma 4256:1999), and a lost one dashed
              // in red — which is also what carries the crossed flame.
              stroke={day.state === 'missed' ? missed : withAlpha(disc, 0.5)}
              strokeWidth={stroke}
              strokeDasharray={day.state === 'open' ? undefined : [dash, dash]}
            />
          )}
        </Svg>
        {day.state !== 'open' && (
          <View style={[styles.dayGlyph, { width: size, height: size }]} pointerEvents="none">
            {day.state === 'complete' ? (
              <StreakDoneIcon width={glyphWidth} height={glyphHeight} color={flame} />
            ) : day.state === 'missed' ? (
              <StreakMissedIcon
                width={glyphWidth}
                height={glyphHeight}
                color={withAlpha(disc, 0.5)}
              />
            ) : (
              // Full-strength amber against the ring's half, so the mark reads as the thing to notice
              // rather than as more of the ring.
              <StreakPendingIcon
                width={glyphHeight * PENDING_GLYPH_ASPECT}
                height={glyphHeight}
                color={disc}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Streak card — Figma node 4232:4211: the current streak in days, a Mon→Sun strip of this week, and
 * an amber flame disc beside it.
 *
 * The strip is the last seven days, today at the right, and says what happened to each: a filled
 * disc with a ticked flame for a day every scheduled task was completed, a dashed red ring with a
 * crossed flame for one that was missed, a dashed amber ring with a "!" for one that still has work
 * on it, and an empty ring for a day with nothing to act on.
 * `ScheduleService.getStreakWeek` decides which is which; this only draws it.
 *
 * A blueprint can name the seven states outright with `previewWeek` to see a combination that would
 * otherwise take a real week to produce — see `parsePreviewWeek`.
 */
export function StreakCardNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Streak';
  // Spans the page by default — the design draws it that way, and a blueprint can opt out with
  // `fillWidth: false`. `availableWidth` is how a horizontal row states that width in points, since
  // there is no container there for a percentage to resolve against; see `NATURAL_WIDTH`.
  const fillWidth = node.fillWidth !== false;
  const availableWidth =
    typeof node.availableWidth === 'number' && node.availableWidth > 0
      ? node.availableWidth
      : undefined;
  const width = fillWidth ? (availableWidth ?? '100%') : NATURAL_WIDTH;
  const live = useStreakWeek();

  // A blueprint-authored week, for design review and demos — see `parsePreviewWeek`. Absent (the
  // normal case) the card shows the participant's own week. `previewStreak` overrides the number too,
  // for the odd case where the figure being shown matters more than it agreeing with the strip.
  const preview = parsePreviewWeek(node.previewWeek, new Date());
  const days = preview ?? live.days;
  const streak = preview
    ? typeof node.previewStreak === 'number'
      ? node.previewStreak
      : previewStreakFor(preview)
    : live.streak;
  /**
   * The outstanding days *on this strip*, not every one on record.
   *
   * Read straight off the circles above it, so the line and the strip cannot disagree. Counting the
   * whole history here instead put a number on the card that the participant had no way to reconcile
   * — "3 days still to finish" over a week showing one dashed ring, the other two being last week's
   * and having nowhere to appear. Work older than this week is the prompt's job; it can say so in a
   * sentence, which is the room this line does not have.
   */
  const unfinished = days.filter(d => d.state === 'pending');
  /**
   * The line under the figure, when there is outstanding work.
   *
   * One day is named — that is what the participant can act on, and it matches what the prompt says.
   * Several become a count: a list of weekday names in a 10pt line under a 40pt number is something
   * to decipher rather than something to read.
   */
  const pendingNote =
    unfinished.length === 0
      ? null
      : unfinished.length === 1
        ? `${unfinishedDayName(unfinished[0].timestamp)} still to finish`
        : `${unfinished.length} days still to finish`;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const caption = tokens.card.stats.description;
  const surface = tokens.card.stats.background;
  /**
   * The brand, as Figma's `text/brand` on this card — `background.secondary` is the token holding the
   * brand-primary hue (the navy the design draws, repainted by a manifest `brandColors` override).
   * Passed through `readableTextColor` because that hue is chosen to sit *behind* text, not to be
   * text: in dark mode it is a near-black that would vanish into the card, and a brand dark enough to
   * work as a header would do the same. The preferred colour survives untouched whenever it clears AA.
   */
  const brand = readableTextColor(surface, { preferred: tokens.background.secondary });

  const unit = streak === 1 ? 'Day' : 'Days';

  // The strip fills whatever the flame disc leaves it, so the circles are sized from the measured row
  // rather than fixed — see `daySizeFor`.
  const [stripWidth, setStripWidth] = useState(0);
  const daySize = daySizeFor(stripWidth);

  return (
    <View
      style={[styles.card, { backgroundColor: surface, width }]}
      accessibilityRole="summary"
      accessibilityLabel={`Streak: ${streak} ${unit.toLowerCase()}`}
    >
      <View style={styles.left}>
        <Text style={[styles.title, { color: caption }]}>{title}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: brand }]}>{streak}</Text>
          <Text style={[styles.unit, { color: caption }]}>{unit}</Text>
        </View>
        {/* Said in words as well as in circles: a dashed ring three days back is easy to miss, and
            the work behind it is the one thing on this card the participant can still act on. */}
        {pendingNote && (
          <Text style={[styles.pendingNote, { color: tokens.streak.disc }]}>{pendingNote}</Text>
        )}
        <View
          style={styles.week}
          accessibilityRole="list"
          onLayout={e => setStripWidth(e.nativeEvent.layout.width)}
        >
          {days.map(day => {
            const weekday = new Date(day.timestamp).getDay();
            return (
              <DayCell
                key={day.key}
                letter={DAY_LETTERS[weekday]}
                label={`${DAY_NAMES[weekday]}: ${DAY_STATE_LABELS[day.state]}`}
                day={day}
                size={daySize}
                caption={caption}
                disc={tokens.streak.disc}
                flame={tokens.streak.flame}
                missed={tokens.streak.missed}
              />
            );
          })}
        </View>
      </View>

      <View style={[styles.badge, { backgroundColor: tokens.streak.disc }]}>
        <FireOutlineIcon
          width={BADGE_MAX * FLAME_SCALE * FLAME_ASPECT}
          height={BADGE_MAX * FLAME_SCALE}
          color={tokens.streak.flame}
        />
      </View>
    </View>
  );
}

const DAY_STATE_LABELS: Record<StreakDay['state'], string> = {
  complete: 'all tasks completed',
  missed: 'tasks missed',
  pending: 'tasks still to finish',
  open: 'nothing due yet',
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: CARD_RADIUS,
    padding: layoutTokens.cardPadding,
    gap: layoutTokens.gap,
    ...cardShadow,
  },
  // Takes every point the flame disc doesn't, which is what gives the strip its width to grow into —
  // and, with no free space left over, is also what pins the disc to the card's right edge.
  left: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  // Figma centres the "Days" block against the number's own 36pt row rather than sitting it on the
  // baseline, so the two read as one figure.
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutTokens.gap,
  },
  value: {
    fontSize: 40,
    lineHeight: 40,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
    letterSpacing: tracking.bold,
  },
  unit: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  // `space-between` rather than a fixed gap: `daySizeFor` stops growing the circles at `DAY_MAX`, and
  // past that this spreads the slack between them so the strip still spans the row.
  pendingNote: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  week: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  dayCell: {
    alignItems: 'center',
    gap: 4,
  },
  dayLetter: {
    fontSize: 8,
    lineHeight: 8,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
    textAlign: 'center',
  },
  // Sized per render from the measured strip — see `daySizeFor`.
  dayCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A full-size overlay rather than the glyph positioned directly: the glyph's own box is smaller
  // than the cell, and centring it on an absolute child means centring it inside something that
  // covers the cell.
  dayGlyph: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Square, pinned to the card's right edge, and a fixed size rather than a flexible one: growing
  // with the card would grow its height too, and on a wide card (a tablet, or a column on its own)
  // the disc would run away with the layout. `marginLeft: 'auto'` takes the slack instead, so the
  // strip stays left and the disc stays right however much room there is between them. It still
  // shrinks — down to `BADGE_MIN` — when the row is too narrow to hold strip and disc side by side.
  badge: {
    width: BADGE_MAX,
    aspectRatio: 1,
    flexShrink: 1,
    minWidth: BADGE_MIN,
    marginLeft: 'auto',
    borderRadius: BADGE_MAX,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
