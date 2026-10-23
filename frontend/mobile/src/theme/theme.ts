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
  md: 16,
  lg: 24,
  xl: 32,
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
