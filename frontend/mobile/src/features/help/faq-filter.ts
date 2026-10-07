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
): FaqCategory[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return categories
    .filter((category) => categoryTitle === null || category.title === categoryTitle)
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const text = `${item.question} ${item.answer}`.toLowerCase();
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
