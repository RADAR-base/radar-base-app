import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCoreServices } from '../../../core/CoreServicesContext';
import { EVENTS } from '../../../core/EventBus';
import type { TaskInstance } from '../../../types';
import type { NodeProps } from '../types';
import { fontFamily } from '../../../theme/theme';

interface CalendarEvent {
  time: string;
  title: string;
  state: string;
}

/**
 * Calendar / agenda view. Pulls real task data from `ScheduleService`;
 * shows an empty state when no protocol is loaded.
 */
export function CalendarNode({ node, context }: NodeProps) {
  const { schedule, eventBus } = useCoreServices();
  const title = typeof node.title === 'string' ? node.title : 'Calendar';
  const [date, setDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const loadEvents = useCallback(async () => {
    try {
      const instances = await schedule.getTasksForDate(date);
      setEvents(instances.map(toCalendarEvent));
    } catch {
      setEvents([]);
    }
  }, [schedule, date]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    const handler = () => { loadEvents(); };
    eventBus.on(EVENTS.SCHEDULE_UPDATED, handler);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, handler);
  }, [eventBus, loadEvents]);

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
            <Text style={[styles.eventTitle, { color: text }]}>{event.title}</Text>
            <Text style={[styles.state, { color: STATE_COLORS[event.state] ?? textSecondary }]}>
              {event.state}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function toCalendarEvent(instance: TaskInstance): CalendarEvent {
  return {
    time: new Date(instance.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    title: instance.title,
    state: instance.state,
  };
}

const STATE_COLORS: Record<string, string> = {
  pending: '#856404',
  completed: '#155724',
  overdue: '#721c24',
  expired: '#999',
  skipped: '#6D6D80',
};

const styles = StyleSheet.create({
  container: { borderWidth: 1, padding: 12, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 6, fontFamily: fontFamily.bold, includeFontPadding: false },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { backgroundColor: '#e0e0e0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  navText: { fontWeight: '700', fontSize: 12, fontFamily: fontFamily.bold, includeFontPadding: false },
  sub: { fontSize: 13, fontWeight: '600', fontFamily: fontFamily.semiBold, includeFontPadding: false },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  time: { width: 54, fontSize: 12, fontFamily: fontFamily.regular, includeFontPadding: false },
  eventTitle: { flex: 1, fontSize: 13, fontFamily: fontFamily.regular, includeFontPadding: false },
  state: { fontSize: 11, fontWeight: '600', marginLeft: 8, fontFamily: fontFamily.semiBold, includeFontPadding: false },
  empty: { fontStyle: 'italic' },
});
