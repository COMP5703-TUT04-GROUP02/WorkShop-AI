import DateTimePicker from "@react-native-community/datetimepicker";
import { createElement, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/theme";
import {
  fromDatetimeLocalValue,
  parseDateTime,
  toDatetimeLocalValue,
} from "../utils/datetime";

type DateTimeFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function DateTimeField({ label, value, onChange }: DateTimeFieldProps) {
  const parsed = parseDateTime(value);

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        {createElement("input", {
          type: "datetime-local",
          value: parsed ? toDatetimeLocalValue(parsed) : "",
          onChange: (event: { target: { value: string } }) => {
            onChange(fromDatetimeLocalValue(event.target.value));
          },
          style: webInputStyle,
        })}
      </View>
    );
  }

  return (
    <NativeDateTimeField date={parsed} label={label} onChange={onChange} />
  );
}

function NativeDateTimeField({
  date,
  label,
  onChange,
}: {
  date: Date | null;
  label: string;
  onChange: (value: string) => void;
}) {
  const [pickerMode, setPickerMode] = useState<"date" | "time" | "datetime" | null>(
    null,
  );
  const pickerValue = date ?? new Date();

  function commit(next: Date) {
    onChange(fromDatetimeLocalValue(toDatetimeLocalValue(next)));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          setPickerMode(Platform.OS === "ios" ? "datetime" : "date")
        }
        style={styles.nativeButton}
      >
        <Text
          style={[
            styles.nativeButtonText,
            date ? null : styles.nativeButtonPlaceholder,
          ]}
        >
          {date
            ? date.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Select date and time"}
        </Text>
      </Pressable>
      {pickerMode ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "spinner" : "default"}
          mode={pickerMode === "datetime" ? "datetime" : pickerMode}
          onChange={(_, selectedDate) => {
            if (!selectedDate) {
              setPickerMode(null);
              return;
            }

            if (pickerMode === "date" && Platform.OS === "android") {
              const next = new Date(pickerValue);
              next.setFullYear(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                selectedDate.getDate(),
              );
              commit(next);
              setPickerMode("time");
              return;
            }

            if (pickerMode === "time" && Platform.OS === "android") {
              const next = new Date(pickerValue);
              next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
              commit(next);
              setPickerMode(null);
              return;
            }

            commit(selectedDate);
            if (Platform.OS !== "ios") {
              setPickerMode(null);
            }
          }}
          value={pickerValue}
        />
      ) : null}
    </View>
  );
}

const webInputStyle = {
  minHeight: 48,
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: "0 16px",
  fontSize: 16,
  color: colors.text,
  backgroundColor: colors.background,
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  nativeButton: {
    minHeight: 48,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  nativeButtonText: {
    color: colors.text,
    fontSize: 16,
  },
  nativeButtonPlaceholder: {
    color: colors.mutedText,
  },
});
