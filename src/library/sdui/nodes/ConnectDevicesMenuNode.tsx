import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NodeProps } from '../types';

const ON_PRIMARY = '#FFFFFF';
const CONNECTED_COLOR = '#4CAF50';
const DISCONNECTED_COLOR = '#F44336';
const ERROR_COLOR = '#dc3545';

/**
 * Surfaces the device connection status panel. Currently a demo implementation that
 * toggles a mocked connection state every 5 seconds; a future iteration will integrate
 * with the wearable device data layer (Phase 5) and accept `providers[]` /
 * `mode: 'menu' | 'card' | 'auto'` per the SDUI catalog.
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
      <Text
        style={[styles.statusLine, { color: connected ? CONNECTED_COLOR : DISCONNECTED_COLOR }]}
      >
        {connected ? 'Connected' : 'Disconnected'}
      </Text>
      <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>
      <Text style={[styles.lastSync, { color: textSecondary }]}>Last sync: {lastSync}</Text>
      {lastError && <Text style={styles.error}>Last error: {lastError}</Text>}
      <TouchableOpacity
        accessibilityRole="button"
        onPress={syncNow}
        style={[styles.syncBtn, { backgroundColor: primary, borderRadius: radius }]}
      >
        <Text style={[styles.syncBtnText, { color: ON_PRIMARY }]}>Sync now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, padding: 12, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  statusLine: { fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 12, opacity: 0.9, marginBottom: 4 },
  lastSync: { fontSize: 12, opacity: 0.8 },
  error: { color: ERROR_COLOR, marginTop: 4, fontSize: 12 },
  syncBtn: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' },
  syncBtnText: { fontWeight: '600', fontSize: 12 },
});
