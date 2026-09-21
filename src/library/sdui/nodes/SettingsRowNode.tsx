import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import type { NodeProps } from '../types';
import { fontFamily } from '../../../theme/theme';

/**
 * A flexible settings row. Renders a horizontal row with:
 *   - Optional leading icon circle
 *   - Label (left-aligned)
 *   - Right side: value text, toggle switch, external-link icon, or arrow icon
 *
 * Blueprint props:
 *   - `label` (string) — the row label
 *   - `value` (string, optional) — right-aligned value text (supports `{{template}}`)
 *   - `variant` — `"value"` (default) | `"toggle"` | `"link"` | `"action"`
 *   - `icon` (string, optional) — shows a leading icon circle
 *   - `defaultOn` (boolean, optional) — initial toggle state for `variant: "toggle"`
 *   - `eventName` (string, optional) — event fired on toggle change or row press
 *   - `url` (string, optional) — URL for `variant: "link"` (opens external)
 *   - `action` (string, optional) — action type for `variant: "action"`
 *   - `showDivider` (boolean, optional) — shows a divider line below the row
 */
export function SettingsRowNode({ node, context }: NodeProps) {
  const label = typeof node.label === 'string' ? node.label : '';
  const value = typeof node.value === 'string' ? node.value : undefined;
  const variant = typeof node.variant === 'string' ? node.variant : 'value';
  const icon = typeof node.icon === 'string' ? node.icon : undefined;
  const defaultOn = node.defaultOn === true;
  const showDivider = node.showDivider === true;
  const theme = context.theme;

  const [toggled, setToggled] = useState(defaultOn);

  const handleToggle = (val: boolean) => {
    setToggled(val);
    if (typeof node.eventName === 'string') {
      context.dispatch({
        type: 'TriggerEvent',
        eventName: node.eventName,
        payload: { value: val },
      });
    }
  };

  const handlePress = () => {
    if (variant === 'link' && typeof node.url === 'string') {
      context.dispatch({ type: 'OpenExternalUrl', url: node.url });
    } else if (variant === 'action') {
      const action = typeof node.action === 'string' ? node.action : 'TriggerEvent';
      if (action === 'TriggerEvent') {
        context.dispatch({
          type: 'TriggerEvent',
          eventName: typeof node.eventName === 'string' ? node.eventName : '',
        });
      } else if (action === 'OpenCustomView') {
        context.dispatch({
          type: 'OpenCustomView',
          viewUrl: typeof node.viewUrl === 'string' ? node.viewUrl : '',
        });
      }
    }
  };

  const isTappable = variant === 'link' || variant === 'action';

  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.iconCircle, { backgroundColor: theme.primaryColor ?? '#1e3557' }]} />
      )}
      <Text style={[styles.label, icon && styles.labelWithIcon]} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.right}>
        {value != null && <Text style={styles.value}>{value}</Text>}
        {variant === 'toggle' && (
          <Switch
            value={toggled}
            onValueChange={handleToggle}
            trackColor={{ false: '#D1D5DB', true: theme.primaryColor ?? '#1e3557' }}
            thumbColor="#FFFFFF"
          />
        )}
        {variant === 'link' && (
          <Text style={styles.trailingIcon}>↗</Text>
        )}
        {variant === 'action' && (
          <Text style={styles.trailingIcon}>→</Text>
        )}
      </View>
    </View>
  );

  const wrapped = isTappable ? (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.6}>
      {content}
    </TouchableOpacity>
  ) : content;

  if (showDivider) {
    return (
      <View>
        {wrapped}
        <View style={styles.divider} />
      </View>
    );
  }

  return wrapped;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 40,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    color: '#1A1A1A',
    includeFontPadding: false,
  },
  labelWithIcon: {
    marginRight: 8,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    color: '#1A1A1A',
    includeFontPadding: false,
  },
  trailingIcon: {
    fontSize: 18,
    color: '#9CA3AF',
    includeFontPadding: false,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginTop: 8,
    marginBottom: 4,
  },
});
