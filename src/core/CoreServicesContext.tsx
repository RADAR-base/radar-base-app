/**
 * React context + provider for the core service layer.
 *
 * The provider creates services once (via `ServiceContainer`), wires their lifecycle
 * (via `ServiceLifecycle`), and exposes them through context. Everything else — the DI
 * wiring, no-op defaults, lifecycle hooks — lives in its own module.
 */
import React, { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createServices, type ServiceBag, type ServiceOverrides } from './ServiceContainer';
import { useServicesLifecycle } from './ServiceLifecycle';

// Re-export so existing consumers don't need to change their imports.
export type { ServiceOverrides as CoreServiceOverrides } from './ServiceContainer';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CoreServices extends ServiceBag {
  /** True once all core services have initialised (config, schedule, protocol, questionnaires). */
  servicesReady: boolean;
  /** True while sign-out cleanup is in progress (tokens cleared, services tearing down). */
  signingOut: boolean;
}

const CoreServicesContext = createContext<CoreServices | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface CoreServicesProviderProps {
  children: ReactNode;
  overrides?: ServiceOverrides;
}

export function CoreServicesProvider({ children, overrides = {} }: CoreServicesProviderProps) {
  // If already inside a CoreServicesProvider, reuse the parent context
  // instead of creating duplicate service instances (avoids double-init issues).
  const parentContext = useContext(CoreServicesContext);
  if (parentContext) return <>{children}</>;

  return <CoreServicesProviderInner overrides={overrides}>{children}</CoreServicesProviderInner>;
}

function CoreServicesProviderInner({ children, overrides = {} }: CoreServicesProviderProps) {
  const [servicesReady, setServicesReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Create all services exactly once so they survive re-renders.
  const servicesRef = useRef<ServiceBag | null>(null);
  if (!servicesRef.current) {
    servicesRef.current = createServices(overrides);
  }
  const services = servicesRef.current;

  // Stable callbacks — avoids re-triggering the lifecycle hook on every render.
  const markReady = useCallback(() => setServicesReady(true), []);
  const markNotReady = useCallback(() => setServicesReady(false), []);
  const markSigningOut = useCallback((active: boolean) => setSigningOut(active), []);

  useServicesLifecycle(services, {
    onReady: markReady,
    onNotReady: markNotReady,
    onSigningOut: markSigningOut,
  });

  const value: CoreServices = { ...services, servicesReady, signingOut };

  return (
    <CoreServicesContext.Provider value={value}>
      {children}
    </CoreServicesContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useCoreServices = (): CoreServices => {
  const context = useContext(CoreServicesContext);
  if (!context) {
    throw new Error('useCoreServices must be used within a CoreServicesProvider');
  }
  return context;
};

// Individual service hooks for convenience
export const useDataService = () => useCoreServices().data;
export const useEventBus = () => useCoreServices().eventBus;
export const useApiService = () => useCoreServices().api;
export const useAppServerService = () => useCoreServices().appServer;
export const useTokenService = () => useCoreServices().token;
export const useAnalyticsService = () => useCoreServices().analytics;
export const useCacheService = () => useCoreServices().cache;
export const useKafkaService = () => useCoreServices().kafka;
export const useConfigService = () => useCoreServices().config;
export const useAuthService = () => useCoreServices().auth;
export const useNotificationService = () => useCoreServices().notifications;
export const useScheduleService = () => useCoreServices().schedule;
export const useQuestionnaireDataService = () => useCoreServices().questionnaireData;
export const useDataPipeline = () => useCoreServices().dataPipeline;
export const useSubjectConfigService = () => useCoreServices().subjectConfig;
export const useAudioRecordService = () => useCoreServices().audioRecord;
export const useHealthKitService = () => useCoreServices().healthKit;

/** True once all core services have initialised (or been skipped for unauthenticated users). */
export function useServicesReady(): boolean {
  return useCoreServices().servicesReady;
}

/** True while sign-out cleanup is in progress. */
export function useSigningOut(): boolean {
  return useCoreServices().signingOut;
}

