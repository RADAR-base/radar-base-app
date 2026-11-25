import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontFamily, tracking } from '../../theme/theme';

/** The example's column: it grows to the text's height, up to this. */
const INFO_VISUAL_MAX = 88;

/** One explanation in an info dialog: an optional example picture, then a title and a sentence. */
export interface InfoRowSpec {
  title: string;
  body: string;
  /** Drawn at `size` square or less: the height of the text beside it, up to `INFO_VISUAL_MAX`. */
  renderVisual?: (size: number) => React.ReactNode;
}

/**
 * A dialog's explanation rows, as on "Your Contribution" (Figma 4388:2809). The example's column is a
 * fixed width, so the text never rewraps around it: sizing the column to the picture made the text
 * taller, which grew the picture again, without end.
 */
export function ModalInfoRows({ rows, text, muted }: { rows: InfoRowSpec[]; text: string; muted: string }) {
  return (
    <View style={styles.rows}>
      {rows.map((row) => (
        <ModalInfoRow key={row.title} {...row} text={text} muted={muted} />
      ))}
    </View>
  );
}

function ModalInfoRow({ title, body, text, muted, renderVisual }: InfoRowSpec & { text: string; muted: string }) {
  const [textHeight, setTextHeight] = useState(0);
  const size = Math.min(textHeight, INFO_VISUAL_MAX);
  return (
    <View style={styles.row}>
      {renderVisual && <View style={styles.visual}>{size > 0 && renderVisual(size)}</View>}
      <View
        style={styles.text}
        onLayout={(e) => {
          const height = Math.round(e.nativeEvent.layout.height);
          setTextHeight((current) => (Math.abs(current - height) > 1 ? height : current));
        }}
      >
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Text style={[styles.body, { color: muted }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    width: '100%',
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
  },
  visual: {
    width: INFO_VISUAL_MAX,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 9,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  body: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
