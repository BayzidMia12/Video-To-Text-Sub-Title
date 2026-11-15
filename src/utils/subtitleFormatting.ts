import type {
  SubtitleFontFamilyId,
  SubtitleLineBreakMode,
} from "../types/subtitle";

export const SUBTITLE_FONT_FAMILIES: Array<{
  id: SubtitleFontFamilyId;
  label: string;
  cssSource: string;
  cssBengali: string;
}> = [
  {
    id: "default",
    label: "Auto Script",
    cssSource: "",
    cssBengali: "var(--font-bengali)",
  },
  {
    id: "sans",
    label: "Clean Sans",
    cssSource: "'Plus Jakarta Sans', system-ui, sans-serif",
    cssBengali: "'Noto Sans Bengali', system-ui, sans-serif",
  },
  {
    id: "hind",
    label: "Hind Siliguri",
    cssSource: "'Hind Siliguri', 'Plus Jakarta Sans', sans-serif",
    cssBengali: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif",
  },
  {
    id: "serif",
    label: "Editorial Serif",
    cssSource: "Georgia, 'Noto Serif Bengali', serif",
    cssBengali: "'Noto Sans Bengali', Georgia, serif",
  },
  {
    id: "mono",
    label: "Monospace",
    cssSource: "var(--font-mono)",
    cssBengali: "'Noto Sans Bengali', monospace",
  },
];

export function resolveFontFamilyCss(
  familyId: SubtitleFontFamilyId,
  isTargetBengali: boolean,
  autoLanguageCss?: string
): string | undefined {
  if (familyId === "default") {
    return isTargetBengali ? "var(--font-bengali)" : autoLanguageCss;
  }
  const found = SUBTITLE_FONT_FAMILIES.find((f) => f.id === familyId);
  if (!found) return isTargetBengali ? "var(--font-bengali)" : autoLanguageCss;
  return isTargetBengali ? found.cssBengali : found.cssSource || autoLanguageCss;
}

/**
 * Intelligent CapCut-style subtitle formatting:
 * - "one_line": keeps text on a single line (flattened whitespace).
 * - "auto": keeps short/medium lines on 1 clean line, and only breaks long lines
 *   into 2 balanced lines at natural punctuation/phrase boundaries without orphan words.
 * - "two_lines": splits multi-word lines into 2 balanced lines when readable.
 */
export function formatSubtitleText(
  rawText: string,
  mode: SubtitleLineBreakMode,
  options?: {
    maxSingleLineChars?: number;
    maxLineChars?: number;
  }
): string {
  const clean = rawText.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  if (mode === "one_line") {
    return clean;
  }

  const isUnspacedCjk =
    !/\s/.test(clean) &&
    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(clean);

  const maxSingleLine = options?.maxSingleLineChars ?? (isUnspacedCjk ? 20 : 38);

  if (mode === "auto" && clean.length <= maxSingleLine) {
    return clean;
  }

  if (isUnspacedCjk) {
    if (clean.length <= 12) return clean;
    const mid = Math.ceil(clean.length / 2);
    let splitIdx = -1;
    for (
      let i = Math.max(4, mid - 5);
      i <= Math.min(clean.length - 4, mid + 5);
      i++
    ) {
      if (/[、。，！？；：]/.test(clean[i - 1])) {
        splitIdx = i;
        break;
      }
    }
    if (splitIdx === -1) splitIdx = mid;
    return `${clean.slice(0, splitIdx)}\n${clean.slice(splitIdx)}`;
  }

  const words = clean.split(" ");
  if (words.length <= 2) return clean;
  if (mode === "two_lines" && words.length <= 3 && clean.length <= 16) {
    return clean;
  }

  // Find balanced split close to midpoint, preferring punctuation or conjunction boundaries
  const totalLen = clean.length;
  const targetMid = totalLen / 2;
  let bestSplitIndex = -1;
  let bestScore = Infinity;

  let runningLen = 0;
  for (let i = 1; i < words.length; i++) {
    runningLen += words[i - 1].length + (i > 1 ? 1 : 0);
    const leftLen = runningLen;
    const rightLen = totalLen - leftLen - 1;

    // Avoid orphan 1-word short lines when possible
    if (words.length >= 4 && (i === 1 || i === words.length - 1)) {
      if (Math.min(leftLen, rightLen) < 6) continue;
    }

    let score = Math.abs(leftLen - targetMid);
    const prevWord = words[i - 1];
    if (/[,;:.!?।—–-]$/.test(prevWord)) {
      score -= 12;
    } else if (
      /^(and|or|but|so|because|when|that|to|for|with|in|on|at|এবং|কিন্তু|যদি|তখন|কারণ|জন্য)$/i.test(
        words[i]
      )
    ) {
      score -= 6;
    }

    if (score < bestScore) {
      bestScore = score;
      bestSplitIndex = i;
    }
  }

  if (bestSplitIndex <= 0 || bestSplitIndex >= words.length) {
    return clean;
  }

  const line1 = words.slice(0, bestSplitIndex).join(" ");
  const line2 = words.slice(bestSplitIndex).join(" ");
  return `${line1}\n${line2}`;
}
