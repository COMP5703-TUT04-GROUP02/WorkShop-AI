import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronDown, ChevronRight, ChevronUp, Search } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getCustomerFaq } from "../api/faq";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAuth } from "../context/AuthContext";
import { filterFaq, findFaqItem } from "../features/help/faq-filter";
import type { LegalDocument, RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme/theme";
import type { FaqCategory, FaqItem } from "../types/faq";
import { getErrorMessage } from "../utils/errors";

const CONTACT = [
  {
    title: "Email us",
    body: "support@workshop.ai — demo only, replies are not monitored.",
  },
  {
    title: "Live chat",
    body: "Chat with the support team from inside the app. Coming soon.",
  },
];

const LEGAL: { document: LegalDocument; title: string }[] = [
  { document: "privacy", title: "Privacy Policy" },
  { document: "terms", title: "Terms of Use" },
];

export function HelpScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Help">>();
  const { user } = useAuth();
  // Provider answers are a separate file that does not exist yet; customer
  // answers would mislead a provider, so they see contact and legal only.
  const showFaq = user?.role !== "provider";

  return (
    <ScreenContainer>
      <Text style={styles.title}>Help and Support</Text>

      {showFaq ? <FaqSection initialFaqId={route.params?.faqId} /> : null}
      <Section title="Contact us" items={CONTACT} />

      {/* WS-90. Signed-in entry point to the same pages the register form uses. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
        {LEGAL.map((item) => (
          <Pressable
            key={item.document}
            accessibilityRole="link"
            onPress={() =>
              navigation.navigate("Legal", { document: item.document })
            }
            style={({ pressed }) => [
              styles.card,
              styles.linkCard,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <ChevronRight color={colors.mutedText} size={20} />
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

function FaqSection({ initialFaqId }: { initialFaqId?: string }) {
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [categoryTitle, setCategoryTitle] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkedItem, setLinkedItem] = useState<FaqItem | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getCustomerFaq()
      .then((result) => {
        if (!active) return;
        setCategories(result);
        // A link to one answer pins it open above the list, so it is visible
        // without scrolling to wherever it sits in its category.
        setLinkedItem(initialFaqId ? findFaqItem(result, initialFaqId) : null);
      })
      .catch((loadError) => {
        if (active) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialFaqId, reloadKey]);

  const visible = useMemo(
    () => filterFaq(categories, query, categoryTitle),
    [categories, query, categoryTitle],
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>FAQ</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.cardBody}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReloadKey((key) => key + 1)}
          >
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {linkedItem ? (
            <View style={[styles.card, styles.linkedCard]}>
              <Text style={styles.linkedLabel}>Suggested answer</Text>
              <Text style={styles.questionText}>{linkedItem.question}</Text>
              <Text style={styles.cardBody}>{linkedItem.answer}</Text>
            </View>
          ) : null}

          <View style={styles.searchBox}>
            <Search color={colors.mutedText} size={18} />
            <TextInput
              accessibilityLabel="Search help articles"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="Search help articles"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              value={query}
            />
          </View>

          <View style={styles.chipRow}>
            <CategoryChip
              active={categoryTitle === null}
              label="All"
              onPress={() => setCategoryTitle(null)}
            />
            {categories.map((category) => (
              <CategoryChip
                key={category.title}
                active={categoryTitle === category.title}
                label={category.title}
                onPress={() => setCategoryTitle(category.title)}
              />
            ))}
          </View>

          {visible.length === 0 ? (
            <Text style={styles.cardBody}>
              No answers match your search. Try fewer words or another category.
            </Text>
          ) : (
            visible.map((category) => (
              <View key={category.title} style={styles.category}>
                <Text style={styles.categoryTitle}>{category.title}</Text>
                {category.items.map((item) => (
                  <FaqEntry
                    key={item.id}
                    expanded={expandedId === item.id}
                    item={item}
                    onToggle={() =>
                      setExpandedId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                  />
                ))}
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}

function FaqEntry({
  item,
  expanded,
  onToggle,
}: {
  item: FaqItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.question, pressed ? styles.pressed : null]}
      >
        <Text style={styles.questionText}>{item.question}</Text>
        <Chevron color={colors.mutedText} size={20} />
      </Pressable>
      {expanded ? <Text style={styles.cardBody}>{item.answer}</Text> : null}
    </View>
  );
}

function CategoryChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: { title: string; body: string }[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item) => (
        <View key={item.title} style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardBody}>{item.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  card: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pressed: {
    opacity: 0.7,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 34,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.primary },
  category: {
    gap: spacing.sm,
  },
  categoryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  question: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  questionText: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  linkedCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  linkedLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  retry: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  cardBody: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
});
