/**
 * Normalize a CSS color (named, hex, or rgb) to a 6-digit uppercase hex without
 * the leading '#', as required by the `docx` library.
 */

const NAMED: Record<string, string> = {
  red: "FF0000",
  green: "008000",
  blue: "0000FF",
  yellow: "FFFF00",
  orange: "FFA500",
  purple: "800080",
  black: "000000",
  gray: "808080",
  grey: "808080",
  white: "FFFFFF",
};

export function cssColorToHex(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const c = input.trim().toLowerCase();

  if (NAMED[c]) return NAMED[c];

  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) {
      h = h
        .split("")
        .map((x) => x + x)
        .join("");
    }
    if (/^[0-9a-f]{6}$/.test(h)) return h.toUpperCase();
    return undefined;
  }

  const rgb = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  return undefined;
}
