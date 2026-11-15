import type { SubtitleSegment } from "../types/subtitle";

const CHUNK_CACHE_PREFIX = "vbt_chunk_cache_v2::";
const PHRASE_CACHE_KEY = "vbt_bn_phrase_cache_v2";
const MAX_PHRASE_CACHE_ENTRIES = 600;

export interface CachedChunkEntry {
  chunkIndex: number;
  startOffsetSeconds: number;
  durationSeconds: number;
  segments: SubtitleSegment[];
  transcribed: boolean;
  translated: boolean;
  updatedAt: number;
}

export interface VideoProcessingCache {
  cacheKey: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  totalDuration: number;
  chunks: Record<number, CachedChunkEntry>;
  updatedAt: number;
}

export function buildVideoCacheKey(
  file: Pick<File, "name" | "size" | "lastModified">,
  languagePairId: string
): string {
  return `${CHUNK_CACHE_PREFIX}${languagePairId}::${file.name}::${file.size}::${file.lastModified}`;
}

export function loadVideoProcessingCache(
  cacheKey: string
): VideoProcessingCache | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VideoProcessingCache;
    if (!parsed || typeof parsed !== "object" || !parsed.chunks) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveChunkToCache(
  cacheKey: string,
  meta: {
    fileName: string;
    fileSize: number;
    totalChunks: number;
    totalDuration: number;
  },
  entry: CachedChunkEntry
): void {
  try {
    const existing = loadVideoProcessingCache(cacheKey) ?? {
      cacheKey,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      totalChunks: meta.totalChunks,
      totalDuration: meta.totalDuration,
      chunks: {},
      updatedAt: Date.now(),
    };

    existing.totalChunks = meta.totalChunks;
    existing.totalDuration = meta.totalDuration;
    existing.chunks[entry.chunkIndex] = entry;
    existing.updatedAt = Date.now();

    localStorage.setItem(cacheKey, JSON.stringify(existing));
  } catch {
    try {
      pruneOldChunkCaches(cacheKey);
      const retry = loadVideoProcessingCache(cacheKey) ?? {
        cacheKey,
        fileName: meta.fileName,
        fileSize: meta.fileSize,
        totalChunks: meta.totalChunks,
        totalDuration: meta.totalDuration,
        chunks: {},
        updatedAt: Date.now(),
      };
      retry.chunks[entry.chunkIndex] = entry;
      localStorage.setItem(cacheKey, JSON.stringify(retry));
    } catch {
      // Ignore storage quota overflow gracefully
    }
  }
}

export function clearVideoProcessingCache(cacheKey: string): void {
  try {
    localStorage.removeItem(cacheKey);
  } catch {
    // Ignore
  }
}

function pruneOldChunkCaches(preserveKey: string): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CHUNK_CACHE_PREFIX) && k !== preserveKey) {
      keysToRemove.push(k);
    }
  }
  for (const k of keysToRemove) {
    localStorage.removeItem(k);
  }
}

export function loadPhraseTranslationCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PHRASE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getCachedBengaliTranslation(
  sourceText: string,
  languagePairId: string
): string | null {
  const map = loadPhraseTranslationCache();
  const key = `${languagePairId}::${sourceText.trim().toLowerCase()}`;
  return map[key] ?? null;
}

export function saveBengaliTranslationsToCache(
  pairs: Array<{ sourceText: string; targetText: string }>,
  languagePairId: string
): void {
  try {
    const map = loadPhraseTranslationCache();
    for (const item of pairs) {
      const src = item.sourceText.trim().toLowerCase();
      const dst = item.targetText.trim();
      if (src && dst) {
        map[`${languagePairId}::${src}`] = dst;
      }
    }

    const keys = Object.keys(map);
    if (keys.length > MAX_PHRASE_CACHE_ENTRIES) {
      const trimmed: Record<string, string> = {};
      for (const k of keys.slice(keys.length - MAX_PHRASE_CACHE_ENTRIES)) {
        trimmed[k] = map[k];
      }
      localStorage.setItem(PHRASE_CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(PHRASE_CACHE_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage errors
  }
}

export interface CacheStatsSummary {
  cachedVideosCount: number;
  cachedPhrasesCount: number;
  estimatedBytes: number;
}

export function getCacheStats(): CacheStatsSummary {
  try {
    let cachedVideosCount = 0;
    let estimatedBytes = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(CHUNK_CACHE_PREFIX)) {
        cachedVideosCount += 1;
        estimatedBytes += (localStorage.getItem(k)?.length ?? 0) * 2;
      } else if (k === PHRASE_CACHE_KEY) {
        estimatedBytes += (localStorage.getItem(k)?.length ?? 0) * 2;
      }
    }

    const phraseMap = loadPhraseTranslationCache();
    return {
      cachedVideosCount,
      cachedPhrasesCount: Object.keys(phraseMap).length,
      estimatedBytes,
    };
  } catch {
    return { cachedVideosCount: 0, cachedPhrasesCount: 0, estimatedBytes: 0 };
  }
}

export function clearAllCachedProcessingData(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(CHUNK_CACHE_PREFIX) || k === PHRASE_CACHE_KEY)) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}
