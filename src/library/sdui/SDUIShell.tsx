import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionManager, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  CoreServicesProvider,
  useCoreServices,
  type CoreServiceOverrides,
} from '../../core/CoreServicesContext';
import { EVENTS } from '../../core/EventBus';
import type { AppManifest, TabManifest } from '../contracts/ManifestSchema';
import type { ScreenBlueprint } from '../contracts/BlueprintSchema';
import type { Node } from '../contracts/NodeSchema';
import { BlueprintLoader, type BlueprintSource } from './BlueprintLoader';
import { ManifestLoader, type ManifestSource } from './ManifestLoader';
import { NodeRenderer } from './NodeRenderer';
import { LoadingScreen, LoadingDots } from './LoadingScreen';
import { createActionDispatcher } from './ActionDispatcher';
import { registerBuiltInNodes } from './nodes';
import { NavbarNode } from './nodes/navbar/NavbarNode';
import { useSlideOverlay } from './useSlideOverlay';
import { TabHeaderContext } from './TabHeaderContext';
import { TabActiveContext } from './TabActiveContext';
import { PageHeader } from './PageHeader';
import { NotificationsProvider } from './useNotifications';
import { TaskInstructionsScreen } from './TaskInstructionsScreen';
import type { TaskCardType } from './nodes/card/TaskCardNode';
import { fontFamily, navbarLayout, layout as layoutTokens, resolveBackground } from '../../theme/theme';
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

  // Pre-warm the blueprint cache for every tab in the background once the manifest loads, so the
  // first switch to each tab is instant (no loader flash) — TabView then reads them synchronously.
  useEffect(() => {
    if (!manifest) return;
    for (const tab of manifest.tabs) {
      void blueprintLoader.load(tab.viewPath).catch(() => {});
    }
  }, [manifest, blueprintLoader]);

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
    return <LoadingScreen />;
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
      <NotificationsProvider alerts={manifest.alerts}>
      <View
        style={[
          styles.container,
          { backgroundColor: resolveBackground(manifest.theme, colorScheme ?? 'light') },
        ]}
      >
        {/* The dashboard header now lives inside each tab's scroll view (bar sticky, title scrolls
            away) — see `TabPanel` / `ViewNode`. The shell no longer draws a pinned header. */}
        <View style={styles.body}>
          <TabView
            activeTabId={activeTabId}
            blueprintLoader={blueprintLoader}
            manifest={manifest}
            context={context}
          />
        </View>

        <BottomTabBar manifest={manifest} activeTabId={activeTabId} context={context} />

        {/* Full-screen slide-in overlays (over header + navbar). A pushed secondary view (settings,
            notifications inbox) slides in from the right and owns its own back-bar. */}
        <SecondaryViewHost
          top={topSecondary}
          onClose={popSecondaryView}
          manifest={manifest}
          context={context}
        />
        <TaskInstructionsHost context={context} />
      </View>
      </NotificationsProvider>
    </CoreServicesProvider>
  );
}

/* ─── Secondary view overlay ──────────────────────────────────────────── */

/**
 * Slides a pushed secondary view (settings, notifications inbox, …) in from the right over the whole
 * shell, mirroring `TaskInstructionsHost`. Driven by the shell's `secondaryStack` via `top`: it opens
 * when a view is pushed and — on the back button, edge-swipe, or Android back — slides out and then
 * pops the stack through `onClose`. It draws its own back-bar, so the shell no longer does.
 */
function SecondaryViewHost({
  top,
  onClose,
  manifest,
  context,
}: {
  top: SecondaryEntry | null;
  onClose: () => void;
  manifest: AppManifest;
  context: SDUIContext;
}) {
  const overlay = useSlideOverlay(250, onClose);
  const [current, setCurrent] = useState<SecondaryEntry | null>(top);

  // Open when a view is pushed; slide out when the stack is cleared/popped from elsewhere. Keyed on
  // the view path so a different pushed view re-triggers.
  const topKey = top?.viewUrl ?? null;
  useEffect(() => {
    if (top) {
      setCurrent(top);
      overlay.open();
    } else {
      overlay.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topKey]);

  // Fully unmount the page once the slide-out finishes (`visible` flips false in its callback).
  useEffect(() => {
    if (!overlay.visible) setCurrent(null);
  }, [overlay.visible]);

  if (!current && !overlay.visible) return null;

  const title = current ? getNodeTitle(current.blueprint) : null;
  const backdrop = resolveBackground(manifest.theme, context.colorScheme ?? 'light');

  return (
    <Animated.View
      {...overlay.panHandlers}
      style={[
        StyleSheet.absoluteFill,
        styles.secondaryOverlay,
        { backgroundColor: backdrop },
        overlay.overlayStyle,
      ]}
    >
      {/* Same back-chip + centered-title header as the registration flow / task instructions screen
          (no progress bar). */}
      <PageHeader
        onBack={overlay.close}
        title={title ?? ''}
        mode={context.colorScheme ?? 'light'}
        brandColors={context.theme.brandColors}
      />
      <View style={styles.body}>
        {current && <NodeRenderer node={current.blueprint.root} context={context} />}
      </View>
    </Animated.View>
  );
}

/* ─── Task Instructions overlay ───────────────────────────────────────── */

/** Payload carried on `EVENTS.OPEN_TASK_INSTRUCTIONS` — the tapped task's display data. */
export interface TaskInstructionsPayload {
  taskId: string;
  taskName: string;
  description?: string;
  taskType: TaskCardType;
  duration?: string;
  expirationTime?: string;
  questionNumber?: string;
}

/**
 * Listens for `OPEN_TASK_INSTRUCTIONS` (emitted when a task is tapped in `TaskListSectionNode`) and
 * slides the `TaskInstructionsScreen` in from the right over the whole shell. Lives inside
 * `CoreServicesProvider` so it can reach the schedule service to start the task. "Lets Start" runs the
 * task (for now: marks it complete — the previous tap-to-complete behavior, now gated behind the
 * instructions page); back / "Remind Me Later" just slide it away.
 */
function TaskInstructionsHost({ context }: { context: SDUIContext }) {
  const { schedule, eventBus } = useCoreServices();
  const [payload, setPayload] = useState<TaskInstructionsPayload | null>(null);
  const overlay = useSlideOverlay();

  useEffect(() => {
    const handler = (data: TaskInstructionsPayload) => {
      setPayload(data);
      overlay.open();
    };
    eventBus.on(EVENTS.OPEN_TASK_INSTRUCTIONS, handler);
    return () => eventBus.off(EVENTS.OPEN_TASK_INSTRUCTIONS, handler);
  }, [eventBus, overlay]);

  // Fully unmount the page once the slide-out finishes (overlay.visible flips false in its callback).
  useEffect(() => {
    if (!overlay.visible) setPayload(null);
  }, [overlay.visible]);

  const start = () => {
    if (payload) {
      // TODO (task flow): launch the real questionnaire/assessment for this task. For now we keep the
      // prior behavior — mark it complete — so the home list updates; the instructions page is the
      // new gate in front of it.
      void schedule.completeTask(payload.taskId).catch(() => {});
    }
    overlay.close();
  };

  if (!payload && !overlay.visible) return null;

  return (
    <Animated.View
      {...overlay.panHandlers}
      style={[StyleSheet.absoluteFill, styles.instructionsOverlay, overlay.overlayStyle]}
    >
      {payload && (
        <TaskInstructionsScreen
          taskName={payload.taskName}
          description={payload.description}
          taskType={payload.taskType}
          duration={payload.duration}
          expirationTime={payload.expirationTime}
          questionNumber={payload.questionNumber}
          onBack={overlay.close}
          onRemindLater={overlay.close}
          onStart={start}
          mode={context.colorScheme ?? 'light'}
          brandColors={context.theme.brandColors}
        />
      )}
    </Animated.View>
  );
}

/* ─── Header ──────────────────────────────────────────────────────────── */

/**
 * Derives a tab's header `Node` config from the manifest's shared `header` block. The first tab gets
 * the colored greeting; every other tab is a transparent header titled with the tab's label. The
 * shared action config (buttons + secondary-view paths) applies to all. Returns `null` when the
 * manifest declares no header. `TabPanel` provides the result via `TabHeaderContext`; `ViewNode`
 * renders it as a sticky bar + a scroll-away title.
 */
function deriveHeaderNode(manifest: AppManifest, tabId: string, context: SDUIContext): Node | null {
  const { header } = manifest;
  if (!header) return null;

  const headerRecord = header as Record<string, unknown>;
  const subtitle = typeof headerRecord.subtitle === 'string' ? headerRecord.subtitle : undefined;
  const username = header.showName ? getUsername(context) : undefined;

  const isHomeTab = tabId === manifest.tabs[0]?.id;
  const tab = manifest.tabs.find((t: TabManifest) => t.id === tabId);

  return {
    id: 'shell-header',
    type: 'HeaderNode',
    // The first tab keeps the colored navy panel + greeting; every other tab is a transparent
    // header showing the tab's label as a plain page title.
    transparent: !isHomeTab,
    backgroundColor: header.backgroundColor,
    textColor: header.textColor,
    title: isHomeTab ? header.title : tab?.label ?? header.title,
    // Raw username only — HeaderTextNode decides whether to append it next to `title`.
    name: isHomeTab ? username : undefined,
    showName: isHomeTab && header.showName === true,
    description: isHomeTab ? subtitle ?? 'Track your data and complete your daily tasks' : '',
    // Home shows the Edit affordance + the last-synced button; other tabs hide both.
    showEditButton: isHomeTab ? undefined : false,
    lastSyncedButton: isHomeTab ? undefined : false,
    // Shared action config, defined once in the manifest header and applied to every tab.
    showSettings: headerRecord.showSettings,
    showNotifications: headerRecord.showNotifications,
    settingsViewPath: headerRecord.settingsViewPath,
    notificationsViewPath: headerRecord.notificationsViewPath,
    profileIcon: header.profileIcon,
  };
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
  // Edge-to-edge: the shell draws behind the system navigation bar / home indicator. The navbar
  // should sit directly above the device's bottom safe area.
  const insets = useSafeAreaInsets();

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
    <View
      style={[
        styles.tabBarOuter,
        { paddingBottom: insets.bottom },
      ]}
    >
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
  const activeIndex = Math.max(
    0,
    manifest.tabs.findIndex((t: TabManifest) => t.id === activeTabId),
  );

  return (
    <TabPager
      activeIndex={activeIndex}
      count={manifest.tabs.length}
      renderPanel={(i) => (
        <TabPanel
          tab={manifest.tabs[i]}
          headerNode={deriveHeaderNode(manifest, manifest.tabs[i]?.id ?? '', context)}
          blueprintLoader={blueprintLoader}
          context={context}
        />
      )}
    />
  );
}

/**
 * Pager for the tab content. Cross-fades (dissolves) between tabs: all panels are stacked at the
 * same position and each fades its own opacity toward 1 when active / 0 when not, so the outgoing
 * tab fades out as the incoming one fades in. Crucially it mounts each visited tab lazily and then
 * *keeps it mounted* (keyed by index): switching back never re-mounts a heavy page, which is what
 * made the old slide lag/stutter with a from/to swap. Only the active tab receives touches; the
 * rest sit fully transparent behind it.
 */
function TabPager({
  activeIndex,
  renderPanel,
  count,
  duration = 220,
}: {
  activeIndex: number;
  renderPanel: (index: number) => React.ReactNode;
  count: number;
  duration?: number;
}) {
  const [mounted, setMounted] = useState<number[]>(() => [activeIndex]);

  useEffect(() => {
    setMounted((prev) => (prev.includes(activeIndex) ? prev : [...prev, activeIndex]));
  }, [activeIndex]);

  // Once the first tab has painted and interactions settle, render the remaining tabs in the
  // background (mounted but hidden at opacity 0). The *first* switch to each is then an instant
  // cross-fade between already-rendered, settled pages — rather than fading over a page whose cards
  // and async task data are still assembling, which is what made the first visit stutter. Deferred
  // via InteractionManager so it never delays the initial paint.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setMounted((prev) =>
        prev.length >= count ? prev : Array.from({ length: count }, (_, i) => i),
      );
    });
    return () => handle.cancel();
  }, [count]);

  return (
    <View style={styles.pagerViewport}>
      {mounted.map((i) => (
        <TabPagerPanel key={i} active={i === activeIndex} duration={duration}>
          {renderPanel(i)}
        </TabPagerPanel>
      ))}
    </View>
  );
}

function TabPagerPanel({
  active,
  duration,
  children,
}: {
  active: boolean;
  duration: number;
  children: React.ReactNode;
}) {
  // Start hidden and fade in: a panel is only ever mounted at the moment it becomes active (see
  // `mounted` above), so fading from 0 gives the incoming tab a proper cross-fade on first visit;
  // revisits and the outgoing tab animate on the `active` change below.
  const opacity = useSharedValue(0);
  // While the cross-fade runs, promote the panel to an Android hardware-texture layer so its whole
  // subtree — content *and* the views' `elevation` shadows — fades as one composited texture. Without
  // it, Android draws elevation shadows in a separate pass that ignores the animated alpha, so the
  // card content fades first while its shadow lingers (the "cards go, shadows take longer" ghosting),
  // and it re-rasterizes the heavy subtree every frame. The layer is released once settled so normal
  // scrolling isn't rasterized each frame. (`renderToHardwareTextureAndroid` is a no-op on iOS.)
  const [rasterize, setRasterize] = useState(false);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration });
    setRasterize(true);
    const done = setTimeout(() => setRasterize(false), duration + 60);
    return () => clearTimeout(done);
  }, [active, duration, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents={active ? 'auto' : 'none'}
      renderToHardwareTextureAndroid={rasterize}
    >
      {/* Expose active/focused state to this tab's nodes — they stay mounted across switches, so a
          node that wants to reset when its tab comes back into view keys an effect off this. */}
      <TabActiveContext.Provider value={active}>{children}</TabActiveContext.Provider>
    </Animated.View>
  );
}

/**
 * Renders one tab's blueprint (or its loading/error state). Blueprints are cached and pre-warmed, so
 * `peek` returns them synchronously — switching to an already-visited tab renders instantly with no
 * loader flash, and both panels a `StepSlider` shows mid-slide draw immediately.
 */
function TabPanel({
  tab,
  headerNode,
  blueprintLoader,
  context,
}: {
  tab: TabManifest | undefined;
  headerNode: Node | null;
  blueprintLoader: BlueprintLoader;
  context: SDUIContext;
}) {
  const viewPath = tab?.viewPath;
  const cached = viewPath ? blueprintLoader.peek(viewPath) : undefined;
  const [loaded, setLoaded] = useState<{ path: string; blueprint: ScreenBlueprint } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!viewPath || cached) return; // cached — rendered directly below, nothing to load
    let cancelled = false;
    blueprintLoader
      .load(viewPath)
      .then((bp) => {
        if (!cancelled) setLoaded({ path: viewPath, blueprint: bp });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [viewPath, cached, blueprintLoader]);

  const blueprint = cached ?? (loaded && loaded.path === viewPath ? loaded.blueprint : null);

  if (!tab) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Tab not found</Text>
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
        <LoadingDots />
      </View>
    );
  }

  return (
    <TabHeaderContext.Provider value={headerNode}>
      <NodeRenderer node={blueprint.root} context={context} />
    </TabHeaderContext.Provider>
  );
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
  /* Task instructions slide-in overlay — above the floating navbar (elevation 6) on Android. Rounded
     + clipped so it reads as a rounded card as it slides over the screen behind it. */
  instructionsOverlay: {
    zIndex: 100,
    elevation: 24,
    borderRadius: layoutTokens.radiusScreen,
    overflow: 'hidden',
  },
  /* Secondary view (settings / notifications inbox) slide-in overlay — same rounded, elevated card
     treatment as the task instructions overlay, above the floating navbar. */
  secondaryOverlay: {
    zIndex: 100,
    elevation: 24,
    borderRadius: layoutTokens.radiusScreen,
    overflow: 'hidden',
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
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
  },
  secondaryTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
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
  /* Tab pager viewport — clips the off-screen tab panels sliding in/out. */
  pagerViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  /* Bottom tab bar */
  tabBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    // paddingBottom is applied inline — max(bottom safe-area inset, navbarLayout.outerPaddingBottom) —
    // so the floating pill clears the system navigation bar / home indicator in edge-to-edge mode.
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
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
    color: '#dc3545',
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    color: '#6c757d',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    color: '#6c757d',
  },
});

