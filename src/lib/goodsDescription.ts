// Semantic goods-description composer shared by Single BL and Multi-BL flows.
// Produces:
//   - text: multi-line invoice-ready block (HS + name + KGS per group)
//   - lines: per-group breakdown for filling {{goods_description_1|2|3}}
//   - primaryHs / groupCount for downstream logic

export type GoodsCategory = 'clothing' | 'shoes' | 'other_worn' | 'other';

/**
 * Configurable business rules for weight allocation (KGS).
 * Any category listed here receives a FIXED weight; the "remainder" category
 * (clothing) absorbs whatever is left of the BL gross weight, so the total
 * always equals the original BL weight.
 * Unknown/extra categories fall back to DEFAULT_FIXED_WEIGHT.
 */
export const FIXED_WEIGHT_RULES: Partial<Record<GoodsCategory, number>> & Record<string, number> = {
  shoes: 50,
  other_worn: 50,
};
export const DEFAULT_FIXED_WEIGHT = 50;
/** Category that absorbs the remaining weight. */
export const REMAINDER_CATEGORY: GoodsCategory = 'clothing';

export interface GoodsLine {
  hs: string | null;
  name: string;
  weightText: string;
  text: string; // "HS CODE: xxxx\nNAME W KGS"
  category: GoodsCategory;
}

export interface ComposedGoods {
  text: string;
  lines: GoodsLine[];
  primaryHs: string | null;
  groupCount: number;
  /** Groups whose HS code could not be confidently determined (needs manual verification). */
  unverifiedGroups?: string[];
}

// Canonical business mapping — the ONLY HS codes this system may auto-assign.
export const HS_MAP: Record<Exclude<GoodsCategory, 'other'>, string> = {
  clothing: '6309.1010',
  shoes: '6309.1020',
  other_worn: '6309.1090',
};

const ALLOWED_HS = new Set(Object.values(HS_MAP));

/** Keep an AI/BL supplied HS code only if it matches the approved business mapping. */
export const sanitizeHs = (hs: string | null | undefined, category: GoodsCategory): string | null => {
  const clean = (hs || '').toString().trim();
  if (category !== 'other') return HS_MAP[category];
  if (!clean) return null;
  return ALLOWED_HS.has(clean) ? null : null; // never reuse a 6309 code for an unknown category
};

export const classifyGoodsGroup = (
  raw: string,
): { category: GoodsCategory; canonicalName: string; displayName: string; hs: string | null } => {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // displayName always keeps the wording exactly as it appears on the BL.
  if (!s) return { category: 'other', canonicalName: raw, displayName: raw, hs: null };

  // 1) Other worn / misc used articles (checked first: most specific phrasing)
  if (
    /\b(OTHER\s+WORN|WORN\s+ARTICLES?|WORN\s+CLOTH(ING|ES)?|OTHER\s+USED|USED\s+ARTICLES?|OTHER\s+TEXTILES?|USED\s+TEXTILES?|WORN\s+TEXTILES?|RAGS?|WIPERS?|MISC(ELLANEOUS)?|OTHER\s+ITEMS?|SUNDRIES)\b/.test(s)
  ) {
    return { category: 'other_worn', canonicalName: 'OTHER WORN ARTICLES', displayName: s, hs: HS_MAP.other_worn };
  }

  // 2) Footwear
  if (/\b(SHOES?|FOOT\s?WEAR|SNEAKERS?|BOOTS?|SANDALS?|SLIPPERS?|TRAINERS?|LOAFERS?|HEELS?)\b/.test(s)) {
    return { category: 'shoes', canonicalName: 'USED SHOES', displayName: s, hs: HS_MAP.shoes };
  }

  // 3) Clothing / apparel (incl. "mix used clothing", "second hand garments", "wearing apparel")
  if (
    /\b(CLOTH(E|ES|ING)?|APPARELS?|GARMENTS?|WEARING\s+APPAREL|SECOND\s?HAND|2ND\s?HAND|MIX(ED)?\s+USED|DRESSES?|SHIRTS?|TROUSERS?|JACKETS?|SWEATERS?|WEAR)\b/.test(s)
  ) {
    const isMix = /\bMIX(ED)?\b/.test(s);
    return {
      category: 'clothing',
      canonicalName: isMix ? 'MIX USED CLOTHING' : 'USED CLOTHING',
      displayName: s,
      hs: HS_MAP.clothing,
    };
  }

  // Unknown category — do NOT guess an HS code.
  return { category: 'other', canonicalName: s, displayName: s, hs: null };
};


export const splitDescriptionFallback = (desc: string): string[] => {
  if (!desc) return [];
  const cleaned = desc
    .replace(/\bAS\s+WELL\s+AS\b/gi, ',')
    .replace(/\bALONG\s+WITH\b/gi, ',')
    .replace(/\bTOGETHER\s+WITH\b/gi, ',')
    .replace(/\bINCLUDING\b/gi, ',')
    .replace(/\bINCL\.?\b/gi, ',')
    .replace(/\bPLUS\b/gi, ',')
    .replace(/\bAND\b/gi, ',')
    .replace(/\bWITH\b/gi, ',')
    .replace(/[&/+;]/g, ',');
  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [desc.trim()];
};

// Decide how many decimal places to keep for the clothing weight so the
// invoice matches the BL's original precision (e.g. "17939.0000" -> 4 decimals).
const detectDecimals = (rawWeightText?: string | null, kgs?: number | null): number => {
  const src = (rawWeightText || '').toString();
  const m = src.match(/(\d+)\.(\d+)/);
  if (m) return Math.min(4, m[2].length);
  if (typeof kgs === 'number' && !Number.isInteger(kgs)) {
    const s = kgs.toString();
    const dot = s.indexOf('.');
    return dot >= 0 ? Math.min(4, s.length - dot - 1) : 0;
  }
  // Default to 4 decimals to mirror the reference invoice style ("17739.0000").
  return 4;
};

const formatWeight = (value: number, decimals: number): string =>
  decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));

const buildLine = (hs: string | null, name: string, weightText: string): GoodsLine => ({
  hs,
  name,
  weightText,
  category: 'other',
  text: hs ? `HS CODE: ${hs}\n${name} ${weightText} KGS` : `${name} ${weightText} KGS`,
});

export const composeGoodsDescription = (
  groups: Array<{ name: string; hs_code?: string | null }>,
  totalKgs: number | null,
  originalDescription: string,
  rawWeightText?: string | null,
): ComposedGoods => {
  const classified = (groups || [])
    .map((g) => ({ ...classifyGoodsGroup(g.name), providedHs: g.hs_code || null }))
    .filter((g) => g.canonicalName);

  // Safety net: if the AI returned a single lumped group, re-split the raw description
  // semantically so each category still gets its own HS code.
  const fromDescription = splitDescriptionFallback(originalDescription || '')
    .map((p) => ({ ...classifyGoodsGroup(p), providedHs: null as string | null }))
    .filter((g) => g.category !== 'other');
  const merged = [...classified, ...fromDescription];

  // Deduplicate by category
  const seen = new Set<string>();
  const unique = merged.filter((g) => {
    const k = g.category === 'other' ? g.canonicalName : g.category;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const unverifiedGroups = unique.filter((g) => g.category === 'other').map((g) => g.canonicalName);
  const originalHasMix = /\bMIX(ED)?\b/i.test(originalDescription || '');

  // Only one detected category (or no usable weight) -> keep the BL description as one line.
  if (unique.length <= 1 || !totalKgs || totalKgs <= 0) {
    const first = unique[0];
    let cleanedText = (originalDescription || '').trim();
    if (!originalHasMix && /\bMIX(ED)?\s+USED\s+CLOTHING\b/i.test(cleanedText)) {
      cleanedText = cleanedText.replace(/\bMIX(ED)?\s+USED\s+CLOTHING\b/gi, 'USED CLOTHING');
    }
    const primaryHs = first ? sanitizeHs(first.hs ?? first.providedHs, first.category) : null;
    const name =
      first?.category === 'clothing'
        ? (originalHasMix ? (first.canonicalName || 'MIX USED CLOTHING') : 'USED CLOTHING')
        : (first?.canonicalName || cleanedText);
    const weightText = totalKgs ? formatWeight(totalKgs, detectDecimals(rawWeightText, totalKgs)) : '';
    const lineText = primaryHs && weightText ? `HS CODE: ${primaryHs}\n${name} ${weightText} KGS` : cleanedText || name;

    const singleLine: GoodsLine = {
      hs: primaryHs,
      name,
      weightText,
      text: lineText,
      category: first?.category || 'clothing',
    };

    return {
      text: cleanedText || lineText,
      lines: [singleLine],
      primaryHs,
      groupCount: 1,
      unverifiedGroups,
    };
  }

  const decimals = detectDecimals(rawWeightText, totalKgs);

  // Canonical ordering: remainder category first, then known categories, then extras
  // (in the order the AI detected them) — the line count always matches the categories.
  const rank = (c: GoodsCategory) =>
    c === REMAINDER_CATEGORY ? 0 : c === 'shoes' ? 1 : c === 'other_worn' ? 2 : 3;
  const ordered = [...unique].sort((a, b) => rank(a.category) - rank(b.category));

  const remainderIndex = ordered.findIndex((g) => g.category === REMAINDER_CATEGORY);
  // No explicit remainder category detected -> the first (largest) category absorbs the rest.
  const absorbIndex = remainderIndex >= 0 ? remainderIndex : 0;

  // Rule-driven fixed allocations for every non-absorbing category.
  const fixed = ordered.map((g, i) =>
    i === absorbIndex ? 0 : FIXED_WEIGHT_RULES[g.category] ?? DEFAULT_FIXED_WEIGHT,
  );
  let allocated = fixed.reduce((s, v) => s + v, 0);
  // Self-validation: fixed rules can never exceed the BL gross weight.
  if (allocated >= totalKgs) {
    const scale = (totalKgs * 0.5) / allocated;
    for (let i = 0; i < fixed.length; i++) fixed[i] = Math.round(fixed[i] * scale);
    allocated = fixed.reduce((s, v) => s + v, 0);
  }
  fixed[absorbIndex] = Math.max(0, totalKgs - allocated);

  const lines: GoodsLine[] = ordered.map((g, i) => {
    const hs = sanitizeHs(g.hs ?? g.providedHs, g.category);
    let name = g.canonicalName;
    if (g.category === REMAINDER_CATEGORY) {
      name = originalHasMix ? (g.canonicalName || 'MIX USED CLOTHING') : 'USED CLOTHING';
    }
    const weightText =
      i === absorbIndex ? formatWeight(fixed[i], decimals) : formatWeight(fixed[i], 0);
    return { ...buildLine(hs, name, weightText), category: g.category };
  });

  const text = lines.map((l) => l.text).join('\n\n');
  return {
    text,
    lines,
    primaryHs: lines[0]?.hs ?? null,
    groupCount: lines.length,
    unverifiedGroups,

  };
};
