import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getColorTokens, headerLayout, layout as layoutTokens } from '../../../../theme/theme';
import type { NodeProps } from '../../types';

/**
 * Greeting + description row of the dashboard header — matches the Figma `HeaderTitle`
 * component set (node 2139:2463), which exposes one boolean variant: `name`.
 *
 *   - `name=true`  → "Hello {name}"
 *   - `name=false` → "Welcome"
 *
 * Both variants share the description line and trailing "Edit" button.
 */
export function HeaderTextNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : undefined;
  const name = typeof node.name === 'string' ? node.name : undefined;
  // Opt-in, unlike showActions/showEditButton below — default to false so a name isn't
  // appended unless the manifest explicitly asks for it.
  const showName = node.showName === true;
  const description = typeof node.description === 'string' ? node.description : '';
  const showEditButton = node.showEditButton !== false;
  const editLabel = typeof node.editLabel === 'string' ? node.editLabel : 'Edit';

  const tokens = getColorTokens(context.colorScheme ?? 'light');
  const textColor = typeof node.textColor === 'string' ? node.textColor : tokens.header.text;
  const descriptionColor =
    typeof node.descriptionColor === 'string' ? node.descriptionColor : textColor;
  const buttonBg =
    typeof node.buttonBackgroundColor === 'string'
      ? node.buttonBackgroundColor
      : tokens.header.buttonBackground;
  const buttonTextColor =
    typeof node.buttonTextColor === 'string' ? node.buttonTextColor : tokens.header.buttonIcon;
  // Prefer the app-manifest's `theme.button.borderRadius` (config) over a hardcoded
  // default, matching the convention already used by CardNode / ActionNode.
  const buttonBorderRadius = context.theme.button?.borderRadius ?? layoutTokens.radiusPill;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        {title ? (
          <>
            <Text style={[styles.heading, { color: textColor }]}>{title}</Text>
            {showName && name && (
              <Text style={[styles.heading, { color: textColor }]}>{name}</Text>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.heading, { color: textColor }]}>{name ? 'Hello' : 'Welcome'}</Text>
            {name && <Text style={[styles.heading, { color: textColor }]}>{name}</Text>}
          </>
        )}
      </View>
      <View style={styles.subRow}>
        {description !== '' && (
          <Text style={[styles.description, { color: descriptionColor }]} numberOfLines={1}>
            {description}
          </Text>
        )}
        {showEditButton && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={editLabel}
            onPress={() =>
              context.dispatch({
                type: 'TriggerEvent',
                eventName: typeof node.editEventName === 'string' ? node.editEventName : 'HeaderEdit',
              })
            }
            style={[styles.editButton, { backgroundColor: buttonBg, borderRadius: buttonBorderRadius }]}
          >
            <Text style={[styles.editLabel, { color: buttonTextColor }]}>{editLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: headerLayout.gap,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: headerLayout.gap,
  },
  heading: {
    fontSize: 40,
    lineHeight: 40,
    fontWeight: '400',
    letterSpacing: headerLayout.letterSpacing,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  description: {
    flexShrink: 1,
    fontSize: 14,
    letterSpacing: headerLayout.letterSpacing,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginLeft: 12,
  },
  editLabel: {
    fontSize: headerLayout.captionFontSize,
    letterSpacing: headerLayout.letterSpacing,
  },
});
