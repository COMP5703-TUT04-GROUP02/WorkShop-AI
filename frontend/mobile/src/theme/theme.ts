/**
 * Design tokens, v6 "clear" palette.
 *
 * Three levels of brightness carry the layout: white cards, a neutral grey page
 * ground, and a pale blue used only for the selected state and for information.
 * The ground is grey rather than tinted so that blue stays a signal: it appears
 * where something is selected or actionable, nowhere else. Solid `primary` is
 * reserved for the single main action on a screen, and `warning` only ever
 * marks money or something waiting on the user.
 */
export const colors = {
  // Surfaces
  background: "#FFFFFF",
  surface: "#F2F2F7",
  border: "#E3E3E9",

  // Text
  text: "#142536",
  mutedText: "#52677A",
  placeholder: "#6B7C8D",

  // Primary — one solid button per screen
  primary: "#1976C9",
  primaryPressed: "#15639F",
  primaryText: "#15639F",
  primaryTint: "#EAF5FD",
  primaryTintBorder: "#C9E4F7",
  accent: "#8BC8ED",

  // Waiting on the user: money, todos
  warning: "#E9A52F",
  warningText: "#845000",
  warningTint: "#FCF1DF",
  warningBorder: "#EBD3A8",

  // Done, verified, open for business
  success: "#0E7A4D",
  successTint: "#E9F6EF",

  // Destructive
  danger: "#C33B2E",
  dangerText: "#C33B2E",
  dangerTint: "#FBEEEC",
  dangerBorder: "#E8BDB8",
};

export const spacing = {
  xs: 4,
  sm: 8,
  /** Between a thing and the thing it belongs to: a photo and its name. */
  snug: 12,
  md: 16,
  lg: 24,
  xl: 32,
  /** Between one section of a page and the next. */
  xxl: 48,
};

/**
 * The type scale. Sizes were chosen per screen before this existed, which left
 * twenty-five of them in use, four at half a pixel and several a pixel apart
 * for no reason anyone could state.
 *
 * Body is 16. iOS sets body at 17 and Material at 16; 14 is a density for
 * tables, and `adminTypography` keeps it for exactly that. A consumer screen
 * is read, not scanned, so running text gets the size it is read at.
 */
export const type = {
  /** One per screen, at the top. */
  display: 28,
  /** A heading inside a screen, and modal titles. */
  title: 22,
  /** A section inside a screen. */
  section: 18,
  /** What a card is called. */
  cardTitle: 16,
  /** Running text: anything that is a sentence. */
  body: 16,
  /**
   * Anything a finger presses and anything typed into. Same number as body,
   * different job. Not below 16: iOS Safari zooms the page when it focuses an
   * input whose text is smaller, and this runs on the web.
   */
  control: 16,
  /** Beside or under something: metadata, labels, helper lines. */
  secondary: 14,
  /** Dense metadata only, where a column of them has to fit. */
  caption: 13,
  /** Badges and counts. Never a whole sentence, and never below this. */
  micro: 12,
};

export const radius = {
  /** Tags and small badges. */
  sm: 6,
  /** Buttons and inputs. */
  md: 10,
  /** Cards and panels. */
  lg: 12,
  /** Fully rounded: pills, avatars, dots. */
  pill: 999,
};

export const layout = {
  webDesktopMinWidth: 900,
  webContentMaxWidth: 1120,
  webSidebarWidth: 248,
};
