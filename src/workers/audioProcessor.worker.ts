/// <reference lib="webworker" />

import type { AudioExtractionMode } from "../types/subtitle";
import {
  checkPcmSilence,
  downsamplePlanarTo16kMono,
  encodeWavArrayBuffer,
  extractAudioZeroTranscodeFromSource,
} from "../utils/audioDemuxEngine";

export type AudioWorkerInput =
  | {
      type: "stream-file";
      file: File;
      durationHint: number;
      chunkDurationSeconds: number;
      overlapSeconds: number;
      singlePassMaxSeconds?: number;
      maxChunkBytes?: number;
    }
  | {
      type: "pcm-buffers";
      channels: Float32Array[];
      sourceSampleRate: number;
      totalDuration: number;
      chunkDurationSeconds: number;
      overlapSeconds: number;
      fallbackReason?: string;
    };

export interface AudioWorkerChunkPayload {
  index: number;
  totalChunks: number;
  startOffsetSeconds: number;
  durationSeconds: number;
  audioBuffer: ArrayBuffer | null;
  mimeType: string;
  isSilent: boolean;
  codec?: string;
  outputFormat?: string;
  extractionMode?: AudioExtractionMode;
  detectMs?: number;
  extractPacketsMs?: number;
  muxMs?: number;
}

export type AudioWorkerMessage =
  | {
      type: "metadata";
      totalDuration: number;
      estimatedTotalChunks: number;
      sourceCodec?: string;
      outputFormat?: string;
      outputMimeType?: string;
      extractionMode?: AudioExtractionMode;
      detectMs?: number;
      fallbackReason?: string;
    }
  | {
      type: "chunk";
      chunk: AudioWorkerChunkPayload;
      extractProgress: number;
    }
  | {
      type: "done";
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
  | {
      type: "fallback-required";
      reason: string;
    }
  | {
      type: "error";
      message: string;
    };

const TARGET_SAMPLE_RATE = 16000;

async function processStreamingFile(
  inputData: Extract<AudioWorkerInput, { type: "stream-file" }>
) {
  const {
    file,
    durationHint,
    chunkDurationSeconds,
    overlapSeconds,
    singlePassMaxSeconds = 150,
    maxChunkBytes = 9 * 1024 * 1024,
  } = inputData;

  const { BlobSource } = await import("mediabunny");
  const source = new BlobSource(file, { maxCacheSize: 4 * 1024 * 1024 });

  try {
    const summary = await extractAudioZeroTranscodeFromSource(source, {
      durationHint,
      chunkDurationSeconds,
      overlapSeconds,
      singlePassMaxSeconds,
      maxChunkBytes,
      onMetadata: (meta) => {
        self.postMessage({
          type: "metadata",
          totalDuration: meta.totalDuration,
          estimatedTotalChunks: meta.estimatedTotalChunks,
          sourceCodec: meta.sourceCodec,
          outputFormat: meta.outputFormat,
          outputMimeType: meta.outputMimeType,
          extractionMode: meta.extractionMode,
          detectMs: meta.detectMs,
          fallbackReason: meta.fallbackReason,
        } satisfies AudioWorkerMessage);
      },
      onChunk: (chunk, extractProgress) => {
        const payload: AudioWorkerChunkPayload = {
          index: chunk.index,
          totalChunks: chunk.totalChunks,
          startOffsetSeconds: chunk.startOffsetSeconds,
          durationSeconds: chunk.durationSeconds,
          audioBuffer: chunk.audioBuffer,
          mimeType: chunk.mimeType,
          isSilent: chunk.isSilent,
          codec: chunk.codec,
          outputFormat: chunk.outputFormat,
          extractionMode: chunk.extractionMode,
          detectMs: chunk.detectMs,
          extractPacketsMs: chunk.extractPacketsMs,
          muxMs: chunk.muxMs,
        };
        const msg: AudioWorkerMessage = {
          type: "chunk",
          chunk: payload,
          extractProgress,
        };
        if (chunk.audioBuffer) {
          self.postMessage(msg, [chunk.audioBuffer]);
        } else {
          self.postMessage(msg);
        }
      },
    });

    if (summary.totalChunks === 0 || !summary.hadSpeechSignal) {
      self.postMessage({
        type: "error",
        message: "No speech detected in audio track.",
      } satisfies AudioWorkerMessage);
      return;
    }

    self.postMessage({
      type: "done",
      totalChunks: summary.totalChunks,
      totalDuration: summary.totalDuration,
      hadSpeechSignal: summary.hadSpeechSignal,
      extractionMode: summary.extractionMode,
      sourceCodec: summary.sourceCodec,
      outputFormat: summary.outputFormat,
      outputMimeType: summary.outputMimeType,
      detectMs: summary.detectMs,
      extractPacketsMs: summary.extractPacketsMs,
      muxMs: summary.muxMs,
      extractedAudioBytes: summary.extractedAudioBytes,
      fallbackReason: summary.fallbackReason,
    } satisfies AudioWorkerMessage);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the video.";
    if (
      message === "Audio codec requires AudioContext fallback" ||
      message.includes("WebCodecs")
    ) {
      self.postMessage({
        type: "fallback-required",
        reason: message,
      } satisfies AudioWorkerMessage);
      return;
    }
    self.postMessage({
      type: "error",
      message,
    } satisfies AudioWorkerMessage);
  }
}

function processPcmBuffers(
  inputData: Extract<AudioWorkerInput, { type: "pcm-buffers" }>
) {
  const {
    channels,
    sourceSampleRate,
    chunkDurationSeconds,
    overlapSeconds,
    fallbackReason = "Browser AudioContext decode fallback",
  } = inputData;

  const downsampleStart = performance.now();
  const sourceLength = channels[0]?.length ?? 0;
  let mono16k = downsamplePlanarTo16kMono(channels, sourceLength, sourceSampleRate);
  channels.length = 0;
  const extractSamplesMs = Math.round(performance.now() - downsampleStart);

  const totalSamples = mono16k.length;
  const totalDuration = totalSamples / TARGET_SAMPLE_RATE;
  if (totalDuration <= 0.1) {
    self.postMessage({
      type: "error",
      message: "No speech detected in audio track.",
    } satisfies AudioWorkerMessage);
    return;
  }

  const useSingleChunk = totalDuration <= 60;
  const effectiveChunkSec = useSingleChunk ? totalDuration : chunkDurationSeconds;
  const effectiveOverlapSec = useSingleChunk ? 0 : overlapSeconds;
  const strideSec = Math.max(15, effectiveChunkSec - effectiveOverlapSec);

  const ranges: Array<{
    startSample: number;
    endSample: number;
    startSec: number;
    durationSec: number;
  }> = [];
  if (useSingleChunk) {
    ranges.push({
      startSample: 0,
      endSample: totalSamples,
      startSec: 0,
      durationSec: Number(totalDuration.toFixed(2)),
    });
  } else {
    let cursorSec = 0;
    while (cursorSec < totalDuration - 0.25) {
      const endSec = Math.min(totalDuration, cursorSec + effectiveChunkSec);
      const startSample = Math.floor(cursorSec * TARGET_SAMPLE_RATE);
      const endSample = Math.min(
        totalSamples,
        Math.ceil(endSec * TARGET_SAMPLE_RATE)
      );
      if (endSample - startSample > TARGET_SAMPLE_RATE * 0.3) {
        ranges.push({
          startSample,
          endSample,
          startSec: Number(cursorSec.toFixed(2)),
          durationSec: Number(
            ((endSample - startSample) / TARGET_SAMPLE_RATE).toFixed(2)
          ),
        });
      }
      if (endSec >= totalDuration) break;
      cursorSec += strideSec;
    }
  }

  let hadSpeechSignal = false;
  let muxMs = 0;
  let extractedBytes = 0;
  const totalChunks = ranges.length;

  for (let i = 0; i < totalChunks; i++) {
    const r = ranges[i];
    const slice = mono16k.subarray(r.startSample, r.endSample);
    const isSilent = checkPcmSilence(slice);
    if (!isSilent) hadSpeechSignal = true;

    const m0 = performance.now();
    const wavBuffer = isSilent
      ? null
      : encodeWavArrayBuffer(slice, TARGET_SAMPLE_RATE);
    muxMs += performance.now() - m0;
    extractedBytes += wavBuffer?.byteLength ?? 0;

    const extractProgress = Math.round(((i + 1) / totalChunks) * 100);
    const msg: AudioWorkerMessage = {
      type: "chunk",
      chunk: {
        index: i,
        totalChunks,
        startOffsetSeconds: r.startSec,
        durationSeconds: r.durationSec,
        audioBuffer: wavBuffer,
        mimeType: "audio/wav",
        isSilent,
        codec: "pcm-f32",
        outputFormat: "PCM WAV (.wav)",
        extractionMode: "pcm-fallback",
        detectMs: 0,
        extractPacketsMs: extractSamplesMs,
        muxMs: Math.round(muxMs),
      },
      extractProgress,
    };

    if (wavBuffer) {
      self.postMessage(msg, [wavBuffer]);
    } else {
      self.postMessage(msg);
    }
  }

  mono16k = new Float32Array(0);

  self.postMessage({
    type: "done",
    totalChunks,
    totalDuration,
    hadSpeechSignal,
    extractionMode: "pcm-fallback",
    sourceCodec: "pcm-f32",
    outputFormat: "PCM WAV (.wav)",
    outputMimeType: "audio/wav",
    detectMs: 0,
    extractPacketsMs: extractSamplesMs,
    muxMs: Math.round(muxMs),
    extractedAudioBytes: extractedBytes,
    fallbackReason,
  } satisfies AudioWorkerMessage);
}

self.onmessage = async (event: MessageEvent<AudioWorkerInput>) => {
  try {
    if (event.data.type === "stream-file") {
      await processStreamingFile(event.data);
    } else {
      processPcmBuffers(event.data);
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Could not read the video.",
    } satisfies AudioWorkerMessage);
  }
};
