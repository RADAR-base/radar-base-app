import { createContext } from 'react';

/**
 * Whether the tab subtree reading this is the currently-active (focused) tab. The shell's `TabPager`
 * keeps every visited tab mounted (so switching back never re-mounts a heavy page), which means a
 * tab's nodes don't unmount/remount when you navigate away and back. Nodes that want to reset
 * transient view state when their tab comes back into view can read this and key an effect off it —
 * e.g. `CalendarNode` resetting its selected date to today.
 *
 * Defaults to `true` so nodes used outside the pager (tests, direct blueprint use) behave as focused.
 */
export const TabActiveContext = createContext<boolean>(true);
