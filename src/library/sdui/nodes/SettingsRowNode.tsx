import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { tracking, fontFamily, getColorTokens, withAlpha, layout } from '../../../theme/theme';
import type { NodeProps } from '../types';

/**
 * Settings row — themed, spec-driven. Renders:
 *   [icon?]  [label, flex 1]  [value?]  [trailing control by variant]
 *
 * Blueprint props:
 *   - `label` (string, required) — primary text, left-aligned
 *   - `value` (string, optional) — right-aligned secondary text (supports `{{template}}`)
 *   - `variant` — `"value"` | `"toggle"` | `"link"` | `"action"`
 *   - `icon` (string, optional) — leading tinted icon badge. No icon = no empty slot.
 *   - `defaultOn` (boolean, optional) — initial toggle state for `variant: "toggle"`
 *   - `eventName` (string, optional) — event fired on toggle change or row press
 *   - `url` (string, optional) — URL for `variant: "link"` (opens external)
 *   - `action` (string, optional) — action type for `variant: "action"`
 *   - `showDivider` (boolean, optional) — divider below the row, explicit per row
 */
export function SettingsRowNode({ node, context }: NodeProps) {
  const label = typeof node.label === 'string' ? node.label : '';
  const value = typeof node.value === 'string' ? node.value : undefined;
  const variant = typeof node.variant === 'string' ? node.variant : 'value';
  const icon = typeof node.icon === 'string' ? node.icon : undefined;
  const defaultOn = node.defaultOn === true;
  const showDivider = node.showDivider === true;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);

  // Theme-derived colors — no hardcoded values
  const onSurface = tokens.text.primary;
  const onSurfaceVariant = tokens.card.stats.description;
  const primaryColor = tokens.button.background;
  const surfaceVariant = tokens.card.stats.openBadge;
  const surfaceVariantIcon = tokens.card.stats.openIcon;
  const iconBadgeBg = withAlpha(primaryColor, 0.1);
  const dividerColor = withAlpha(onSurface, 0.7);
  const switchTrackOff = withAlpha(onSurface, 0.15);

  const [toggled, setToggled] = useState(defaultOn);

  // Unknown variant — render label-only with warning
  const knownVariants = ['value', 'toggle', 'link', 'action'];
  if (!knownVariants.includes(variant)) {
    if (__DEV__) console.warn(`[SettingsRowNode] Unknown variant "${variant}", rendering as label-only`);
  }

  const handleToggle = (val: boolean) => {
    setToggled(val);
    if (typeof node.eventName === 'string') {
      context.dispatch({
        type: 'TriggerEvent',
        eventName: node.eventName,
        payload: { value: val, rowId: node.id },
      });
    }
  };

  const handlePress = () => {
    if (variant === 'toggle') {
      handleToggle(!toggled);
      return;
    }
    if (variant === 'link' && typeof node.url === 'string') {
      context.dispatch({ type: 'OpenExternalUrl', url: node.url });
    } else if (variant === 'action') {
      const action = typeof node.action === 'string' ? node.action : 'TriggerEvent';
      if (action === 'TriggerEvent') {
        context.dispatch({
          type: 'TriggerEvent',
          eventName: typeof node.eventName === 'string' ? node.eventName : '',
          payload: { rowId: node.id },
        });
      } else if (action === 'OpenCustomView') {
        context.dispatch({
          type: 'OpenCustomView',
          viewUrl: typeof node.viewUrl === 'string' ? node.viewUrl : '',
        });
      }
    }
  };

  const isTappable = variant === 'toggle' || variant === 'link' || variant === 'action';
  const isValueBold = variant === 'toggle';

  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.iconBadge, { backgroundColor: iconBadgeBg }]}>
          <SettingsIcon name={icon} color={primaryColor} />
        </View>
      )}
      <Text
        style={[styles.label, { color: onSurface }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <View style={styles.right}>
        {value != null && (
          <Text
            style={[
              styles.value,
              { color: onSurfaceVariant },
              isValueBold && styles.valueBold,
            ]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {value}
          </Text>
        )}
        {variant === 'toggle' && (
          // pointerEvents="none" so taps fall through to the row Pressable — no double-toggle
          <View pointerEvents="none">
            <Switch
              value={toggled}
              onValueChange={handleToggle}
              trackColor={{ false: switchTrackOff, true: primaryColor }}
              thumbColor="#FFFFFF"
            />
          </View>
        )}
        {variant === 'link' && (
          <View style={[styles.trailButton, { backgroundColor: surfaceVariant }]}>
            <ExternalLinkIcon color={surfaceVariantIcon} />
          </View>
        )}
        {variant === 'action' && (
          <View style={[styles.trailButton, { backgroundColor: surfaceVariant }]}>
            <ArrowRightIcon color={surfaceVariantIcon} />
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View>
      {isTappable ? (
        <Pressable
          accessibilityRole="button"
          onPress={handlePress}
          style={({ pressed }) => pressed && styles.pressed}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      {showDivider && (
        <View style={[styles.divider, { backgroundColor: dividerColor }]} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ExternalLinkIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ArrowRightIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12h14M12 5l7 7-7 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Minimal icon glyph for the settings badge. Maps known names to simple SVG paths. */
function SettingsIcon({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const paths: Record<string, string> = {
    bell: 'M10 17.5a2 2 0 01-4 0M14 8A5 5 0 004 8c0 5-2 7-2 7h16s-2-2-2-7',
    clock: 'M10 3a7 7 0 100 14 7 7 0 000-14zm0 3v4l3 2',
    info: 'M10 3a7 7 0 100 14 7 7 0 000-14zm0 5v4m0-7h.01',
    'help-circle': 'M10 3a7 7 0 100 14 7 7 0 000-14zm-1.5 5a1.5 1.5 0 013 0c0 1-1.5 1.25-1.5 2.5m0 1.5h.01',
    shield: 'M10 2L3 5v4.5c0 4.5 3.5 7 7 8.5 3.5-1.5 7-4 7-8.5V5l-7-3z',
    refresh: 'M17 3v5h-5M3 17v-5h5M3 10a7 7 0 0112.9-3.5M17 10a7 7 0 01-12.9 3.5',
    'log-out': 'M13 3h3a1 1 0 011 1v12a1 1 0 01-1 1h-3M8 17l5-5-5-5M13 12H3',
  };

  const d = paths[name];
  if (!d) {
    return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.3 }} />;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d={d}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Layout constants (from spec wireframe, in theme spacing units)
// ---------------------------------------------------------------------------

const ICON_CONTAINER = 52;
const ICON_GAP = 26;
const TRAIL_BUTTON_SIZE = 28;
const DIVIDER_INSET = 30;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 84,
    paddingVertical: 18,
  },
  pressed: {
    opacity: 0.6,
  },
  iconBadge: {
    width: ICON_CONTAINER,
    height: ICON_CONTAINER,
    borderRadius: ICON_CONTAINER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: ICON_GAP,
  },
  label: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '50%',
    gap: 12,
    marginLeft: 12,
  },
  value: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
    flexShrink: 1,
  },
  valueBold: {
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
  },
  trailButton: {
    width: TRAIL_BUTTON_SIZE,
    height: TRAIL_BUTTON_SIZE,
    borderRadius: TRAIL_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: DIVIDER_INSET,
  },
});
