import { createContext, useContext } from 'react';

/**
 * Lets a deeply-nested node temporarily disable the scrolling of the `ViewNode` ScrollView
 * it lives in — e.g. while dragging across `LineGraphCardNode`'s plot, so the page doesn't
 * scroll at the same time. `ViewNode` provides it; interactive nodes consume it via
 * `useScrollLock()`. Defaults to a no-op so nodes work outside a ViewNode too.
 */
export interface ScrollLockControls {
  setLocked: (locked: boolean) => void;
}

export const ScrollLockContext = createContext<ScrollLockControls>({ setLocked: () => {} });

export function useScrollLock(): ScrollLockControls {
  return useContext(ScrollLockContext);
}
