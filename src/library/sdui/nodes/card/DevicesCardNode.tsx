import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS, eventBus } from '../../../../core/EventBus';
import BatteryIcon from '../../../../theme/icons/battery.svg';
import MoreIcon from '../../../../theme/icons/more.svg';
import PlusIcon from '../../../../theme/icons/plus.svg';
import PlusSmallIcon from '../../../../theme/icons/plussmall.svg';
import {
  cardShadow,
  getColorTokens,
  layout as layoutTokens,
  resolveBackground,
  textStyle,
  withAlpha,
  type ThemeMode,
} from '../../../../theme/theme';
import { AddDeviceModal, type AvailableDevice } from '../../AddDeviceModal';
import { ConfirmModal } from '../../ConfirmModal';
import type { NodeProps } from '../../types';
import { SECTION_TITLE_ALPHA } from '../SectionNode';
import { DeviceDisc } from './DeviceGlyph';
import { inferDeviceKind, type DeviceKind } from './deviceTypes';

interface ConnectedDevice {
  name: string;
  kind: DeviceKind;
  /** ISO time of the device's last sync. */
  lastSync?: string;
  /** 0–100; the pill is left out when the source doesn't report it. */
  battery?: number;
}

const KINDS: DeviceKind[] = ['phone', 'watch', 'ring', 'band', 'other'];

const DEFAULT_AVAILABLE: AvailableDevice[] = [
  { name: 'Fitbit', kind: 'band' },
  { name: 'Oura', kind: 'ring' },
  { name: 'Garmin', kind: 'watch' },
  { name: 'Empatica', kind: 'band' },
];

/** Each device's last sync, by name, so a sync still shows after the app restarts. */
const LAST_SYNC_KEY = 'devicesCard.lastSync';

/** The later of two ISO times; unreadable or missing ones are ignored. */
function latestOf(a?: string, b?: string): string | undefined {
  const time = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
  if (Number.isNaN(time(a))) return Number.isNaN(time(b)) ? undefined : b;
  if (Number.isNaN(time(b))) return a;
  return time(a) >= time(b) ? a : b;
}

/** Lets the dialog's exit play before the link's own confirm dialog opens. */
const HANDOFF_MS = 200;

function kindOf(entry: { name: string; type?: unknown }): DeviceKind {
  const declared = typeof entry.type === 'string' ? (entry.type.toLowerCase() as DeviceKind) : undefined;
  return declared && KINDS.includes(declared) ? declared : inferDeviceKind(entry.name);
}

function parseConnected(raw: unknown): ConnectedDevice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): ConnectedDevice[] => {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') return [];
    return [
      {
        name: entry.name,
        kind: kindOf(entry),
        lastSync: typeof entry.lastSync === 'string' ? entry.lastSync : undefined,
        battery: typeof entry.battery === 'number' ? entry.battery : undefined,
      },
    ];
  });
}

function parseAvailable(raw: unknown): AvailableDevice[] {
  if (!Array.isArray(raw)) return DEFAULT_AVAILABLE;
  return raw.flatMap((entry): AvailableDevice[] => {
    if (typeof entry === 'string') return [{ name: entry, kind: inferDeviceKind(entry) }];
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') return [];
    return [{ name: entry.name, kind: kindOf(entry), url: typeof entry.url === 'string' ? entry.url : undefined }];
  });
}

// A quick spring in, so the menu pops from its chip; a short fade out.
const MENU_IN = { damping: 18, stiffness: 320, mass: 0.6 } as const;
const MENU_OUT_MS = 120;
const MENU_FROM = 0.85;

/** Where the ⋯ chip sits on screen, from `measureInWindow`. */
interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MENU_GAP = 4;
/** Two 36pt rows plus the menu's padding; used only to tell whether it fits below its chip. */
const MENU_HEIGHT = 80;
const SCREEN_MARGIN = 16;

/** Right-aligned 4pt under its chip, or over it when the chip is too near the bottom of the screen. */
function menuPosition(anchor: MenuAnchor, screen: { width: number; height: number }): ViewStyle {
  const right = screen.width - (anchor.x + anchor.width);
  const below = anchor.y + anchor.height + MENU_GAP;
  if (below + MENU_HEIGHT <= screen.height - SCREEN_MARGIN) {
    return { top: below, right, transformOrigin: 'top right' };
  }
  return { bottom: screen.height - anchor.y + MENU_GAP, right, transformOrigin: 'bottom right' };
}

/** The row's options menu. Animated by hand: `entering`/`exiting` strand a touch-blocking overlay on Android. */
function DeviceMenu({
  visible,
  onHidden,
  style,
  children,
}: {
  visible: boolean;
  /** Called once the exit has finished, so the parent can unmount it. */
  onHidden: () => void;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      progress.value = withSpring(1, MENU_IN);
      return;
    }
    progress.value = withTiming(0, { duration: MENU_OUT_MS }, (finished) => {
      if (finished) runOnJS(onHidden)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(progress.value, 1),
    transform: [{ scale: interpolate(progress.value, [0, 1], [MENU_FROM, 1]) }],
  }));

  return (
    <Animated.View
      accessibilityRole="menu"
      pointerEvents={visible ? 'auto' : 'none'}
      style={[style, animated]}
    >
      {children}
    </Animated.View>
  );
}

/** "today, 2:00 PM", "yesterday, 9:30 AM" or "3 Nov, 2:00 PM", in the device's locale. */
function formatLastSync(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * The participant's connected devices (Figma 4580:1106), and the way to add one (4583:1211).
 *
 * TODO: no device data source yet; `devices` comes from the blueprint, and removing one only
 * hides it here (the `device-removed` event is for the host to revoke it).
 */
export function DevicesCardNode({ node, context }: NodeProps) {
  const { sync, healthKit, storage } = useCoreServices();
  const mode: ThemeMode = context.colorScheme ?? 'light';
  const brandColors = context.theme.brandColors;
  const tokens = getColorTokens(mode, brandColors);
  const brand = brandColors?.brand ?? tokens.button.background;
  const text = tokens.text.primary;
  const muted = withAlpha(text, 0.62);
  const chip = tokens.card.stats.openBadge;

  const title = typeof node.title === 'string' ? node.title : 'Connected devices';
  const available = parseAvailable(node.available);
  const [devices, setDevices] = useState(() => parseConnected(node.devices));
  const [adding, setAdding] = useState(false);
  // The menu is kept mounted past `menuOpen` so its exit can play.
  const [menu, setMenu] = useState<{ device: ConnectedDevice; anchor: MenuAnchor } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [removing, setRemoving] = useState<ConnectedDevice | null>(null);
  const [syncingDevice, setSyncingDevice] = useState<string | null>(null);

  // Restores each device's saved time, keeping whichever is newer. A device with none anywhere shows
  // the app's own last sync, so the line is never missing once the app has synced at all.
  const restored = useRef(false);
  useEffect(() => {
    let live = true;
    void Promise.all([
      storage.get<Record<string, string>>(LAST_SYNC_KEY).catch(() => null),
      sync.loadLastSyncedAt().catch(() => null),
    ]).then(([saved, appLast]) => {
      if (!live) return;
      setDevices((current) =>
        current.map((d) => ({
          ...d,
          lastSync: latestOf(d.lastSync, saved?.[d.name]) ?? appLast?.toISOString(),
        })),
      );
      restored.current = true;
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved after the restore, so the first render's blueprint times never overwrite newer ones.
  useEffect(() => {
    if (!restored.current) return;
    const times = Object.fromEntries(
      devices.flatMap((d) => (d.lastSync ? [[d.name, d.lastSync]] : [])),
    );
    void storage.set(LAST_SYNC_KEY, times).catch(() => {});
  }, [devices, storage]);

  const markSynced = (at: Date, only?: string) => {
    const iso = new Date(at).toISOString();
    setDevices((current) =>
      current.map((d) => (only == null || d.name === only ? { ...d, lastSync: iso } : d)),
    );
  };

  // The header's Sync covers every device.
  useEffect(() => {
    const onUserSynced = (payload?: { at?: Date }) => {
      if (payload?.at) markSynced(payload.at);
    };
    eventBus.on(EVENTS.USER_SYNCED, onUserSynced);
    return () => eventBus.off(EVENTS.USER_SYNCED, onUserSynced);
  }, []);

  // A row's Sync runs the app's sync (there is no per-device one yet) and stamps only that row.
  const syncDevice = async (device: ConnectedDevice) => {
    setSyncingDevice(device.name);
    try {
      const result = await sync.sync();
      if (result.success || result.partial) {
        markSynced(result.lastSyncedAt, device.name);
        // Keeps the header's own "last sync" in step.
        eventBus.emit(EVENTS.DATA_SYNCED, { at: result.lastSyncedAt });
      }
    } catch {
      // Left as it was: the row keeps its previous time.
    } finally {
      setSyncingDevice(null);
    }
  };
  const chips = useRef(new Map<string, React.ComponentRef<typeof View> | null>());
  const window = useWindowDimensions();

  const openMenu = (device: ConnectedDevice) => {
    chips.current.get(device.name)?.measureInWindow((x, y, width, height) => {
      setMenu({ device, anchor: { x, y, width, height } });
      setMenuOpen(true);
    });
  };
  const closeMenu = () => setMenuOpen(false);

  // iOS drops a modal presented while another is still on screen, so the confirm waits for the menu.
  const pendingRemoval = useRef<ConnectedDevice | null>(null);
  const showPendingRemoval = () => {
    const device = pendingRemoval.current;
    pendingRemoval.current = null;
    if (device) setRemoving(device);
  };
  const onMenuHidden = () => {
    setMenu(null);
    // iOS reports the dismissal itself (`onDismiss`); Android stacks dialogs, so it can go now.
    if (Platform.OS !== 'ios') showPendingRemoval();
  };

  const selectDevice = (device: AvailableDevice) => {
    setAdding(false);
    context.eventBus?.emit('device-connect', { name: device.name, type: device.kind });
    if (device.url) {
      const url = device.url;
      setTimeout(() => context.eventBus?.emit(EVENTS.OPEN_EXTERNAL_LINK, { url }), HANDOFF_MS);
    }
  };

  const connectHealthApp = async () => {
    setAdding(false);
    await healthKit.requestPermission().catch(() => false);
  };

  const remove = (device: ConnectedDevice) => {
    setDevices((current) => current.filter((d) => d.name !== device.name));
    context.eventBus?.emit('device-removed', { name: device.name, type: device.kind });
  };

  return (
    <View
      style={[styles.card, { backgroundColor: resolveBackground(context.theme, mode) }]}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: withAlpha(text, SECTION_TITLE_ALPHA) }]}>{title}</Text>
        {devices.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a device"
            onPress={() => setAdding(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.addChip, { backgroundColor: chip }, pressed && styles.pressed]}
          >
            <PlusSmallIcon width={12} height={12} color={brand} />
            <Text style={[styles.addLabel, { color: brand }]}>Add</Text>
          </Pressable>
        )}
      </View>

      {devices.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: tokens.card.background }, cardShadow]}>
          <View style={styles.empty}>
            <View style={styles.emptyIcons}>
              {(['phone', 'watch', 'ring'] as const).map((kind) => (
                <DeviceDisc key={kind} kind={kind} size={46} background={brand} color={tokens.button.icon} />
              ))}
            </View>
            <Text style={[styles.emptyTitle, { color: text }]}>No devices connected yet</Text>
            <Text style={[styles.emptyBody, { color: withAlpha(text, 0.72) }]}>
              Connect a watch, ring or your phone’s health app, and its data will show here.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: tokens.button.background },
              pressed && styles.pressed,
            ]}
          >
            <PlusIcon width={14} height={14} color={tokens.button.icon} />
            <Text style={[styles.addButtonLabel, { color: tokens.button.icon }]}>Add a device</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {devices.map((device) => {
            const lastSync = device.lastSync ? formatLastSync(device.lastSync) : null;
            const expanded = menuOpen && menu?.device.name === device.name;
            return (
              <View key={device.name} style={[styles.row, { backgroundColor: tokens.card.background }, cardShadow]}>
                <DeviceDisc kind={device.kind} size={44} background={brand} color={tokens.button.icon} />
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: text }]} numberOfLines={1}>
                    {device.name}
                  </Text>
                  {/* Status only when it needs saying: a connected device just shows when it last synced. */}
                  <View style={styles.meta}>
                    {syncingDevice === device.name ? (
                      <Text style={[styles.metaText, { color: muted }]}>Syncing…</Text>
                    ) : (
                      lastSync && <Text style={[styles.metaText, { color: muted }]}>Synced {lastSync}</Text>
                    )}
                    {device.battery != null && (
                      <>
                        {(lastSync || syncingDevice === device.name) && (
                          <Text style={[styles.metaText, { color: muted }]}>·</Text>
                        )}
                        <View style={styles.battery}>
                          <BatteryIcon width={12} height={8.5} />
                          <Text style={[styles.metaText, { color: muted }]}>{Math.round(device.battery)}%</Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
                <Pressable
                  ref={(chipView) => {
                    chips.current.set(device.name, chipView);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Options for ${device.name}`}
                  accessibilityState={{ expanded }}
                  onPress={() => openMenu(device)}
                  hitSlop={8}
                  style={[styles.corner, { backgroundColor: chip }]}
                >
                  <MoreIcon width={18} height={18} color={brand} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* Drawn over the whole screen, so no row, card or section can clip or cover it. */}
      <Modal
        visible={menu != null}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeMenu}
        onDismiss={showPendingRemoval}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel="Close menu" />
        {menu && (
          <DeviceMenu
            visible={menuOpen}
            onHidden={onMenuHidden}
            style={[
              styles.menu,
              menuPosition(menu.anchor, window),
              { backgroundColor: tokens.card.background },
              cardShadow,
            ]}
          >
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                closeMenu();
                void syncDevice(menu.device);
              }}
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: chip }]}
            >
              <Text style={[styles.menuItem, { color: text }]}>Sync</Text>
            </Pressable>
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                closeMenu();
                pendingRemoval.current = menu.device;
              }}
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: chip }]}
            >
              <Text style={[styles.menuItem, { color: tokens.button.error }]}>Remove device</Text>
            </Pressable>
          </DeviceMenu>
        )}
      </Modal>

      <AddDeviceModal
        visible={adding}
        onClose={() => setAdding(false)}
        devices={available}
        onSelect={selectDevice}
        onUseHealthApp={node.healthApp === false ? undefined : connectHealthApp}
        brandColors={brandColors}
      />
      <ConfirmModal
        visible={removing != null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
        title={`Remove ${removing?.name ?? 'device'}?`}
        description="Its data will stop coming in. You can connect it again at any time."
        confirmLabel="Remove"
        destructive
        brandColors={brandColors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No padding: the card is the page colour, so padding would only read as extra margin.
  card: {
    width: '100%',
    gap: layoutTokens.gap,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  /** Styled as a section title (`CardSectionNode`), as the card heads its own group. */
  headerTitle: textStyle(layoutTokens.headingFontSize, layoutTokens.headingLineHeight, 'regular'),
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  addLabel: { ...textStyle(12, 16, 'semiBold'), fontWeight: '600' },
  /** A surface like the device rows, so the empty state reads as a card on the page. */
  emptyCard: {
    padding: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusCard,
    gap: layoutTokens.gap,
  },
  empty: {
    gap: 4,
  },
  emptyIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  emptyTitle: { ...textStyle(16, 20, 'bold'), fontWeight: '700' },
  emptyBody: textStyle(12, 16, 'regular'),
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 24,
  },
  addButtonLabel: { ...textStyle(14, 18, 'semiBold'), fontWeight: '600' },
  list: {
    gap: layoutTokens.gap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: layoutTokens.radiusCard,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  name: { ...textStyle(17, 21, 'semiBold'), fontWeight: '600' },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaText: { ...textStyle(13, 17, 'regular'), fontVariant: ['tabular-nums'] },
  battery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  corner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    minWidth: 150,
    padding: 4,
    borderRadius: 14,
  },
  menuRow: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  menuItem: textStyle(15, 20, 'regular'),
});
