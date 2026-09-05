import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import QuestionnaireIcon from '../../../../theme/icons/questionnaire.svg';
import SpeechIcon from '../../../../theme/icons/speech.svg';
import PhysicalIcon from '../../../../theme/icons/physical.svg';
import MedicationIcon from '../../../../theme/icons/medicine.svg';
import { TYPE_COLORS, type TaskCardType } from './taskTypes';

/** Default per-type glyph — the same icons the home task list uses, so both cards read consistently. */
const GLYPH: Record<TaskCardType, ComponentType<SvgProps>> = {
  questionnaire: QuestionnaireIcon,
  speech: SpeechIcon,
  physical: PhysicalIcon,
  medication: MedicationIcon,
};

export interface TaskIconProps {
  taskType: TaskCardType;
  /** Optional study-supplied icon URL (raster). Studies set this on the assessment to brand their
   *  tasks; see `AssessmentConfig.icon`. */
  iconUrl?: string;
  /** Badge diameter (default 64). */
  size?: number;
}

/**
 * The task's icon badge: a solid type-colored circle with a white glyph — the app default (Figma node
 * 3728:4295) — or, when a study supplies `iconUrl`, that image laid over the circle.
 *
 * The default glyph always renders underneath the remote image, giving a **fallback chain for free**:
 * it's the placeholder while the image loads and the fallback if it errors, so the card is never blank
 * and works offline. The image only takes over once it has actually loaded (`onLoad`).
 *
 * Prototype scope: raster only. RN's `Image` can't render a remote SVG, and there's no disk cache /
 * prefetch here — a production version would swap in `expo-image` (built-in caching + `prefetch` on
 * protocol load) and could add `SvgUri` for vector study icons. Study icons show as-is (no tint), so
 * they don't adapt to light/dark the way the default glyph does — that's the trade for exact branding.
 */
export function TaskIcon({ taskType, iconUrl, size = 64 }: TaskIconProps) {
  const color = TYPE_COLORS[taskType];
  const Glyph = GLYPH[taskType];
  const glyphSize = Math.round(size * 0.5);

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = !!iconUrl && !failed;
  // Default shows when there's no image, while it's still loading, or if it failed — never blank.
  const showDefault = !showImage || !loaded;

  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      {showDefault && <Glyph width={glyphSize} height={glyphSize} color="#FFFFFF" />}
      {showImage && (
        <Image
          source={{ uri: iconUrl }}
          style={[styles.image, { width: glyphSize * 1.25, height: glyphSize * 1.25 }]}
          resizeMode="contain"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  image: {
    position: 'absolute',
  },
});
