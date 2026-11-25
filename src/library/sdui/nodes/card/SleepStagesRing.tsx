import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { textStyle, withAlpha } from '../../../../theme/theme';
import { RING_SIZE, RING_STROKE } from '../../ProgressRing';
import { useRiseStyle } from '../../RisingText';
import { formatDuration } from './chartAxis';

export type SleepStage = 'awake' | 'rem' | 'light' | 'deep';
export interface StagePeriod {
  stage: SleepStage;
  minutes: number;
}

/** Clockwise from the top, as in Figma 4557:803. */
const STAGE_ORDER: SleepStage[] = ['awake', 'light', 'deep', 'rem'];
const STAGE_NAMES: Record<SleepStage, string> = { awake: 'awake', light: 'light', deep: 'deep', rem: 'REM' };

/** The stages from the blueprint's `[{ stage, minutes }]`, in the night's order or as totals. */
export function parseStages(raw: unknown): StagePeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const { stage, minutes } = (entry ?? {}) as { stage?: unknown; minutes?: unknown };
    if (typeof minutes !== 'number' || minutes <= 0) return [];
    const name = typeof stage === 'string' ? stage.toLowerCase() : '';
    const known = name === 'awake' || name === 'rem' || name === 'light' || name === 'deep';
    return [{ stage: (known ? name : 'awake') as SleepStage, minutes }];
  });
}

/** Time asleep: every stage but awake. */
export function asleepMinutes(stages: StagePeriod[]): number {
  return stages.reduce((sum, s) => (s.stage === 'awake' ? sum : sum + s.minutes), 0);
}

/** Each stage's total for the night, in ring order, leaving out any with none. */
function stageTotals(stages: StagePeriod[]): StagePeriod[] {
  return STAGE_ORDER.map((stage) => ({
    stage,
    minutes: stages.reduce((sum, s) => (s.stage === stage ? sum + s.minutes : sum), 0),
  })).filter((s) => s.minutes > 0);
}

/** A spoken summary: "4h light, 1h 55m deep, …". */
export function describeNight(stages: StagePeriod[]): string {
  return stageTotals(stages)
    .map((s) => `${formatDuration(s.minutes)} ${STAGE_NAMES[s.stage]}`)
    .join(', ');
}

interface SleepStagesRingProps {
  stages: StagePeriod[];
  /** The centre figure; time asleep by default. */
  valueText: string;
  /** Opaque, as each stage's rounded end overlaps the next. */
  colors: Record<SleepStage, string>;
  text: string;
  size?: number;
  stroke?: number;
}

/**
 * The night's stages as shares of a ring (Figma 4557:803): the whole circle is the night, awake time
 * included, and each stage fills its part of it, with the time asleep in the middle.
 */
export function SleepStagesRing({
  stages,
  valueText,
  colors,
  text,
  size = RING_SIZE,
  stroke = RING_STROKE,
}: SleepStagesRingProps) {
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const totals = stageTotals(stages);
  const night = totals.reduce((sum, s) => sum + s.minutes, 0);
  const ringRise = useRiseStyle(totals.map((s) => `${s.stage}${s.minutes}`).join(','));
  const valueRise = useRiseStyle(valueText);

  let at = 0;
  const arcs = totals.map((s) => {
    const arc = { stage: s.stage, from: at / night, to: (at + s.minutes) / night };
    at += s.minutes;
    return arc;
  });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, ringRise]}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={withAlpha(text, 0.08)}
            strokeWidth={stroke}
            fill="none"
          />
          {/* Last first, so each stage's rounded end sits over the start of the one after it. */}
          {[...arcs].reverse().map((arc) =>
            arcs.length === 1 ? (
              <Circle
                key={arc.stage}
                cx={center}
                cy={center}
                r={radius}
                stroke={colors[arc.stage]}
                strokeWidth={stroke}
                fill="none"
              />
            ) : (
              <Path
                key={arc.stage}
                d={arcPath(arc.from, arc.to, center, radius)}
                stroke={colors[arc.stage]}
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
              />
            ),
          )}
        </Svg>
      </Animated.View>

      <View style={[styles.center, { paddingHorizontal: stroke + 12 }]} pointerEvents="none">
        <Animated.Text style={[styles.value, { color: text }, valueRise]} numberOfLines={1} adjustsFontSizeToFit>
          {valueText}
        </Animated.Text>
      </View>
    </View>
  );
}

function pointAt(share: number, center: number, radius: number): { x: number; y: number } {
  const angle = share * 2 * Math.PI;
  return { x: center + radius * Math.sin(angle), y: center - radius * Math.cos(angle) };
}

/** Clockwise from `from` to `to`, as shares of the ring (0 at the top). */
function arcPath(from: number, to: number, center: number, radius: number): string {
  const a = pointAt(from, center, radius);
  const b = pointAt(Math.min(to, from + 0.9999), center, radius);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { ...textStyle(18, 21, 'bold'), fontWeight: '700', textAlign: 'center' },
});
