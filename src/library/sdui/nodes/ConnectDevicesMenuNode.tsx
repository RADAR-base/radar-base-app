import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NodeProps } from '../types';

/**
 * Device connection status indicator. Matches the Figma header sync style
 * with a cleaner, more compact layout.
 */
export function ConnectDevicesMenuNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Connected Devices';
  const description =
    typeof node.description === 'string' ? node.description : 'Tap to manage your devices.';

  const [connected, setConnected] = useState<boolean>(true);
  const [lastSync, setLastSync] = useState<string>(() => new Date().toLocaleTimeString());
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setConnected((prev) => {
        const next = !prev;
        setLastSync(new Date().toLocaleTimeString());
        context.eventBus?.emit('device-sync', { connected: next, at: new Date().toISOString() });
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [context.eventBus]);

  const syncNow = () => {
    const failed = Math.random() < 0.2;
    if (failed) {
      setLastError('Sync failed due to connectivity');
      context.eventBus?.emit('device-sync', {
        connected,
        error: 'connectivity',
        at: new Date().toISOString(),
      });
    } else {
      setLastError(null);
      setConnected(true);
      setLastSync(new Date().toLocaleTimeString());
      context.eventBus?.emit('device-sync', { connected: true, at: new Date().toISOString() });
    }
  };

  const theme = context.theme;
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#1C3549';
  const textSecondary = theme.textSecondaryColor ?? '#8E8E93';
  const secondary = theme.secondaryColor ?? '#8FA764';
  const radius = theme.button?.borderRadius ?? 12;

  return (
    <View style={[styles.container, { backgroundColor: surface, borderRadius: radius }]}>
      <View style={styles.headerRow}>
        <View style={[styles.statusDot, { backgroundColor: connected ? '#4CAF50' : '#F44336' }]} />
        <Text style={[styles.title, { color: text }]}>{title}</Text>
      </View>
      <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>
      <Text style={[styles.lastSync, { color: textSecondary }]}>Last sync: {lastSync}</Text>
      {lastError && <Text style={styles.error}>{lastError}</Text>}
      <TouchableOpacity
        accessibilityRole="button"
        onPress={syncNow}
        style={[styles.syncBtn, { backgroundColor: secondary, borderRadius: radius }]}
      >
        <Text style={styles.syncBtnText}>Sync now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  title: { fontSize: 15, fontWeight: '700' },
  description: { fontSize: 12, opacity: 0.9, marginBottom: 4 },
  lastSync: { fontSize: 12, opacity: 0.8 },
  error: { color: '#dc3545', marginTop: 4, fontSize: 12 },
  syncBtn: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  syncBtnText: { fontWeight: '600', fontSize: 13, color: '#FFFFFF' },
});
