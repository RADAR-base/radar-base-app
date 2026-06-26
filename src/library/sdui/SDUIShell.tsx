import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CoreServicesProvider, type CoreServiceOverrides } from '../../core/CoreServicesContext';
import type { AppManifest, TabManifest } from '../contracts/ManifestSchema';
import type { ScreenBlueprint } from '../contracts/BlueprintSchema';
import { BlueprintLoader, type BlueprintSource } from './BlueprintLoader';
import { ManifestLoader, type ManifestSource } from './ManifestLoader';
import { NodeRenderer } from './NodeRenderer';
import { createActionDispatcher } from './ActionDispatcher';
import { registerBuiltInNodes } from './nodes';
import type { SDUIContext, TemplateContext } from './types';

export interface SDUIShellProps {
  manifestSource: ManifestSource;
  blueprintSource: BlueprintSource;
  manifestFallback?: ManifestSource;
  blueprintFallback?: BlueprintSource;
  serviceOverrides?: CoreServiceOverrides;
  templateContext?: TemplateContext;
  eventBus?: { emit: (event: string, data?: unknown) => void };
}

interface SecondaryEntry {
  viewUrl: string;
  blueprint: ScreenBlueprint;
}

export function SDUIShell(props: SDUIShellProps) {
  registerBuiltInNodes();

  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [secondaryStack, setSecondaryStack] = useState<SecondaryEntry[]>([]);

  const blueprintLoader = useMemo(
    () =>
      new BlueprintLoader({
        source: props.blueprintSource,
        fallback: props.blueprintFallback,
        onValidationError: (path, err) =>
          console.warn(`[SDUI] Blueprint validation failed for "${path}":`, err),
      }),
    [props.blueprintSource, props.blueprintFallback],
  );

  useEffect(() => {
    let cancelled = false;
    const loader = new ManifestLoader({
      source: props.manifestSource,
      fallback: props.manifestFallback,
      onValidationError: (err) => console.warn('[SDUI] Manifest validation failed:', err),
    });
    loader
      .load()
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        setActiveTabId(m.tabs[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setManifestError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [props.manifestSource, props.manifestFallback]);

  const openSecondaryView = useCallback(
    async (viewUrl: string) => {
      try {
        const blueprint = await blueprintLoader.load(viewUrl);
        setSecondaryStack((stack) => [...stack, { viewUrl, blueprint }]);
      } catch (err) {
        console.error(`[SDUI] Failed to open secondary view "${viewUrl}":`, err);
      }
    },
    [blueprintLoader],
  );

  const popSecondaryView = useCallback(() => {
    setSecondaryStack((stack) => stack.slice(0, -1));
  }, []);

  const dispatch = useMemo(
    () =>
      createActionDispatcher({
        onOpenCustomView: (viewUrl) => {
          void openSecondaryView(viewUrl);
        },
        onNavigate: (tabId) => {
          setSecondaryStack([]);
          setActiveTabId(tabId);
        },
        onTriggerEvent: (eventName, payload) => {
          props.eventBus?.emit(eventName, payload);
        },
      }),
    [openSecondaryView, props.eventBus],
  );

  if (manifestError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Configuration error</Text>
        <Text style={styles.errorBody}>{manifestError}</Text>
      </View>
    );
  }

  if (!manifest || !activeTabId) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const context: SDUIContext = {
    template: props.templateContext ?? {},
    dispatch,
    theme: manifest.theme,
    eventBus: props.eventBus,
  };

  const topSecondary = secondaryStack[secondaryStack.length - 1] ?? null;

  return (
    <CoreServicesProvider overrides={props.serviceOverrides}>
      <View
        style={[
          styles.container,
          { backgroundColor: manifest.theme.backgroundColor ?? '#EDF1F5' },
        ]}
      >
        <ShellHeader
          manifest={manifest}
          secondaryTitle={topSecondary ? getNodeTitle(topSecondary.blueprint) : null}
          onBack={topSecondary ? popSecondaryView : null}
        />

        <View style={styles.body}>
          {topSecondary ? (
            <NodeRenderer node={topSecondary.blueprint.root} context={context} />
          ) : (
            <TabView
              activeTabId={activeTabId}
              blueprintLoader={blueprintLoader}
              manifest={manifest}
              context={context}
            />
          )}
        </View>

        {!topSecondary && (
          <BottomTabBar
            manifest={manifest}
            activeTabId={activeTabId}
            onSelect={(tabId) => setActiveTabId(tabId)}
          />
        )}
      </View>
    </CoreServicesProvider>
  );
}

/* ─── Header ──────────────────────────────────────────────────────────── */

function ShellHeader({
  manifest,
  secondaryTitle,
  onBack,
}: {
  manifest: AppManifest;
  secondaryTitle: string | null;
  onBack: (() => void) | null;
}) {
  const { header } = manifest;
  const bgColor = header.backgroundColor ?? manifest.theme.primaryColor;
  const textColor = header.textColor ?? '#FFFFFF';
  const greeting = (header as Record<string, unknown>).greeting as string | undefined;
  const subtitle = (header as Record<string, unknown>).subtitle as string | undefined;

  if (onBack) {
    return (
      <View style={[styles.header, { backgroundColor: bgColor }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: textColor }]}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={[styles.secondaryTitle, { color: textColor }]} numberOfLines={1}>
            {secondaryTitle ?? header.title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.header, { backgroundColor: bgColor }]}>
      {/* Top row: avatar + sync status + icon buttons */}
      <View style={styles.headerTopRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarEmoji}>{'\u263A'}</Text>
        </View>
        <Text style={styles.syncText}>Last Synced: 12:00</Text>
        <View style={styles.headerIcons}>
          <HeaderIconButton icon={'\u21BB'} />
          <HeaderIconButton icon={'\u25CF'} />
          <HeaderIconButton icon={'\u2699'} />
        </View>
      </View>

      {/* Greeting */}
      <Text style={[styles.greetingText, { color: textColor }]}>
        {greeting ?? 'Hello User'}
      </Text>

      {/* Subtitle + Edit button */}
      <View style={styles.subtitleRow}>
        <Text style={[styles.subtitleText, { color: textColor }]} numberOfLines={1}>
          {subtitle ?? 'Track your data and complete your daily tasks'}
        </Text>
        <TouchableOpacity style={styles.editPill} accessibilityRole="button">
          <Text style={styles.editPillText}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function HeaderIconButton({ icon }: { icon: string }) {
  return (
    <View style={styles.headerIconBtn}>
      <Text style={styles.headerIconText}>{icon}</Text>
    </View>
  );
}

/* ─── Bottom Tab Bar ──────────────────────────────────────────────────── */

function BottomTabBar({
  manifest,
  activeTabId,
  onSelect,
}: {
  manifest: AppManifest;
  activeTabId: string;
  onSelect: (tabId: string) => void;
}) {
  const primary = manifest.theme.primaryColor;
  return (
    <View style={styles.tabBarOuter}>
      <View style={[styles.tabBar, { backgroundColor: primary }]}>
        {manifest.tabs.map((tab: TabManifest) => {
          const isActive = tab.id === activeTabId;
          return (
            <TouchableOpacity
              key={tab.id}
              accessibilityRole="tab"
              onPress={() => onSelect(tab.id)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <TabIcon name={tab.icon ?? 'home'} active={isActive} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const opacity = active ? 1 : 0.45;
  switch (name) {
    case 'home':
      return (
        <View style={[iconStyles.container, { opacity }]}>
          {/* House: triangle roof + square body */}
          <View style={iconStyles.homeRoof} />
          <View style={iconStyles.homeBody} />
        </View>
      );
    case 'calendar':
      return (
        <View style={[iconStyles.container, { opacity }]}>
          {/* Calendar: bordered square with horizontal line */}
          <View style={iconStyles.calendarOuter}>
            <View style={iconStyles.calendarLine} />
            <View style={iconStyles.calendarDots}>
              <View style={iconStyles.calendarDot} />
              <View style={iconStyles.calendarDot} />
              <View style={iconStyles.calendarDot} />
              <View style={iconStyles.calendarDot} />
            </View>
          </View>
        </View>
      );
    case 'person':
      return (
        <View style={[iconStyles.container, { opacity }]}>
          {/* Person: circle head + arc body */}
          <View style={iconStyles.personHead} />
          <View style={iconStyles.personBody} />
        </View>
      );
    case 'grid':
      return (
        <View style={[iconStyles.container, { opacity }]}>
          {/* Grid: 2x2 rounded squares */}
          <View style={iconStyles.gridRow}>
            <View style={iconStyles.gridSquare} />
            <View style={iconStyles.gridSquare} />
          </View>
          <View style={iconStyles.gridRow}>
            <View style={iconStyles.gridSquare} />
            <View style={iconStyles.gridSquare} />
          </View>
        </View>
      );
    default:
      return (
        <View style={[iconStyles.container, { opacity }]}>
          <View style={iconStyles.defaultDot} />
        </View>
      );
  }
}

/* ─── Tab Content ─────────────────────────────────────────────────────── */

function TabView({
  activeTabId,
  blueprintLoader,
  manifest,
  context,
}: {
  activeTabId: string;
  blueprintLoader: BlueprintLoader;
  manifest: AppManifest;
  context: SDUIContext;
}) {
  const tab = useMemo<TabManifest | undefined>(
    () => manifest.tabs.find((t: TabManifest) => t.id === activeTabId),
    [manifest, activeTabId],
  );
  const [blueprint, setBlueprint] = useState<ScreenBlueprint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tab) return;
    let cancelled = false;
    setBlueprint(null);
    setError(null);
    blueprintLoader
      .load(tab.viewPath)
      .then((bp) => {
        if (cancelled) return;
        setBlueprint(bp);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, blueprintLoader]);

  if (!tab) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Tab not found</Text>
        <Text style={styles.errorBody}>{activeTabId}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Failed to load view</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!blueprint) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return <NodeRenderer node={blueprint.root} context={context} />;
}

function getNodeTitle(blueprint: ScreenBlueprint): string | null {
  const title = (blueprint.root as { title?: unknown }).title;
  return typeof title === 'string' ? title : null;
}

/* ─── Styles ──────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /* Header */
  header: {
    paddingTop: 54,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#A8C96A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  syncText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtitleText: {
    fontSize: 13,
    opacity: 0.75,
    flex: 1,
    marginRight: 10,
  },
  editPill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  editPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  /* Secondary header (back navigation) */
  backButton: {
    paddingRight: 8,
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },
  /* Body */
  body: {
    flex: 1,
  },
  /* Bottom tab bar */
  tabBarOuter: {
    paddingHorizontal: 24,
    paddingBottom: 30,
    paddingTop: 6,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  /* Shared */
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#dc3545',
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 13,
    color: '#6c757d',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#6c757d',
  },
});

const iconStyles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Home icon */
  homeRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    marginBottom: -1,
  },
  homeBody: {
    width: 14,
    height: 10,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  /* Calendar icon */
  calendarOuter: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 3,
    overflow: 'hidden',
  },
  calendarLine: {
    height: 1.5,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  calendarDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 1.5,
    gap: 2,
    marginTop: 1,
  },
  calendarDot: {
    width: 3,
    height: 3,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  /* Person icon */
  personHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginBottom: 2,
  },
  personBody: {
    width: 16,
    height: 8,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  /* Grid icon */
  gridRow: {
    flexDirection: 'row',
    gap: 3,
  },
  gridSquare: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    margin: 1,
  },
  /* Default */
  defaultDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
});
