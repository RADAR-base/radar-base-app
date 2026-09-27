import React, { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether the app's own loading chrome has finished and the participant is looking at the app.
 *
 * `AppShell` draws its `LoadingScreen` *over* the content, and the content already holds a mounted
 * `SDUIShell` — so "the shell is rendering" is not the same as "the participant can see it". Anything
 * that greets someone on arrival has to wait for this, or it opens behind the loading screen and is
 * half over by the time the screen fades.
 *
 * Defaults to `true`: a host that embeds `SDUIShell` directly draws no loading chrome of its own, so
 * for it there is nothing to wait for.
 */
const AppChromeReadyContext = createContext(true);

export function AppChromeReadyProvider({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  return <AppChromeReadyContext.Provider value={ready}>{children}</AppChromeReadyContext.Provider>;
}

export function useAppChromeReady(): boolean {
  return useContext(AppChromeReadyContext);
}
