import React, { useMemo } from "react";
import { BackdropBlur, Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { getColorTokens, type ThemeMode } from "../../theme/theme";

const source = Skia.RuntimeEffect.Make(`
uniform float u_time;
uniform vec2  u_resolution;
uniform vec3  u_primary;     // the lighter ground, normalized to 0..1
uniform vec3  u_secondary;   // the brand colour its shapes are cut from
uniform vec3  u_tertiary;    // the accent that glows where the two meet

// --- tunables ---------------------------------------------------------------
const float SPEED        = 0.6;  // how fast the shapes drift
const float SCALE        = 0.85;  // lower = larger shapes
const float WARP         = 0.6;   // how far the shapes bend out of straight bands
const float EDGE_LO      = 0.3;   // primary -> secondary crossover; closer together = harder edge
const float EDGE_HI      = 0.7;
const float HALO_WIDTH   = 0.26;  // reach of the tertiary glow either side of that edge
const float TERTIARY_MIX = 0.85;  // strength of the glow at its centre (0..1)
const float NOISE_AMOUNT = 0.08;  // film-grain strength; also hides gradient banding
const float GRAIN_SIZE   = 0.25;   // grain cell, in points
// ----------------------------------------------------------------------------

float grainHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 main(vec2 fragCoord) {
  // Bottom-left origin, as the maths below expects; Skia is top-left.
  vec2 frag = vec2(fragCoord.x, u_resolution.y - fragCoord.y);
  float t = u_time / 1000.0 * SPEED;           // useClock is ms

  float mr = min(u_resolution.x, u_resolution.y);
  vec2 q = (frag * 2.0 - u_resolution) / mr * SCALE;  // centered, aspect-correct coords

  // A few low-frequency warps bend the plane into large, slow-moving blobs.
  for (float i = 1.0; i < 4.0; i++) {
    q.x += WARP / i * sin(i * 1.3 * q.y + t + 0.3 * i);
    q.y += WARP / i * cos(i * 1.3 * q.x + t * 0.8 + 0.7 * i);
  }
  float n = 0.5 + 0.5 * sin(q.x + q.y);

  // Two regions, with the accent as a soft band along the boundary between them.
  vec3 col = mix(u_primary, u_secondary, smoothstep(EDGE_LO, EDGE_HI, n));
  float halo = smoothstep(0.0, 1.0, 1.0 - abs(n - 0.5) / HALO_WIDTH);
  col = mix(col, u_tertiary, halo * TERTIARY_MIX);

  // Static grain: re-seeding it per frame reads as TV static without a blur on top.
  col += (grainHash(floor(fragCoord / GRAIN_SIZE)) - 0.5) * NOISE_AMOUNT;

  return vec4(col, 1.0);
}
`)!;

/** '#RRGGBB' -> normalized [r, g, b] in 0..1 for a SkSL vec3 uniform. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export interface GradientMeshBackgroundProps {
  /** Which theme's tokens to pull the colors from. Defaults to the device color scheme. */
  mode?: ThemeMode;
  /** Override `background.primary`. Accepts '#RRGGBB'. */
  primaryColor?: string;
  /** Override `background.secondary`. Accepts '#RRGGBB'. */
  secondaryColor?: string;
  /** Override `background.tertiary`. Accepts '#RRGGBB'. */
  tertiaryColor?: string;
  /** Overlay a frosted-glass layer (blur + light haze) on top of the mesh. */
  frosted?: boolean;
  /** Blur radius for the frost. Default 5. */
  frostBlur?: number;
  /** Haze color drawn over the blurred mesh. Default translucent white. */
  frostTint?: string;
  /**
   * Freeze the animation. When true, the shader time stops advancing so the uniforms stop
   * changing — the Skia canvas then stops repainting entirely (shader *and* backdrop blur go
   * idle). Set this while the mesh is covered by another screen to free up the GPU for the
   * transition.
   */
  paused?: boolean;
}

export function GradientMeshBackground({
  mode,
  primaryColor,
  secondaryColor,
  tertiaryColor,
  frosted = false,
  frostBlur = 5,
  frostTint = "rgba(255, 255, 255, 0.2)",
  paused = false,
}: GradientMeshBackgroundProps = {}) {
  const clock = useClock();

  // Seed with the window size so the first frame is sane, then let the canvas report its own
  // painted size via `onSize` (updated on the UI thread). Using the canvas's real size keeps
  // `u_resolution` exactly matched to the pixels the shader fills, so the mesh always covers the
  // whole canvas edge-to-edge (correct across device pixel ratios, insets, and rotation).
  const { width, height } = useWindowDimensions();
  const canvasSize = useSharedValue({ width, height });

  const resolvedMode: ThemeMode = mode ?? "light";
  const tokens = getColorTokens(resolvedMode);
  const primary = useMemo(
    () => hexToRgb(primaryColor ?? tokens.background.primary),
    [primaryColor, tokens],
  );
  const secondary = useMemo(
    () => hexToRgb(secondaryColor ?? tokens.background.secondary),
    [secondaryColor, tokens],
  );
  const tertiary = useMemo(
    () => hexToRgb(tertiaryColor ?? tokens.background.tertiary),
    [tertiaryColor, tokens],
  );

  const uniforms = useDerivedValue(
    () => ({
      // When paused, read a constant instead of `clock.value` so this derived value stops
      // subscribing to the clock — the uniforms freeze and the canvas stops repainting.
      u_time: paused ? 0 : clock.value,
      u_resolution: [canvasSize.value.width, canvasSize.value.height],
      u_primary: primary,
      u_secondary: secondary,
      u_tertiary: tertiary,
    }),
    [paused, primary, secondary, tertiary],
  );

  return (
    // Absolute-fill background: sits *behind* the screen content and covers the full screen,
    // instead of taking flex space as a sibling (which only gave it part of the height).
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill} onSize={canvasSize}>
        <Fill>
          <Shader source={source} uniforms={uniforms} />
        </Fill>
        {/* Frosted glass: blur the mesh drawn above, then a light haze on top of it. */}
        {frosted && (
          <BackdropBlur blur={frostBlur}>
            <Fill color={frostTint} />
          </BackdropBlur>
        )}
      </Canvas>
    </View>
  );
}
