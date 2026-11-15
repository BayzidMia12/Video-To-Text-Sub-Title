import type {
  SubtitleSegment,
  SubtitleSettings,
  SubtitleTrackPosition,
  TranslationProject,
} from "../types/subtitle";
import { resolveSubtitleFontSizePx } from "./storageService";
import { resolveTrackTextAlign } from "../utils/subtitlePosition";
import { formatSrtTime, formatVttTime } from "../utils/time";

export type SubtitleExportFormat = "dual" | "source" | "target";

export function generateSrtContent(
  segments: SubtitleSegment[],
  mode: SubtitleExportFormat = "dual"
): string {
  return segments
    .map((seg, idx) => {
      const start = formatSrtTime(seg.startTime);
      const end = formatSrtTime(seg.endTime);
      const lines: string[] = [];
      if (mode === "dual" || mode === "source") {
        if (seg.sourceText.trim()) lines.push(seg.sourceText.trim());
      }
      if (mode === "dual" || mode === "target") {
        if (seg.targetText.trim()) lines.push(seg.targetText.trim());
      }
      return `${idx + 1}\n${start} --> ${end}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function generateVttContent(
  segments: SubtitleSegment[],
  mode: SubtitleExportFormat = "dual"
): string {
  const body = segments
    .map((seg, idx) => {
      const start = formatVttTime(seg.startTime);
      const end = formatVttTime(seg.endTime);
      const lines: string[] = [];
      if (mode === "dual" || mode === "source") {
        if (seg.sourceText.trim()) lines.push(seg.sourceText.trim());
      }
      if (mode === "dual" || mode === "target") {
        if (seg.targetText.trim()) lines.push(seg.targetText.trim());
      }
      return `${idx + 1}\n${start} --> ${end}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  return `WEBVTT\n\n${body}`;
}

export function generateProjectJson(project: TranslationProject): string {
  return JSON.stringify(
    {
      app: "Video Bangla Translator",
      exportedAt: new Date().toISOString(),
      languagePair: `${project.sourceLanguageCode} -> ${project.targetLanguageCode}`,
      videoFileName: project.videoMeta.fileName,
      durationSeconds: project.videoMeta.duration,
      segments: project.segments,
    },
    null,
    2
  );
}

export function downloadTextFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function checkVideoExportSupport(): { supported: boolean; reason?: string } {
  if (typeof MediaRecorder === "undefined") {
    return {
      supported: false,
      reason: "This browser does not support MediaRecorder for client-side video export.",
    };
  }
  const testCanvas = document.createElement("canvas");
  if (typeof testCanvas.captureStream !== "function") {
    return {
      supported: false,
      reason: "Canvas stream capture is unavailable in this browser.",
    };
  }
  return { supported: true };
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawTrackOnCanvas(params: {
  ctx: CanvasRenderingContext2D;
  trackKind: "source" | "target";
  lines: string[];
  fontCss: string;
  fontSizePx: number;
  textColor: string;
  position: SubtitleTrackPosition;
  settings: SubtitleSettings;
  canvasWidth: number;
  canvasHeight: number;
}): void {
  const {
    ctx,
    trackKind,
    lines,
    fontCss,
    fontSizePx,
    textColor,
    position,
    settings,
    canvasWidth,
    canvasHeight,
  } = params;

  if (lines.length === 0) return;

  const trackBg =
    trackKind === "source"
      ? settings.sourceBackground ?? settings.background
      : settings.targetBackground ?? settings.background;
  const trackOpacity =
    trackKind === "source"
      ? settings.sourceOpacity ?? settings.opacity
      : settings.targetOpacity ?? settings.opacity;
  const trackOutline =
    trackKind === "source"
      ? settings.sourceOutline ?? settings.outline
      : settings.targetOutline ?? settings.outline;
  const trackLineHeightRatio =
    trackKind === "source"
      ? settings.sourceLineHeight ?? 1.35
      : settings.targetLineHeight ?? 1.38;

  ctx.font = fontCss;
  const lineHeight = Math.round(fontSizePx * trackLineHeightRatio);
  const lineGap = Math.max(4, lineHeight - fontSizePx);
  const padX = trackBg !== "none" ? 20 : 8;
  const padY = trackBg !== "none" ? 12 : 4;

  const safeLeft = Math.round(canvasWidth * 0.015);
  const safeTop = 0;
  const safeW = Math.max(80, canvasWidth - safeLeft * 2);
  const safeH = canvasHeight;

  let maxLineW = 0;
  for (const line of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }

  const boxW = Math.min(safeW, Math.round(maxLineW + padX * 2));
  const boxH = Math.min(safeH, lines.length * lineHeight + padY * 2 - lineGap);
  const rawBottomOffset = Math.max(
    0,
    Math.min(200, position.bottomOffsetPx ?? 0)
  );
  const scaledBottomOffset = Math.round(
    rawBottomOffset * Math.max(1, canvasHeight / 360)
  );

  const boxLeft =
    safeLeft + (position.horizontalPercent / 100) * Math.max(0, safeW - boxW);
  const boxTop =
    safeTop +
    (position.verticalPercent / 100) *
      Math.max(0, safeH - boxH - scaledBottomOffset);

  if (trackBg !== "none") {
    const alpha =
      trackBg === "solid"
        ? Math.max(0.85, trackOpacity / 100)
        : (trackOpacity / 100) * 0.72;
    ctx.fillStyle = `rgba(10, 15, 28, ${alpha})`;
    ctx.fillRect(boxLeft, boxTop, boxW, boxH);
  }

  const align = resolveTrackTextAlign(position);
  ctx.textAlign = align;
  const xPos =
    align === "left"
      ? boxLeft + padX
      : align === "right"
      ? boxLeft + boxW - padX
      : boxLeft + boxW / 2;

  let cursorY = boxTop + padY + fontSizePx;
  for (const line of lines) {
    if (trackOutline !== "none") {
      ctx.lineWidth = trackOutline === "strong" ? 5 : 3;
      ctx.strokeStyle = "rgba(0,0,0,0.9)";
      ctx.strokeText(line, xPos, cursorY);
    }
    ctx.fillStyle = textColor;
    ctx.fillText(line, xPos, cursorY);
    cursorY += lineHeight;
  }
}

export async function exportVideoWithSubtitles(
  videoUrl: string,
  segments: SubtitleSegment[],
  settings: SubtitleSettings,
  baseFileName: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const support = checkVideoExportSupport();
  if (!support.supported) {
    throw new Error(support.reason || "Video export is not supported in this environment.");
  }

  const video = document.createElement("video");
  video.src = videoUrl;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = false;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read the video."));
  });

  const width = Math.min(video.videoWidth || 1280, 1280);
  const height = Math.round(((video.videoHeight || 720) / (video.videoWidth || 1280)) * width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering context unavailable.");

  const canvasStream = canvas.captureStream(30);
  const videoWithCapture = video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  const mediaStream =
    typeof videoWithCapture.captureStream === "function"
      ? videoWithCapture.captureStream()
      : typeof videoWithCapture.mozCaptureStream === "function"
      ? videoWithCapture.mozCaptureStream()
      : null;

  if (mediaStream) {
    for (const audioTrack of mediaStream.getAudioTracks()) {
      canvasStream.addTrack(audioTrack);
    }
  }

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm")
    ? "video/webm"
    : "";

  const recorder = mimeType
    ? new MediaRecorder(canvasStream, { mimeType })
    : new MediaRecorder(canvasStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const rawEnPx = resolveSubtitleFontSizePx(
    settings.sourceFontSize,
    settings.sourceCustomFontSize
  );
  const rawBnPx = resolveSubtitleFontSizePx(
    settings.targetFontSize,
    settings.targetCustomFontSize
  );
  const scaleFactor = Math.max(1, height / 360);

  return new Promise<void>((resolve, reject) => {
    let rafId = 0;

    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseFileName.replace(/\.[^.]+$/, "")}_bangla_subtitled.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      onProgress(100);
      resolve();
    };

    recorder.onerror = () => {
      cancelAnimationFrame(rafId);
      reject(new Error("Video export failed during encoding."));
    };

    video.currentTime = 0;
    recorder.start(250);
    video.play().catch((err) => {
      recorder.stop();
      reject(err);
    });

    const drawLoop = () => {
      ctx.drawImage(video, 0, 0, width, height);
      const t = video.currentTime;
      const active = segments.find((s) => t >= s.startTime && t <= s.endTime);

      if (active) {
        const enSize = Math.round(rawEnPx * scaleFactor);
        const bnSize = Math.round(rawBnPx * scaleFactor);
        const maxTextWidth = width * 0.84;

        const enFont = `600 ${enSize}px "Plus Jakarta Sans", "Noto Sans Arabic", "Noto Sans Devanagari", "Noto Sans KR", "Noto Sans SC", "Noto Sans Tamil", sans-serif`;
        ctx.font = enFont;
        const enLines =
          settings.showSource && active.sourceText
            ? wrapCanvasText(ctx, active.sourceText, maxTextWidth)
            : [];

        const bnFont = `600 ${bnSize}px "Noto Sans Bengali", "Hind Siliguri", sans-serif`;
        ctx.font = bnFont;
        const bnLines =
          settings.showTarget && active.targetText
            ? wrapCanvasText(ctx, active.targetText, maxTextWidth)
            : [];

        if (enLines.length > 0) {
          drawTrackOnCanvas({
            ctx,
            trackKind: "source",
            lines: enLines,
            fontCss: enFont,
            fontSizePx: enSize,
            textColor: settings.sourceColor,
            position: settings.sourcePosition,
            settings,
            canvasWidth: width,
            canvasHeight: height,
          });
        }

        if (bnLines.length > 0) {
          drawTrackOnCanvas({
            ctx,
            trackKind: "target",
            lines: bnLines,
            fontCss: bnFont,
            fontSizePx: bnSize,
            textColor: settings.targetColor,
            position: settings.targetPosition,
            settings,
            canvasWidth: width,
            canvasHeight: height,
          });
        }
      }

      if (video.duration > 0) {
        onProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
      }

      if (!video.ended && !video.paused) {
        rafId = requestAnimationFrame(drawLoop);
      } else if (video.ended) {
        recorder.stop();
      }
    };

    video.onended = () => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    };

    rafId = requestAnimationFrame(drawLoop);
  });
}
