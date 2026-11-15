import type { AudioExtractionMode } from "../types/subtitle";
import type {
  AudioCodec,
  AudioSample,
  EncodedPacket,
  OutputFormat,
  Source,
} from "mediabunny";

export interface DemuxedAudioChunk {
  index: number;
  totalChunks: number;
  startOffsetSeconds: number;
  durationSeconds: number;
  audioBuffer: ArrayBuffer | null;
  mimeType: string;
  isSilent: boolean;
  codec: string;
  outputFormat: string;
  extractionMode: AudioExtractionMode;
  detectMs: number;
  extractPacketsMs: number;
  muxMs: number;
}

export interface DemuxAudioMetadata {
  totalDuration: number;
  estimatedTotalChunks: number;
  sourceCodec: string;
  outputFormat: string;
  outputMimeType: string;
  extractionMode: AudioExtractionMode;
  detectMs: number;
  fallbackReason?: string;
}

export interface DemuxExtractionSummary {
  totalChunks: number;
  totalDuration: number;
  hadSpeechSignal: boolean;
  extractionMode: AudioExtractionMode;
  sourceCodec: string;
  outputFormat: string;
  outputMimeType: string;
  detectMs: number;
  extractPacketsMs: number;
  muxMs: number;
  extractedAudioBytes: number;
  fallbackReason?: string;
}

export interface ZeroTranscodeExtractOptions {
  durationHint?: number;
  chunkDurationSeconds?: number;
  overlapSeconds?: number;
  singlePassMaxSeconds?: number;
  maxChunkBytes?: number;
  signal?: AbortSignal;
  onMetadata?: (meta: DemuxAudioMetadata) => void;
  onChunk: (chunk: DemuxedAudioChunk, extractProgress: number) => void;
}

interface TargetContainerSpec {
  createFormat: () => OutputFormat;
  mimeType: string;
  formatName: string;
  isUncompressedPcm: boolean;
  outputCodec: AudioCodec;
}

const TARGET_FALLBACK_SAMPLE_RATE = 16000;

function writeAsciiString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function encodeWavArrayBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
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

  return buffer;
}

export function checkPcmSilence(samples: Float32Array): boolean {
  let peak = 0;
  let sumSq = 0;
  let sampled = 0;
  for (let k = 0; k < samples.length; k += 16) {
    const v = samples[k];
    const abs = v < 0 ? -v : v;
    if (abs > peak) peak = abs;
    sumSq += v * v;
    sampled++;
  }
  const rms = sampled > 0 ? Math.sqrt(sumSq / sampled) : 0;
  return peak < 0.002 && rms < 0.0004;
}

export function downsamplePlanarTo16kMono(
  channels: Float32Array[],
  framesCount: number,
  sourceSampleRate: number
): Float32Array {
  const channelCount = channels.length;
  if (channelCount === 0 || framesCount === 0) {
    return new Float32Array(0);
  }

  const ratio = sourceSampleRate / TARGET_FALLBACK_SAMPLE_RATE;
  const targetLength = Math.max(1, Math.floor(framesCount / ratio));
  const output = new Float32Array(targetLength);

  if (Math.abs(ratio - 1) < 0.01) {
    for (let i = 0; i < targetLength; i++) {
      let sum = 0;
      for (let c = 0; c < channelCount; c++) {
        sum += channels[c][i] ?? 0;
      }
      output[i] = sum / channelCount;
    }
    return output;
  }

  for (let i = 0; i < targetLength; i++) {
    const startSrc = Math.floor(i * ratio);
    const endSrc = Math.min(framesCount, Math.max(startSrc + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    let count = 0;
    for (let s = startSrc; s < endSrc; s++) {
      let chSum = 0;
      for (let c = 0; c < channelCount; c++) {
        chSum += channels[c][s];
      }
      sum += chSum / channelCount;
      count++;
    }
    output[i] = count > 0 ? sum / count : 0;
  }

  return output;
}

function appendToRollingBuffer(
  existing: Float32Array<ArrayBuffer>,
  existingLen: number,
  incoming: Float32Array
): { buffer: Float32Array<ArrayBuffer>; length: number } {
  const needed = existingLen + incoming.length;
  let buffer = existing;
  if (needed > buffer.length) {
    const nextCapacity = Math.max(
      needed,
      Math.ceil(buffer.length * 1.5),
      TARGET_FALLBACK_SAMPLE_RATE * 64
    );
    const grown = new Float32Array(nextCapacity);
    grown.set(buffer.subarray(0, existingLen), 0);
    buffer = grown;
  }
  buffer.set(incoming, existingLen);
  return { buffer, length: needed };
}

function checkRawPcmPacketSilence(packets: EncodedPacket[], codec: AudioCodec): boolean {
  if (codec !== "pcm-s16" && codec !== "pcm-u8") return false;
  let maxAmp = 0;
  for (let p = 0; p < packets.length; p++) {
    const data = packets[p].data;
    if (codec === "pcm-s16") {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let off = 0; off + 1 < data.byteLength; off += 32) {
        const v = Math.abs(view.getInt16(off, true)) / 32768;
        if (v > maxAmp) maxAmp = v;
        if (maxAmp >= 0.0025) return false;
      }
    } else {
      for (let off = 0; off < data.byteLength; off += 16) {
        const v = Math.abs(data[off] - 128) / 128;
        if (v > maxAmp) maxAmp = v;
        if (maxAmp >= 0.0025) return false;
      }
    }
  }
  return maxAmp < 0.0025;
}

async function selectZeroTranscodeTargets(
  codec: AudioCodec | null,
  decoderConfig: AudioDecoderConfig | null
): Promise<TargetContainerSpec[]> {
  if (!codec) return [];
  const mb = await import("mediabunny");

  switch (codec) {
    case "aac": {
      const mp4Target: TargetContainerSpec = {
        createFormat: () => new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
        mimeType: "audio/mp4",
        formatName: "M4A/MP4 (.mp4)",
        isUncompressedPcm: false,
        outputCodec: "aac",
      };
      const adtsTarget: TargetContainerSpec = {
        createFormat: () => new mb.AdtsOutputFormat(),
        mimeType: "audio/aac",
        formatName: "ADTS (.aac)",
        isUncompressedPcm: false,
        outputCodec: "aac",
      };
      return decoderConfig?.description ? [mp4Target, adtsTarget] : [adtsTarget, mp4Target];
    }

    case "opus":
    case "vorbis": {
      const oggTarget: TargetContainerSpec = {
        createFormat: () => new mb.OggOutputFormat(),
        mimeType: "audio/ogg",
        formatName: "OGG (.ogg)",
        isUncompressedPcm: false,
        outputCodec: codec,
      };
      const webmTarget: TargetContainerSpec = {
        createFormat: () => new mb.WebMOutputFormat(),
        mimeType: "audio/webm",
        formatName: "WebM (.webm)",
        isUncompressedPcm: false,
        outputCodec: codec,
      };
      return decoderConfig?.description ? [oggTarget, webmTarget] : [webmTarget];
    }

    case "mp3":
      return [
        {
          createFormat: () => new mb.Mp3OutputFormat({ xingHeader: false }),
          mimeType: "audio/mpeg",
          formatName: "MP3 (.mp3)",
          isUncompressedPcm: false,
          outputCodec: "mp3",
        },
      ];

    case "flac":
      return [
        {
          createFormat: () => new mb.FlacOutputFormat(),
          mimeType: "audio/flac",
          formatName: "FLAC (.flac)",
          isUncompressedPcm: false,
          outputCodec: "flac",
        },
      ];

    case "pcm-s16":
    case "pcm-s24":
    case "pcm-s32":
    case "pcm-f32":
    case "pcm-f64":
    case "pcm-u8":
    case "ulaw":
    case "alaw":
      return [
        {
          createFormat: () => new mb.WavOutputFormat(),
          mimeType: "audio/wav",
          formatName: "WAV (.wav)",
          isUncompressedPcm: true,
          outputCodec: codec,
        },
      ];

    case "pcm-s16be":
    case "pcm-s24be":
    case "pcm-s32be":
    case "pcm-f32be":
    case "pcm-f64be":
      return [
        {
          createFormat: () => new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
          mimeType: "audio/mp4",
          formatName: "M4A/MP4 (.mp4)",
          isUncompressedPcm: true,
          outputCodec: codec,
        },
      ];

    default:
      return [];
  }
}

async function muxPacketWindow(
  packets: EncodedPacket[],
  codec: AudioCodec,
  decoderConfig: AudioDecoderConfig | null,
  targetSpec: TargetContainerSpec
): Promise<ArrayBuffer> {
  const mb = await import("mediabunny");
  const bufferTarget = new mb.BufferTarget();
  const output = new mb.Output({
    format: targetSpec.createFormat(),
    target: bufferTarget,
  });
  const source = new mb.EncodedAudioPacketSource(codec);
  output.addAudioTrack(source);

  await output.start();
  const baseTimestamp = packets[0]?.timestamp ?? 0;
  const meta = decoderConfig ? { decoderConfig } : undefined;
  let lastRelTimestamp = 0;

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];
    let relTimestamp = Math.max(0, pkt.timestamp - baseTimestamp);
    if (relTimestamp < lastRelTimestamp) {
      relTimestamp = lastRelTimestamp;
    }
    lastRelTimestamp = relTimestamp;

    const shiftedPacket = pkt.clone({
      timestamp: relTimestamp,
      duration: Math.max(0, pkt.duration),
    });
    await source.add(shiftedPacket, i === 0 ? meta : undefined);
  }

  source.close();
  await output.finalize();

  if (!bufferTarget.buffer) {
    throw new Error("Container muxer produced an empty buffer.");
  }
  return bufferTarget.buffer;
}

/**
 * Primary zero-transcode audio extraction pipeline:
 * 1. Lazily reads container metadata & primary audio track (zero video frame decoding).
 * 2. Copies compressed encoded audio packets directly into a Gemini-compatible audio-only container.
 * 3. Uses a single pass for short/medium videos (<= 150s) and bounded streaming packet windows for long videos.
 * 4. Falls back cleanly to lightest audio-only transcode or 16kHz PCM WAV ONLY when the source codec cannot be copied.
 */
export async function extractAudioZeroTranscodeFromSource(
  source: Source,
  options: ZeroTranscodeExtractOptions
): Promise<DemuxExtractionSummary> {
  const {
    durationHint = 0,
    chunkDurationSeconds = 75,
    overlapSeconds = 1.5,
    singlePassMaxSeconds = 150,
    maxChunkBytes = 9 * 1024 * 1024,
    signal,
    onMetadata,
    onChunk,
  } = options;

  const mb = await import("mediabunny");
  const detectStart = performance.now();

  const input = new mb.Input({
    formats: mb.ALL_FORMATS,
    source,
  });

  try {
    if (signal?.aborted) {
      throw new Error("Processing paused.");
    }

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      throw new Error("No audio track found in this video.");
    }

    const sourceCodec = await audioTrack.getCodec();
    const decoderConfig = await audioTrack.getDecoderConfig().catch(() => null);
    const metadataDuration = await input.getDurationFromMetadata().catch(() => null);
    let totalDuration =
      metadataDuration && Number.isFinite(metadataDuration) && metadataDuration > 0
        ? metadataDuration
        : durationHint > 0
        ? durationHint
        : 0;

    if (totalDuration <= 0) {
      totalDuration = await audioTrack.computeDuration().catch(() => 0);
    }

    const detectMs = Math.round(performance.now() - detectStart);
    const targetCandidates = await selectZeroTranscodeTargets(sourceCodec, decoderConfig);

    // Path A: Zero-Transcode Packet Copy
    if (sourceCodec && targetCandidates.length > 0) {
      const useSinglePass = totalDuration > 0 && totalDuration <= singlePassMaxSeconds;
      const effectiveWindowSec = useSinglePass ? Math.max(totalDuration + 5, singlePassMaxSeconds) : chunkDurationSeconds;
      const estimatedTotalChunks =
        totalDuration > 0
          ? useSinglePass
            ? 1
            : Math.max(1, Math.ceil(totalDuration / Math.max(15, chunkDurationSeconds - overlapSeconds)))
          : 1;

      let activeTargetIdx = 0;
      let activeTarget = targetCandidates[activeTargetIdx];

      onMetadata?.({
        totalDuration,
        estimatedTotalChunks,
        sourceCodec,
        outputFormat: activeTarget.formatName,
        outputMimeType: activeTarget.mimeType,
        extractionMode: "zero-transcode-copy",
        detectMs,
      });

      let extractPacketsMs = 0;
      let muxMs = 0;
      let totalExtractedBytes = 0;
      let emittedChunks = 0;
      let hadSpeechSignal = false;
      let remuxFailedError: unknown = null;

      try {
        const sink = new mb.EncodedPacketSink(audioTrack);
        const packetIter = sink.packets()[Symbol.asyncIterator]();

        let windowPackets: EncodedPacket[] = [];
        let windowBytes = 0;

        const flushWindow = async (isFinal: boolean) => {
          if (windowPackets.length === 0) return;

          const firstTs = windowPackets[0].timestamp;
          const lastPkt = windowPackets[windowPackets.length - 1];
          const windowEndTs = lastPkt.timestamp + Math.max(0.02, lastPkt.duration);
          const windowDuration = Math.max(0.1, windowEndTs - firstTs);
          const isSilent = activeTarget.isUncompressedPcm
            ? checkRawPcmPacketSilence(windowPackets, sourceCodec)
            : false;

          if (!isSilent) hadSpeechSignal = true;

          let muxedBuffer: ArrayBuffer | null = null;
          if (!isSilent) {
            const muxStart = performance.now();
            while (true) {
              try {
                muxedBuffer = await muxPacketWindow(
                  windowPackets,
                  sourceCodec,
                  decoderConfig,
                  activeTarget
                );
                break;
              } catch (err) {
                if (emittedChunks === 0 && activeTargetIdx + 1 < targetCandidates.length) {
                  activeTargetIdx++;
                  activeTarget = targetCandidates[activeTargetIdx];
                } else {
                  throw err;
                }
              }
            }
            muxMs += performance.now() - muxStart;
          }

          const byteLen = muxedBuffer?.byteLength ?? 0;
          totalExtractedBytes += byteLen;

          const startOffsetSeconds = Number(Math.max(0, firstTs).toFixed(2));
          const durationSeconds = Number(windowDuration.toFixed(2));
          const finalTotalChunks = isFinal
            ? emittedChunks + 1
            : Math.max(estimatedTotalChunks, emittedChunks + 1);

          const extractProgress =
            totalDuration > 0
              ? Math.min(isFinal ? 100 : 96, Math.round((windowEndTs / totalDuration) * 100))
              : isFinal
              ? 100
              : Math.min(95, (emittedChunks + 1) * 15);

          onChunk(
            {
              index: emittedChunks,
              totalChunks: finalTotalChunks,
              startOffsetSeconds,
              durationSeconds,
              audioBuffer: muxedBuffer,
              mimeType: activeTarget.mimeType,
              isSilent,
              codec: sourceCodec,
              outputFormat: activeTarget.formatName,
              extractionMode: "zero-transcode-copy",
              detectMs,
              extractPacketsMs: Math.round(extractPacketsMs),
              muxMs: Math.round(muxMs),
            },
            extractProgress
          );
          emittedChunks++;

          if (!isFinal && overlapSeconds > 0 && !activeTarget.isUncompressedPcm) {
            const keepFromTs = Math.max(firstTs, windowEndTs - overlapSeconds);
            const tail: EncodedPacket[] = [];
            let tailBytes = 0;
            for (let k = windowPackets.length - 1; k >= 0; k--) {
              const p = windowPackets[k];
              if (p.timestamp < keepFromTs && tail.length > 0) break;
              tail.unshift(p);
              tailBytes += p.data.byteLength;
              if (tailBytes >= 512 * 1024) break;
            }
            windowPackets = tail;
            windowBytes = tailBytes;
          } else {
            windowPackets = [];
            windowBytes = 0;
          }
        };

        while (true) {
          if (signal?.aborted) {
            throw new Error("Processing paused.");
          }

          const p0 = performance.now();
          const { value: packet, done } = await packetIter.next();
          extractPacketsMs += performance.now() - p0;

          if (done) break;
          if (!packet || packet.isMetadataOnly || packet.data.byteLength === 0) continue;

          if (windowPackets.length > 0) {
            const windowSpan = packet.timestamp - windowPackets[0].timestamp;
            const wouldExceedBytes = windowBytes + packet.data.byteLength > maxChunkBytes;
            const hitTimeWindow = !useSinglePass && windowSpan >= effectiveWindowSec;

            if (hitTimeWindow || wouldExceedBytes) {
              await flushWindow(false);
            }
          }

          windowPackets.push(packet);
          windowBytes += packet.data.byteLength;
        }

        if (windowPackets.length > 0) {
          const lastEnd =
            windowPackets[windowPackets.length - 1].timestamp +
            windowPackets[windowPackets.length - 1].duration;
          if (totalDuration <= 0 && Number.isFinite(lastEnd) && lastEnd > 0) {
            totalDuration = Number(lastEnd.toFixed(2));
          }
          await flushWindow(true);
        }

        if (emittedChunks === 0) {
          throw new Error("No audio packets found in this video.");
        }

        return {
          totalChunks: emittedChunks,
          totalDuration,
          hadSpeechSignal,
          extractionMode: "zero-transcode-copy",
          sourceCodec,
          outputFormat: activeTarget.formatName,
          outputMimeType: activeTarget.mimeType,
          detectMs,
          extractPacketsMs: Math.round(extractPacketsMs),
          muxMs: Math.round(muxMs),
          extractedAudioBytes: totalExtractedBytes,
        };
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message === "Processing paused." || err.message === "No audio packets found in this video.")
        ) {
          throw err;
        }
        if (emittedChunks > 0) {
          throw err;
        }
        remuxFailedError = err;
      }

      const fallbackReason =
        remuxFailedError instanceof Error
          ? `Direct ${sourceCodec.toUpperCase()} remux fallback (${remuxFailedError.message})`
          : `Direct ${sourceCodec.toUpperCase()} remux fallback`;

      return await extractAudioOnlyFallback({
        mb,
        audioTrack,
        sourceCodec,
        totalDuration,
        detectMs,
        chunkDurationSeconds: Math.min(chunkDurationSeconds, 50),
        overlapSeconds,
        fallbackReason,
        signal,
        onMetadata,
        onChunk,
      });
    }

    // Path B: Codec cannot be directly copied into a Gemini-compatible container
    const fallbackReason = sourceCodec
      ? `Codec ${sourceCodec.toUpperCase()} requires audio-only conversion`
      : "Unknown audio codec requires audio-only conversion";

    return await extractAudioOnlyFallback({
      mb,
      audioTrack,
      sourceCodec: sourceCodec ?? "unknown",
      totalDuration,
      detectMs,
      chunkDurationSeconds: Math.min(chunkDurationSeconds, 50),
      overlapSeconds,
      fallbackReason,
      signal,
      onMetadata,
      onChunk,
    });
  } finally {
    input.dispose();
  }
}

async function extractAudioOnlyFallback(params: {
  mb: typeof import("mediabunny");
  audioTrack: import("mediabunny").InputAudioTrack;
  sourceCodec: string;
  totalDuration: number;
  detectMs: number;
  chunkDurationSeconds: number;
  overlapSeconds: number;
  fallbackReason: string;
  signal?: AbortSignal;
  onMetadata?: (meta: DemuxAudioMetadata) => void;
  onChunk: (chunk: DemuxedAudioChunk, extractProgress: number) => void;
}): Promise<DemuxExtractionSummary> {
  const {
    mb,
    audioTrack,
    sourceCodec,
    detectMs,
    chunkDurationSeconds,
    overlapSeconds,
    fallbackReason,
    signal,
    onMetadata,
    onChunk,
  } = params;
  let { totalDuration } = params;

  const canDecode = await audioTrack.canDecode();
  if (!canDecode) {
    throw new Error("Audio codec requires AudioContext fallback");
  }

  let encodableCompressedCodec: "aac" | "opus" | null = null;
  if (typeof AudioEncoder !== "undefined") {
    const ch = Math.min(2, await audioTrack.getNumberOfChannels().catch(() => 1));
    const sr = await audioTrack.getSampleRate().catch(() => 48000);
    const chosen = await mb
      .getFirstEncodableAudioCodec(["aac", "opus"], {
        numberOfChannels: ch,
        sampleRate: sr,
        bitrate: 64_000,
      })
      .catch(() => null);
    if (chosen === "aac" || chosen === "opus") {
      encodableCompressedCodec = chosen;
    }
  }

  if (encodableCompressedCodec) {
    const formatName = encodableCompressedCodec === "aac" ? "M4A/MP4 (.mp4)" : "OGG (.ogg)";
    const mimeType = encodableCompressedCodec === "aac" ? "audio/mp4" : "audio/ogg";
    const useSinglePass = totalDuration > 0 && totalDuration <= 150;
    const windowSec = useSinglePass ? Math.max(totalDuration + 5, 150) : chunkDurationSeconds;
    const estimatedTotalChunks =
      totalDuration > 0
        ? useSinglePass
          ? 1
          : Math.max(1, Math.ceil(totalDuration / Math.max(15, windowSec - overlapSeconds)))
        : 1;

    onMetadata?.({
      totalDuration,
      estimatedTotalChunks,
      sourceCodec,
      outputFormat: formatName,
      outputMimeType: mimeType,
      extractionMode: "audio-only-transcode",
      detectMs,
      fallbackReason,
    });

    const sink = new mb.AudioSampleSink(audioTrack);
    const iter = sink.samples()[Symbol.asyncIterator]();

    let extractSamplesMs = 0;
    let muxMs = 0;
    let extractedBytes = 0;
    let chunkIndex = 0;
    let hadSpeechSignal = false;
    const muxState: {
      output: InstanceType<typeof mb.Output> | null;
      source: InstanceType<typeof mb.AudioSampleSource> | null;
      target: InstanceType<typeof mb.BufferTarget> | null;
    } = { output: null, source: null, target: null };
    let windowStartSec = 0;
    let lastSampleEndSec = 0;

    const openWindow = async (startSec: number) => {
      const target = new mb.BufferTarget();
      const output = new mb.Output({
        format:
          encodableCompressedCodec === "aac"
            ? new mb.Mp4OutputFormat({ fastStart: "in-memory" })
            : new mb.OggOutputFormat(),
        target,
      });
      const source = new mb.AudioSampleSource({
        codec: encodableCompressedCodec!,
        bitrate: 64_000,
      });
      output.addAudioTrack(source);
      await output.start();
      muxState.target = target;
      muxState.output = output;
      muxState.source = source;
      windowStartSec = startSec;
    };

    const closeWindow = async (isFinal: boolean) => {
      if (!muxState.output || !muxState.source || !muxState.target) return;
      const m0 = performance.now();
      muxState.source.close();
      await muxState.output.finalize();
      muxMs += performance.now() - m0;

      const buf = muxState.target.buffer ?? null;
      const durationSec = Math.max(0.1, Number((lastSampleEndSec - windowStartSec).toFixed(2)));
      extractedBytes += buf?.byteLength ?? 0;
      if (buf && buf.byteLength > 0) hadSpeechSignal = true;

      const finalTotalChunks = isFinal
        ? chunkIndex + 1
        : Math.max(estimatedTotalChunks, chunkIndex + 1);
      const extractProgress =
        totalDuration > 0
          ? Math.min(isFinal ? 100 : 96, Math.round((lastSampleEndSec / totalDuration) * 100))
          : isFinal
          ? 100
          : Math.min(95, (chunkIndex + 1) * 15);

      onChunk(
        {
          index: chunkIndex,
          totalChunks: finalTotalChunks,
          startOffsetSeconds: Number(Math.max(0, windowStartSec).toFixed(2)),
          durationSeconds: durationSec,
          audioBuffer: buf,
          mimeType,
          isSilent: !buf || buf.byteLength === 0,
          codec: sourceCodec,
          outputFormat: formatName,
          extractionMode: "audio-only-transcode",
          detectMs,
          extractPacketsMs: Math.round(extractSamplesMs),
          muxMs: Math.round(muxMs),
        },
        extractProgress
      );
      chunkIndex++;
      muxState.output = null;
      muxState.source = null;
      muxState.target = null;
    };

    while (true) {
      if (signal?.aborted) {
        if (muxState.output) await muxState.output.cancel().catch(() => {});
        throw new Error("Processing paused.");
      }

      const t0 = performance.now();
      const { value: sample, done } = await iter.next();
      extractSamplesMs += performance.now() - t0;

      if (done) break;
      try {
        if (!muxState.output) {
          await openWindow(Math.max(0, sample.timestamp));
        }

        if (!useSinglePass && sample.timestamp - windowStartSec >= windowSec) {
          await closeWindow(false);
          await openWindow(Math.max(0, sample.timestamp));
        }

        const origTs = sample.timestamp;
        const origDur = sample.duration;
        const cloned: AudioSample = sample.clone();
        try {
          cloned.setTimestamp(Math.max(0, origTs - windowStartSec));
          const m0 = performance.now();
          if (muxState.source) {
            await muxState.source.add(cloned);
          }
          muxMs += performance.now() - m0;
        } finally {
          cloned.close();
        }
        lastSampleEndSec = Math.max(lastSampleEndSec, origTs + origDur);
      } finally {
        sample.close();
      }
    }

    if (muxState.output) {
      if (totalDuration <= 0 && lastSampleEndSec > 0) {
        totalDuration = Number(lastSampleEndSec.toFixed(2));
      }
      await closeWindow(true);
    }

    return {
      totalChunks: chunkIndex,
      totalDuration,
      hadSpeechSignal,
      extractionMode: "audio-only-transcode",
      sourceCodec,
      outputFormat: formatName,
      outputMimeType: mimeType,
      detectMs,
      extractPacketsMs: Math.round(extractSamplesMs),
      muxMs: Math.round(muxMs),
      extractedAudioBytes: extractedBytes,
      fallbackReason,
    };
  }

  // Last-resort PCM WAV fallback inside Mediabunny AudioSampleSink
  const estimatedTotalChunks =
    totalDuration > 0
      ? totalDuration <= 60
        ? 1
        : Math.max(2, Math.ceil(totalDuration / Math.max(15, chunkDurationSeconds - overlapSeconds)))
      : 1;

  onMetadata?.({
    totalDuration,
    estimatedTotalChunks,
    sourceCodec,
    outputFormat: "PCM WAV (.wav)",
    outputMimeType: "audio/wav",
    extractionMode: "pcm-fallback",
    detectMs,
    fallbackReason,
  });

  const sink = new mb.AudioSampleSink(audioTrack);
  const iter = sink.samples()[Symbol.asyncIterator]();

  let rollingBuf = new Float32Array(TARGET_FALLBACK_SAMPLE_RATE * 64);
  let rollingLen = 0;
  let chunkIndex = 0;
  let emittedSamplesCursor = 0;
  let hadSpeechSignal = false;
  let firstTimestampSet = false;
  let streamBaseSec = 0;
  let extractSamplesMs = 0;
  let muxMs = 0;
  let extractedBytes = 0;

  const singleMaxSamples = TARGET_FALLBACK_SAMPLE_RATE * 60;
  const chunkSamples = Math.round(chunkDurationSeconds * TARGET_FALLBACK_SAMPLE_RATE);
  const overlapSamples = Math.round(overlapSeconds * TARGET_FALLBACK_SAMPLE_RATE);
  const strideSamples = Math.max(TARGET_FALLBACK_SAMPLE_RATE * 15, chunkSamples - overlapSamples);

  let scratchPlane: Float32Array<ArrayBuffer> = new Float32Array(8192);
  let scratchChannels: Float32Array<ArrayBuffer>[] = [];

  const emitSlice = (sampleSlice: Float32Array, startSec: number, isFinal: boolean) => {
    if (sampleSlice.length < TARGET_FALLBACK_SAMPLE_RATE * 0.25 && chunkIndex > 0) return;
    const isSilent = checkPcmSilence(sampleSlice);
    if (!isSilent) hadSpeechSignal = true;

    const m0 = performance.now();
    const wavBuffer = isSilent ? null : encodeWavArrayBuffer(sampleSlice, TARGET_FALLBACK_SAMPLE_RATE);
    muxMs += performance.now() - m0;

    extractedBytes += wavBuffer?.byteLength ?? 0;
    const finalChunkCount = isFinal ? chunkIndex + 1 : Math.max(estimatedTotalChunks, chunkIndex + 1);
    const durationSec = Number((sampleSlice.length / TARGET_FALLBACK_SAMPLE_RATE).toFixed(2));
    const extractProgress =
      totalDuration > 0
        ? Math.min(isFinal ? 100 : 96, Math.round(((startSec + durationSec) / totalDuration) * 100))
        : isFinal
        ? 100
        : Math.min(95, (chunkIndex + 1) * 15);

    onChunk(
      {
        index: chunkIndex,
        totalChunks: finalChunkCount,
        startOffsetSeconds: Number(startSec.toFixed(2)),
        durationSeconds: durationSec,
        audioBuffer: wavBuffer,
        mimeType: "audio/wav",
        isSilent,
        codec: sourceCodec,
        outputFormat: "PCM WAV (.wav)",
        extractionMode: "pcm-fallback",
        detectMs,
        extractPacketsMs: Math.round(extractSamplesMs),
        muxMs: Math.round(muxMs),
      },
      extractProgress
    );
    chunkIndex++;
  };

  const forceChunkingMode = totalDuration > 60;

  while (true) {
    if (signal?.aborted) {
      throw new Error("Processing paused.");
    }
    const t0 = performance.now();
    const { value: sample, done } = await iter.next();
    extractSamplesMs += performance.now() - t0;

    if (done) break;

    try {
      if (!firstTimestampSet) {
        streamBaseSec = Math.max(0, sample.timestamp || 0);
        firstTimestampSet = true;
      }

      const frames = sample.numberOfFrames;
      const chCount = Math.min(2, sample.numberOfChannels);
      if (frames > 0 && chCount > 0) {
        if (scratchPlane.length < frames * chCount) {
          scratchPlane = new Float32Array(frames * chCount);
        }
        if (scratchChannels.length !== chCount) {
          scratchChannels = Array.from({ length: chCount }, (_, idx) =>
            scratchPlane.subarray(idx * frames, (idx + 1) * frames)
          );
        } else {
          for (let c = 0; c < chCount; c++) {
            scratchChannels[c] = scratchPlane.subarray(c * frames, (c + 1) * frames);
          }
        }

        for (let c = 0; c < chCount; c++) {
          sample.copyTo(scratchChannels[c], { planeIndex: c, format: "f32-planar" });
        }

        const mono16k = downsamplePlanarTo16kMono(scratchChannels, frames, sample.sampleRate);
        const appended = appendToRollingBuffer(rollingBuf, rollingLen, mono16k);
        rollingBuf = appended.buffer;
        rollingLen = appended.length;

        const triggerThreshold =
          chunkIndex === 0 && !forceChunkingMode ? singleMaxSamples + 1 : chunkSamples;

        while (rollingLen >= triggerThreshold) {
          const slice = rollingBuf.subarray(0, chunkSamples);
          const startSec = streamBaseSec + emittedSamplesCursor / TARGET_FALLBACK_SAMPLE_RATE;
          emitSlice(slice, startSec, false);

          const remaining = rollingLen - strideSamples;
          if (remaining > 0) {
            rollingBuf.copyWithin(0, strideSamples, rollingLen);
            rollingLen = remaining;
          } else {
            rollingLen = 0;
          }
          emittedSamplesCursor += strideSamples;
        }
      }
    } finally {
      sample.close();
    }
  }

  if (rollingLen > 0) {
    const slice = rollingBuf.subarray(0, rollingLen);
    const startSec = streamBaseSec + emittedSamplesCursor / TARGET_FALLBACK_SAMPLE_RATE;
    emitSlice(slice, startSec, true);
  }

  const measuredTotalDuration =
    totalDuration > 0
      ? totalDuration
      : Number(((emittedSamplesCursor + rollingLen) / TARGET_FALLBACK_SAMPLE_RATE).toFixed(2));

  return {
    totalChunks: chunkIndex,
    totalDuration: measuredTotalDuration,
    hadSpeechSignal,
    extractionMode: "pcm-fallback",
    sourceCodec,
    outputFormat: "PCM WAV (.wav)",
    outputMimeType: "audio/wav",
    detectMs,
    extractPacketsMs: Math.round(extractSamplesMs),
    muxMs: Math.round(muxMs),
    extractedAudioBytes: extractedBytes,
    fallbackReason,
  };
}
