import React from 'react';
import { StyleSheet } from 'react-native';
import { Blur, Canvas, ColorMatrix, Group, Paint, RoundedRect } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

/**
 * The goo filter: blur everything, then crush the alpha back to a hard edge.
 *
 * Two shapes blurred together overlap in their soft edges; pushing alpha through a steep ramp turns
 * that overlap back into solid colour, so they fuse with a liquid bridge instead of merely touching.
 * The classic metaball trick — the alpha row is a gain of 20 with a −9 bias, which is steep enough to
 * hold a crisp edge without the shapes bleeding into each other from across the row.
 */
const GOO = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 20, -9];

/**
 * How far the blur spreads. It sets the reach of the bridge — how close two shapes must be before
 * they start to pull toward one another.
 */
const BLUR = 6;

/**
 * Padding around the canvas.
 *
 * The blur samples outside each shape, so a canvas sized exactly to the row would clip the goo at its
 * edges and leave the bridge looking cut off.
 */
const BLEED = 24;

interface GooChipProps {
  /** Centre of the travelling chip, in points from the row's left edge. */
  centre: SharedValue<number>;
  /** Centre of the number it is heading for — the blob it merges with. */
  target: SharedValue<number>;
  /** The travelling chip's own box, which flattens to a pill as it moves. */
  width: SharedValue<number>;
  height: SharedValue<number>;
  /** How round the travelling chip's corners are. */
  radius: SharedValue<number>;
  /** The resting size of a number's chip — the blob waiting at the target. */
  restSize: number;
  /** Vertical centre of the row, in points from its top. */
  midline: number;
  /** The row's own box. */
  rowWidth: number;
  rowHeight: number;
  colour: string;
  /** 0 at rest, 1 while the row is held — grows the ring, as the sliders' handles do. */
  press: SharedValue<number>;
  /** The ring's own colour: the accent at a fifth, matching every handle in the family. */
  ringColour: string;
}

/** How far the ring stands out from the blob when held. The handles' `HANDLE_RING`. */
const RING = 4;

/**
 * The answer chip, drawn as gooey metaballs (Figma 0:15, Gooey Blobs).
 *
 * Two shapes share one filtered layer: the chip under the finger, and a small blob sitting on the
 * number it is closest to. Apart, they read as two separate things; as the chip approaches, their
 * blurred edges overlap and the threshold fuses them into one shape with a neck between — so the chip
 * visibly *merges into* the number rather than arriving at it.
 *
 * Drawn in Skia because this can't be done with views: it needs a blur and a colour matrix applied to
 * a group as a single layer, which is a raster operation rather than a style.
 */
export function GooChip({
  centre,
  target,
  width,
  height,
  radius,
  restSize,
  midline,
  rowWidth,
  rowHeight,
  colour,
  press,
  ringColour,
}: GooChipProps) {
  // Skia reads Reanimated values directly, so none of this crosses to the JS thread.
  const x = useDerivedValue(() => centre.value - width.value / 2 + BLEED);
  const y = useDerivedValue(() => midline - height.value / 2 + BLEED);
  const targetX = useDerivedValue(() => target.value - restSize / 2 + BLEED);
  const targetY = midline - restSize / 2 + BLEED;

  /**
   * The ring's box: the blob's, grown by `RING` on every side as the row is held.
   *
   * A band of padding rather than a stroke — the same trick the handles use, and for the same reason.
   * A translucent border painted over the blob's own fill would be invisible, because the fill sits
   * under it; grown *outside* the shape, the band has only the track behind it and reads properly.
   */
  const band = useDerivedValue(() => RING * press.value);
  const ringWidth = useDerivedValue(() => width.value + band.value * 2);
  const ringHeight = useDerivedValue(() => height.value + band.value * 2);
  const ringX = useDerivedValue(() => centre.value - ringWidth.value / 2 + BLEED);
  const ringY = useDerivedValue(() => midline - ringHeight.value / 2 + BLEED);
  const ringRadius = useDerivedValue(() => radius.value + band.value);

  return (
    <Canvas
      style={[
        styles.canvas,
        { width: rowWidth + BLEED * 2, height: rowHeight + BLEED * 2, left: -BLEED, top: -BLEED },
      ]}
      pointerEvents="none"
    >
      {/* The ring, drawn beneath the goo and *outside* its layer.

          It has to be outside: the goo's colour matrix crushes alpha to a hard edge, which is what
          fuses the blobs — run a translucent band through it and it comes out either solid or gone.
          Kept unfiltered, it stays the faint accent band the sliders' handles wear, and the opaque
          blob on top hides all but the rim. */}
      <RoundedRect
        x={ringX}
        y={ringY}
        width={ringWidth}
        height={ringHeight}
        r={ringRadius}
        color={ringColour}
      />

      <Group
        layer={
          <Paint>
            <Blur blur={BLUR} />
            <ColorMatrix matrix={GOO} />
          </Paint>
        }
      >
        {/* The blob waiting on the nearest number. Smaller than the chip, so the chip reads as the
            thing doing the travelling and this as what it is arriving at. */}
        <RoundedRect
          x={targetX}
          y={targetY}
          width={restSize}
          height={restSize}
          r={restSize / 2}
          color={colour}
        />
        {/* The chip itself. */}
        <RoundedRect x={x} y={y} width={width} height={height} r={radius} color={colour} />
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
  },
});
