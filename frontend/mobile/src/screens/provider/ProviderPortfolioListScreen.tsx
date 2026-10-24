import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Plus } from "lucide-react-native";
import { useCallback, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getProviderPortfolios } from "../../api/provider";
import { PortfolioCard } from "../../components/PortfolioCard";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing } from "../../theme/theme";
import type { PaginatedData } from "../../types/chat";
import type { ProviderPortfolio } from "../../types/provider";

const PAGE_SIZE = 12;

export function ProviderPortfolioListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<ProviderPortfolio[]>([]);
  const [paging, setPaging] = useState<PaginatedData<ProviderPortfolio> | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityLabel="Add a portfolio"
          accessibilityRole="button"
          onPress={() => navigation.navigate("ProviderPortfolioCreate")}
          style={styles.addButton}
        >
          <Plus color="#FFFFFF" size={18} />
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadFirstPage() {
        setIsLoading(true);
        try {
          const data = await getProviderPortfolios(1, PAGE_SIZE);

          if (isActive) {
            setItems(data?.items ?? []);
            setPaging(data);
            setPage(1);
          }
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      }

      void loadFirstPage();

      return () => {
        isActive = false;
      };
    }, []),
  );

  async function loadMore() {
    if (isLoadingMore || !paging?.has_next) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await getProviderPortfolios(nextPage, PAGE_SIZE);

      if (data) {
        setItems((current) => [...current, ...data.items]);
        setPaging(data);
        setPage(nextPage);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          ListEmptyComponent={<Text style={styles.emptyText}>Past work shown on your profile. An admin checks each piece is your own photograph before it goes live.</Text>}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
            ) : null
          }
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          data={items}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <PortfolioCard
              onPress={() =>
                navigation.navigate("ProviderPortfolioDetail", {
                  portfolioId: item.id,
                })
              }
              portfolio={item}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  addButton: {
    minHeight: 36,
    marginRight: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  addText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  loader: {
    marginTop: spacing.xl,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  gridRow: {
    justifyContent: "space-between",
    gap: spacing.md,
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 16,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
});
