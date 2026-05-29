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
  /** Async source for the manifest (e.g. `async () => bundledManifest`). */
  manifestSource: ManifestSource;
  /** Async source for blueprints by viewPath. */
  blueprintSource: BlueprintSource;
  /** Fallback manifest used when the primary source fails validation. */
  manifestFallback?: ManifestSource;
  /** Fallback blueprint source. */
  blueprintFallback?: BlueprintSource;
  /** Forwarded into the internal CoreServicesProvider for dependency injection. */
  serviceOverrides?: CoreServiceOverrides;
  /** Variables available for `{{template}}` interpolation inside node props. */
  templateContext?: TemplateContext;
  /** Optional EventBus pass-through for nodes that emit events. */
  eventBus?: { emit: (event: string, data?: unknown) => void };
}

interface SecondaryEntry {
  viewUrl: string;
  blueprint: ScreenBlueprint;
}

/**
 * Top-level SDUI engine component. Responsibilities:
 *   1. Load + validate the manifest at startup.
 *   2. Render header + tab bar from the manifest.
 *   3. Lazy-load + validate the blueprint for each tab the user opens.
 *   4. Walk the blueprint's node tree through `NodeRenderer`.
 *   5. Manage a stack of secondary views opened via `ActionNode` (`OpenCustomView`).
 */
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

  // Load the manifest once at mount.
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
          { backgroundColor: manifest.theme.backgroundColor ?? '#f8f9fa' },
        ]}
      >
        <ShellHeader
          manifest={manifest}
          secondaryTitle={topSecondary ? getNodeTitle(topSecondary.blueprint) : null}
          onBack={topSecondary ? popSecondaryView : null}
        />

        {!topSecondary && (
          <TabBar
            manifest={manifest}
            activeTabId={activeTabId}
            onSelect={(tabId) => setActiveTabId(tabId)}
          />
        )}

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
      </View>
    </CoreServicesProvider>
  );
}

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
  return (
    <View style={[styles.header, { backgroundColor: header.backgroundColor ?? manifest.theme.primaryColor }]}>
      <View style={styles.headerRow}>
        {onBack && (
          <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: header.textColor ?? '#fff' }]}>‹ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: header.textColor ?? '#fff' }]} numberOfLines={1}>
          {secondaryTitle ?? header.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
    </View>
  );
}

function TabBar({
  manifest,
  activeTabId,
  onSelect,
}: {
  manifest: AppManifest;
  activeTabId: string;
  onSelect: (tabId: string) => void;
}) {
  return (
    <View style={[styles.tabBar, { backgroundColor: manifest.theme.surfaceColor ?? '#fff' }]}>
      {manifest.tabs.map((tab: TabManifest) => {
        const isActive = tab.id === activeTabId;
        return (
          <TouchableOpacity
            key={tab.id}
            accessibilityRole="tab"
            onPress={() => onSelect(tab.id)}
            style={[
              styles.tab,
              isActive && {
                borderBottomWidth: 2,
                borderBottomColor: manifest.theme.primaryColor,
              },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                {
                  color: isActive
                    ? manifest.theme.primaryColor
                    : manifest.theme.textSecondaryColor ?? '#6D6D80',
                },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    paddingRight: 8,
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
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
