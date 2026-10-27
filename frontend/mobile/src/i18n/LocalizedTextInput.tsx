import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";

import { useLanguage } from "./LanguageContext";
import { accessibilityCopy } from "./accessibility";

export const LocalizedTextInput = forwardRef<TextInput, TextInputProps>(function LocalizedTextInput(
  { placeholder, accessibilityLabel, accessibilityHint, ...props },
  ref,
) {
  const { language, t } = useLanguage();
  return (
    <TextInput
      {...props}
      ref={ref}
      placeholder={placeholder ? t(placeholder) : undefined}
      accessibilityLabel={accessibilityLabel ? accessibilityCopy(language, accessibilityLabel) : undefined}
      accessibilityHint={accessibilityHint ? accessibilityCopy(language, accessibilityHint) : undefined}
    />
  );
});
