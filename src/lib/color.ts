/** Colour helpers so on-screen text is always readable, whatever colours a brand has. */

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]) {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: string, b: string) {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return 1;
  const [l1, l2] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** White or near-black, whichever reads better on `bg`. */
export function readableOn(bg: string) {
  return contrastRatio("#ffffff", bg) >= contrastRatio("#16131a", bg) ? "#ffffff" : "#16131a";
}

/** Use the brand's text colour if it is readable on `bg`, otherwise fall back to white/black. */
export function textOn(bg: string, preferred?: string) {
  return preferred && contrastRatio(preferred, bg) >= 4.5 ? preferred : readableOn(bg);
}
