import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DoneIcon from '../../../../theme/icons/done.svg';
import CheckIcon from '../../../../theme/icons/check.svg';
import MissedIcon from '../../../../theme/icons/missed.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import type { NodeProps } from '../../types';

type ToDoStatus = 'allCompleted' | 'someMissed' | 'allMissed';

const COPY: Record<ToDoStatus, { title: string; lines: string[] }> = {
  allCompleted: {
    title: "You're all caught up",
    lines: ["You've completed every task for today.", 'Thank you for taking part!'],
  },
  someMissed: {
    title: "That's it for now",
    lines: ['You have no more tasks scheduled at the moment.', 'We will remind you when new tasks are ready.'],
  },
  allMissed: {
    title: 'We missed you',
    lines: ['No need to worry', "We'll remind you when tomorrow's tasks are ready."],
  },
};

/**
 * Derives which of the three states to render from raw counts, per the spec: all tasks
 * done → `allCompleted`; none done (and at least one task existed) → `allMissed`;
 * anything in between, including a day with no tasks at all, → `someMissed` (its Figma
 * copy — "no more tasks scheduled" — already reads correctly for the zero-task case).
 */
function deriveStatus(completed: number, total: number): ToDoStatus {
  if (total <= 0) return 'someMissed';
  if (completed >= total) return 'allCompleted';
  if (completed <= 0) return 'allMissed';
  return 'someMissed';
}

/**
 * End-of-day task status banner — matches the Figma `TaskStatus` component set (node
 * 2923:3189), which exposes a `taskCompleted` variant (AllCompleted / SomeMissed /
 * AllMissed). Rather than taking that variant directly, this derives it from `completed`/
 * `total` task counts (`node.completed`, `node.total`) so blueprint authors just wire up
 * real numbers instead of pre-computing the state.
 *
 * Figma shows no light/dark variant for the three background colors (see `theme.ts`'s
 * `toDoStatus` tokens, fixed regardless of `context.colorScheme`), but the icon/text
 * color is bound to `var(--card/task/background, white)` — i.e. `tokens.card.task.
 * background`, which *does* vary (white in light mode, near-black in dark mode) — so
 * that's read live off `context.colorScheme` rather than hardcoded white.
 *
 * The checkmark badge (allCompleted/someMissed) is `done.svg` (badge shape) and
 * `check.svg` (checkmark stroke) stacked, each a plain single-color fill/stroke —
 * deliberately not one file using an SVG `<mask>` or `fill-rule="evenodd"` hole, both of
 * which turned out unreliable on iOS. `done.svg` is colored with the page background
 * (`tokens.background.primary`) and `check.svg` with the current banner's own
 * background, so the checkmark still reads as "cut out" without any masking/compositing.
 */
export function ToDoStatusNode({ node, context }: NodeProps) {
  const completed = typeof node.completed === 'number' ? node.completed : 0;
  const total = typeof node.total === 'number' ? node.total : 0;
  const status = deriveStatus(completed, total);

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const backgroundColor = tokens.toDoStatus[status];
  const foreground = tokens.card.task.background;
  const copy = COPY[status];
  const iconSize = status === 'allMissed' ? { width: 43, height: 43 } : { width: 39, height: 40 };

  return (
    <View style={[styles.card, { backgroundColor }]}>
      {status === 'allMissed' ? (
        <MissedIcon width={iconSize.width} height={iconSize.height} color={foreground} />
      ) : (
        <View style={{ width: iconSize.width, height: iconSize.height }}>
          <DoneIcon width={iconSize.width} height={iconSize.height} color={tokens.background.primary} />
          <View style={StyleSheet.absoluteFill}>
            <CheckIcon width={iconSize.width} height={iconSize.height} color={backgroundColor} />
          </View>
        </View>
      )}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: foreground }]}>{copy.title}</Text>
        {copy.lines.map((line) => (
          <Text key={line} style={[styles.subtitle, { color: foreground }]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: layoutTokens.gap,
    borderRadius: layoutTokens.radiusCard,
    gap: layoutTokens.gap,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#085041',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  textBlock: {
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  title: {
    fontSize: layoutTokens.headingFontSize,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: layoutTokens.captionFontSize,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
    textAlign: 'center',
  },
});
