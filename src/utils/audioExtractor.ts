import type { AudioExtractionMode, VideoMetadata } from "../types/subtitle";
import type {
  AudioWorkerChunkPayload,
  AudioWorkerInput,
  AudioWorkerMessage,
} from "../workers/audioProcessor.worker";

export interface ExtractedAudioChunk {
  index: number;
  totalChunks: number;
  startOffsetSeconds: number;
  durationSeconds: number;
  audioBytes: Uint8Array | null;
  mimeType: string;
  isSilent: boolean;
  codec?: string;
  outputFormat?: string;
  extractionMode?: AudioExtractionMode;
  detectMs?: number;
  extractPacketsMs?: number;
  muxMs?: number;
}

export interface StreamingExtractionResult {
  totalChunks: number;
  totalDuration: number;
  extractionMs: number;
  extractionMode: AudioExtractionMode;
  sourceCodec?: string;
  outputFormat?: string;
  outputMimeType?: string;
  detectMs?: number;
  extractPacketsMs?: number;
  muxMs?: number;
  extractedAudioBytes?: number;
  fallbackReason?: string;
}

/**
 * Creates a zero-copy local playback URL and initial metadata synchronously
 * so the selected video renders immediately in the player on mobile & desktop.
 */
export function createInstantLocalVideoMeta(file: File): {
  videoMeta: VideoMetadata;
  objectUrl: string;
} {
  const objectUrl = URL.createObjectURL(file);
  const videoMeta: VideoMetadata = {
    id: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileSize: file.size,
    duration: 0,
    mimeType: file.type || "video/mp4",
    thumbnailDataUrl: null,
    lastModified: file.lastModified,
  };
  return { videoMeta, objectUrl };
}

/**
 * Lazily captures metadata & optional thumbnail in the background without blocking playback.
 */
export async function inspectVideoFile(
  file: File
): Promise<{ videoMeta: VideoMetadata; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Could not read the video."));
      }
    }, 15000);

    const cleanupListeners = () => {
      window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const seekTarget = duration > 1.5 ? Math.min(1.2, duration * 0.25) : 0;
      video.currentTime = seekTarget;
    };

    video.onseeked = () => {
      if (settled) return;
      settled = true;
      cleanupListeners();

      let thumbnailDataUrl: string | null = null;
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const maxThumbWidth = 480;
        const scale = Math.min(1, maxThumbWidth / vw);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(160, Math.round(vw * scale));
        canvas.height = Math.max(90, Math.round(vh * scale));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.72);
        }
      } catch {
        thumbnailDataUrl = null;
      }

      resolve({
        objectUrl,
        videoMeta: {
          id: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          fileSize: file.size,
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          mimeType: file.type || "video/mp4",
          thumbnailDataUrl,
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
          lastModified: file.lastModified,
        },
      });
    };

    video.onerror = () => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read the video."));
    };
  });
}

function writeAsciiString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function encodeWavFromFloat32(
  samples: Float32Array,
  sampleRate: number
): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAsciiString(view, 8, "WAVE");
  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAsciiString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function payloadToExtractedChunk(
  payload: AudioWorkerChunkPayload
): ExtractedAudioChunk {
  return {
    index: payload.index,
    totalChunks: payload.totalChunks,
    startOffsetSeconds: payload.startOffsetSeconds,
    durationSeconds: payload.durationSeconds,
    audioBytes: payload.audioBuffer ? new Uint8Array(payload.audioBuffer) : null,
    mimeType: payload.mimeType,
    isSilent: payload.isSilent,
    codec: payload.codec,
    outputFormat: payload.outputFormat,
    extractionMode: payload.extractionMode,
    detectMs: payload.detectMs,
    extractPacketsMs: payload.extractPacketsMs,
    muxMs: payload.muxMs,
  };
}

function getSafeInMemoryDecodeLimitBytes(): number {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) {
    return 120 * 1024 * 1024;
  }
  return 180 * 1024 * 1024;
}

const NON_FALLBACK_TERMINAL_ERRORS = new Set([
  "No English speech detected.",
  "No speech detected in audio track.",
  "No audio track found in this video.",
  "No audio packets found in this video.",
  "Processing paused.",
]);

export async function extractAudioChunksStreaming(
  file: File,
  options: {
    durationHint?: number;
    chunkDurationSeconds?: number;
    overlapSeconds?: number;
    singlePassMaxSeconds?: number;
    maxChunkBytes?: number;
    onChunkReady: (chunk: ExtractedAudioChunk, extractProgress: number) => void;
    onMetadataReady?: (meta: {
      totalDuration: number;
      estimatedTotalChunks: number;
      sourceCodec?: string;
      outputFormat?: string;
      outputMimeType?: string;
      extractionMode?: AudioExtractionMode;
      detectMs?: number;
      fallbackReason?: string;
    }) => void;
    onDecodeProgress?: (pct: number) => void;
    signal?: AbortSignal;
  }
): Promise<StreamingExtractionResult> {
  const startedAt = performance.now();
  const chunkDurationSeconds = options.chunkDurationSeconds ?? 75;
  const overlapSeconds = options.overlapSeconds ?? 1.5;
  const singlePassMaxSeconds = options.singlePassMaxSeconds ?? 150;
  const maxChunkBytes = options.maxChunkBytes ?? 9 * 1024 * 1024;
  const durationHint = options.durationHint ?? 0;

  let fallbackReason: string | undefined;

  if (typeof Worker !== "undefined") {
    try {
      const streamAttempt = await new Promise<
        | {
            mode: "done";
            totalChunks: number;
            totalDuration: number;
            hadSpeechSignal: boolean;
            extractionMode: AudioExtractionMode;
            sourceCodec?: string;
            outputFormat?: string;
            outputMimeType?: string;
            detectMs?: number;
            extractPacketsMs?: number;
            muxMs?: number;
            extractedAudioBytes?: number;
            fallbackReason?: string;
          }
        | { mode: "fallback"; reason: string }
      >((resolve, reject) => {
        const worker = new Worker(
          new URL("../workers/audioProcessor.worker.ts", import.meta.url),
          { type: "module" }
        );

        const abortHandler = () => {
          worker.terminate();
          reject(new Error("Processing paused."));
        };
        options.signal?.addEventListener("abort", abortHandler, { once: true });

        worker.onmessage = (e: MessageEvent<AudioWorkerMessage>) => {
          const msg = e.data;
          if (msg.type === "metadata") {
            options.onMetadataReady?.({
              totalDuration: msg.totalDuration,
              estimatedTotalChunks: msg.estimatedTotalChunks,
              sourceCodec: msg.sourceCodec,
              outputFormat: msg.outputFormat,
              outputMimeType: msg.outputMimeType,
              extractionMode: msg.extractionMode,
              detectMs: msg.detectMs,
              fallbackReason: msg.fallbackReason,
            });
            options.onDecodeProgress?.(25);
          } else if (msg.type === "chunk") {
            const scaledProgress = 25 + Math.round(msg.extractProgress * 0.75);
            options.onChunkReady(
              payloadToExtractedChunk(msg.chunk),
              scaledProgress
            );
          } else if (msg.type === "fallback-required") {
            options.signal?.removeEventListener("abort", abortHandler);
            worker.terminate();
            resolve({ mode: "fallback", reason: msg.reason });
          } else if (msg.type === "done") {
            options.signal?.removeEventListener("abort", abortHandler);
            worker.terminate();
            resolve({
              mode: "done",
              totalChunks: msg.totalChunks,
              totalDuration: msg.totalDuration,
              hadSpeechSignal: msg.hadSpeechSignal,
              extractionMode: msg.extractionMode,
              sourceCodec: msg.sourceCodec,
              outputFormat: msg.outputFormat,
              outputMimeType: msg.outputMimeType,
              detectMs: msg.detectMs,
              extractPacketsMs: msg.extractPacketsMs,
              muxMs: msg.muxMs,
              extractedAudioBytes: msg.extractedAudioBytes,
              fallbackReason: msg.fallbackReason,
            });
          } else if (msg.type === "error") {
            options.signal?.removeEventListener("abort", abortHandler);
            worker.terminate();
            reject(new Error(msg.message));
          }
        };

        worker.onerror = () => {
          options.signal?.removeEventListener("abort", abortHandler);
          worker.terminate();
          resolve({ mode: "fallback", reason: "Worker initialization failed" });
        };

        const input: AudioWorkerInput = {
          type: "stream-file",
          file,
          durationHint,
          chunkDurationSeconds,
          overlapSeconds,
          singlePassMaxSeconds,
          maxChunkBytes,
        };
        worker.postMessage(input);
      });

      if (streamAttempt.mode === "done") {
        if (!streamAttempt.hadSpeechSignal) {
          throw new Error("No speech detected in audio track.");
        }
        return {
          totalChunks: streamAttempt.totalChunks,
          totalDuration: streamAttempt.totalDuration,
          extractionMs: Math.round(performance.now() - startedAt),
          extractionMode: streamAttempt.extractionMode,
          sourceCodec: streamAttempt.sourceCodec,
          outputFormat: streamAttempt.outputFormat,
          outputMimeType: streamAttempt.outputMimeType,
          detectMs: streamAttempt.detectMs,
          extractPacketsMs: streamAttempt.extractPacketsMs,
          muxMs: streamAttempt.muxMs,
          extractedAudioBytes: streamAttempt.extractedAudioBytes,
          fallbackReason: streamAttempt.fallbackReason,
        };
      }
      fallbackReason = streamAttempt.reason;
    } catch (err) {
      if (
        err instanceof Error &&
        NON_FALLBACK_TERMINAL_ERRORS.has(err.message)
      ) {
        throw err;
      }
      fallbackReason =
        err instanceof Error ? err.message : "Container demux fallback";
    }
  } else {
    fallbackReason = "Web Worker unavailable in this browser";
  }

  const maxSafeBytes = getSafeInMemoryDecodeLimitBytes();
  if (file.size > maxSafeBytes) {
    throw new Error(
      `This ${(file.size / (1024 * 1024)).toFixed(0)} MB video's audio codec cannot be streamed incrementally in this browser. Try an MP4/WebM with AAC or Opus audio, or open in Chrome.`
    );
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("Could not read the video.");
  }

  options.onDecodeProgress?.(10);
  const decodeT0 = performance.now();
  const audioCtx = new AudioCtx();
  let decodedBuffer: AudioBuffer | null = null;
  let arrayBuffer: ArrayBuffer | null = null;

  try {
    arrayBuffer = await file.arrayBuffer();
    if (options.signal?.aborted) throw new Error("Processing paused.");
    options.onDecodeProgress?.(30);

    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    arrayBuffer = null;
  } catch (err) {
    await audioCtx.close().catch(() => {});
    if (err instanceof Error && err.message === "Processing paused.") throw err;
    throw new Error("Could not read the video.");
  } finally {
    await audioCtx.close().catch(() => {});
  }

  const totalDuration = decodedBuffer.duration;
  const sourceSampleRate = decodedBuffer.sampleRate;
  const numChannels = Math.min(2, decodedBuffer.numberOfChannels);

  if (
    !Number.isFinite(totalDuration) ||
    totalDuration <= 0.1 ||
    numChannels === 0
  ) {
    throw new Error("No speech detected in audio track.");
  }

  const fallbackChunkDuration = Math.min(chunkDurationSeconds, 50);

  options.onMetadataReady?.({
    totalDuration,
    estimatedTotalChunks:
      totalDuration <= 60
        ? 1
        : Math.max(2, Math.ceil(totalDuration / (fallbackChunkDuration - overlapSeconds))),
    sourceCodec: "pcm-f32",
    outputFormat: "PCM WAV (.wav)",
    outputMimeType: "audio/wav",
    extractionMode: "pcm-fallback",
    detectMs: Math.round(performance.now() - decodeT0),
    fallbackReason,
  });

  const channels: Float32Array[] = [];
  const transferables: Transferable[] = [];
  for (let c = 0; c < numChannels; c++) {
    const copied = new Float32Array(decodedBuffer.getChannelData(c));
    channels.push(copied);
    transferables.push(copied.buffer);
  }
  decodedBuffer = null;
  options.onDecodeProgress?.(45);

  if (typeof Worker !== "undefined") {
    try {
      const result = await new Promise<{
        totalChunks: number;
        hadSpeechSignal: boolean;
        extractPacketsMs?: number;
        muxMs?: number;
        extractedAudioBytes?: number;
      }>((resolve, reject) => {
        const worker = new Worker(
          new URL("../workers/audioProcessor.worker.ts", import.meta.url),
          { type: "module" }
        );

        const abortHandler = () => {
          worker.terminate();
          reject(new Error("Processing paused."));
        };
        options.signal?.addEventListener("abort", abortHandler, { once: true });

        worker.onmessage = (e: MessageEvent<AudioWorkerMessage>) => {
          const msg = e.data;
          if (msg.type === "chunk") {
            const scaledProgress = 45 + Math.round(msg.extractProgress * 0.55);
            options.onChunkReady(
              payloadToExtractedChunk(msg.chunk),
              scaledProgress
            );
          } else if (msg.type === "done") {
            options.signal?.removeEventListener("abort", abortHandler);
            worker.terminate();
            resolve({
              totalChunks: msg.totalChunks,
              hadSpeechSignal: msg.hadSpeechSignal,
              extractPacketsMs: msg.extractPacketsMs,
              muxMs: msg.muxMs,
              extractedAudioBytes: msg.extractedAudioBytes,
            });
          } else if (msg.type === "error") {
            options.signal?.removeEventListener("abort", abortHandler);
            worker.terminate();
            reject(new Error(msg.message));
          }
        };

        worker.onerror = () => {
          options.signal?.removeEventListener("abort", abortHandler);
          worker.terminate();
          reject(new Error("Audio worker failed."));
        };

        const input: AudioWorkerInput = {
          type: "pcm-buffers",
          channels,
          sourceSampleRate,
          totalDuration,
          chunkDurationSeconds: fallbackChunkDuration,
          overlapSeconds,
          fallbackReason,
        };
        worker.postMessage(input, transferables);
      });

      if (!result.hadSpeechSignal) {
        throw new Error("No speech detected in audio track.");
      }

      return {
        totalChunks: result.totalChunks,
        totalDuration,
        extractionMs: Math.round(performance.now() - startedAt),
        extractionMode: "pcm-fallback",
        sourceCodec: "pcm-f32",
        outputFormat: "PCM WAV (.wav)",
        outputMimeType: "audio/wav",
        detectMs: Math.round(performance.now() - decodeT0),
        extractPacketsMs: result.extractPacketsMs,
        muxMs: result.muxMs,
        extractedAudioBytes: result.extractedAudioBytes,
        fallbackReason,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        NON_FALLBACK_TERMINAL_ERRORS.has(err.message)
      ) {
        throw err;
      }
    }
  }

  const targetSampleRate = 16000;
  const ratio = sourceSampleRate / targetSampleRate;
  const sourceLength = channels[0]?.length ?? 0;
  if (sourceLength === 0) {
    throw new Error("Could not read the video.");
  }
  const targetLength = Math.max(1, Math.floor(sourceLength / ratio));
  const mono = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const idx = Math.min(sourceLength - 1, Math.floor(i * ratio));
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][idx];
    mono[i] = sum / channels.length;
  }

  const useSingle = totalDuration <= 60;
  const effChunk = useSingle ? totalDuration : fallbackChunkDuration;
  const stride = useSingle
    ? totalDuration
    : Math.max(15, effChunk - overlapSeconds);

  const ranges: Array<{ start: number; end: number; startSec: number }> = [];
  let cursor = 0;
  while (cursor < totalDuration - 0.25) {
    const endSec = Math.min(totalDuration, cursor + effChunk);
    ranges.push({
      start: Math.floor(cursor * targetSampleRate),
      end: Math.min(mono.length, Math.ceil(endSec * targetSampleRate)),
      startSec: Number(cursor.toFixed(2)),
    });
    if (useSingle || endSec >= totalDuration) break;
    cursor += stride;
  }

  let hadSpeech = false;
  let totalWavBytes = 0;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const slice = mono.subarray(r.start, r.end);
    let peak = 0;
    for (let k = 0; k < slice.length; k += 24) {
      const a = Math.abs(slice[k]);
      if (a > peak) peak = a;
    }
    const isSilent = peak < 0.002;
    if (!isSilent) hadSpeech = true;

    const wav = isSilent ? null : encodeWavFromFloat32(slice, targetSampleRate);
    totalWavBytes += wav?.byteLength ?? 0;

    options.onChunkReady(
      {
        index: i,
        totalChunks: ranges.length,
        startOffsetSeconds: r.startSec,
        durationSeconds: Number(((r.end - r.start) / targetSampleRate).toFixed(2)),
        audioBytes: wav,
        mimeType: "audio/wav",
        isSilent,
        codec: "pcm-f32",
        outputFormat: "PCM WAV (.wav)",
        extractionMode: "pcm-fallback",
      },
      45 + Math.round(((i + 1) / ranges.length) * 55)
    );
  }

  if (!hadSpeech) {
    throw new Error("No speech detected in audio track.");
  }

  return {
    totalChunks: ranges.length,
    totalDuration,
    extractionMs: Math.round(performance.now() - startedAt),
    extractionMode: "pcm-fallback",
    sourceCodec: "pcm-f32",
    outputFormat: "PCM WAV (.wav)",
    outputMimeType: "audio/wav",
    detectMs: Math.round(performance.now() - decodeT0),
    extractedAudioBytes: totalWavBytes,
    fallbackReason,
  };
}

/**
 * Creates a clean playable 12-second instructional sample WebM video locally in the browser.
 */
export async function generateLocalSampleVideo(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");

  if (
    !ctx ||
    typeof canvas.captureStream !== "function" ||
    typeof MediaRecorder === "undefined"
  ) {
    throw new Error("Sample video generation is not supported in this browser.");
  }

  const stream = canvas.captureStream(24);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const slides = [
    {
      start: 0,
      end: 3.5,
      heading: "Welcome to Video Bangla Translator",
      caption: "Scene 01 · Introduction",
    },
    {
      start: 3.5,
      end: 7.5,
      heading: "Learning New Languages Every Day",
      caption: "Scene 02 · Natural Context",
    },
    {
      start: 7.5,
      end: 12,
      heading: "Edit, Style & Export Your Subtitles",
      caption: "Scene 03 · Studio Workflow",
    },
  ];

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(
        new File([blob], "sample_english_lesson.webm", { type: "video/webm" })
      );
    };
    recorder.onerror = () => reject(new Error("Could not generate sample video."));

    recorder.start();
    const totalMs = 12000;
    const startTime = performance.now();

    const drawFrame = () => {
      const elapsedSec = (performance.now() - startTime) / 1000;
      const activeSlide =
        slides.find((s) => elapsedSec >= s.start && elapsedSec < s.end) ??
        slides[slides.length - 1];

      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#134e4a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let x = 80; x < canvas.width; x += 160) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      ctx.fillStyle = "#5eead4";
      ctx.font = "600 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(activeSlide.caption, canvas.width / 2, 195);

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 38px sans-serif";
      ctx.fillText(activeSlide.heading, canvas.width / 2, 250);

      const pct = Math.min(1, elapsedSec / 12);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(280, 295, 400, 6);
      ctx.fillStyle = "#14b8a6";
      ctx.fillRect(280, 295, 400 * pct, 6);

      if (performance.now() - startTime < totalMs) {
        requestAnimationFrame(drawFrame);
      } else {
        recorder.stop();
      }
    };

    drawFrame();
  });
}
