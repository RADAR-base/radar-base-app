import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * The page's scroll, for content that pins itself under the header bar (the data filter): the scroll
 * offset, the pinned bar's height, and where the page body starts.
 */
export interface PageScroll {
  scrollY: SharedValue<number>;
  /** How far below the top of the scroll view pinned content rests: the pinned header bar's height. */
  pinTop: SharedValue<number>;
  /** Where the page body starts in the scroll content, so a body child knows its content y. */
  bodyTop: SharedValue<number>;
}

export const PageScrollContext = createContext<PageScroll | null>(null);

export function usePageScroll(): PageScroll | null {
  return useContext(PageScrollContext);
}
