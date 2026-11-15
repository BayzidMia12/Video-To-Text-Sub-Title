import type { LanguagePairConfig } from "../config/languages";
import type {
  AudioExtractionMode,
  DetectedLanguageInfo,
  EnglishAccent,
  PipelineMetrics,
  ProcessingErrorStage,
  ProcessingQualityMode,
  ProcessingStatusState,
  StageLatencyBreakdown,
  SubtitleSegment,
  TranslationEngineMode,
} from "../types/subtitle";
import {
  extractAudioChunksStreaming,
  type ExtractedAudioChunk,
} from "../utils/audioExtractor";
import {
  mergeAndSyncChunkSegments,
  validateAndRepairSegments,
  type ChunkSegmentBucket,
} from "../utils/subtitleSync";
import { parseTimeInput } from "../utils/time";
import {
  buildVideoCacheKey,
  clearVideoProcessingCache,
  getCachedBengaliTranslation,
  loadVideoProcessingCache,
  saveBengaliTranslationsToCache,
  saveChunkToCache,
} from "./cacheService";

export const SAMPLE_SUBTITLE_SEGMENTS: SubtitleSegment[] = [
  {
    id: "sample-1",
    startTime: 0.2,
    endTime: 3.4,
    sourceText: "Hello everyone, welcome to my channel.",
    targetText: "সবাইকে হ্যালো, আমার চ্যানেলে স্বাগতম।",
  },
  {
    id: "sample-2",
    startTime: 3.5,
    endTime: 7.4,
    sourceText: "Today we are going to learn something new.",
    targetText: "আজ আমরা নতুন কিছু শিখতে যাচ্ছি।",
  },
  {
    id: "sample-3",
    startTime: 7.5,
    endTime: 11.8,
    sourceText: "I have been working here for five years.",
    targetText: "আমি এখানে পাঁচ বছর ধরে কাজ করছি।",
  },
];

export async function checkServerHealth(): Promise<{
  aiAvailable: boolean;
  models?: { transcription: string; transcriptionFallback: string; translation: string };
}> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return { aiAvailable: false };
    const data = (await res.json()) as {
      aiAvailable?: boolean;
      models?: { transcription: string; transcriptionFallback: string; translation: string };
    };
    return { aiAvailable: Boolean(data.aiAvailable), models: data.models };
  } catch {
    return { aiAvailable: false };
  }
}

const FREE_PHRASE_MAP: Array<[RegExp, string]> = [
  [/hello everyone/i, "সবাইকে হ্যালো"],
  [/welcome to my channel/i, "আমার চ্যানেলে স্বাগতম"],
  [/how are you today/i, "আজ আপনি কেমন আছেন"],
  [/how are you/i, "আপনি কেমন আছেন"],
  [/i am going to the market/i, "আমি বাজারে যাচ্ছি"],
  [/thank you very much/i, "আপনাকে অনেক ধন্যবাদ"],
  [/thank you/i, "ধন্যবাদ"],
  [/good morning/i, "শুভ সকাল"],
  [/good night/i, "শুভ রাত্রি"],
  [/please subscribe/i, "অনুগ্রহ করে সাবস্ক্রাইব করুন"],
  [/let us get started/i, "চলুন শুরু করা যাক"],
  [/let's get started/i, "চলুন শুরু করা যাক"],
  [/see you in the next video/i, "পরের ভিডিওতে দেখা হবে"],
];

const MYMEMORY_LANG_MAP: Record<string, string> = {
  en: "en",
  ko: "ko",
  hi: "hi",
  ja: "ja",
  zh: "zh-CN",
  ta: "ta",
  de: "de",
  ar: "ar",
};

export async function translateTextFreeFallback(
  sourceText: string,
  sourceLanguageCode = "en"
): Promise<string> {
  const trimmed = sourceText.trim();
  if (!trimmed) return "";

  if (sourceLanguageCode === "en" || sourceLanguageCode === "auto") {
    for (const [pattern, bn] of FREE_PHRASE_MAP) {
      if (pattern.test(trimmed)) {
        return bn;
      }
    }
  }

  const mmSource = MYMEMORY_LANG_MAP[sourceLanguageCode] ?? "en";

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${mmSource}|bn`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as {
        responseData?: { translatedText?: string };
      };
      const translated = data?.responseData?.translatedText?.trim();
      if (translated && translated.toLowerCase() !== trimmed.toLowerCase()) {
        return translated;
      }
    }
  } catch {
    // Offline fallback
  }

  return `[অনুবাদ সম্পাদনা করুন] ${trimmed}`;
}

interface TranscribeSseResult {
  segments: SubtitleSegment[];
  detectedLanguage?: DetectedLanguageInfo;
  modelUsed?: string;
  retryCount: number;
  tierWarning?: string;
  uploadMs: number;
  recognitionMs: number;
}

async function consumeTranscribeSse(
  chunk: ExtractedAudioChunk,
  languagePair: LanguagePairConfig,
  englishAccent: EnglishAccent,
  onSegmentStreamed: (seg: SubtitleSegment) => void,
  signal?: AbortSignal
): Promise<TranscribeSseResult> {
  if (!chunk.audioBytes || chunk.audioBytes.byteLength === 0) {
    return { segments: [], retryCount: 0, uploadMs: 0, recognitionMs: 0 };
  }

  const binaryBody = new Blob([chunk.audioBytes.buffer as ArrayBuffer], {
    type: chunk.mimeType,
  });

  const uploadStart = performance.now();
  const response = await fetch("/api/transcribe-chunk-stream", {
    method: "POST",
    headers: {
      "Content-Type": chunk.mimeType,
      "X-Chunk-Index": String(chunk.index),
      "X-Chunk-Start": String(chunk.startOffsetSeconds),
      "X-Chunk-Duration": String(chunk.durationSeconds),
      "X-Source-Language": languagePair.source.name,
      "X-Source-Code": languagePair.source.code,
      "X-English-Accent": englishAccent,
    },
    signal,
    body: binaryBody,
  });
  const uploadMs = Math.round(performance.now() - uploadStart);
  const recogStart = performance.now();

  if (!response.ok || !response.body) {
    const err = new Error("Speech recognition failed.") as Error & { code?: string };
    err.code = response.status === 429 ? "RATE_LIMIT" : "UNKNOWN";
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const collected: SubtitleSegment[] = [];
  let doneSegments: SubtitleSegment[] | null = null;
  let detectedLanguage: DetectedLanguageInfo | undefined;
  let modelUsed: string | undefined;
  let retryCount = 0;
  let tierWarning: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;

      const payload = JSON.parse(line.slice(6)) as {
        type: "segment" | "done" | "error";
        segment?: SubtitleSegment;
        segments?: SubtitleSegment[];
        detectedLanguage?: DetectedLanguageInfo;
        modelUsed?: string;
        retryCount?: number;
        retryAfterSeconds?: number;
        tierWarning?: string;
        code?: string;
        error?: string;
      };

      if (payload.type === "segment" && payload.segment) {
        collected.push(payload.segment);
        onSegmentStreamed(payload.segment);
      } else if (payload.type === "done") {
        doneSegments = Array.isArray(payload.segments) ? payload.segments : collected;
        detectedLanguage = payload.detectedLanguage;
        modelUsed = payload.modelUsed;
        retryCount = payload.retryCount ?? 0;
        tierWarning = payload.tierWarning;
      } else if (payload.type === "error") {
        const err = new Error(payload.error || "Speech recognition failed.") as Error & {
          code?: string;
          retryCount?: number;
          retryAfterSeconds?: number;
        };
        err.code = payload.code;
        err.retryCount = payload.retryCount ?? 0;
        err.retryAfterSeconds = payload.retryAfterSeconds;
        throw err;
      }
    }
  }

  const recognitionMs = Math.round(performance.now() - recogStart);

  return {
    segments: doneSegments ?? collected,
    detectedLanguage,
    modelUsed,
    retryCount,
    tierWarning,
    uploadMs,
    recognitionMs,
  };
}

const TRANSLATION_BATCH_SIZE = 16;

async function translateBatchWithCache(
  segments: SubtitleSegment[],
  languagePair: LanguagePairConfig,
  signal?: AbortSignal
): Promise<{
  segments: SubtitleSegment[];
  modelUsed?: string;
  retryCount: number;
}> {
  if (segments.length === 0) {
    return { segments: [], retryCount: 0 };
  }

  const uncached: SubtitleSegment[] = [];
  const resolved = new Map<string, string>();
  let totalRetries = 0;
  let modelUsed: string | undefined;

  for (const seg of segments) {
    const cached = getCachedBengaliTranslation(seg.sourceText, languagePair.id);
    if (cached) {
      resolved.set(seg.id, cached);
    } else {
      uncached.push(seg);
    }
  }

  for (let offset = 0; offset < uncached.length; offset += TRANSLATION_BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = uncached.slice(offset, offset + TRANSLATION_BATCH_SIZE);

    const res = await fetch("/api/translate-segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        segments: batch.map((s) => ({ id: s.id, sourceText: s.sourceText })),
        sourceLanguageCode: languagePair.source.code,
        sourceLanguageName: languagePair.source.name,
        targetLanguageName: languagePair.target.name,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        retryCount?: number;
        retryAfterSeconds?: number;
      };
      const err = new Error(errBody.error || "Translation failed.") as Error & {
        code?: string;
        retryCount?: number;
        retryAfterSeconds?: number;
      };
      err.code = res.status === 429 ? "RATE_LIMIT" : errBody.code;
      err.retryCount = errBody.retryCount ?? 0;
      err.retryAfterSeconds = errBody.retryAfterSeconds;
      throw err;
    }

    const data = (await res.json()) as {
      modelUsed?: string;
      retryCount?: number;
      translations?: Array<{ id: string; english?: string; bengali?: string; targetText?: string }>;
    };

    if (data.modelUsed) modelUsed = data.modelUsed;
    totalRetries += data.retryCount ?? 0;

    const newlyTranslated: Array<{ sourceText: string; targetText: string }> = [];
    for (const t of data.translations ?? []) {
      const cleaned = (t.bengali ?? t.targetText ?? "").trim();
      if (cleaned) {
        resolved.set(t.id, cleaned);
        const orig = batch.find((u) => u.id === t.id);
        if (orig) {
          newlyTranslated.push({ sourceText: orig.sourceText, targetText: cleaned });
        }
      }
    }

    if (newlyTranslated.length > 0) {
      saveBengaliTranslationsToCache(newlyTranslated, languagePair.id);
    }
  }

  return {
    segments: segments.map((seg) => ({
      ...seg,
      targetText: resolved.get(seg.id) || seg.targetText,
    })),
    modelUsed,
    retryCount: totalRetries,
  };
}

export interface StreamingPipelineOptions {
  file: File;
  durationHint: number;
  languagePair: LanguagePairConfig;
  englishAccent?: EnglishAccent;
  processingQuality?: ProcessingQualityMode;
  autoRetry?: boolean;
  forceFresh?: boolean;
  signal?: AbortSignal;
  onProgress: (state: ProcessingStatusState) => void;
  onSegmentsUpdate: (segments: SubtitleSegment[]) => void;
  onDetectedLanguage?: (lang: DetectedLanguageInfo) => void;
}

export async function processVideoStreamingPipeline(
  options: StreamingPipelineOptions
): Promise<{
  segments: SubtitleSegment[];
  metrics: PipelineMetrics;
  totalDuration: number;
  detectedLanguage?: DetectedLanguageInfo;
}> {
  const {
    file,
    durationHint,
    languagePair,
    englishAccent = "us",
    processingQuality = "fast",
    autoRetry = true,
    forceFresh,
    signal,
    onProgress,
    onSegmentsUpdate,
    onDetectedLanguage,
  } = options;

  const pipelineStart = performance.now();
  const cachePairKey =
    languagePair.source.code === "en"
      ? `${languagePair.id}-${englishAccent}`
      : languagePair.id;
  const cacheKey = buildVideoCacheKey(file, cachePairKey);
  if (forceFresh) {
    clearVideoProcessingCache(cacheKey);
  }
  const existingCache = forceFresh ? null : loadVideoProcessingCache(cacheKey);

  const effectiveChunkSeconds =
    processingQuality === "high" ? 45 : processingQuality === "balanced" ? 60 : 75;
  let extractProgress = 5;
  let totalChunksEstimate = Math.max(
    1,
    durationHint > effectiveChunkSeconds * 2
      ? Math.ceil(durationHint / Math.max(20, effectiveChunkSeconds - 1.5))
      : 1
  );
  let totalDuration = durationHint;

  const buckets = new Map<number, ChunkSegmentBucket>();
  const transcribedChunks = new Set<number>();
  const translatedChunks = new Set<number>();
  const inFlightChunks = new Set<number>();

  let concurrencyLimit =
    processingQuality === "high" ? 2 : durationHint > 150 ? 2 : 3;
  let globalCooldownPromise: Promise<void> | null = null;
  let peakConcurrencyUsed = 1;
  let speechTimeMs = 0;
  let speechNetMs = 0;
  let audioUploadMs = 0;
  let translateTimeMs = 0;
  let syncTimeMs = 0;
  let extractionTimeMs = 0;
  let audioDetectMs: number | undefined;
  let packetExtractMs: number | undefined;
  let containerMuxMs: number | undefined;
  let extractedAudioBytes = 0;
  let extractionMode: AudioExtractionMode | undefined;
  let sourceAudioCodec: string | undefined;
  let outputAudioFormat: string | undefined;
  let outputMimeType: string | undefined;
  let fallbackReason: string | undefined;
  let totalRetries = 0;
  let failedRequests = 0;
  let transcriptionModel = "gemini-3.5-transcribe";
  let translationModel = "gemini-3.1-flash-lite";
  let tierWarning: string | undefined;
  let detectedLanguage: DetectedLanguageInfo | undefined;
  let lastSyncedSegments: SubtitleSegment[] = [];

  if (existingCache) {
    for (const entry of Object.values(existingCache.chunks)) {
      if (entry.transcribed && entry.translated) {
        buckets.set(entry.chunkIndex, {
          chunkIndex: entry.chunkIndex,
          startOffsetSeconds: entry.startOffsetSeconds,
          durationSeconds: entry.durationSeconds,
          segments: entry.segments,
        });
        transcribedChunks.add(entry.chunkIndex);
        translatedChunks.add(entry.chunkIndex);
      }
    }
    if (buckets.size > 0) {
      lastSyncedSegments = mergeAndSyncChunkSegments(Array.from(buckets.values()), totalDuration);
      onSegmentsUpdate(lastSyncedSegments);
    }
  }

  const computeProcessedSeconds = () => {
    let sec = 0;
    for (const idx of translatedChunks) {
      const b = buckets.get(idx);
      if (b) {
        sec += idx === 0 ? b.durationSeconds : Math.max(0, b.durationSeconds - 1.5);
      }
    }
    if (translatedChunks.size >= totalChunksEstimate && totalDuration > 0) {
      return totalDuration;
    }
    return Math.min(totalDuration || sec, sec);
  };

  const buildStageMetrics = (): StageLatencyBreakdown => ({
    audioDetectMs,
    packetExtractMs,
    containerMuxMs,
    audioUploadMs: audioUploadMs > 0 ? audioUploadMs : undefined,
    speechRecognitionMs: speechNetMs > 0 ? speechNetMs : undefined,
    extractedAudioBytes: extractedAudioBytes > 0 ? extractedAudioBytes : undefined,
    extractionMode,
    sourceAudioCodec,
    outputAudioFormat,
    outputMimeType,
    fallbackReason,
  });

  const emitProgress = (
    stage: ProcessingStatusState["stage"],
    message: string,
    detail?: string,
    syncPct = 0,
    syncLabel = "Waiting"
  ) => {
    const total = Math.max(1, totalChunksEstimate);
    const speechPct = Math.min(100, Math.round((transcribedChunks.size / total) * 100));
    const translatePct = Math.min(100, Math.round((translatedChunks.size / total) * 100));
    const overall = Math.min(
      100,
      Math.round(extractProgress * 0.15 + speechPct * 0.45 + translatePct * 0.3 + syncPct * 0.1)
    );
    const processedSeconds = computeProcessedSeconds();

    onProgress({
      stage,
      progress: overall,
      message,
      detail,
      extractProgress,
      speechProgress: speechPct,
      translateProgress: translatePct,
      syncProgress: syncPct,
      syncLabel,
      processedSeconds,
      totalSeconds: totalDuration,
      completedChunks: translatedChunks.size,
      totalChunks: total,
      completedSegmentsCount: lastSyncedSegments.length,
      retryCount: totalRetries,
      failedRequests,
      activeConcurrency: concurrencyLimit,
      transcriptionModel,
      translationModel,
      tierWarning,
      detectedLanguage,
      stageMetrics: buildStageMetrics(),
    });
  };

  emitProgress(
    "analyzing",
    "Extracting audio track...",
    "Reading audio packets without decoding video frames"
  );

  const pendingChunks: ExtractedAudioChunk[] = [];
  let activeWorkers = 0;
  let extractionFinished = false;
  let fatalError: (Error & { code?: string }) | null = null;
  let resolveQueueDone: (() => void) | null = null;

  const syncAndPublish = (syncPct = 40, syncLabel = "Processing") => {
    const t0 = performance.now();
    lastSyncedSegments = mergeAndSyncChunkSegments(Array.from(buckets.values()), totalDuration);
    syncTimeMs += Math.round(performance.now() - t0);
    onSegmentsUpdate(lastSyncedSegments);
    void syncPct;
    void syncLabel;
    return lastSyncedSegments;
  };

  const checkAllDone = () => {
    if (fatalError && activeWorkers === 0) {
      resolveQueueDone?.();
      return;
    }
    if (extractionFinished && pendingChunks.length === 0 && activeWorkers === 0) {
      resolveQueueDone?.();
    }
  };

  const runChunkWithAdaptiveBackoff = async (chunk: ExtractedAudioChunk) => {
    if (inFlightChunks.has(chunk.index) || translatedChunks.has(chunk.index)) return;
    inFlightChunks.add(chunk.index);

    try {
      const cached = existingCache?.chunks[chunk.index];
      if (cached && cached.transcribed && cached.translated) {
        buckets.set(chunk.index, {
          chunkIndex: chunk.index,
          startOffsetSeconds: cached.startOffsetSeconds,
          durationSeconds: cached.durationSeconds,
          segments: cached.segments,
        });
        transcribedChunks.add(chunk.index);
        translatedChunks.add(chunk.index);
        chunk.audioBytes = null;
        syncAndPublish(50, "Processing");
        emitProgress(
          "recognizing",
          "Restored cached segments...",
          `Part ${chunk.index + 1}/${chunk.totalChunks} loaded from cache`,
          50,
          "Processing"
        );
        return;
      }

      if (chunk.isSilent || !chunk.audioBytes) {
        buckets.set(chunk.index, {
          chunkIndex: chunk.index,
          startOffsetSeconds: chunk.startOffsetSeconds,
          durationSeconds: chunk.durationSeconds,
          segments: [],
        });
        transcribedChunks.add(chunk.index);
        translatedChunks.add(chunk.index);
        saveChunkToCache(
          cacheKey,
          { fileName: file.name, fileSize: file.size, totalChunks: chunk.totalChunks, totalDuration },
          {
            chunkIndex: chunk.index,
            startOffsetSeconds: chunk.startOffsetSeconds,
            durationSeconds: chunk.durationSeconds,
            segments: [],
            transcribed: true,
            translated: true,
            updatedAt: Date.now(),
          }
        );
        emitProgress(
          "recognizing",
          languagePair.source.code === "auto"
            ? "Recognizing speech..."
            : `Recognizing ${languagePair.source.name} speech...`,
          `Skipped silent part ${chunk.index + 1}/${chunk.totalChunks}`
        );
        return;
      }

      const waitWithAbort = async (ms: number) => {
        if (signal?.aborted) return;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          }, ms);
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      };

      const triggerSharedCooldown = async (retryAfterSeconds?: number) => {
        concurrencyLimit = 1;
        if (!globalCooldownPromise) {
          const waitSec = Math.min(28, Math.max(6, retryAfterSeconds ?? 12));
          emitProgress(
            "recognizing",
            "Free-tier rate limit pause...",
            `Resuming automatically in ~${waitSec}s (completed chunks saved)`
          );
          globalCooldownPromise = waitWithAbort(waitSec * 1000).finally(() => {
            globalCooldownPromise = null;
          });
        }
        await globalCooldownPromise;
      };

      let englishSegments: SubtitleSegment[] = [];
      if (cached && cached.transcribed && cached.segments.length > 0) {
        englishSegments = cached.segments;
      } else {
        const speechT0 = performance.now();
        let attempt = 0;
        while (true) {
          if (globalCooldownPromise) await globalCooldownPromise;
          if (signal?.aborted) {
            const abortErr = new Error("Aborted") as Error & { code?: string };
            abortErr.code = "ABORTED";
            throw abortErr;
          }
          attempt++;
          try {
            const liveChunkSegments: SubtitleSegment[] = [];
            const activePairForSse: LanguagePairConfig =
              languagePair.source.code === "auto" && detectedLanguage
                ? {
                    ...languagePair,
                    source: {
                      ...languagePair.source,
                      code: detectedLanguage.code,
                      name: detectedLanguage.name,
                      nativeName: detectedLanguage.nativeName || detectedLanguage.name,
                    },
                  }
                : languagePair;

            const sseResult = await consumeTranscribeSse(
              chunk,
              activePairForSse,
              englishAccent,
              (streamedSeg) => {
                liveChunkSegments.push(streamedSeg);
                buckets.set(chunk.index, {
                  chunkIndex: chunk.index,
                  startOffsetSeconds: chunk.startOffsetSeconds,
                  durationSeconds: chunk.durationSeconds,
                  segments: [...liveChunkSegments],
                });
                syncAndPublish(40, "Processing");
              },
              signal
            );
            englishSegments = sseResult.segments;
            totalRetries += sseResult.retryCount;
            audioUploadMs += sseResult.uploadMs;
            speechNetMs += sseResult.recognitionMs;
            if (sseResult.modelUsed) transcriptionModel = sseResult.modelUsed;
            if (sseResult.tierWarning) tierWarning = sseResult.tierWarning;
            if (sseResult.detectedLanguage && !detectedLanguage) {
              detectedLanguage = sseResult.detectedLanguage;
              onDetectedLanguage?.(sseResult.detectedLanguage);
            }
            break;
          } catch (err) {
            if (signal?.aborted) throw err;
            const e = err as Error & {
              code?: string;
              retryCount?: number;
              retryAfterSeconds?: number;
            };
            totalRetries += e.retryCount ?? 0;
            failedRequests++;

            if (concurrencyLimit > 1) {
              concurrencyLimit = Math.max(1, concurrencyLimit - 1);
            }

            const maxAttempts = !autoRetry ? 1 : e.code === "RATE_LIMIT" ? 4 : 3;
            if (attempt >= maxAttempts || e.code === "AI_UNAVAILABLE" || e.code === "AUDIO_ERROR") {
              (e as Error & { errorStage?: ProcessingErrorStage }).errorStage = "recognition";
              throw err;
            }
            totalRetries++;
            if (e.code === "RATE_LIMIT") {
              await triggerSharedCooldown(e.retryAfterSeconds);
            } else {
              await waitWithAbort(700 * attempt);
            }
          }
        }
        speechTimeMs += Math.round(performance.now() - speechT0);
      }

      chunk.audioBytes = null;
      transcribedChunks.add(chunk.index);

      buckets.set(chunk.index, {
        chunkIndex: chunk.index,
        startOffsetSeconds: chunk.startOffsetSeconds,
        durationSeconds: chunk.durationSeconds,
        segments: englishSegments,
      });

      saveChunkToCache(
        cacheKey,
        { fileName: file.name, fileSize: file.size, totalChunks: chunk.totalChunks, totalDuration },
        {
          chunkIndex: chunk.index,
          startOffsetSeconds: chunk.startOffsetSeconds,
          durationSeconds: chunk.durationSeconds,
          segments: englishSegments,
          transcribed: true,
          translated: englishSegments.length === 0,
          updatedAt: Date.now(),
        }
      );

      syncAndPublish(55, "Processing");
      emitProgress(
        "translating",
        "Translating into Bengali...",
        `Part ${chunk.index + 1}/${chunk.totalChunks} (${englishSegments.length} lines)`,
        55,
        "Processing"
      );

      let bilingualSegments = englishSegments;
      if (englishSegments.length > 0) {
        const transT0 = performance.now();
        let trAttempt = 0;
        while (true) {
          if (globalCooldownPromise) await globalCooldownPromise;
          if (signal?.aborted) {
            const abortErr = new Error("Aborted") as Error & { code?: string };
            abortErr.code = "ABORTED";
            throw abortErr;
          }
          trAttempt++;
          try {
            const translationPair: LanguagePairConfig =
              languagePair.source.code === "auto" && detectedLanguage
                ? {
                    ...languagePair,
                    id: `${detectedLanguage.code}-bn`,
                    source: {
                      ...languagePair.source,
                      code: detectedLanguage.code,
                      name: detectedLanguage.name,
                      nativeName: detectedLanguage.nativeName || detectedLanguage.name,
                    },
                  }
                : languagePair;
            const trOut = await translateBatchWithCache(englishSegments, translationPair, signal);
            bilingualSegments = trOut.segments;
            totalRetries += trOut.retryCount;
            if (trOut.modelUsed) translationModel = trOut.modelUsed;
            break;
          } catch (err) {
            if (signal?.aborted) throw err;
            const e = err as Error & {
              code?: string;
              retryCount?: number;
              retryAfterSeconds?: number;
            };
            totalRetries += e.retryCount ?? 0;
            failedRequests++;
            if (concurrencyLimit > 1) {
              concurrencyLimit = Math.max(1, concurrencyLimit - 1);
            }
            const maxTrAttempts = !autoRetry ? 1 : e.code === "RATE_LIMIT" ? 4 : 3;
            if (trAttempt >= maxTrAttempts || e.code === "AI_UNAVAILABLE") {
              (e as Error & { errorStage?: ProcessingErrorStage }).errorStage = "translation";
              throw err;
            }
            totalRetries++;
            if (e.code === "RATE_LIMIT") {
              await triggerSharedCooldown(e.retryAfterSeconds);
            } else {
              await waitWithAbort(700 * trAttempt);
            }
          }
        }
        translateTimeMs += Math.round(performance.now() - transT0);
      }

      translatedChunks.add(chunk.index);
      buckets.set(chunk.index, {
        chunkIndex: chunk.index,
        startOffsetSeconds: chunk.startOffsetSeconds,
        durationSeconds: chunk.durationSeconds,
        segments: bilingualSegments,
      });

      saveChunkToCache(
        cacheKey,
        { fileName: file.name, fileSize: file.size, totalChunks: chunk.totalChunks, totalDuration },
        {
          chunkIndex: chunk.index,
          startOffsetSeconds: chunk.startOffsetSeconds,
          durationSeconds: chunk.durationSeconds,
          segments: bilingualSegments,
          transcribed: true,
          translated: true,
          updatedAt: Date.now(),
        }
      );

      syncAndPublish(70, "Processing");
      emitProgress(
        "recognizing",
        "Recognizing & translating...",
        `${translatedChunks.size}/${chunk.totalChunks} parts complete`,
        70,
        "Processing"
      );
    } finally {
      inFlightChunks.delete(chunk.index);
    }
  };

  const pumpQueue = () => {
    while (
      activeWorkers < concurrencyLimit &&
      pendingChunks.length > 0 &&
      !fatalError &&
      !signal?.aborted
    ) {
      const nextChunk = pendingChunks.shift()!;
      activeWorkers++;
      if (activeWorkers > peakConcurrencyUsed) peakConcurrencyUsed = activeWorkers;
      runChunkWithAdaptiveBackoff(nextChunk)
        .catch((err) => {
          if (!fatalError) {
            fatalError = err instanceof Error ? err : new Error("Speech recognition failed.");
          }
        })
        .finally(() => {
          activeWorkers--;
          pumpQueue();
          checkAllDone();
        });
    }
    checkAllDone();
  };

  const queueDonePromise = new Promise<void>((resolve) => {
    resolveQueueDone = resolve;
  });

  try {
    const extractResult = await extractAudioChunksStreaming(file, {
      durationHint,
      chunkDurationSeconds: effectiveChunkSeconds,
      overlapSeconds: 1.5,
      singlePassMaxSeconds: effectiveChunkSeconds * 2,
      maxChunkBytes: 9 * 1024 * 1024,
      signal,
      onMetadataReady: (meta) => {
        if (meta.totalDuration > 0) totalDuration = meta.totalDuration;
        if (meta.estimatedTotalChunks > 0) totalChunksEstimate = meta.estimatedTotalChunks;
        if (meta.detectMs !== undefined) audioDetectMs = meta.detectMs;
        if (meta.extractionMode) extractionMode = meta.extractionMode;
        if (meta.sourceCodec) sourceAudioCodec = meta.sourceCodec;
        if (meta.outputFormat) outputAudioFormat = meta.outputFormat;
        if (meta.outputMimeType) outputMimeType = meta.outputMimeType;
        if (meta.fallbackReason) fallbackReason = meta.fallbackReason;
        const modeText =
          meta.extractionMode === "zero-transcode-copy"
            ? `Zero-transcode copy (${meta.sourceCodec?.toUpperCase() ?? "AUDIO"} → ${meta.outputFormat ?? "Audio"})`
            : meta.fallbackReason || "Audio-only extraction";
        emitProgress("analyzing", "Extracting audio track...", modeText);
      },
      onDecodeProgress: (pct) => {
        extractProgress = pct;
        emitProgress(
          "analyzing",
          "Extracting audio track...",
          extractionMode === "zero-transcode-copy" && sourceAudioCodec
            ? `Direct packet copy: ${sourceAudioCodec.toUpperCase()} → ${outputAudioFormat ?? "Audio"}`
            : "Demuxing compressed audio packets in worker"
        );
      },
      onChunkReady: (chunk, pct) => {
        extractProgress = pct;
        totalChunksEstimate = chunk.totalChunks;
        if (chunk.detectMs !== undefined) audioDetectMs = chunk.detectMs;
        if (chunk.extractPacketsMs !== undefined) packetExtractMs = chunk.extractPacketsMs;
        if (chunk.muxMs !== undefined) containerMuxMs = chunk.muxMs;
        if (chunk.extractionMode) extractionMode = chunk.extractionMode;
        if (chunk.codec) sourceAudioCodec = chunk.codec;
        if (chunk.outputFormat) outputAudioFormat = chunk.outputFormat;
        if (chunk.mimeType) outputMimeType = chunk.mimeType;
        if (chunk.audioBytes) extractedAudioBytes += chunk.audioBytes.byteLength;
        pendingChunks.push(chunk);
        pumpQueue();
      },
    });

    totalChunksEstimate = extractResult.totalChunks;
    totalDuration = extractResult.totalDuration;
    extractionTimeMs = extractResult.extractionMs;
    audioDetectMs = extractResult.detectMs ?? audioDetectMs;
    packetExtractMs = extractResult.extractPacketsMs ?? packetExtractMs;
    containerMuxMs = extractResult.muxMs ?? containerMuxMs;
    extractedAudioBytes = extractResult.extractedAudioBytes ?? extractedAudioBytes;
    extractionMode = extractResult.extractionMode ?? extractionMode;
    sourceAudioCodec = extractResult.sourceCodec ?? sourceAudioCodec;
    outputAudioFormat = extractResult.outputFormat ?? outputAudioFormat;
    outputMimeType = extractResult.outputMimeType ?? outputMimeType;
    fallbackReason = extractResult.fallbackReason ?? fallbackReason;

    extractProgress = 100;
    extractionFinished = true;
    emitProgress(
      "recognizing",
      languagePair.source.code === "auto"
        ? "Detecting language & recognizing speech..."
        : `Recognizing ${languagePair.source.name} speech...`,
      `${totalChunksEstimate} ${totalChunksEstimate === 1 ? "part" : "parts"} queued (concurrency ${concurrencyLimit})`
    );
    checkAllDone();
  } catch (err) {
    extractionFinished = true;
    if (!fatalError) {
      const wrapped = err instanceof Error ? err : new Error("Could not read the video.");
      (wrapped as Error & { errorStage?: ProcessingErrorStage }).errorStage = "extraction";
      fatalError = wrapped;
    }
    checkAllDone();
  }

  await queueDonePromise;

  if (signal?.aborted) {
    const err = new Error("Processing paused. Completed segments are saved locally.") as Error & {
      code?: string;
    };
    err.code = "ABORTED";
    throw err;
  }

  if (fatalError) {
    throw fatalError;
  }

  emitProgress(
    "synchronizing",
    "Validating & synchronizing subtitles...",
    "Checking timestamps, duplicates, and Bengali lines",
    85,
    "Processing"
  );

  const syncT0 = performance.now();
  let merged = mergeAndSyncChunkSegments(Array.from(buckets.values()), totalDuration);
  const validation = validateAndRepairSegments(merged, totalDuration);
  merged = validation.segments;

  if (validation.missingTranslationIds.length > 0) {
    const missingSet = new Set(validation.missingTranslationIds);
    const missingItems = merged.filter((s) => missingSet.has(s.id));
    if (missingItems.length > 0) {
      try {
        const repaired = await translateBatchWithCache(missingItems, languagePair, signal);
        const repairMap = new Map(repaired.segments.map((r) => [r.id, r.targetText]));
        merged = merged.map((s) => ({
          ...s,
          targetText: repairMap.get(s.id) || s.targetText,
        }));
      } catch {
        // Keep partial translations rather than failing the whole job
      }
    }
  }
  syncTimeMs += Math.round(performance.now() - syncT0);
  lastSyncedSegments = merged;
  onSegmentsUpdate(merged);

  if (merged.length === 0) {
    const err = new Error(
      languagePair.source.code === "auto"
        ? "No spoken speech detected in this video."
        : `No ${languagePair.source.name} speech detected.`
    ) as Error & { code?: string };
    err.code = "NO_SPEECH";
    throw err;
  }

  const totalMs = Math.round(performance.now() - pipelineStart);
  const finalStageMetrics = buildStageMetrics();
  const metrics: PipelineMetrics = {
    audioExtractionMs: extractionTimeMs,
    speechRecognitionMs: speechNetMs > 0 ? speechNetMs : speechTimeMs,
    translationMs: translateTimeMs,
    syncMs: syncTimeMs,
    totalMs,
    retryCount: totalRetries,
    failedRequests,
    concurrencyUsed: peakConcurrencyUsed,
    transcriptionModel,
    translationModel,
    tierWarning,
    audioDetectMs: finalStageMetrics.audioDetectMs,
    packetExtractMs: finalStageMetrics.packetExtractMs,
    containerMuxMs: finalStageMetrics.containerMuxMs,
    audioUploadMs: finalStageMetrics.audioUploadMs,
    extractedAudioBytes: finalStageMetrics.extractedAudioBytes,
    extractionMode: finalStageMetrics.extractionMode,
    sourceAudioCodec: finalStageMetrics.sourceAudioCodec,
    outputAudioFormat: finalStageMetrics.outputAudioFormat,
    outputMimeType: finalStageMetrics.outputMimeType,
    fallbackReason: finalStageMetrics.fallbackReason,
  };

  onProgress({
    stage: "ready",
    progress: 100,
    message: "Ready!",
    detail: `${merged.length} synchronized ${detectedLanguage?.name ?? languagePair.source.name} → বাংলা subtitles`,
    extractProgress: 100,
    speechProgress: 100,
    translateProgress: 100,
    syncProgress: 100,
    syncLabel: "Complete",
    processedSeconds: totalDuration,
    totalSeconds: totalDuration,
    completedChunks: totalChunksEstimate,
    totalChunks: totalChunksEstimate,
    completedSegmentsCount: merged.length,
    retryCount: totalRetries,
    failedRequests,
    activeConcurrency: concurrencyLimit,
    transcriptionModel,
    translationModel,
    tierWarning,
    detectedLanguage,
    stageMetrics: finalStageMetrics,
    metrics,
  });

  return { segments: merged, metrics, totalDuration, detectedLanguage };
}

export async function translateSubtitleSegments(
  segments: SubtitleSegment[],
  languagePair: LanguagePairConfig,
  engine: TranslationEngineMode
): Promise<SubtitleSegment[]> {
  if (segments.length === 0) return [];

  if (engine === "ai") {
    try {
      const out = await translateBatchWithCache(segments, languagePair);
      return out.segments;
    } catch {
      // Fall through to free translation fallback
    }
  }

  const translatedList: SubtitleSegment[] = [];
  for (const seg of segments) {
    const bn = await translateTextFreeFallback(
      seg.sourceText,
      languagePair.source.code
    );
    translatedList.push({ ...seg, targetText: bn });
  }
  return translatedList;
}

export function parseSubtitleFile(rawText: string): SubtitleSegment[] {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/^WEBVTT[^\n]*\n+/, "").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const segments: SubtitleSegment[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx === -1) continue;

    const [startStr, endStr] = lines[timingIdx].split("-->").map((s) => s.trim().split(" ")[0]);
    const start = parseTimeInput(startStr);
    const end = parseTimeInput(endStr);
    if (start === null || end === null || end <= start) continue;

    const textLines = lines.slice(timingIdx + 1);
    if (textLines.length === 0) continue;

    const hasBengali = (t: string) => /[\u0980-\u09FF]/.test(t);
    const bengaliLines = textLines.filter(hasBengali);
    const englishLines = textLines.filter((l) => !hasBengali(l));

    segments.push({
      id: `imported-${i + 1}-${Date.now()}`,
      startTime: start,
      endTime: end,
      sourceText: englishLines.join(" ").trim() || textLines[0],
      targetText: bengaliLines.join(" ").trim(),
    });
  }

  return segments;
}

export function isWebSpeechSupported(): boolean {
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function hasResumableCacheForFile(
  file: Pick<File, "name" | "size" | "lastModified">,
  languagePairId: string,
  englishAccent: EnglishAccent = "us"
): { hasCache: boolean; cachedChunks: number; totalChunks: number } {
  const cachePairKey =
    languagePairId === "en-bn" ? `${languagePairId}-${englishAccent}` : languagePairId;
  const key = buildVideoCacheKey(file, cachePairKey);
  const cache = loadVideoProcessingCache(key);
  if (!cache) return { hasCache: false, cachedChunks: 0, totalChunks: 0 };
  const completed = Object.values(cache.chunks).filter(
    (c) => c.transcribed && c.translated
  ).length;
  return {
    hasCache: completed > 0,
    cachedChunks: completed,
    totalChunks: cache.totalChunks || completed,
  };
}
