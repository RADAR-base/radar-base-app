import { BackdropBlur, Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { getColorTokens, type ThemeMode } from "@radarbase/app-kit";

const source = Skia.RuntimeEffect.Make(`
uniform float u_time;
uniform vec2  u_resolution;
uniform vec3  u_primary;     // theme.ts background.primary,   normalized to 0..1
uniform vec3  u_secondary;   // theme.ts background.secondary, normalized to 0..1
uniform vec3  u_tertiary;    // theme.ts background.tertiary,  normalized to 0..1

// --- tunables ---------------------------------------------------------------
const float SPEED        = 0.5;   // swirl speed of the phase fields
const float RG_MID       = 1.0;   // red/green mid level of the raw pattern
const float RG_CONTRAST  = 1.0;   // red/green swing around that mid level
const float B_PHASE      = 1.0;   // fixed phase feeding the blue channel
const float TERTIARY_MIX = 0.1;   // how strongly tertiary accents show on top (0..1)
const float NOISE_AMOUNT = 0.1;  // film-grain strength; also hides gradient banding
const vec3  BLUE         = vec3(0.10, 0.30, 0.80);  // target hue for the blue tint
const float BLUE_TINT    = 0.4;  // pull the whole mesh toward BLUE: 0 = off, 1 = fully blue
// ----------------------------------------------------------------------------

// Cheap per-pixel hash -> film grain / dither that breaks up banding on smooth gradients.
float grainHash(vec2 p, float t) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + t) * 43758.5453);
}

vec4 main(vec2 fragCoord) {
  // Shadertoy is bottom-left origin, Skia is top-left -> flip Y to match
  vec2 frag = vec2(fragCoord.x, u_resolution.y - fragCoord.y);

  float iTime = u_time / 1000.0;               // useClock is ms; iTime is seconds

  float mr = min(u_resolution.x, u_resolution.y);
  vec2 uv = (frag * 2.0 - u_resolution) / mr;  // centered, aspect-correct coords

  // Two coupled phase fields: 'a' accumulates cosines, 'd' sines, and each feeds the other
  // every iteration -> large swirling values that vary with position and time.
  float d = -iTime * SPEED;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; i++) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += iTime * SPEED;

  // Develop the phase fields into a flowing pattern; its channels are used below as the
  // blend signals that mix the three theme colors (not as color themselves).
  vec3 pat = vec3(cos(uv * vec2(d, a)) * RG_CONTRAST + RG_MID, cos(a + d) * 0.5 + 0.5);
  pat = cos(pat * cos(vec3(d, a, B_PHASE)) * 0.5 + 0.5);

  // Two decorrelated flow signals from the pattern (each remapped to 0..1) drive the blend.
  float f1 = pat.r * 0.5 + 0.5;   // field A: primary <-> secondary base
  float f2 = pat.b * 0.5 + 0.5;   // field B: where tertiary accents pool

  // Blend all three theme background tokens: a primary/secondary base with tertiary on top.
  vec3 col = mix(u_primary, u_secondary, f1);
  col = mix(col, u_tertiary, f2 * TERTIARY_MIX);

  // Push the whole mesh toward blue. Raise BLUE_TINT for more, set to 0.0 to disable.
  col = mix(col, BLUE, BLUE_TINT);

  // Film-grain noise: a per-pixel dither on top. Re-seeded each frame by iTime so it shimmers;
  // pass 0.0 instead of iTime for static grain. Also suppresses banding on the gradient.
  float grain = grainHash(fragCoord, iTime) - 0.5;
  col += grain * NOISE_AMOUNT;

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
