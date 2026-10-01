import React from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export const FADE_HEIGHT = 40;

/** Stable, SVG-safe unique suffix for gradient ids (`useId`'s ':' is invalid inside `url(#…)`). */
function useIdSafe(): string {
  return React.useId().replace(/:/g, '');
}

/**
 * One end of the list, fading into the page.
 *
 * Painted rather than masked: React Native has no mask without `@react-native-masked-view`, so this is
 * the page's own colour laid over the list at full opacity where the edge is and nothing where the
 * list is — which comes to the same thing as long as it is given the colour actually behind it.
 */
export function EdgeFade({
  color,
  width,
  height,
  reversed,
}: {
  color: string;
  /**
   * The fade's size in points, measured by the caller.
   *
   * Given as numbers rather than `"100%"`: react-native-svg only resolves a percentage on the root
   * `Svg` against a viewBox, and with none set it measures zero and draws nothing at all.
   */
  width: number;
  /**
   * Taller than the gradient where the edge has to keep covering past it.
   *
   * The bottom one runs down behind the footer: a gradient alone would hand the list back at full
   * strength the moment it ended, and the row sitting under the buttons would read straight through
   * them. It fades over `FADE_HEIGHT` and then holds the page's colour the rest of the way.
   */
  height: number;
  reversed?: boolean;
}) {
  const id = `edgeFade${useIdSafe()}${reversed ? 'B' : 'T'}`;
  if (!width || !height) return null;
  // Where the gradient finishes and the flat colour takes over, as a fraction of the whole.
  const turn = Math.min(1, FADE_HEIGHT / height);
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={reversed ? 0 : 1} />
          <Stop offset={turn} stopColor={color} stopOpacity={reversed ? 1 : 0} />
          <Stop offset="1" stopColor={color} stopOpacity={reversed ? 1 : 0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}
