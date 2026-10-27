import { forwardRef } from "react";
import { Pressable, type PressableProps, type View } from "react-native";

import { useLanguage } from "./LanguageContext";
import { accessibilityCopy } from "./accessibility";

export const LocalizedPressable = forwardRef<View, PressableProps>(function LocalizedPressable(
  { accessibilityLabel, accessibilityHint, ...props },
  ref,
) {
  const { language } = useLanguage();
  return (
    <Pressable
      {...props}
      ref={ref}
      accessibilityLabel={accessibilityLabel ? accessibilityCopy(language, accessibilityLabel) : undefined}
      accessibilityHint={accessibilityHint ? accessibilityCopy(language, accessibilityHint) : undefined}
    />
  );
});
