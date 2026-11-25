import { createContext } from 'react';
import type { Node } from '../contracts/NodeSchema';

/**
 * Carries the (globally-configured, per-tab-derived) header config from the shell down to the tab's
 * `ViewNode`, which renders the bar as a sticky scroll header and lets the title scroll away beneath
 * it. `null` (the default, and for secondary views) means "no header" — those draw their own
 * `PageHeader` instead.
 */
export const TabHeaderContext = createContext<Node | null>(null);
