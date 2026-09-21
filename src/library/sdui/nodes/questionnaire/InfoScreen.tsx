import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SelectChoice } from '../../../../types';

interface InfoScreenProps {
  label?: string;
  sections?: SelectChoice[];
  textColor: string;
  textSecondaryColor: string;
}

export function InfoScreen({ label, sections, textColor, textSecondaryColor }: InfoScreenProps) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.text, { color: textColor }]}>{label}</Text>
      ) : null}
      {sections?.map((section, i) => (
        <View key={section.code || i} style={styles.section}>
          <Text style={[styles.sectionText, { color: textSecondaryColor }]}>{section.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 },
  text: { fontSize: 14, lineHeight: 20 },
  section: { marginTop: 8 },
  sectionText: { fontSize: 13, lineHeight: 19 },
});
