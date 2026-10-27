import type { FaqCategory, FaqItem } from "../../types/faq";

/**
 * Keeps the categories and entries that match both the selected category (null
 * means all) and every word of the search text, in either question or answer.
 * Categories left without entries are dropped.
 */
export function filterFaq(
  categories: FaqCategory[],
  query: string,
  categoryTitle: string | null,
  language: "en" | "tr" = "en",
): FaqCategory[] {
  const locale = language === "tr" ? "tr-TR" : "en-GB";
  const terms = query.toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);

  return categories
    .filter((category) => categoryTitle === null || category.title === categoryTitle)
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const text = `${item.question} ${item.answer}`.toLocaleLowerCase(locale);
        return terms.every((term) => text.includes(term));
      }),
    }))
    .filter((category) => category.items.length > 0);
}

export function findFaqItem(
  categories: FaqCategory[],
  faqId: string,
): FaqItem | null {
  for (const category of categories) {
    const item = category.items.find((candidate) => candidate.id === faqId);
    if (item) return item;
  }
  return null;
}
