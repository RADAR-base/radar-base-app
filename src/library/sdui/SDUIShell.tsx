import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { CoreServicesProvider, type CoreServiceOverrides } from '../../core/CoreServicesContext';
import type { AppManifest, TabManifest } from '../contracts/ManifestSchema';
import type { ScreenBlueprint } from '../contracts/BlueprintSchema';
import type { Node } from '../contracts/NodeSchema';
import { BlueprintLoader, type BlueprintSource } from './BlueprintLoader';
import { ManifestLoader, type ManifestSource } from './ManifestLoader';
import { NodeRenderer } from './NodeRenderer';
import { createActionDispatcher } from './ActionDispatcher';
import { registerBuiltInNodes } from './nodes';
import { HeaderNode } from './nodes/header/HeaderNode';
import { NavbarNode } from './nodes/navbar/NavbarNode';
import { navbarLayout, layout as layoutTokens } from '../../theme/theme';
import type { SDUIContext, TemplateContext } from './types';

const noopRender = () => null;

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

  const colorScheme = useColorScheme();
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
      mode: colorScheme ?? 'light',
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
    // Re-parses on colorScheme change so unconfigured theme fields — including the
    // shell's own background below — track dark/light instead of being stuck with
    // whatever mode was active on first load.
  }, [props.manifestSource, props.manifestFallback, colorScheme]);

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
    colorScheme: colorScheme ?? 'light',
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
          context={context}
          activeTabId={activeTabId}
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

        <BottomTabBar manifest={manifest} activeTabId={activeTabId} context={context} />
      </View>
    </CoreServicesProvider>
  );
}

/* ─── Header ──────────────────────────────────────────────────────────── */

function ShellHeader({
  manifest,
  context,
  activeTabId,
  secondaryTitle,
  onBack,
}: {
  manifest: AppManifest;
  context: SDUIContext;
  activeTabId: string;
  secondaryTitle: string | null;
  onBack: (() => void) | null;
}) {
  const { header } = manifest;

  if (onBack) {
    const backButtonBg = header.backgroundColor ?? manifest.theme.primaryColor;
    const backButtonText = header.textColor ?? '#FFFFFF';
    return (
      <View style={[styles.header, { backgroundColor: backButtonBg }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: backButtonText }]}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={[styles.secondaryTitle, { color: backButtonText }]} numberOfLines={1}>
            {secondaryTitle ?? header.title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>
    );
  }

  const headerRecord = header as Record<string, unknown>;
  const subtitle = typeof headerRecord.subtitle === 'string' ? headerRecord.subtitle : undefined;
  const lastSyncedLabel =
    typeof headerRecord.lastSyncedLabel === 'string'
      ? headerRecord.lastSyncedLabel
      : 'Last Synced: 12:00';

  const username = header.showName ? getUsername(context) : undefined;

  // The first tab is the "home" dashboard — it keeps the greeting header ("Hello <name>" +
  // subtitle + Edit). Every other navbar tab shows that tab's label as a plain page title
  // (no greeting name, subtitle, or Edit affordance), so the header names the page you're on.
  const isHomeTab = activeTabId === manifest.tabs[0]?.id;
  const activeTab = manifest.tabs.find((tab: TabManifest) => tab.id === activeTabId);

  const headerNode: Node = {
    id: 'shell-header',
    type: 'HeaderNode',
    // Only forward these when the manifest actually configures them — leaving them
    // `undefined` otherwise lets HeaderNode fall back to its own dark/light-aware
    // `theme.ts` tokens instead of always being pinned to the (dark-mode-unaware)
    // static manifest theme.
    backgroundColor: header.backgroundColor,
    textColor: header.textColor,
    title: isHomeTab ? header.title : activeTab?.label ?? header.title,
    // Raw username only — HeaderTextNode decides whether to append it next to `title`
    // based on `showName`, rather than us pre-concatenating strings here.
    name: isHomeTab ? username : undefined,
    showName: isHomeTab && header.showName === true,
    description: isHomeTab ? subtitle ?? 'Track your data and complete your daily tasks' : '',
    showEditButton: isHomeTab ? undefined : false,
    showActions: header.showSettings !== false,
    lastSyncedLabel,
    profileIcon: header.profileIcon,
  };

  return <HeaderNode node={headerNode} context={context} render={noopRender} />;
}

/**
 * Reads the signed-in user's display name off `SDUIContext.template.user`, checked for
 * `header.showName`. Hosts populate `template.user` via `SDUIShell`'s `templateContext`
 * prop; this is intentionally lenient about the field name since that shape isn't
 * standardized across apps.
 */
function getUsername(context: SDUIContext): string | undefined {
  // Populate this by passing `templateContext={{ user: { firstName: 'Ada' } }}` (or
  // `.name` / `.displayName`) to <SDUIShell> from the host app — e.g. from `useAuth()`'s
  // session data. Nothing sets this by default, so `showName` is a no-op until a host does.
  const user = context.template.user;
  if (!user) return undefined;
  const candidate = user.firstName ?? user.name ?? user.displayName;
  return typeof candidate === 'string' ? candidate : undefined;
}

/* ─── Bottom Tab Bar ──────────────────────────────────────────────────── */

function BottomTabBar({
  manifest,
  activeTabId,
  context,
}: {
  manifest: AppManifest;
  activeTabId: string;
  context: SDUIContext;
}) {
  const navbarNode: Node = {
    id: 'shell-navbar',
    type: 'NavbarNode',
    tabs: manifest.tabs.map((tab: TabManifest) => ({
      id: tab.id,
      label: tab.label,
      icon: tab.icon,
      showLabel: tab.showLabel,
    })),
    selectedTabId: activeTabId,
  };

  return (
    <View style={styles.tabBarOuter}>
      <NavbarNode node={navbarNode} context={context} render={noopRender} />
    </View>
  );
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
  /* Secondary header (back navigation) */
  backButton: {
    paddingRight: 8,
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: layoutTokens.headingFontSize,
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: navbarLayout.outerPaddingBottom,
    paddingTop: navbarLayout.outerPaddingTop,
  },
  /* Shared */
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: layoutTokens.headingFontSize,
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

