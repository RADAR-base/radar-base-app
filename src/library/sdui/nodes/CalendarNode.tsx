import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NodeProps } from '../types';

/**
 * Calendar / agenda view. Two variants are planned (`calendar`, `agenda`); the MVP
 * always renders the agenda variant. The grid `calendar` variant will land alongside
 * task scheduling (Phase 3.4). Events are currently demo data; future iterations will
 * pull from a TaskScheduleService.
 */
export function CalendarNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Calendar';
  const [date, setDate] = useState<Date>(new Date());

  const sampleEvents = useMemo<Record<string, { time: string; title: string }[]>>(
    () => ({
      [new Date().toDateString()]: [
        { time: '09:00', title: 'Morning Vitals' },
        { time: '13:00', title: 'Study Survey' },
        { time: '18:00', title: 'Medication Log' },
      ],
    }),
    [],
  );

  const events = sampleEvents[date.toDateString()] ?? [];

  const shiftDay = (delta: number) =>
    setDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + delta);
      return next;
    });

  const theme = context.theme;
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#000';
  const textSecondary = theme.textSecondaryColor ?? '#6D6D80';
  const primary = theme.primaryColor;
  const radius = theme.button?.borderRadius ?? 8;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: surface, borderColor: primary, borderRadius: radius },
      ]}
    >
      <Text style={[styles.title, { color: text }]}>{title}</Text>
      <View style={styles.navRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => shiftDay(-1)}
          style={styles.navBtn}
        >
          <Text style={styles.navText}>◀︎</Text>
        </TouchableOpacity>
        <Text style={[styles.sub, { color: text }]}>{date.toDateString()}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => shiftDay(1)}
          style={styles.navBtn}
        >
          <Text style={styles.navText}>▶︎</Text>
        </TouchableOpacity>
      </View>

      {events.length === 0 ? (
        <Text style={[styles.empty, { color: textSecondary }]}>No events</Text>
      ) : (
        events.map((event, index) => (
          <View key={`${event.time}-${index}`} style={styles.row}>
            <Text style={[styles.time, { color: textSecondary }]}>{event.time}</Text>
            <Text style={{ color: text }}>{event.title}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, padding: 12, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { backgroundColor: '#e0e0e0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  navText: { fontWeight: '700', fontSize: 12 },
  sub: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  time: { width: 54, fontSize: 12 },
  empty: { fontStyle: 'italic' },
});
