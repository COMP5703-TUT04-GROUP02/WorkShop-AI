export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type FaqCategory = {
  title: string;
  items: FaqItem[];
};

export type FaqResponse = {
  audience: "customer";
  categories: FaqCategory[];
};
