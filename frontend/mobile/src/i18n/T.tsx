import { Text, type TextProps } from "react-native";

import { useLanguage } from "./LanguageContext";

/** Use for app-owned copy; keep user-authored text in native Text. */
export function T({ children, ...props }: TextProps) {
  const { language, t } = useLanguage();
  const copy = typeof children === "string" && language === "tr"
    ? t(children.trim().replace(/\s+/g, " "))
    : children;
  return <Text {...props}>{copy}</Text>;
}
