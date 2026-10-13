import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Question, SelectChoice } from '../../../../types';
import { fontFamily, layout as layoutTokens, tracking, withAlpha } from '../../../../theme/theme';
import { richLabel, splitRichBlocks } from './richLabel';

/** The heading for a page whose definition gives it none. */
export const INFO_DEFAULT_TITLE = 'Information';

/**
 * The page title for an info/descriptive field: the label when sections carry the body, otherwise
 * the section header (the label is the body then), otherwise the default.
 */
export function infoTitle(question?: Question): string {
  const sections = question?.select_choices_or_calculations ?? [];
  const label = question?.field_label?.trim();
  const header = question?.section_header?.trim();
  if (sections.length && label) return label;
  return header || INFO_DEFAULT_TITLE;
}

interface InfoScreenProps {
  /** Whether this is the page on screen. An embedded video pauses when it isn't. */
  active?: boolean;
  label?: string;
  sections?: SelectChoice[];
  /** Brand color — the card tint and the bullets. */
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
}

/**
 * A REDCap `info` or `descriptive` field: copy with nothing to answer, drawn as a brand-tinted card.
 * The body is `select_choices_or_calculations` when present, otherwise `field_label`.
 */
export function InfoScreen({
  active = true,
  label,
  sections,
  primaryColor,
  textSecondaryColor,
}: InfoScreenProps) {
  const surface = withAlpha(primaryColor, 0.1);

  const paragraphs: SelectChoice[] = sections?.length
    ? sections
    : label?.trim()
      ? [{ code: 'label', label }]
      : [];

  // No body, no card.
  if (!paragraphs.length) return null;

  return (
    <View style={[styles.card, { backgroundColor: surface }]}>
      <View style={styles.sections}>
        {paragraphs.map((section, i) => (
          <View key={section.code || i} style={styles.section}>
            {/* Only bulleted when there's more than one — a single paragraph isn't a list. */}
            {paragraphs.length > 1 ? (
              <View style={[styles.bullet, { backgroundColor: primaryColor }]} />
            ) : null}
            <View style={styles.sectionBody}>
              {splitRichBlocks(section.label).map((block, j) =>
                block.type === 'image' ? (
                  <RichImage key={j} uri={block.value} alt={block.alt} />
                ) : block.type === 'video' ? (
                  <RichVideo key={j} uri={block.value} title={block.alt} tint={primaryColor} active={active} />
                ) : (
                  <Text key={j} style={[styles.sectionText, { color: textSecondaryColor }]}>
                    {richLabel(block.value, { linkColor: primaryColor })}
                  </Text>
                ),
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** An embedded image, drawn at full width once its aspect ratio is known. */
function RichImage({ uri, alt }: { uri: string; alt?: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && h > 0) setRatio(w / h);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!ratio) return null;
  return (
    <Image
      source={{ uri }}
      style={[styles.image, { aspectRatio: ratio }]}
      resizeMode="contain"
      accessible={!!alt}
      accessibilityLabel={alt}
    />
  );
}

/** `expo-video`, if the host app installed it. Optional, like `expo-audio`. */
const videoModule = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-video') as {
      createVideoPlayer: (source: string) => { release?: () => void; pause: () => void };
      VideoView: React.ComponentType<Record<string, unknown>>;
    };
  } catch {
    return null;
  }
})();

/** An embedded video: played inline with `expo-video`, otherwise a card that opens the clip. */
function RichVideo({
  uri,
  title,
  tint,
  active,
}: {
  uri: string;
  title?: string;
  tint: string;
  active: boolean;
}) {
  if (videoModule) return <InlineVideo uri={uri} title={title} active={active} />;
  return <VideoLink uri={uri} title={title} tint={tint} />;
}

/** The inline player. Only mounted when `expo-video` resolved. */
function InlineVideo({ uri, title, active }: { uri: string; title?: string; active: boolean }) {
  const mod = videoModule!;
  const player = useMemo(() => mod.createVideoPlayer(uri), [mod, uri]);
  useEffect(() => () => player.release?.(), [player]);

  // Parked panels stay mounted, so pause when this page is no longer the one on screen.
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  // And when the app is backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => sub.remove();
  }, [player]);

  const { VideoView } = mod;
  return (
    <VideoView
      style={styles.videoPlayer}
      player={player}
      nativeControls
      contentFit="contain"
      accessibilityLabel={title ?? 'Instruction video'}
    />
  );
}

/** Fallback without `expo-video`: a card that opens the clip outside the app. */
function VideoLink({ uri, title, tint }: { uri: string; title?: string; tint: string }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title ? `Play ${title}` : 'Play the instruction video'}
      onPress={() => void Linking.openURL(uri).catch(() => {})}
      style={[styles.video, { borderColor: withAlpha(tint, 0.3) }]}
    >
      <View style={[styles.videoBadge, { backgroundColor: tint }]}>
        <View style={styles.playTriangle} />
      </View>
      <Text style={[styles.videoLabel, { color: tint }]} numberOfLines={2}>
        {title ?? 'Play the instruction video'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusCard,
    gap: 16,
  },
  lead: {
    fontSize: 16,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android.
    lineHeight: 22,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    letterSpacing: tracking.medium,
    includeFontPadding: false,
  },
  sections: {
    gap: 12,
  },
  sectionBody: {
    // Takes the remaining width so long paragraphs wrap beside the bullet, not under it.
    flex: 1,
    gap: 12,
  },
  image: {
    width: '100%',
    borderRadius: layoutTokens.radiusControl,
  },
  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: layoutTokens.radiusControl,
    backgroundColor: '#000000',
  },
  video: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: layoutTokens.radiusControl,
    borderWidth: 1,
  },
  videoBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** A play triangle drawn with borders. */
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
    marginLeft: 2,
  },
  videoLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    letterSpacing: tracking.medium,
    includeFontPadding: false,
  },
  section: {
    flexDirection: 'row',
    gap: 10,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    // Nudged down to sit on the first line's optical centre rather than its top.
    marginTop: 7,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
