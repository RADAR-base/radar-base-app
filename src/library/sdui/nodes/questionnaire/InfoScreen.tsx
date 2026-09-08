import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SelectChoice } from '../../../../types';
import { fontFamily, layout as layoutTokens, tracking, withAlpha } from '../../../../theme/theme';

interface InfoScreenProps {
  label?: string;
  sections?: SelectChoice[];
  /** Brand color — the card tint and the bullets. */
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
}

/**
 * A REDCap `info` field: participant-facing copy with nothing to answer — a preamble, a set of
 * instructions, a debrief.
 *
 * Styled as one of the app's tinted cards rather than a bare block, so it reads as a distinct passage
 * inside the questionnaire. The tint is derived from the brand at low opacity (the same treatment as
 * the speech question's action cards), which keeps it correct in dark mode and under a manifest brand
 * override — the previous fixed `#f8f9fa` was a light-mode-only grey.
 *
 * `field_label` is the lead line; `select_choices_or_calculations` carries the body, which aRMT uses
 * for the actual prose (see `audio_3`, whose first field leaves the label empty). Each entry is its
 * own bulleted paragraph, since studies write them as numbered steps.
 */
export function InfoScreen({
  label,
  sections,
  primaryColor,
  textColor,
  textSecondaryColor,
}: InfoScreenProps) {
  const surface = withAlpha(primaryColor, 0.1);
  const hasSections = !!sections?.length;

  return (
    <View style={[styles.card, { backgroundColor: surface }]}>
      {hasSections ? (
        <View style={styles.sections}>
          {sections!.map((section, i) => (
            <View key={section.code || i} style={styles.section}>
              {/* Only bulleted when there's more than one — a single paragraph isn't a list. */}
              {sections!.length > 1 ? (
                <View style={[styles.bullet, { backgroundColor: primaryColor }]} />
              ) : null}
              <Text style={[styles.sectionText, { color: textSecondaryColor }]}>{section.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
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
    // Takes the remaining width so long paragraphs wrap beside the bullet, not under it.
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
