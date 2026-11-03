import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from "react-native";

// Android draws modal windows edge to edge, so the system no longer shrinks
// them when the keyboard opens and the lower fields end up underneath it.
// Use this in place of a modal's backdrop view to lift the sheet above the
// keyboard instead.
export function KeyboardAvoidingOverlay({
  children,
  style,
}: {
  children: ReactNode;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "android" ? "padding" : undefined}
      style={style}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
