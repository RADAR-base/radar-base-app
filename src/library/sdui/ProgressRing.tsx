import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

/** The data wheel's proportions (Figma `WheelStats`, 2189:1786) — a thick ring, not a hairline. */
export const RING_SIZE = 142;
export const RING_STROKE = 18;

/**
 * How visible the unfilled remainder is, as a fraction of the filled arc's own colour.
 *
 * One colour at two strengths rather than two colours: the track is the same ring, not yet reached.
 */
const TRACK_OPACITY = 0.25;

/**
 * An SVG stroke animates through `animatedProps`, not through style, so the arc needs an animated
 * `Circle`. Created once at module scope — building it per render would remount the arc each time.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /**
   * How far round the ring is filled, 0..1.
   *
   * A shared value rather than a number, so the arc can be animated on the UI thread. A caller with a
   * static figure holds one and assigns to it; a caller animating a sweep drives it with `withTiming`.
   */
  progress: SharedValue<number>;
  /** The arc's colour. The unfilled track is the same colour at {@link TRACK_OPACITY}. */
  color: string;
  size?: number;
  stroke?: number;
}

/**
 * The circular progress ring shared by the data wheel card and the questionnaire's completion screen.
 *
 * Draws only the ring — no value, no label. Whatever sits in the middle is the caller's, laid over the
 * ring's box rather than inside the `Svg`, so it stays real text with the page's own type tokens.
 *
 * The arc is one dash as long as the circle's circumference, with `strokeDashoffset` deciding how much
 * of that dash has been pulled into view: the full circumference shows nothing, zero shows the whole
 * ring. It starts at twelve o'clock, since an SVG circle otherwise begins at three.
 */
export function ProgressRing({
  progress,
  color,
  size = RING_SIZE,
  stroke = RING_STROKE,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* The remainder, so the ring reads as a whole even while it is still filling. */}
      <Circle
        cx={centre}
        cy={centre}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeOpacity={TRACK_OPACITY}
        fill="none"
      />
      <AnimatedCircle
        cx={centre}
        cy={centre}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeLinecap="round"
        fill="none"
        animatedProps={arcProps}
        transform={`rotate(-90 ${centre} ${centre})`}
      />
    </Svg>
  );
}
