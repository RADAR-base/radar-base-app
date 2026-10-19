import type { ThemeMode } from '../../../../theme/theme';

/** The kinds of device a study can connect, each drawn in its own colour on the contribution wheel. */
export type DeviceKind = 'phone' | 'watch' | 'ring' | 'band' | 'other';

/** A device as the contribution card shows it. */
export interface StudyDevice {
  name: string;
  kind: DeviceKind;
}

/**
 * One colour per device kind, per mode. Fixed rather than brand-overridable, like the task-type
 * colours: they say *which* device, so a study's accent mustn't repaint them.
 *
 * Picked to stand apart from the task colours on the outer ring (none sits near the questionnaire
 * orange) and from each other, and to reach 3:1 on the card and dialog surfaces of their mode.
 */
export const DEVICE_COLORS: Record<DeviceKind, Record<ThemeMode, string>> = {
  phone: { light: '#1D3557', dark: '#8FB8F2' }, // navy
  watch: { light: '#2E8B3A', dark: '#7FD68A' }, // green
  ring: { light: '#2B2BB8', dark: '#5C5CF5' }, //  ultramarine
  band: { light: '#B8247E', dark: '#F28CC9' }, //  magenta
  other: { light: '#7A5A3A', dark: '#C9A882' }, // brown
};

const KINDS: DeviceKind[] = ['phone', 'watch', 'ring', 'band', 'other'];

export function deviceColor(kind: DeviceKind, mode: ThemeMode): string {
  return DEVICE_COLORS[kind][mode];
}

/** The kind a device name implies, for blueprints that list plain names ("Phone", "Oura Ring"). */
export function inferDeviceKind(name: string): DeviceKind {
  const lower = name.toLowerCase();
  if (/\bring\b|oura|ultrahuman/.test(lower)) return 'ring';
  if (/watch|garmin|wear ?os|galaxy watch/.test(lower)) return 'watch';
  if (/band|tracker|fitbit|whoop|charge|inspire|empatica|e4/.test(lower)) return 'band';
  if (/phone|iphone|android|mobile|smartphone/.test(lower)) return 'phone';
  return 'other';
}

/**
 * The blueprint's `devices`: plain names, or `{ name, type }` to state the kind outright. Anything
 * unreadable is dropped.
 */
export function parseDevices(raw: unknown): StudyDevice[] {
  if (!Array.isArray(raw)) return [];
  const devices: StudyDevice[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      devices.push({ name: entry, kind: inferDeviceKind(entry) });
    } else if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { name?: unknown }).name === 'string'
    ) {
      const { name, type } = entry as { name: string; type?: unknown };
      const declared = typeof type === 'string' ? (type.toLowerCase() as DeviceKind) : undefined;
      devices.push({
        name,
        kind: declared && KINDS.includes(declared) ? declared : inferDeviceKind(name),
      });
    }
  }
  return devices;
}
