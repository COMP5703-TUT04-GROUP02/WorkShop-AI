import { LocalizedTextInput } from "../i18n/LocalizedTextInput";
import {
  KeyboardTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import { colors, radius, spacing } from "../theme/theme";
import { useLanguage } from "../i18n/LanguageContext";

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  editable?: boolean;
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
  error?: string;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  multiline = false,
  numberOfLines,
  maxLength,
  editable = true,
  onSubmitEditing,
  error,
}: TextFieldProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t(label)}</Text>
      <LocalizedTextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder ? t(placeholder) : undefined}
        placeholderTextColor={colors.mutedText}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        numberOfLines={numberOfLines}
        style={[
          styles.input,
          multiline ? styles.multilineInput : null,
          !editable ? styles.inputDisabled : null,
        ]}
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  multilineInput: {
    minHeight: 104,
    paddingTop: spacing.md,
  },
  inputDisabled: {
    backgroundColor: colors.surface,
    color: colors.mutedText,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
});
