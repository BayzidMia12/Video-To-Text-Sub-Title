import type { SubtitleSegment } from "../types/subtitle";

export interface ChunkSegmentBucket {
  chunkIndex: number;
  startOffsetSeconds: number;
  durationSeconds: number;
  segments: SubtitleSegment[];
}

export interface ValidationReport {
  segments: SubtitleSegment[];
  missingTranslationIds: string[];
  duplicatesRemoved: number;
  overlapsFixed: number;
}

/**
 * O(log N) binary search for active subtitle segment at playback timeSeconds.
 */
export function findActiveSegmentBinary(
  segments: SubtitleSegment[],
  timeSeconds: number
): SubtitleSegment | null {
  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const seg = segments[mid];
    if (timeSeconds < seg.startTime) {
      hi = mid - 1;
    } else if (timeSeconds > seg.endTime) {
      lo = mid + 1;
    } else {
      return seg;
    }
  }
  return null;
}

/**
 * Unicode-aware tokenization supporting Latin (English/German), Hangul (Korean),
 * Devanagari (Hindi), Tamil, Arabic, and unspaced Hanzi (Mandarin Chinese).
 */
function normalizeTokens(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim();
  if (!cleaned) return [];

  const spaceTokens = cleaned.split(/\s+/).filter(Boolean);
  // For unspaced scripts (e.g. Mandarin Chinese), build overlapping character bigrams
  if (spaceTokens.length <= 2 && cleaned.replace(/\s+/g, "").length >= 4) {
    const compact = cleaned.replace(/\s+/g, "");
    const chars = Array.from(compact);
    if (chars.length <= 1) return chars;
    const grams: string[] = [];
    for (let i = 0; i < chars.length - 1; i++) {
      grams.push(chars[i] + chars[i + 1]);
    }
    return grams;
  }

  return spaceTokens;
}

function textSimilarity(a: string, b: string): number {
  const tokensA = normalizeTokens(a);
  const tokensB = normalizeTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Splits overly long subtitle segments cleanly at punctuation
 * while preserving proportional speech timing across both spaced and CJK scripts.
 */
function ensureReadableSegmentLength(seg: SubtitleSegment): SubtitleSegment[] {
  const trimmed = seg.sourceText.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const chars = Array.from(trimmed);
  const duration = seg.endTime - seg.startTime;

  const isLongSpaced = words.length > 16;
  const isLongUnspaced = words.length <= 3 && chars.length > 36;
  if ((!isLongSpaced && !isLongUnspaced) || duration < 2.2) {
    return [seg];
  }

  let firstPart = "";
  let secondPart = "";
  let ratio = 0.5;

  if (isLongSpaced) {
    const mid = Math.ceil(words.length / 2);
    let splitIdx = -1;
    for (let i = Math.max(4, mid - 4); i <= Math.min(words.length - 4, mid + 4); i++) {
      if (/[,;:.!?।。！？؟،]$/.test(words[i - 1])) {
        splitIdx = i;
        break;
      }
    }
    if (splitIdx === -1) return [seg];
    firstPart = words.slice(0, splitIdx).join(" ");
    secondPart = words.slice(splitIdx).join(" ");
    ratio = splitIdx / words.length;
  } else {
    const mid = Math.ceil(chars.length / 2);
    let splitIdx = -1;
    for (let i = Math.max(6, mid - 8); i <= Math.min(chars.length - 6, mid + 8); i++) {
      if (/[，,。！？；;!?.]/.test(chars[i - 1])) {
        splitIdx = i;
        break;
      }
    }
    if (splitIdx === -1) return [seg];
    firstPart = chars.slice(0, splitIdx).join("").trim();
    secondPart = chars.slice(splitIdx).join("").trim();
    ratio = splitIdx / chars.length;
  }

  if (!firstPart || !secondPart) return [seg];

  const splitTime = Number((seg.startTime + duration * ratio).toFixed(2));

  let firstBn = seg.targetText;
  let secondBn = "";
  if (seg.targetText.trim()) {
    const bnWords = seg.targetText.trim().split(/\s+/);
    if (bnWords.length >= 6) {
      const bnMid = Math.round(bnWords.length * ratio);
      let bnSplit = bnMid;
      for (let i = Math.max(2, bnMid - 2); i <= Math.min(bnWords.length - 2, bnMid + 2); i++) {
        if (/[।,;!?]$/.test(bnWords[i - 1])) {
          bnSplit = i;
          break;
        }
      }
      firstBn = bnWords.slice(0, bnSplit).join(" ");
      secondBn = bnWords.slice(bnSplit).join(" ");
    }
  }

  return [
    {
      ...seg,
      id: `${seg.id}-a`,
      endTime: Number((splitTime - 0.03).toFixed(2)),
      sourceText: firstPart,
      targetText: firstBn,
    },
    {
      ...seg,
      id: `${seg.id}-b`,
      startTime: splitTime,
      sourceText: secondPart,
      targetText: secondBn || seg.targetText,
    },
  ];
}

/**
 * Merges chunk buckets, deduplicates overlap boundaries, repairs invalid/overlapping
 * timestamps, and reports any missing Bengali translations for targeted repair.
 */
export function validateAndRepairSegments(
  segments: SubtitleSegment[],
  totalDuration?: number
): ValidationReport {
  let duplicatesRemoved = 0;
  let overlapsFixed = 0;

  const sorted = [...segments]
    .filter((s) => Boolean(s.sourceText && s.sourceText.trim()))
    .sort((a, b) => a.startTime - b.startTime);

  const deduped: SubtitleSegment[] = [];
  for (const seg of sorted) {
    const last = deduped[deduped.length - 1];
    if (last) {
      const closeInTime =
        Math.abs(seg.startTime - last.startTime) < 1.8 ||
        seg.startTime < last.endTime + 0.25;
      const sim = textSimilarity(last.sourceText, seg.sourceText);
      if (closeInTime && sim >= 0.72) {
        duplicatesRemoved++;
        if (seg.sourceText.length > last.sourceText.length) {
          deduped[deduped.length - 1] = {
            ...seg,
            startTime: Math.min(last.startTime, seg.startTime),
            endTime: Math.max(last.endTime, seg.endTime),
            targetText: seg.targetText || last.targetText,
          };
        } else if (!last.targetText && seg.targetText) {
          last.targetText = seg.targetText;
        }
        continue;
      }
    }
    deduped.push(seg);
  }

  const normalized = deduped.flatMap(ensureReadableSegmentLength);
  const maxAllowed =
    totalDuration && Number.isFinite(totalDuration) && totalDuration > 0
      ? totalDuration
      : Infinity;

  const finalSegments: SubtitleSegment[] = [];
  const missingTranslationIds: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const curr = { ...normalized[i] };
    const prev = finalSegments[finalSegments.length - 1];

    curr.startTime = Math.max(0, Number(curr.startTime.toFixed(2)));
    if (prev && curr.startTime < prev.endTime + 0.04) {
      overlapsFixed++;
      if (prev.endTime - curr.startTime < 0.35 && prev.endTime - prev.startTime > 0.8) {
        prev.endTime = Number(Math.max(prev.startTime + 0.5, curr.startTime - 0.04).toFixed(2));
      } else {
        curr.startTime = Number((prev.endTime + 0.04).toFixed(2));
      }
    }

    const next = normalized[i + 1];
    let targetEnd = Math.max(curr.startTime + 0.55, curr.endTime);
    if (next && targetEnd > next.startTime - 0.04) {
      const candidate = next.startTime - 0.04;
      if (candidate >= curr.startTime + 0.45) {
        targetEnd = candidate;
      }
    }
    targetEnd = Math.min(maxAllowed, targetEnd);
    curr.endTime = Number(Math.max(curr.startTime + 0.35, targetEnd).toFixed(2));

    if (curr.startTime < maxAllowed) {
      const id = curr.id || `seg-${i + 1}-${Math.round(curr.startTime * 100)}`;
      curr.id = id;
      if (!curr.targetText.trim()) {
        missingTranslationIds.push(id);
      }
      finalSegments.push(curr);
    }
  }

  return {
    segments: finalSegments,
    missingTranslationIds,
    duplicatesRemoved,
    overlapsFixed,
  };
}

export function mergeAndSyncChunkSegments(
  buckets: ChunkSegmentBucket[],
  totalDuration?: number
): SubtitleSegment[] {
  const sortedBuckets = [...buckets].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const merged: SubtitleSegment[] = [];

  for (let bIdx = 0; bIdx < sortedBuckets.length; bIdx++) {
    const bucket = sortedBuckets[bIdx];
    const nextBucket = sortedBuckets[bIdx + 1];

    const chunkEnd = bucket.startOffsetSeconds + bucket.durationSeconds;
    const overlapMidpoint =
      nextBucket && nextBucket.startOffsetSeconds < chunkEnd
        ? (nextBucket.startOffsetSeconds + chunkEnd) / 2
        : Infinity;

    const prevBucket = sortedBuckets[bIdx - 1];
    const prevChunkEnd = prevBucket
      ? prevBucket.startOffsetSeconds + prevBucket.durationSeconds
      : -Infinity;
    const prevOverlapMidpoint =
      prevBucket && bucket.startOffsetSeconds < prevChunkEnd
        ? (bucket.startOffsetSeconds + prevChunkEnd) / 2
        : -Infinity;

    for (const rawSeg of bucket.segments) {
      const seg: SubtitleSegment = {
        ...rawSeg,
        sourceText: rawSeg.sourceText.trim(),
        targetText: rawSeg.targetText.trim(),
      };
      if (!seg.sourceText) continue;

      const midpoint = (seg.startTime + seg.endTime) / 2;
      if (midpoint < prevOverlapMidpoint - 0.15) continue;
      if (midpoint > overlapMidpoint + 0.15) continue;

      const last = merged[merged.length - 1];
      if (last) {
        const timeClose =
          Math.abs(seg.startTime - last.startTime) < 2.2 ||
          seg.startTime < last.endTime + 0.35;
        const sim = textSimilarity(last.sourceText, seg.sourceText);

        if (timeClose && sim >= 0.55) {
          if (seg.sourceText.length > last.sourceText.length) {
            merged[merged.length - 1] = {
              ...seg,
              startTime: Math.min(last.startTime, seg.startTime),
              endTime: Math.max(last.endTime, seg.endTime),
              targetText: seg.targetText || last.targetText,
            };
          } else if (!last.targetText && seg.targetText) {
            last.targetText = seg.targetText;
          }
          continue;
        }
      }

      merged.push(seg);
    }
  }

  return validateAndRepairSegments(merged, totalDuration).segments;
}

export function resyncSubtitleSegments(
  segments: SubtitleSegment[],
  totalDuration?: number
): ValidationReport {
  return validateAndRepairSegments(segments, totalDuration);
}

