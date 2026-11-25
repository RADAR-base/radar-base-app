import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';
import { TextInputField } from './TextInputField';
import { ModalHeader, ModalShell } from './ModalShell';

/**
 * "Enter Study Name" modal — Figma node 3120:1253. A close (X) button, a title + description,
 * a text input, and a search button, shown over a dimmed backdrop. Opened from the WelcomeCard's
 * "Sign Up" action. Colors follow the device color scheme (or an explicit `mode`) and `brandColors`.
 */
export interface StudyNameModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the entered study name when the search button is pressed. */
  onSubmit?: (studyName: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  ctaLabel?: string;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  /** Manifest brand colors, threaded so the title/button track the app's primary. */
  brandColors?: ThemeColorOverrides;
}

export function StudyNameModal({
  visible,
  onClose,
  onSubmit,
  title = 'Enter Study Name',
  description = 'Enter the study name and we will search for their study enrolment portal',
  placeholder = 'Study name',
  ctaLabel = 'Search Study',
  mode,
  brandColors,
}: StudyNameModalProps) {
  const [studyName, setStudyName] = useState('');
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const brand = tokens.button.background; // navy — title + button, follows brandColors.primary
  const onBrand = tokens.navbar.text.primary; // white — button label

  const handleClose = () => {
    setStudyName('');
    onClose();
  };

  const handleSubmit = () => onSubmit?.(studyName.trim());

  return (
    <ModalShell visible={visible} onClose={handleClose} brandColors={brandColors} avoidKeyboard>
      <ModalHeader title={title} subtitle={description} onClose={handleClose} brandColors={brandColors} />

      <View style={styles.form}>
        <TextInputField
          value={studyName}
          onChangeText={setStudyName}
          placeholder={placeholder}
          mode={resolvedMode}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
        />

        <TouchableOpacity
          accessibilityRole="button"
          onPress={handleSubmit}
          style={[styles.button, { backgroundColor: brand }]}
        >
          <Text style={[styles.buttonLabel, { color: onBrand }]}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  form: {
    width: '100%',
    gap: 40, // Figma gap between input and button (node 3122:3517)
  },
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: layout.radiusPill,
    minHeight: 52,
  },
  buttonLabel: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false, // Android: keeps the label vertically centered in the button
  },
});
