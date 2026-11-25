import React, { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import { textStyle, withAlpha } from '../../../../theme/theme';
import type { InfoRowSpec } from '../../ModalInfoRow';
import { formatDuration } from './chartAxis';
import type { SleepStage, StagePeriod } from './SleepStagesRing';

/** Top to bottom (Figma "Sleep (Day) – chart options", D2). */
const LANES: SleepStage[] = ['deep', 'rem', 'light', 'awake'];
export const STAGE_LABELS: Record<SleepStage, string> = {
  awake: 'Awake',
  rem: 'REM',
  light: 'Light',
  deep: 'Deep',
};

/** What each stage is, for a sleep card's ⓘ. */
const STAGE_DESCRIPTIONS: Record<SleepStage, string> = {
  deep: 'Your deepest, most restful sleep, when your body recovers. Most of it comes in the first half of the night.',
  rem: 'When most dreaming happens. It helps with memory and mood, and gets longer towards morning.',
  light: 'Most of the night is light sleep, linking the other stages together. Apple Health calls it Core.',
  awake: 'Short times awake. A few each night are normal, and most are too brief to remember.',
};

/** A row per stage for the ⓘ. */
export function sleepStageInfoRows(): InfoRowSpec[] {
  return LANES.map((stage) => ({ title: STAGE_LABELS[stage], body: STAGE_DESCRIPTIONS[stage] }));
}

const LABEL_WIDTH = 40;
const TOTAL_WIDTH = 56;
const SIDE_GAP = 8;
const LANE_GAP = 4;
/** Thin, so a period can be drawn at its true width: at ~0.5pt a minute, a fat lane makes every short period a dot. */
const BAR_HEIGHT = 8;
/** The dragged-over period grows to this, so it shows past the finger. */
const ACTIVE_BAR_HEIGHT = 14;
/** The narrowest a sleep period is drawn; a wake-up is never narrower than a dot, so it can't vanish. */
const MIN_PERIOD_WIDTH = 2;
/** Periods shorter than this are folded into the stage either side of them. */
const SMOOTH_MINUTES = 5;
/** A stage interrupted only by a wake-up shorter than this is drawn as one capsule. */
const JOIN_ACROSS_WAKE_MINUTES = 5;
/** Hour marks closer than this to the start or end time are dropped, so labels never overlap. */
const TIME_LABEL_ROOM = 34;

/** "23:10" as minutes after midnight. */
export function parseClock(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return undefined;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 24 * 60 ? minutes : undefined;
}

/** Minutes after midnight (any day) as "06:30". */
export function clockLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Where each period starts, in minutes from the start of the night. */
export function stageStarts(stages: StagePeriod[]): number[] {
  let at = 0;
  return stages.map((s) => {
    const start = at;
    at += s.minutes;
    return start;
  });
}

/** The period under a point `fraction` of the way across the night. */
export function stageIndexAt(stages: StagePeriod[], fraction: number): number {
  const night = stages.reduce((sum, s) => sum + s.minutes, 0);
  const at = Math.min(Math.max(fraction, 0), 1) * night;
  const starts = stageStarts(stages);
  for (let i = stages.length - 1; i >= 0; i--) if (at >= starts[i]) return i;
  return 0;
}

/**
 * The night as it's drawn: a sleep period shorter than `SMOOTH_MINUTES` between two of the same stage
 * takes that stage, then neighbours of one stage merge. Wake-ups are kept however short.
 */
export function smoothStages(stages: StagePeriod[]): StagePeriod[] {
  let periods = stages.map((s) => ({ ...s }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < periods.length - 1; i++) {
      const [before, p, after] = [periods[i - 1], periods[i], periods[i + 1]];
      if (
        p.stage !== 'awake' &&
        p.minutes < SMOOTH_MINUTES &&
        before.stage === after.stage &&
        before.stage !== 'awake' &&
        p.stage !== before.stage
      ) {
        p.stage = before.stage;
        changed = true;
      }
    }
    periods = periods.reduce<StagePeriod[]>((out, p) => {
      const last = out[out.length - 1];
      if (last && last.stage === p.stage) last.minutes += p.minutes;
      else out.push({ ...p });
      return out;
    }, []);
  }
  return periods;
}

interface Capsule {
  stage: SleepStage;
  start: number;
  end: number;
  /** The smoothed periods it draws, so dragging over any of them lights it. */
  members: number[];
}

/** One capsule per period, except that a stage carries on across a short wake-up (which keeps its dot). */
function capsulesFor(periods: StagePeriod[]): Capsule[] {
  const starts = stageStarts(periods);
  const caps: Capsule[] = [];
  periods.forEach((p, i) => {
    const start = starts[i];
    const end = start + p.minutes;
    if (p.stage !== 'awake') {
      let j = caps.length - 1;
      let wake = 0;
      while (j >= 0 && caps[j].stage === 'awake') {
        wake += caps[j].end - caps[j].start;
        j--;
      }
      if (j >= 0 && j < caps.length - 1 && caps[j].stage === p.stage && wake < JOIN_ACROSS_WAKE_MINUTES) {
        caps[j].end = end;
        caps[j].members.push(i);
        return;
      }
    }
    caps.push({ stage: p.stage, start, end, members: [i] });
  });
  return caps;
}

interface SleepTimelineProps {
  /** The night as recorded; it is smoothed for drawing, and the totals come from it unchanged. */
  stages: StagePeriod[];
  colors: Record<SleepStage, string>;
  text: string;
  height: number;
  /** Bedtime, in minutes after midnight; without it the time row is left out. */
  start?: number;
  /** The small card's version: lanes only, no names, totals or times. */
  compact?: boolean;
  /** The smoothed period being dragged over (see `smoothStages`); the rest fade back. */
  activeIndex?: number | null;
  idleOpacity?: number;
  onPlotWidth?: (width: number) => void;
  panHandlers?: GestureResponderHandlers;
}

/** The night as it happened: a lane per stage, each period at the time it was in effect. */
export function SleepTimeline({
  stages,
  colors,
  text,
  height,
  start,
  compact = false,
  activeIndex = null,
  idleOpacity = 0.45,
  onPlotWidth,
  panHandlers,
}: SleepTimelineProps) {
  const [width, setWidth] = useState(0);
  const muted = withAlpha(text, 0.55);
  const night = stages.reduce((sum, s) => sum + s.minutes, 0) || 1;
  const capsules = capsulesFor(smoothStages(stages));
  const gap = compact ? 3 : LANE_GAP;
  const rowHeight = (height - gap * (LANES.length - 1)) / LANES.length;
  const bar = Math.min(BAR_HEIGHT, rowHeight);
  const xf = (minutes: number) => (minutes / night) * width;

  // Whole hours between bedtime and waking, every other one past six hours.
  const hourMarks: number[] = [];
  if (start != null && width > 0) {
    const step = night > 360 ? 120 : 60;
    for (let m = Math.ceil(start / 60) * 60; m < start + night; m += 60) {
      const x = xf(m - start);
      if (m % step === 0 && x > TIME_LABEL_ROOM && x < width - TIME_LABEL_ROOM) hourMarks.push(m);
    }
  }

  const side = (key: string, w: number, label: (s: SleepStage) => string, color: string, align: 'left' | 'right') => (
    <View key={key} style={[styles.side, { width: w, gap }]}>
      {LANES.map((s) => (
        <View key={s} style={[styles.sideRow, { height: rowHeight }]}>
          <Text style={[styles.sideText, { color, textAlign: align }]} numberOfLines={1}>
            {label(s)}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {!compact && side('names', LABEL_WIDTH, (s) => STAGE_LABELS[s], text, 'left')}

      <View style={styles.middle}>
        <View
          style={{ gap }}
          // Takes the touch itself rather than the stage under the finger, so `locationX` is across the night.
          pointerEvents="box-only"
          onLayout={(e) => {
            setWidth(e.nativeEvent.layout.width);
            onPlotWidth?.(e.nativeEvent.layout.width);
          }}
          {...panHandlers}
        >
          {LANES.map((lane) => (
            <View key={lane} style={[styles.lane, { height: rowHeight }]}>
              <View
                style={[
                  styles.track,
                  { top: (rowHeight - bar) / 2, height: bar, borderRadius: bar / 2, backgroundColor: withAlpha(text, 0.05) },
                ]}
              />
              {width > 0 &&
                capsules.map((c, i) => {
                  if (c.stage !== lane) return null;
                  const selected = activeIndex != null && c.members.includes(activeIndex);
                  const active = activeIndex == null || selected;
                  const h = selected ? Math.max(bar, Math.min(ACTIVE_BAR_HEIGHT, rowHeight + gap)) : bar;
                  // Grown at both ends by as much as it grew in height.
                  const w = Math.max(lane === 'awake' ? h : MIN_PERIOD_WIDTH, xf(c.end - c.start)) + (h - bar);
                  const centre = xf((c.start + c.end) / 2);
                  return (
                    <View
                      key={i}
                      style={[
                        styles.capsule,
                        selected && styles.capsuleSelected,
                        {
                          left: Math.min(Math.max(centre - w / 2, 0), width - w),
                          width: w,
                          top: (rowHeight - h) / 2,
                          height: h,
                          borderRadius: Math.min(h, w) / 2,
                          backgroundColor: colors[lane],
                          opacity: active ? 1 : idleOpacity,
                        },
                      ]}
                    />
                  );
                })}
            </View>
          ))}
        </View>

        {!compact && start != null && (
          <View style={styles.times}>
            <Text style={[styles.time, { color: muted }]}>{clockLabel(start)}</Text>
            {hourMarks.map((m) => (
              <Text key={m} style={[styles.time, styles.hourMark, { color: muted, left: xf(m - start) - 16 }]}>
                {clockLabel(m)}
              </Text>
            ))}
            <Text style={[styles.time, { color: muted }]}>{clockLabel(start + night)}</Text>
          </View>
        )}
      </View>

      {!compact &&
        side(
          'totals',
          TOTAL_WIDTH,
          (s) => {
            const minutes = stages.reduce((sum, p) => (p.stage === s ? sum + p.minutes : sum), 0);
            return minutes > 0 ? formatDuration(minutes) : '–';
          },
          muted,
          'right',
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: SIDE_GAP,
  },
  side: {
    alignSelf: 'flex-start',
  },
  sideRow: {
    justifyContent: 'center',
  },
  sideText: {
    ...textStyle(12, 16, 'regular'),
    fontVariant: ['tabular-nums'],
  },
  middle: {
    flex: 1,
    gap: 6,
  },
  lane: {
    width: '100%',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  capsule: {
    position: 'absolute',
  },
  /** Drawn over the lanes either side, which it may overlap. */
  capsuleSelected: {
    zIndex: 1,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    ...textStyle(10, 12, 'regular'),
    fontVariant: ['tabular-nums'],
  },
  hourMark: {
    position: 'absolute',
    width: 32,
    textAlign: 'center',
  },
});
