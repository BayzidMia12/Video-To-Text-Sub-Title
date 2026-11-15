import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

/**
 * Independent model configurations for speech recognition and Bengali translation.
 * Uses free-tier models only; never silently activates paid-only models.
 */
export const MODEL_CONFIG = {
  transcription: {
    primary: "gemini-3.5-transcribe",
    freeFallback: "gemini-3.1-flash-lite",
    secondaryFreeFallback: "gemini-4-hydrogen",
  },
  translation: {
    primary: "gemini-3.1-flash-lite",
    freeFallback: "gemini-4-hydrogen",
    thinkingLevel: ThinkingLevel.MINIMAL,
  },
} as const;

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

interface RawSegmentResponse {
  detectedSpeech?: boolean;
  detectedLanguageCode?: string;
  detectedLanguageName?: string;
  segments?: Array<{
    startSeconds?: number;
    endSeconds?: number;
    sourceText?: string;
    targetText?: string;
    speaker?: string;
  }>;
  words?: Array<{
    word?: string;
    startSeconds?: number;
    endSeconds?: number;
    speaker?: string;
  }>;
}

interface WordItem {
  word: string;
  startSeconds: number;
  endSeconds: number;
  speaker?: string;
}

interface NormalizedSegment {
  id: string;
  startTime: number;
  endTime: number;
  sourceText: string;
  targetText: string;
  speaker?: string;
}

interface TranslateRequestSegment {
  id: string;
  sourceText?: string;
  english?: string;
}

const KNOWN_SOURCE_LANGUAGES: Record<
  string,
  { code: string; name: string; nativeName: string; scriptInstruction: string }
> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    scriptInstruction: "Transcribe verbatim in standard English orthography with proper punctuation.",
  },
  ko: {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    scriptInstruction: "Transcribe verbatim in Korean Hangul (한국어). Do NOT romanize or translate.",
  },
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    scriptInstruction: "Transcribe verbatim in Hindi Devanagari script (हिन्दी). Do NOT romanize (Hinglish) unless English loanwords are naturally mixed, and do NOT translate.",
  },
  zh: {
    code: "zh",
    name: "Chinese (Mandarin)",
    nativeName: "中文",
    scriptInstruction: "Transcribe verbatim in Mandarin Chinese characters (简体中文 or 繁體中文 matching context). Do NOT convert to Pinyin and do NOT translate.",
  },
  ta: {
    code: "ta",
    name: "Tamil",
    nativeName: "தமிழ்",
    scriptInstruction: "Transcribe verbatim in Tamil script (தமிழ்). Do NOT romanize or translate.",
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    scriptInstruction: "Transcribe verbatim in German (Deutsch) preserving umlauts (ä, ö, ü) and ß. Do NOT translate.",
  },
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    scriptInstruction: "Transcribe verbatim in Arabic script (العربية), supporting both Modern Standard Arabic and regional spoken Arabic. Do NOT romanize or translate.",
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    scriptInstruction: "Transcribe verbatim in standard Japanese script (Kanji, Hiragana, Katakana). Do NOT romanize (Romaji) and do NOT translate.",
  },
};

function normalizeDetectedLanguage(
  rawCode?: string,
  rawName?: string
): { code: string; name: string; nativeName?: string } | undefined {
  const cleanedCode = (rawCode ?? "").trim().toLowerCase().split("-")[0];
  const cleanedName = (rawName ?? "").trim().toLowerCase();

  if (cleanedCode && KNOWN_SOURCE_LANGUAGES[cleanedCode]) {
    const info = KNOWN_SOURCE_LANGUAGES[cleanedCode];
    return { code: info.code, name: info.name, nativeName: info.nativeName };
  }
  if (cleanedCode === "cmn" || cleanedCode === "zh-cn" || cleanedCode === "zh-tw") {
    return { code: "zh", name: "Chinese (Mandarin)", nativeName: "中文" };
  }
  for (const info of Object.values(KNOWN_SOURCE_LANGUAGES)) {
    if (cleanedName && cleanedName.includes(info.name.toLowerCase().split(" ")[0])) {
      return { code: info.code, name: info.name, nativeName: info.nativeName };
    }
  }
  if (cleanedName.includes("mandarin") || cleanedName.includes("chinese")) {
    return { code: "zh", name: "Chinese (Mandarin)", nativeName: "中文" };
  }
  if (cleanedCode && cleanedName) {
    return { code: cleanedCode, name: rawName!.trim() };
  }
  return undefined;
}

function buildLanguageTranscriptionRules(
  sourceCode: string,
  sourceName: string,
  englishAccent: string
): { isAuto: boolean; label: string; scriptInstruction: string } {
  const code = sourceCode.toLowerCase().split("-")[0];
  if (code === "auto") {
    return {
      isAuto: true,
      label: "spoken",
      scriptInstruction:
        "Identify the primary spoken language from the actual audio (English, Korean, Hindi, Japanese, Mandarin Chinese, Tamil, German, Arabic, etc.). Set detectedLanguageCode and detectedLanguageName accurately, and transcribe verbatim in that language's native script (Hangul for Korean, Devanagari for Hindi, Kanji/Kana for Japanese, Chinese characters for Mandarin, Tamil script for Tamil, Arabic script for Arabic, German orthography for German, English for US/UK/Australian English). NEVER translate to Bengali or English.",
    };
  }
  if (code === "en") {
    const accentNote =
      englishAccent === "au"
        ? "Speaker may have an Australian English accent; recognize Australian pronunciation accurately and transcribe ONLY words clearly spoken."
        : englishAccent === "uk"
        ? "Speaker may have a British (UK) English accent."
        : "Speaker may have a US or international English accent.";
    return {
      isAuto: false,
      label: "English",
      scriptInstruction: `Transcribe verbatim in standard English. ${accentNote}`,
    };
  }
  const known = KNOWN_SOURCE_LANGUAGES[code];
  if (known) {
    return {
      isAuto: false,
      label: known.name,
      scriptInstruction: known.scriptInstruction,
    };
  }
  return {
    isAuto: false,
    label: sourceName || "spoken",
    scriptInstruction: `Transcribe verbatim in ${sourceName || "the spoken language"}'s native script. Do NOT translate.`,
  };
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { status?: number; code?: number; message?: string };
  if (typeof e.status === "number") return e.status;
  if (typeof e.code === "number") return e.code;
  if (typeof e.message === "string") {
    const m = e.message.match(/"(?:code|status)"\s*:\s*(\d{3})/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

function parseRetryAfterMs(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const secMatch = msg.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  if (secMatch) {
    return Math.ceil(Number(secMatch[1]) * 1000);
  }
  const msMatch = msg.match(/retry in\s+(\d+(?:\.\d+)?)ms/i);
  if (msMatch) {
    return Math.ceil(Number(msMatch[1]));
  }
  return null;
}

function isNonRetryableError(error: unknown): boolean {
  const status = getHttpStatus(error);
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /NOT_FOUND|PERMISSION_DENIED|not found|not supported|unsupported|invalid argument|Unknown name/i.test(
    msg
  );
}

/**
 * Sliding 60s RPM window + cooldown tracker per model so free-tier requests
 * stay under Gemini's 15 RPM per-model cap and spill cleanly to secondary free models.
 */
const modelCallTimestamps = new Map<string, number[]>();
const modelCooldownUntil = new Map<string, number>();
const FLASH_LITE_SAFE_RPM = 11;

function recordModelCall(model: string) {
  const now = Date.now();
  const list = (modelCallTimestamps.get(model) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  modelCallTimestamps.set(model, list);
}

function markModelRateLimited(model: string, error: unknown) {
  const retryMs = parseRetryAfterMs(error) ?? 20_000;
  modelCooldownUntil.set(model, Date.now() + Math.min(45_000, Math.max(5_000, retryMs)));
}

function isModelAvailableForBurst(model: string, rpmLimit = FLASH_LITE_SAFE_RPM): boolean {
  const now = Date.now();
  const cooldown = modelCooldownUntil.get(model) ?? 0;
  if (now < cooldown) return false;
  const recent = (modelCallTimestamps.get(model) ?? []).filter((t) => now - t < 60_000);
  modelCallTimestamps.set(model, recent);
  return recent.length < rpmLimit;
}

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<{ result: T; retries: number }> {
  let lastError: unknown;
  let retries = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return { result, retries };
    } catch (err) {
      lastError = err;
      const status = getHttpStatus(err);
      if (isNonRetryableError(err)) {
        throw err;
      }
      // If rate-limited and Gemini asks for > 6s retry delay, throw immediately so caller can failover to secondary free model
      const retryAfterMs = parseRetryAfterMs(err);
      if (status === 429 && retryAfterMs !== null && retryAfterMs > 6000) {
        throw err;
      }
      if (attempt < maxAttempts) {
        retries++;
        const baseDelay = status === 429 ? Math.min(5000, retryAfterMs ?? 1800) : 600;
        const delayMs = status === 429 ? baseDelay : baseDelay * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Builds crisp 1-2 line subtitle segments directly from word-level timestamps,
 * breaking naturally at punctuation, speaker changes, pauses >= 0.35s, or 10-word boundaries.
 */
function buildSegmentsFromWords(
  words: WordItem[],
  chunkIndex: number,
  chunkStartOffset: number,
  chunkDuration: number
): NormalizedSegment[] {
  const cleanWords = words
    .filter((w) => w.word && w.word.trim())
    .map((w) => ({
      word: w.word.trim(),
      startSeconds: Math.max(0, Math.min(chunkDuration, Number(w.startSeconds) || 0)),
      endSeconds: Math.max(
        Math.max(0, Number(w.startSeconds) || 0) + 0.08,
        Math.min(chunkDuration + 0.2, Number(w.endSeconds) || 0)
      ),
      speaker: w.speaker,
    }))
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (cleanWords.length === 0) return [];

  const segments: NormalizedSegment[] = [];
  let bucket: WordItem[] = [];

  const flushBucket = () => {
    if (bucket.length === 0) return;
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const text = bucket.map((w) => w.word).join(" ").trim();
    if (!text) {
      bucket = [];
      return;
    }
    const startTime = Number((chunkStartOffset + first.startSeconds).toFixed(2));
    const endTime = Number(
      (chunkStartOffset + Math.max(first.startSeconds + 0.45, last.endSeconds)).toFixed(2)
    );
    segments.push({
      id: `c${chunkIndex}-seg-${segments.length}-${Math.round(startTime * 100)}`,
      startTime,
      endTime,
      sourceText: text,
      targetText: "",
      speaker: first.speaker,
    });
    bucket = [];
  };

  for (let i = 0; i < cleanWords.length; i++) {
    const w = cleanWords[i];
    const prev = bucket[bucket.length - 1];

    if (prev) {
      const pauseGap = w.startSeconds - prev.endSeconds;
      const speakerChanged = Boolean(w.speaker && prev.speaker && w.speaker !== prev.speaker);
      const prevEndedSentence = /[.?!।。！？؟]$/.test(prev.word);
      const prevClauseBreak = /[,;:،、]$/.test(prev.word) && bucket.length >= 6;
      const maxDurationHit = w.endSeconds - bucket[0].startSeconds >= 4.5 && bucket.length >= 5;
      const maxWordsHit = bucket.length >= 11;

      if (
        speakerChanged ||
        prevEndedSentence ||
        pauseGap >= 0.42 ||
        prevClauseBreak ||
        maxDurationHit ||
        maxWordsHit
      ) {
        flushBucket();
      }
    }

    bucket.push(w);
  }
  flushBucket();

  return segments;
}

/**
 * Parses timestamps returned by gemini-3.5-transcribe (e.g. `[00:01.20 - 00:04.50] Speaker 1: text` or JSON).
 */
function parseTimecodeSeconds(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts.length === 1 ? parts[0] : null;
}

function parseTranscribeTextOutput(
  rawOutput: string,
  chunkIndex: number,
  chunkStartOffset: number,
  chunkDuration: number
): NormalizedSegment[] {
  const trimmed = rawOutput.trim();
  if (!trimmed) return [];

  // Try JSON payload first (segments or word-level timestamps)
  try {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as RawSegmentResponse | Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        if (Array.isArray(parsed.words) && parsed.words.length > 0) {
          const validWords = parsed.words
            .filter((w) => w.word && w.word.trim())
            .map((w) => ({
              word: (w.word ?? "").trim(),
              startSeconds: Number(w.startSeconds) || 0,
              endSeconds: Number(w.endSeconds) || 0,
              speaker: w.speaker,
            }));
          if (validWords.length > 0) {
            return buildSegmentsFromWords(validWords, chunkIndex, chunkStartOffset, chunkDuration);
          }
        }
        if (Array.isArray(parsed.segments)) {
          return parsed.segments
            .filter((s) => s.sourceText && s.sourceText.trim())
            .map((s, idx) => {
              const relStart = Math.max(0, Math.min(chunkDuration, Number(s.startSeconds) || 0));
              const relEnd = Math.max(
                relStart + 0.45,
                Math.min(chunkDuration + 0.2, Number(s.endSeconds) || relStart + 2.0)
              );
              return {
                id: `c${chunkIndex}-seg-${idx}-${Math.round((chunkStartOffset + relStart) * 100)}`,
                startTime: Number((chunkStartOffset + relStart).toFixed(2)),
                endTime: Number((chunkStartOffset + relEnd).toFixed(2)),
                sourceText: (s.sourceText ?? "").trim(),
                targetText: "",
                speaker: s.speaker,
              };
            });
        }
      }
    }
  } catch {
    // Fall through to timestamped line parser
  }

  // Parse timestamped lines like `[00:01.20 --> 00:04.10] Hello everyone.`
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsedLines: NormalizedSegment[] = [];
  const rangeRegex = /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*(?:-->|->|-|—)\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s*(?:(Speaker\s*\d+)\s*:\s*)?(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(rangeRegex);
    if (m) {
      const startSec = parseTimecodeSeconds(m[1]);
      const endSec = parseTimecodeSeconds(m[2]);
      const text = (m[4] ?? "").trim();
      if (startSec !== null && endSec !== null && text) {
        const s = Math.max(0, Math.min(chunkDuration, startSec));
        const e = Math.max(s + 0.45, Math.min(chunkDuration + 0.2, endSec));
        parsedLines.push({
          id: `c${chunkIndex}-seg-${parsedLines.length}-${Math.round((chunkStartOffset + s) * 100)}`,
          startTime: Number((chunkStartOffset + s).toFixed(2)),
          endTime: Number((chunkStartOffset + e).toFixed(2)),
          sourceText: text,
          targetText: "",
          speaker: m[3] || undefined,
        });
      }
    }
  }

  return parsedLines;
}

/**
 * Incrementally extracts completed JSON objects from a streaming `"segments": [ {...}, {...} ]` payload.
 */
class IncrementalSegmentScanner {
  private buffer = "";
  private arrayStarted = false;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private objStart = -1;
  private scanCursor = 0;

  push(chunkText: string): Array<{ startSeconds?: number; endSeconds?: number; sourceText?: string; speaker?: string }> {
    this.buffer += chunkText;
    const completed: Array<{ startSeconds?: number; endSeconds?: number; sourceText?: string; speaker?: string }> = [];

    if (!this.arrayStarted) {
      const segKeyIdx = this.buffer.indexOf('"segments"');
      if (segKeyIdx === -1) return completed;
      const bracketIdx = this.buffer.indexOf("[", segKeyIdx);
      if (bracketIdx === -1) return completed;
      this.arrayStarted = true;
      this.scanCursor = bracketIdx + 1;
    }

    for (; this.scanCursor < this.buffer.length; this.scanCursor++) {
      const ch = this.buffer[this.scanCursor];

      if (this.inString) {
        if (this.escaped) {
          this.escaped = false;
        } else if (ch === "\\") {
          this.escaped = true;
        } else if (ch === '"') {
          this.inString = false;
        }
        continue;
      }

      if (ch === '"') {
        this.inString = true;
        continue;
      }

      if (ch === "{") {
        if (this.depth === 0) {
          this.objStart = this.scanCursor;
        }
        this.depth++;
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.objStart !== -1) {
          const rawObj = this.buffer.slice(this.objStart, this.scanCursor + 1);
          this.objStart = -1;
          try {
            const parsed = JSON.parse(rawObj) as {
              startSeconds?: number;
              endSeconds?: number;
              sourceText?: string;
              speaker?: string;
            };
            completed.push(parsed);
          } catch {
            // Final JSON parse on stream completion handles edge cases
          }
        }
      } else if (ch === "]" && this.depth === 0) {
        break;
      }
    }

    return completed;
  }

  getFullText(): string {
    return this.buffer;
  }
}

const app = express();
app.use(
  express.raw({
    type: ["audio/*", "application/ogg", "video/webm", "application/octet-stream"],
    limit: "25mb",
  })
);
app.use(express.json({ limit: "35mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  const client = createGeminiClient();
  res.json({
    status: "ok",
    aiAvailable: Boolean(client),
    models: {
      transcription: MODEL_CONFIG.transcription.primary,
      transcriptionFallback: MODEL_CONFIG.transcription.freeFallback,
      translation: MODEL_CONFIG.translation.primary,
    },
  });
});

let transcribePrimaryUnavailable: { reason: string; checkedAt: number } | null = null;
let transcribePrimaryConfirmed = false;
let activePrimaryProbe: Promise<void> | null = null;
const TRANSCRIBE_PROBE_TTL_MS = 5 * 60 * 1000;
const PRIMARY_PROBE_TIMEOUT_MS = 7000;

/**
 * Low-latency streaming English Speech-to-Text endpoint (SSE).
 * Accepts raw binary audio/* (preferred — zero client Base64) or JSON audioBase64.
 */
app.post("/api/transcribe-chunk-stream", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let retryCount = 0;

  try {
    const ai = createGeminiClient();
    if (!ai) {
      sendEvent({
        type: "error",
        code: "AI_UNAVAILABLE",
        error: "AI service is not configured on this server. You can use Browser Free Mode.",
      });
      res.end();
      return;
    }

    let audioBuffer: Buffer | null = null;
    let audioBase64 = "";
    let mimeType = "audio/wav";
    let chunkIndex = 0;
    let chunkStartOffset = 0;
    let chunkDuration = 50;
    let sourceLanguageName = "English";
    let sourceLanguageCode = "en";
    let englishAccent = "us";

    if (Buffer.isBuffer(req.body)) {
      audioBuffer = req.body;
      mimeType = (req.header("content-type") || "audio/wav").split(";")[0].trim();
      chunkIndex = Number(req.header("x-chunk-index")) || 0;
      chunkStartOffset = Number(req.header("x-chunk-start")) || 0;
      chunkDuration = Number(req.header("x-chunk-duration")) || 50;
      sourceLanguageName = req.header("x-source-language") || "English";
      sourceLanguageCode = req.header("x-source-code") || "en";
      englishAccent = req.header("x-english-accent") || "us";
    } else {
      const body = (req.body ?? {}) as {
        audioBase64?: string;
        mimeType?: string;
        chunkIndex?: number;
        chunkStartOffset?: number;
        chunkDuration?: number;
        sourceLanguageName?: string;
        sourceLanguageCode?: string;
        englishAccent?: string;
      };
      audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
      mimeType = body.mimeType ?? "audio/wav";
      chunkIndex = body.chunkIndex ?? 0;
      chunkStartOffset = body.chunkStartOffset ?? 0;
      chunkDuration = body.chunkDuration ?? 50;
      sourceLanguageName = body.sourceLanguageName ?? "English";
      sourceLanguageCode = body.sourceLanguageCode ?? "en";
      englishAccent = body.englishAccent ?? "us";
      if (audioBase64) {
        audioBuffer = Buffer.from(audioBase64, "base64");
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      sendEvent({
        type: "error",
        code: "AUDIO_ERROR",
        error: "No audio data was provided for analysis.",
      });
      res.end();
      return;
    }

    // Fast server-side silence gate for 16-bit PCM WAV payloads to avoid wasting quota or hallucinating on silence
    if (mimeType.includes("wav") && audioBuffer.length > 44 && audioBuffer.toString("ascii", 0, 4) === "RIFF") {
      let sumSq = 0;
      let samples = 0;
      for (let offset = 44; offset + 1 < audioBuffer.length; offset += 8) {
        const s = audioBuffer.readInt16LE(offset) / 32768;
        sumSq += s * s;
        samples++;
      }
      const rms = samples > 0 ? Math.sqrt(sumSq / samples) : 1;
      if (rms < 0.0025) {
        sendEvent({
          type: "done",
          detectedSpeech: false,
          segments: [],
          modelUsed: transcribePrimaryUnavailable
            ? MODEL_CONFIG.transcription.freeFallback
            : MODEL_CONFIG.transcription.primary,
          retryCount: 0,
          tierWarning: transcribePrimaryUnavailable?.reason,
        });
        res.end();
        return;
      }
    }

    if (!audioBase64) {
      audioBase64 = audioBuffer.toString("base64");
    }
    audioBuffer = null;

    const normalizeOne = (
      raw: { startSeconds?: number; endSeconds?: number; sourceText?: string; speaker?: string },
      idx: number
    ): NormalizedSegment | null => {
      const text = (raw.sourceText ?? "").trim();
      if (!text) return null;
      const relStart = Math.max(0, Math.min(chunkDuration, Number(raw.startSeconds) || 0));
      const relEnd = Math.max(
        relStart + 0.45,
        Math.min(chunkDuration + 0.2, Number(raw.endSeconds) || relStart + 2.0)
      );
      return {
        id: `c${chunkIndex}-seg-${idx}-${Math.round((chunkStartOffset + relStart) * 100)}`,
        startTime: Number((chunkStartOffset + relStart).toFixed(2)),
        endTime: Number((chunkStartOffset + relEnd).toFixed(2)),
        sourceText: text,
        targetText: "",
        speaker: raw.speaker,
      };
    };

    let usedModel: string = MODEL_CONFIG.transcription.primary;
    let tierWarning: string | undefined;
    const emittedSegments: NormalizedSegment[] = [];
    let finalDetectedSpeech = false;
    let transcribeSucceeded = false;

    if (activePrimaryProbe) {
      await activePrimaryProbe;
    }

    const langRules = buildLanguageTranscriptionRules(
      sourceLanguageCode,
      sourceLanguageName,
      englishAccent
    );
    let detectedLanguage: { code: string; name: string; nativeName?: string } | undefined;

    const primaryCachedUnavailable =
      transcribePrimaryUnavailable &&
      Date.now() - transcribePrimaryUnavailable.checkedAt < TRANSCRIBE_PROBE_TTL_MS;

    if (langRules.isAuto) {
      // Auto Detect uses structured schema (detectedLanguageCode + detectedLanguageName + segments)
    } else if (primaryCachedUnavailable && transcribePrimaryUnavailable) {
      tierWarning = transcribePrimaryUnavailable.reason;
    } else {
      // Step 1: Try dedicated `gemini-3.5-transcribe` with wordTimestamp + diarization.
      const isInitialProbe = !transcribePrimaryConfirmed;
      const probeHolder: { resolve: (() => void) | null } = { resolve: null };
      if (isInitialProbe) {
        activePrimaryProbe = new Promise<void>((resolve) => {
          probeHolder.resolve = resolve;
        });
      }

      try {
        recordModelCall(MODEL_CONFIG.transcription.primary);
        const transcribePrompt = langRules.isAuto
          ? `Identify the spoken language from the audio and transcribe it verbatim in its native script with timestamps formatted strictly as [MM:SS.ss --> MM:SS.ss] Speaker: spoken text. First line: LANGUAGE: <Language Name> (<ISO code>). Only transcribe actual speech; return empty if silent.`
          : `Transcribe the spoken ${langRules.label} audio verbatim in its native script with timestamps formatted strictly as [MM:SS.ss --> MM:SS.ss] Speaker: spoken text. ${langRules.scriptInstruction} Only transcribe actual speech; return empty if silent or non-speech.`;

        const { result: transcribeStream, retries } = await withExponentialBackoff(
          () =>
            ai.models.generateContentStream({
              model: MODEL_CONFIG.transcription.primary,
              contents: {
                parts: [
                  { inlineData: { mimeType, data: audioBase64 } },
                  { text: transcribePrompt },
                ],
              },
              config: isInitialProbe
                ? { abortSignal: AbortSignal.timeout(PRIMARY_PROBE_TIMEOUT_MS) }
                : undefined,
            }),
          isInitialProbe ? 1 : 2
        );
        retryCount += retries;

        let fullOutput = "";
        for await (const chunk of transcribeStream) {
          if (chunk.text) fullOutput += chunk.text;
        }

        if (langRules.isAuto) {
          const langLine = fullOutput.match(/^LANGUAGE:\s*([^\n(]+?)(?:\s*\(([a-zA-Z-]+)\))?\s*$/im);
          if (langLine) {
            detectedLanguage = normalizeDetectedLanguage(langLine[2], langLine[1]);
          }
        }

        const parsed = parseTranscribeTextOutput(
          fullOutput,
          chunkIndex,
          chunkStartOffset,
          chunkDuration
        );

        transcribePrimaryConfirmed = true;
        if (parsed.length > 0) {
          for (const seg of parsed) {
            emittedSegments.push(seg);
            sendEvent({ type: "segment", segment: seg });
          }
          finalDetectedSpeech = true;
          transcribeSucceeded = true;
        } else if (fullOutput.trim().length > 0 && !/no speech|silence|\[\]/i.test(fullOutput)) {
          tierWarning = `${MODEL_CONFIG.transcription.primary} returned untimed text; using free-tier ${MODEL_CONFIG.transcription.freeFallback} for exact subtitle timestamps.`;
        } else {
          finalDetectedSpeech = false;
          transcribeSucceeded = true;
        }
      } catch (transcribeErr) {
        const status = getHttpStatus(transcribeErr);
        const errMsg = transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr);
        if (status === 429) {
          markModelRateLimited(MODEL_CONFIG.transcription.primary, transcribeErr);
          tierWarning = `${MODEL_CONFIG.transcription.primary} hit a free-tier rate limit; using free-tier ${MODEL_CONFIG.transcription.freeFallback}.`;
        } else if (
          status === 400 ||
          status === 403 ||
          status === 404 ||
          /not found|not supported|permission|scope|abort|timeout/i.test(errMsg)
        ) {
          tierWarning = `${MODEL_CONFIG.transcription.primary} is unavailable in this project's free tier; using free-tier ${MODEL_CONFIG.transcription.freeFallback}.`;
          transcribePrimaryUnavailable = { reason: tierWarning, checkedAt: Date.now() };
        } else {
          tierWarning = `${MODEL_CONFIG.transcription.primary} unavailable; using free-tier ${MODEL_CONFIG.transcription.freeFallback}.`;
          transcribePrimaryUnavailable = { reason: tierWarning, checkedAt: Date.now() };
        }
      } finally {
        if (probeHolder.resolve) {
          activePrimaryProbe = null;
          probeHolder.resolve();
        }
      }
    }

    // Step 2: Free-tier fast structured fallback (`gemini-3.1-flash-lite` -> overflow to `gemini-4-hydrogen` on 429)
    if (!transcribeSucceeded) {
      const systemInstruction = [
        `You are a high-precision multilingual ${langRules.isAuto ? "" : langRules.label + " "}speech-to-text subtitler.`,
        `Listen carefully to this ${chunkDuration.toFixed(1)}-second audio clip.`,
        `Rules:`,
        `1. CRITICAL: Only transcribe genuine, clearly intelligible human spoken words. If the audio contains only silence, steady tones, beeps, background music, static, or non-speech noise, you MUST return detectedSpeech: false and segments: []. NEVER invent, guess, or hallucinate phrases or fillers when speech is absent.`,
        `2. ${langRules.scriptInstruction}`,
        `3. Break speech into concise, readable 1–2 line subtitle segments (natural clause/sentence boundaries, roughly 4–12 words or 10–28 CJK characters). Never cut words awkwardly.`,
        `4. Provide accurate startSeconds and endSeconds strictly matching when the words are spoken inside THIS clip (0.0 to ${chunkDuration.toFixed(2)}). Never guess uniform intervals or shift timing.`,
      ].join("\n");

      const runStructuredTranscribeStream = async (model: string, thinkingLevel: ThinkingLevel) => {
        recordModelCall(model);
        return ai.models.generateContentStream({
          model,
          contents: {
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              {
                text: langRules.isAuto
                  ? `Listen carefully. If no clear human speech is present (only silence, tones, music, or noise), return detectedSpeech: false and segments: []. Otherwise detect the actual spoken language, set detectedLanguageCode and detectedLanguageName, and transcribe the speech verbatim in its original script into accurately timed subtitle segments.`
                  : `Listen carefully. If no clear human speech is present (only silence, tones, music, or noise), return detectedSpeech: false and segments: []. Otherwise transcribe the spoken ${langRules.label} in this clip verbatim in its native script into accurately timed subtitle segments.`,
              },
            ],
          },
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectedSpeech: { type: Type.BOOLEAN },
                detectedLanguageCode: { type: Type.STRING },
                detectedLanguageName: { type: Type.STRING },
                segments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      startSeconds: { type: Type.NUMBER },
                      endSeconds: { type: Type.NUMBER },
                      sourceText: { type: Type.STRING },
                      speaker: { type: Type.STRING },
                    },
                    required: ["startSeconds", "endSeconds", "sourceText"],
                  },
                },
              },
              required: ["detectedSpeech", "segments"],
            },
          },
        });
      };

      let streamResponse;
      const preferSecondary = !isModelAvailableForBurst(MODEL_CONFIG.transcription.freeFallback);
      if (preferSecondary) {
        usedModel = MODEL_CONFIG.transcription.secondaryFreeFallback;
        const out = await withExponentialBackoff(
          () => runStructuredTranscribeStream(MODEL_CONFIG.transcription.secondaryFreeFallback, ThinkingLevel.LOW),
          2
        );
        streamResponse = out.result;
        retryCount += out.retries;
      } else {
        usedModel = MODEL_CONFIG.transcription.freeFallback;
        try {
          const out = await withExponentialBackoff(
            () => runStructuredTranscribeStream(MODEL_CONFIG.transcription.freeFallback, ThinkingLevel.MINIMAL),
            2
          );
          streamResponse = out.result;
          retryCount += out.retries;
        } catch (fallbackErr) {
          const fallbackStatus = getHttpStatus(fallbackErr);
          if (fallbackStatus === 429) {
            markModelRateLimited(MODEL_CONFIG.transcription.freeFallback, fallbackErr);
            usedModel = MODEL_CONFIG.transcription.secondaryFreeFallback;
            retryCount++;
            const out = await withExponentialBackoff(
              () => runStructuredTranscribeStream(MODEL_CONFIG.transcription.secondaryFreeFallback, ThinkingLevel.LOW),
              2
            );
            streamResponse = out.result;
            retryCount += out.retries;
          } else {
            throw fallbackErr;
          }
        }
      }

      const scanner = new IncrementalSegmentScanner();
      for await (const chunk of streamResponse) {
        const text = chunk.text ?? "";
        if (!text) continue;
        const newlyCompleted = scanner.push(text);
        for (const rawSeg of newlyCompleted) {
          const normalized = normalizeOne(rawSeg, emittedSegments.length);
          if (normalized) {
            emittedSegments.push(normalized);
            sendEvent({ type: "segment", segment: normalized });
          }
        }
      }

      finalDetectedSpeech = emittedSegments.length > 0;
      try {
        const fullParsed = JSON.parse(scanner.getFullText().trim()) as RawSegmentResponse;
        if (typeof fullParsed.detectedSpeech === "boolean") {
          finalDetectedSpeech = fullParsed.detectedSpeech;
        }
        if (fullParsed.detectedLanguageCode || fullParsed.detectedLanguageName) {
          detectedLanguage = normalizeDetectedLanguage(
            fullParsed.detectedLanguageCode,
            fullParsed.detectedLanguageName
          );
        }
        if (emittedSegments.length === 0 && Array.isArray(fullParsed.segments)) {
          for (let i = 0; i < fullParsed.segments.length; i++) {
            const normalized = normalizeOne(fullParsed.segments[i], i);
            if (normalized) emittedSegments.push(normalized);
          }
        }
      } catch {
        // Rely on streamed emittedSegments
      }
    }

    if (!detectedLanguage && !langRules.isAuto) {
      const known = KNOWN_SOURCE_LANGUAGES[sourceLanguageCode.toLowerCase().split("-")[0]];
      if (known) {
        detectedLanguage = {
          code: known.code,
          name: known.name,
          nativeName: known.nativeName,
        };
      }
    }

    sendEvent({
      type: "done",
      detectedSpeech: finalDetectedSpeech && emittedSegments.length > 0,
      segments: finalDetectedSpeech ? emittedSegments : [],
      detectedLanguage,
      modelUsed: usedModel,
      retryCount,
      tierWarning,
    });
    res.end();
  } catch (error) {
    const status = getHttpStatus(error);
    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(error);
      const retryAfterSeconds = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 15;
      sendEvent({
        type: "error",
        code: "RATE_LIMIT",
        retryCount,
        retryAfterSeconds,
        error: `Free-tier AI rate limit reached. Automatically cooling down (~${retryAfterSeconds}s)—completed chunks are cached.`,
      });
    } else {
      console.warn("Streaming transcription error:", error instanceof Error ? error.message : String(error));
      sendEvent({
        type: "error",
        code: "UNKNOWN",
        retryCount,
        error: "Could not process audio speech recognition. Completed chunks are saved.",
      });
    }
    res.end();
  }
});

/**
 * Legacy single-call endpoint kept for compatibility.
 */
app.post("/api/transcribe-translate", async (req: Request, res: Response) => {
  try {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "AI service is not configured on this server. You can use Browser Free Mode or manual editing.",
        code: "AI_UNAVAILABLE",
      });
      return;
    }

    const {
      audioBase64,
      mimeType = "audio/wav",
      chunkStartOffset = 0,
      chunkDuration = 50,
      sourceLanguageName = "English",
      targetLanguageName = "Bengali",
    } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      chunkStartOffset?: number;
      chunkDuration?: number;
      sourceLanguageName?: string;
      targetLanguageName?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== "string") {
      res.status(400).json({ error: "No audio data was provided for analysis." });
      return;
    }

    const { result: response } = await withExponentialBackoff(() =>
      ai.models.generateContent({
        model: MODEL_CONFIG.translation.primary,
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            {
              text: `Transcribe spoken ${sourceLanguageName} with accurate timestamps and translate naturally into ${targetLanguageName} (বাংলা).`,
            },
          ],
        },
        config: {
          systemInstruction: `Transcribe spoken ${sourceLanguageName} into 1-2 line segments with exact timestamps and natural ${targetLanguageName} (বাংলা) translations.`,
          thinkingConfig: { thinkingLevel: MODEL_CONFIG.translation.thinkingLevel },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedSpeech: { type: Type.BOOLEAN },
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startSeconds: { type: Type.NUMBER },
                    endSeconds: { type: Type.NUMBER },
                    sourceText: { type: Type.STRING },
                    targetText: { type: Type.STRING },
                  },
                  required: ["startSeconds", "endSeconds", "sourceText", "targetText"],
                },
              },
            },
            required: ["detectedSpeech", "segments"],
          },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? "{}").trim()) as RawSegmentResponse;
    const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
    const normalizedSegments = rawSegments
      .filter((seg) => Boolean(seg.sourceText && seg.sourceText.trim()))
      .map((seg, idx) => {
        const relStart = Math.max(0, Number(seg.startSeconds) || 0);
        const relEnd = Math.max(relStart + 0.5, Number(seg.endSeconds) || relStart + 2.0);
        return {
          id: `seg-${Math.round((chunkStartOffset + relStart) * 1000)}-${idx}`,
          startTime: Number((chunkStartOffset + relStart).toFixed(2)),
          endTime: Number((chunkStartOffset + Math.min(relEnd, chunkDuration + 0.3)).toFixed(2)),
          sourceText: (seg.sourceText ?? "").trim(),
          targetText: (seg.targetText ?? "").trim(),
        };
      });

    res.json({
      detectedSpeech: Boolean(parsed.detectedSpeech) && normalizedSegments.length > 0,
      segments: normalizedSegments,
    });
  } catch (error) {
    console.error("Transcription/translation error:", error);
    const status = getHttpStatus(error);
    if (status === 429) {
      res.status(429).json({
        code: "RATE_LIMIT",
        error: "Free-tier rate limit reached temporarily. Please wait a moment and resume.",
      });
      return;
    }
    res.status(500).json({
      error: "Could not process audio speech recognition. Please try again.",
    });
  }
});

/**
 * Fast batched context-aware Bengali translation endpoint.
 * Processes 10-20 segments in one request and returns [{ id, english, bengali }].
 */
app.post("/api/translate-segments", async (req: Request, res: Response) => {
  let retryCount = 0;
  try {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "AI translation service is unavailable on this server.",
        code: "AI_UNAVAILABLE",
      });
      return;
    }

    const {
      segments = [],
      sourceLanguageName = "English",
      sourceLanguageCode = "en",
      targetLanguageName = "Bengali",
    } = req.body as {
      segments?: Array<TranslateRequestSegment>;
      sourceLanguageName?: string;
      sourceLanguageCode?: string;
      targetLanguageName?: string;
    };

    if (!Array.isArray(segments) || segments.length === 0) {
      res.status(400).json({ error: "No subtitle segments provided for translation." });
      return;
    }

    const normalizedInput = segments.map((s) => ({
      id: String(s.id),
      sourceText: (s.sourceText ?? s.english ?? "").trim(),
    }));
    const sourceById = new Map(normalizedInput.map((s) => [s.id, s.sourceText]));

    const effectiveSourceLabel =
      sourceLanguageCode === "auto"
        ? "the detected source language"
        : sourceLanguageName || "the source language";

    const systemInstruction = [
      `You are a fast, native-level subtitle translator converting ${effectiveSourceLabel} subtitles into natural conversational ${targetLanguageName} (বাংলা).`,
      `Rules:`,
      `- Translate every segment in context of adjacent segments so pronouns, honorifics, tense, and tone remain natural in Bengali.`,
      `- Use correct Bengali grammar, natural conversational phrasing, and proper Bengali punctuation (।, ?, !).`,
      `- Preserve personal names, place names, numbers, and important technical terminology accurately.`,
      `- NEVER translate word-by-word awkwardly; keep each Bengali subtitle short, clear, and readable on screen (1–2 lines).`,
      `- Return exactly one item per input segment, preserving every id unchanged. NEVER merge or skip any segment.`,
    ].join("\n");

    const runTranslate = async (model: string, useMinimalThinking: boolean) => {
      recordModelCall(model);
      return ai.models.generateContent({
        model,
        contents: JSON.stringify(normalizedInput),
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: useMinimalThinking
              ? MODEL_CONFIG.translation.thinkingLevel
              : ThinkingLevel.LOW,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                bengali: { type: Type.STRING },
              },
              required: ["id", "bengali"],
            },
          },
        },
      });
    };

    let usedModel: string = MODEL_CONFIG.translation.primary;
    let response;
    if (!isModelAvailableForBurst(MODEL_CONFIG.translation.primary)) {
      usedModel = MODEL_CONFIG.translation.freeFallback;
      const out = await withExponentialBackoff(
        () => runTranslate(MODEL_CONFIG.translation.freeFallback, false),
        2
      );
      response = out.result;
      retryCount += out.retries;
    } else {
      try {
        const out = await withExponentialBackoff(
          () => runTranslate(MODEL_CONFIG.translation.primary, true),
          2
        );
        response = out.result;
        retryCount += out.retries;
      } catch (primaryErr) {
        const status = getHttpStatus(primaryErr);
        if (status === 429 || status === 404) {
          if (status === 429) {
            markModelRateLimited(MODEL_CONFIG.translation.primary, primaryErr);
          }
          usedModel = MODEL_CONFIG.translation.freeFallback;
          retryCount++;
          const out = await withExponentialBackoff(
            () => runTranslate(MODEL_CONFIG.translation.freeFallback, false),
            2
          );
          response = out.result;
          retryCount += out.retries;
        } else {
          throw primaryErr;
        }
      }
    }

    const rawText = (response.text ?? "[]").trim();
    const translations = JSON.parse(rawText) as Array<{
      id: string;
      bengali: string;
    }>;

    res.json({
      modelUsed: usedModel,
      retryCount,
      translations: translations.map((t) => ({
        id: t.id,
        sourceText: sourceById.get(t.id) ?? "",
        english: sourceById.get(t.id) ?? "",
        bengali: t.bengali,
        targetText: t.bengali,
      })),
    });
  } catch (error) {
    const status = getHttpStatus(error);
    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(error);
      const retryAfterSeconds = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 15;
      res.status(429).json({
        code: "RATE_LIMIT",
        retryCount,
        retryAfterSeconds,
        error: `Free-tier translation rate limit reached (~${retryAfterSeconds}s cooldown). Completed progress is cached.`,
      });
      return;
    }
    console.warn("Segment translation error:", error instanceof Error ? error.message : String(error));
    res.status(500).json({
      retryCount,
      error: "Translation failed. Please try again.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Video Bangla Translator server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
