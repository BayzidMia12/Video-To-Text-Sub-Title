import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Download,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Subtitles,
  Sun,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  resolveQuickSeekSeconds,
  resolveSubtitleFontSizePx,
  resolveSwipeSecondsPer100Px,
} from "../services/storageService";
import type {
  PlayerControlButtonSize,
  PlayerSettings,
  ProcessingStatusState,
  SubtitleSegment,
  SubtitleSettings,
  SubtitleTrackPosition,
  VideoAspectFitMode,
} from "../types/subtitle";
import {
  formatSubtitleText,
  resolveFontFamilyCss,
} from "../utils/subtitleFormatting";
import {
  computeDraggedTrackPercents,
  computeResponsiveFontPx,
  computeVideoSafeRect,
  resolveTrackTextAlign,
  solveDualSubtitleLayout,
  type Dimensions,
} from "../utils/subtitlePosition";
import { findActiveSegmentBinary } from "../utils/subtitleSync";
import { formatClockTime } from "../utils/time";
import { PlayerProcessingStatusSection } from "./ProcessingStatus";

export interface VideoPlayerHandle {
  togglePlay: () => void;
  pause: () => void;
  toggleFullscreen: () => void;
}

interface VideoPlayerProps {
  videoUrl: string | null;
  videoTitle: string;
  segments: SubtitleSegment[];
  settings: SubtitleSettings;
  playerSettings: PlayerSettings;
  processingStatus?: ProcessingStatusState;
  sourceLanguageCode?: string;
  sourceLanguageLabel?: string;
  sourceDirection?: "ltr" | "rtl";
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  onChangePlaybackRate?: (rate: number) => void;
  onChangeVolume: (vol: number) => void;
  onToggleMute: () => void;
  onChangeZoom?: (scale: number, aspectMode?: VideoAspectFitMode) => void;
  onToggleSubtitles?: () => void;
  onTimeUpdate: (time: number) => void;
  onActiveSegmentChange?: (segmentId: string | null) => void;
  onDurationChange?: (duration: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  seekRequestTime: number | null;
  onSeekHandled: () => void;
  onUpdateSubtitlePosition?: (
    track: "source" | "target",
    nextPos: SubtitleTrackPosition
  ) => void;
  onAutoFixOverlap?: () => void;
  onOverlapChange?: (overlap: boolean) => void;
  onPauseProcessing?: () => void;
  onResumeProcessing?: () => void;
  onRetryProcessing?: () => void;
  onToggleProcessingDetail?: () => void;
  onOpenSettings: () => void;
  onOpenMobileSubtitles?: () => void;
  onOpenMobileExport?: () => void;
  onBackHome?: () => void;
  settingsOpen?: boolean;
  overlaySlot?: React.ReactNode;
}

interface SeekOverlayState {
  targetTime: number;
  deltaSec: number;
  key: number;
}

interface GestureMeterOverlay {
  kind: "brightness" | "volume" | "zoom";
  value: number; // % for brightness/volume, or scale*100 for zoom
  label: string;
  key: number;
}

interface DraggableSubtitleTrackProps {
  track: "source" | "target";
  text: string;
  dir: "ltr" | "rtl";
  scaledFontPx: number;
  maxBoxWidthPx: number;
  color: string;
  lineHeight: number;
  letterSpacingPx: number;
  fontClassName: string;
  fontFamilyStyle?: string;
  position: SubtitleTrackPosition;
  solvedLeftPx: number;
  solvedTopPx: number;
  safeRect: { left: number; top: number; width: number; height: number };
  boxStyle: React.CSSProperties;
  isRotated90?: boolean;
  onMeasure: (track: "source" | "target", dims: Dimensions) => void;
  onDragPreview: (
    track: "source" | "target",
    preview: { h: number; v: number } | null
  ) => void;
  onUpdatePosition?: (
    track: "source" | "target",
    nextPos: SubtitleTrackPosition
  ) => void;
}

const SPEED_CYCLE = [0.5, 0.75, 1, 1.25, 1.5, 2];

const DraggableSubtitleTrack: React.FC<DraggableSubtitleTrackProps> = ({
  track,
  text,
  dir,
  scaledFontPx,
  maxBoxWidthPx,
  color,
  lineHeight,
  letterSpacingPx,
  fontClassName,
  fontFamilyStyle,
  position,
  solvedLeftPx,
  solvedTopPx,
  safeRect,
  boxStyle,
  isRotated90 = false,
  onMeasure,
  onDragPreview,
  onUpdatePosition,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercents, setDragPercents] = useState<{
    h: number;
    v: number;
  } | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startH: number;
    startV: number;
    boxW: number;
    boxH: number;
  } | null>(null);

  const effectiveH = dragPercents ? dragPercents.h : position.horizontalPercent;
  const effectiveV = dragPercents ? dragPercents.v : position.verticalPercent;
  const effectivePosition: SubtitleTrackPosition = {
    ...position,
    horizontalPercent: effectiveH,
    verticalPercent: effectiveV,
  };
  const textAlign = resolveTrackTextAlign(effectivePosition);
  const lineHeightPx = Math.round(scaledFontPx * lineHeight);
  const canDrag = Boolean(position.dragEnabled && onUpdatePosition);

  const reportMeasure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      onMeasure(track, {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
  }, [onMeasure, track]);

  useLayoutEffect(() => {
    reportMeasure();
  }, [
    reportMeasure,
    text,
    scaledFontPx,
    maxBoxWidthPx,
    lineHeightPx,
    letterSpacingPx,
    fontFamilyStyle,
  ]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      reportMeasure();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [reportMeasure]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canDrag) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = contentRef.current?.getBoundingClientRect();
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startH: position.horizontalPercent,
      startV: position.verticalPercent,
      boxW: rect?.width ?? Math.min(260, safeRect.width * 0.6),
      boxH: rect?.height ?? lineHeightPx + 12,
    };
    setIsDragging(true);
    const initial = {
      h: position.horizontalPercent,
      v: position.verticalPercent,
    };
    setDragPercents(initial);
    onDragPreview(track, initial);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const sess = dragSessionRef.current;
    if (!sess || sess.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    const rawDx = e.clientX - sess.startX;
    const rawDy = e.clientY - sess.startY;
    const dx = isRotated90 ? rawDy : rawDx;
    const dy = isRotated90 ? -rawDx : rawDy;

    const next = computeDraggedTrackPercents({
      startHorizontalPercent: sess.startH,
      startVerticalPercent: sess.startV,
      dx,
      dy,
      safeWidth: safeRect.width,
      safeHeight: safeRect.height,
      boxWidth: sess.boxW,
      boxHeight: sess.boxH,
      bottomOffsetPx: position.bottomOffsetPx ?? 0,
    });
    const nextPair = { h: next.horizontalPercent, v: next.verticalPercent };
    setDragPercents(nextPair);
    onDragPreview(track, nextPair);
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const sess = dragSessionRef.current;
    if (!sess || sess.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const rawDx = e.clientX - sess.startX;
    const rawDy = e.clientY - sess.startY;
    const dx = isRotated90 ? rawDy : rawDx;
    const dy = isRotated90 ? -rawDx : rawDy;

    const finalPercents = computeDraggedTrackPercents({
      startHorizontalPercent: sess.startH,
      startVerticalPercent: sess.startV,
      dx,
      dy,
      safeWidth: safeRect.width,
      safeHeight: safeRect.height,
      boxWidth: sess.boxW,
      boxHeight: sess.boxH,
      bottomOffsetPx: position.bottomOffsetPx ?? 0,
    });

    dragSessionRef.current = null;
    setIsDragging(false);
    setDragPercents(null);
    onDragPreview(track, null);

    if (onUpdatePosition) {
      onUpdatePosition(track, {
        ...position,
        verticalPreset: "custom",
        verticalPercent: finalPercents.verticalPercent,
        horizontalMode: "custom",
        horizontalPercent: finalPercents.horizontalPercent,
      });
    }
  };

  return (
    <div
      ref={boxRef}
      data-no-gesture="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        position: "absolute",
        left: `${solvedLeftPx}px`,
        top: `${solvedTopPx}px`,
        maxWidth: `${maxBoxWidthPx}px`,
        width: "max-content",
        pointerEvents: canDrag ? "auto" : "none",
        touchAction: canDrag ? "none" : "auto",
        zIndex: isDragging ? 35 : track === "target" ? 26 : 25,
      }}
      className={`transition-[top,left] duration-75 ease-out ${
        canDrag
          ? isDragging
            ? "cursor-grabbing select-none transition-none"
            : "cursor-grab select-none"
          : "pointer-events-none select-none"
      }`}
    >
      <div
        ref={contentRef}
        dir={dir}
        style={{
          ...boxStyle,
          color,
          fontSize: `${scaledFontPx}px`,
          lineHeight: `${lineHeightPx}px`,
          letterSpacing: `${letterSpacingPx}px`,
          fontFamily: fontFamilyStyle,
          textAlign,
          outline: isDragging
            ? "1.5px dashed rgba(45, 212, 191, 0.95)"
            : undefined,
        }}
        className={`px-3 py-1 rounded-lg max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] transition-[outline] ${fontClassName}`}
      >
        {text}
      </div>

      {isDragging && (
        <div className="mt-1 flex justify-center">
          <span className="px-2 py-0.5 rounded-full bg-slate-950/90 border border-teal-400/50 text-[10px] font-mono-tabular font-semibold text-teal-200 whitespace-nowrap shadow">
            {track === "target" ? "বাংলা" : "Original"} · X{" "}
            {Math.round(effectiveH)}% · Y {Math.round(effectiveV)}%
          </span>
        </div>
      )}
    </div>
  );
};

function resolveSourceTypography(code?: string): {
  className: string;
  fontFamily?: string;
  dir: "ltr" | "rtl";
} {
  switch (code) {
    case "ar":
      return { className: "", fontFamily: "var(--font-arabic)", dir: "rtl" };
    case "hi":
      return { className: "", fontFamily: "var(--font-hindi)", dir: "ltr" };
    case "ja":
      return { className: "", fontFamily: "var(--font-japanese)", dir: "ltr" };
    case "ko":
      return { className: "", fontFamily: "var(--font-korean)", dir: "ltr" };
    case "zh":
      return { className: "", fontFamily: "var(--font-chinese)", dir: "ltr" };
    case "ta":
      return { className: "", fontFamily: "var(--font-tamil)", dir: "ltr" };
    case "bn":
      return { className: "font-bengali", dir: "ltr" };
    default:
      return { className: "", dir: "ltr" };
  }
}

function buildTrackBoxStyle(
  bg: "none" | "semi" | "solid",
  opacity: number,
  outline: "none" | "subtle" | "strong"
): React.CSSProperties {
  const bgAlpha = (opacity / 100).toFixed(2);
  const backgroundColor =
    bg === "none"
      ? "transparent"
      : bg === "solid"
      ? "rgba(2, 6, 23, 0.96)"
      : `rgba(2, 6, 23, ${bgAlpha})`;

  const textShadow =
    outline === "none"
      ? "none"
      : outline === "subtle"
      ? "0 1px 2px rgba(0, 0, 0, 0.85)"
      : "0 1px 3px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.9)";

  return { backgroundColor, textShadow };
}

function resolveButtonDimensions(size: PlayerControlButtonSize): string {
  if (size === "large") return "min-h-[40px] min-w-[40px] px-2.5 text-xs";
  if (size === "medium") return "min-h-[34px] min-w-[34px] px-2 text-[11px]";
  return "min-h-[30px] min-w-[30px] px-1.5 text-[11px]";
}

export const VideoPlayer = memo(
  forwardRef<VideoPlayerHandle, VideoPlayerProps>(
    (
      {
        videoUrl,
        videoTitle,
        segments,
        settings,
        playerSettings,
        processingStatus,
        sourceLanguageCode,
        sourceLanguageLabel,
        sourceDirection,
        playbackRate,
        volume,
        isMuted,
        onChangePlaybackRate,
        onChangeVolume,
        onToggleMute,
        onChangeZoom,
        onToggleSubtitles,
        onTimeUpdate,
        onActiveSegmentChange,
        onDurationChange,
        onPlayStateChange,
        onFullscreenChange,
        seekRequestTime,
        onSeekHandled,
        onUpdateSubtitlePosition,
        onAutoFixOverlap,
        onOverlapChange,
        onPauseProcessing,
        onResumeProcessing,
        onRetryProcessing,
        onToggleProcessingDetail,
        onOpenSettings,
        onOpenMobileSubtitles,
        onOpenMobileExport,
        onBackHome,
        settingsOpen = false,
        overlaySlot,
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const videoRef = useRef<HTMLVideoElement>(null);
      const segmentsRef = useRef<SubtitleSegment[]>(segments);
      segmentsRef.current = segments;

      const onTimeUpdateRef = useRef(onTimeUpdate);
      onTimeUpdateRef.current = onTimeUpdate;
      const onActiveSegRef = useRef(onActiveSegmentChange);
      onActiveSegRef.current = onActiveSegmentChange;

      const [isPlaying, setIsPlaying] = useState(false);
      const [currentTime, setCurrentTime] = useState(0);
      const [duration, setDuration] = useState(0);
      const [isFullscreen, setIsFullscreen] = useState(false);
      const [screenRotationMode, setScreenRotationMode] = useState<
        "auto" | "landscape" | "portrait"
      >("auto");
      const [viewportSize, setViewportSize] = useState<Dimensions>(() =>
        typeof window !== "undefined"
          ? { width: window.innerWidth, height: window.innerHeight }
          : { width: 1280, height: 720 }
      );
      const [brightnessPct, setBrightnessPct] = useState(100);
      const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

      const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
        typeof window !== "undefined"
          ? window.innerWidth < 768 ||
            (window.innerWidth < 1024 && window.innerHeight <= 500)
          : false
      );
      const isLandscapeExpanded = screenRotationMode === "landscape";
      const isCssRotated90 =
        screenRotationMode === "landscape" &&
        viewportSize.width < viewportSize.height;
      const isPortraitInLandscapeFullscreen =
        isFullscreen &&
        screenRotationMode === "portrait" &&
        viewportSize.width > viewportSize.height;
      const [controlsVisible, setControlsVisible] = useState(true);
      const [seekOverlay, setSeekOverlay] = useState<SeekOverlayState | null>(
        null
      );
      const [meterOverlay, setMeterOverlay] =
        useState<GestureMeterOverlay | null>(null);

      const [stageDimensions, setStageDimensions] = useState<Dimensions>({
        width: 640,
        height: 360,
      });
      const [videoNaturalSize, setVideoNaturalSize] = useState<Dimensions | null>(
        null
      );

      const [trackSizes, setTrackSizes] = useState<{
        source: Dimensions;
        target: Dimensions;
      }>({
        source: { width: 220, height: 32 },
        target: { width: 220, height: 34 },
      });
      const [dragPreviews, setDragPreviews] = useState<{
        source: { h: number; v: number } | null;
        target: { h: number; v: number } | null;
      }>({
        source: null,
        target: null,
      });

      const handleMeasureTrack = useCallback(
        (track: "source" | "target", dims: Dimensions) => {
          setTrackSizes((prev) => {
            const cur = prev[track];
            if (
              Math.abs(cur.width - dims.width) <= 1 &&
              Math.abs(cur.height - dims.height) <= 1
            ) {
              return prev;
            }
            return { ...prev, [track]: dims };
          });
        },
        []
      );

      const handleDragPreview = useCallback(
        (
          track: "source" | "target",
          preview: { h: number; v: number } | null
        ) => {
          setDragPreviews((prev) => ({ ...prev, [track]: preview }));
        },
        []
      );

      const activeSegmentIdRef = useRef<string | null>(null);
      const [activeSegment, setActiveSegment] = useState<SubtitleSegment | null>(
        null
      );

      const hideTimerRef = useRef<number | null>(null);
      const seekOverlayTimerRef = useRef<number | null>(null);
      const meterOverlayTimerRef = useRef<number | null>(null);
      const doubleTapTimerRef = useRef<number | null>(null);
      const gestureSuppressClickRef = useRef(false);
      const lastTapRef = useRef<{ time: number; x: number } | null>(null);

      const touchSessionRef = useRef<{
        startX: number;
        startY: number;
        baseTime: number;
        baseBrightness: number;
        baseVolume: number;
        side: "left" | "right" | "center";
        mode: "pending" | "horizontal" | "vertical" | "pinch";
        targetTime: number;
        deltaSec: number;
        pinchStartDist: number;
        pinchBaseZoom: number;
      } | null>(null);

      const volumeRef = useRef(volume);
      volumeRef.current = volume;
      const brightnessRef = useRef(brightnessPct);
      brightnessRef.current = brightnessPct;
      const zoomRef = useRef(playerSettings.zoomScale);
      zoomRef.current = playerSettings.zoomScale;

      const quickSeekSec = resolveQuickSeekSeconds(playerSettings);
      const swipeSecPer100Px = resolveSwipeSecondsPer100Px(playerSettings);
      const effectiveAutoHideMs = Math.min(
        30000,
        Math.max(1500, playerSettings.autoHideDelayMs || 3000)
      );

      const showTemporarySeekOverlay = useCallback(
        (targetTime: number, deltaSec: number, persistUntilEnd = false) => {
          if (!playerSettings.showSeekPreview) return;
          const key = Date.now();
          setSeekOverlay({ targetTime, deltaSec, key });
          if (seekOverlayTimerRef.current) {
            window.clearTimeout(seekOverlayTimerRef.current);
            seekOverlayTimerRef.current = null;
          }
          if (!persistUntilEnd) {
            seekOverlayTimerRef.current = window.setTimeout(() => {
              setSeekOverlay((prev) => (prev?.key === key ? null : prev));
            }, playerSettings.seekOverlayDurationMs || 700);
          }
        },
        [playerSettings.seekOverlayDurationMs, playerSettings.showSeekPreview]
      );

      const showTemporaryMeter = useCallback(
        (
          kind: "brightness" | "volume" | "zoom",
          value: number,
          label: string
        ) => {
          if (kind === "brightness" && !playerSettings.showBrightnessOverlay)
            return;
          if (kind === "volume" && !playerSettings.showVolumeOverlay) return;
          const key = Date.now();
          setMeterOverlay({ kind, value, label, key });
          if (meterOverlayTimerRef.current) {
            window.clearTimeout(meterOverlayTimerRef.current);
          }
          meterOverlayTimerRef.current = window.setTimeout(() => {
            setMeterOverlay((prev) => (prev?.key === key ? null : prev));
          }, 800);
        },
        [
          playerSettings.showBrightnessOverlay,
          playerSettings.showVolumeOverlay,
        ]
      );

      const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current !== null) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      }, []);

      const scheduleHideControls = useCallback(
        (playingNow?: boolean) => {
          clearHideTimer();
          if (!playerSettings.autoHideControls) return;
          const actuallyPlaying =
            playingNow ??
            Boolean(videoRef.current && !videoRef.current.paused);
          if (!actuallyPlaying || settingsOpen || zoomMenuOpen) return;
          hideTimerRef.current = window.setTimeout(() => {
            setControlsVisible(false);
          }, effectiveAutoHideMs);
        },
        [
          clearHideTimer,
          effectiveAutoHideMs,
          playerSettings.autoHideControls,
          settingsOpen,
          zoomMenuOpen,
        ]
      );

      const revealControls = useCallback(() => {
        setControlsVisible(true);
        scheduleHideControls();
      }, [scheduleHideControls]);

      useEffect(() => {
        const updateViewport = () => {
          const w = window.innerWidth;
          const h = window.innerHeight;
          setViewportSize({ width: w, height: h });
          setIsCompactViewport(w < 768 || (w < 1024 && h <= 500));
        };
        updateViewport();
        window.addEventListener("resize", updateViewport);
        window.addEventListener("orientationchange", updateViewport);
        return () => {
          window.removeEventListener("resize", updateViewport);
          window.removeEventListener("orientationchange", updateViewport);
        };
      }, []);

      useEffect(() => {
        if (!isLandscapeExpanded || isFullscreen) return;
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            setScreenRotationMode("auto");
          }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
      }, [isFullscreen, isLandscapeExpanded]);

      useEffect(() => {
        if (settingsOpen || zoomMenuOpen) {
          clearHideTimer();
          setControlsVisible(true);
        } else {
          scheduleHideControls();
        }
      }, [clearHideTimer, scheduleHideControls, settingsOpen, zoomMenuOpen]);

      useEffect(() => {
        if (!playerSettings.autoHideControls) {
          clearHideTimer();
          setControlsVisible(true);
        } else {
          scheduleHideControls();
        }
      }, [
        clearHideTimer,
        playerSettings.autoHideControls,
        scheduleHideControls,
      ]);

      useEffect(() => {
        const node = containerRef.current;
        if (!node || typeof ResizeObserver === "undefined") return;
        const updateSize = () => {
          const w = node.clientWidth || node.getBoundingClientRect().width;
          const h = node.clientHeight || node.getBoundingClientRect().height;
          if (w > 0 && h > 0) {
            setStageDimensions({ width: w, height: h });
          }
        };
        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(node);
        return () => observer.disconnect();
      }, []);

      useLayoutEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        const w = node.clientWidth || node.getBoundingClientRect().width;
        const h = node.clientHeight || node.getBoundingClientRect().height;
        if (w > 0 && h > 0) {
          setStageDimensions({ width: w, height: h });
        }
      }, [
        isCssRotated90,
        isFullscreen,
        isPortraitInLandscapeFullscreen,
        screenRotationMode,
        viewportSize.height,
        viewportSize.width,
      ]);

      const syncActiveSegmentAtTime = useCallback((t: number) => {
        const found = findActiveSegmentBinary(segmentsRef.current, t);
        const nextId = found?.id ?? null;
        if (nextId !== activeSegmentIdRef.current) {
          activeSegmentIdRef.current = nextId;
          setActiveSegment(found);
          onActiveSegRef.current?.(nextId);
        } else if (found) {
          setActiveSegment(found);
        } else if (activeSegmentIdRef.current !== null) {
          activeSegmentIdRef.current = null;
          setActiveSegment(null);
          onActiveSegRef.current?.(null);
        }
      }, []);

      // Sub-frame RAF synchronization during playback for razor-sharp subtitle transitions
      useEffect(() => {
        if (!isPlaying) return;
        let rafId = 0;
        const tick = () => {
          const vid = videoRef.current;
          if (vid && !vid.paused) {
            syncActiveSegmentAtTime(vid.currentTime);
            rafId = requestAnimationFrame(tick);
          }
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
      }, [isPlaying, syncActiveSegmentAtTime]);

      useEffect(() => {
        const vid = videoRef.current;
        syncActiveSegmentAtTime(vid ? vid.currentTime : currentTime);
      }, [segments, currentTime, syncActiveSegmentAtTime]);

      useEffect(() => {
        if (videoRef.current) {
          videoRef.current.playbackRate = playbackRate;
        }
      }, [playbackRate, videoUrl]);

      useEffect(() => {
        if (videoRef.current) {
          try {
            videoRef.current.volume = volume;
            videoRef.current.muted = isMuted;
          } catch {
            // Some mobile browsers restrict programmatic volume assignment
          }
        }
      }, [volume, isMuted, videoUrl]);

      useEffect(() => {
        const vid = videoRef.current;
        if (!vid || seekRequestTime === null) return;
        const dur = Number.isFinite(vid.duration) ? vid.duration : duration;
        const clamped = Math.max(
          0,
          Math.min(dur || seekRequestTime, seekRequestTime)
        );
        vid.currentTime = clamped;
        setCurrentTime(clamped);
        syncActiveSegmentAtTime(clamped);
        onTimeUpdateRef.current(clamped);
        onSeekHandled();
      }, [duration, onSeekHandled, seekRequestTime, syncActiveSegmentAtTime]);

      const wasFullscreenRef = useRef(false);
      useEffect(() => {
        const onFsChange = () => {
          const fs = Boolean(document.fullscreenElement);
          const exited = wasFullscreenRef.current && !fs;
          wasFullscreenRef.current = fs;
          setIsFullscreen(fs);
          onFullscreenChange?.(fs);
          if (exited) {
            setScreenRotationMode("auto");
            const screenOrient = window.screen?.orientation as
              | { unlock?: () => void }
              | undefined;
            try {
              screenOrient?.unlock?.();
            } catch {
              // Ignore orientation unlock errors
            }
          }
        };
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
      }, [onFullscreenChange]);

      useEffect(() => {
        return () => {
          clearHideTimer();
          if (doubleTapTimerRef.current)
            window.clearTimeout(doubleTapTimerRef.current);
          if (seekOverlayTimerRef.current)
            window.clearTimeout(seekOverlayTimerRef.current);
          if (meterOverlayTimerRef.current)
            window.clearTimeout(meterOverlayTimerRef.current);
        };
      }, [clearHideTimer]);

      const togglePlay = useCallback(() => {
        const vid = videoRef.current;
        if (!vid) return;
        if (vid.paused) {
          void vid.play();
        } else {
          vid.pause();
        }
        revealControls();
      }, [revealControls]);

      const pause = useCallback(() => {
        const vid = videoRef.current;
        if (vid && !vid.paused) {
          vid.pause();
        }
      }, []);

      const seekTo = useCallback(
        (target: number) => {
          const vid = videoRef.current;
          if (!vid) return;
          const dur = Number.isFinite(vid.duration) ? vid.duration : duration;
          const clamped = Math.max(0, Math.min(dur || target, target));
          vid.currentTime = clamped;
          setCurrentTime(clamped);
          syncActiveSegmentAtTime(clamped);
          onTimeUpdateRef.current(clamped);
        },
        [duration, syncActiveSegmentAtTime]
      );

      const seekRelative = useCallback(
        (deltaSeconds: number, showOverlay = true) => {
          const vid = videoRef.current;
          const base = vid ? vid.currentTime : currentTime;
          const dur =
            vid && Number.isFinite(vid.duration) ? vid.duration : duration;
          const next = Math.max(
            0,
            Math.min(dur || base + deltaSeconds, base + deltaSeconds)
          );
          seekTo(next);
          if (showOverlay) {
            showTemporarySeekOverlay(next, Math.round(deltaSeconds));
          }
        },
        [currentTime, duration, seekTo, showTemporarySeekOverlay]
      );

      const toggleFullscreen = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void el.requestFullscreen?.().then(() => {
            if (playerSettings.autoLandscapeFullscreen && screenRotationMode !== "portrait") {
              const screenOrient = window.screen?.orientation as
                | { lock?: (mode: string) => Promise<void> }
                | undefined;
              screenOrient?.lock?.("landscape")?.catch(() => {});
            }
          });
        }
      }, [playerSettings.autoLandscapeFullscreen, screenRotationMode]);

      const toggleRotateScreen = useCallback(() => {
        const currentlyLandscape =
          screenRotationMode === "landscape" ||
          (screenRotationMode === "auto" &&
            viewportSize.width > viewportSize.height &&
            (isFullscreen || isCompactViewport));
        const nextMode: "landscape" | "portrait" = currentlyLandscape
          ? "portrait"
          : "landscape";
        setScreenRotationMode(nextMode);
        revealControls();

        const screenOrient = window.screen?.orientation as
          | { lock?: (mode: string) => Promise<void>; unlock?: () => void }
          | undefined;
        if (nextMode === "landscape") {
          screenOrient?.lock?.("landscape")?.catch(() => {});
        } else if (document.fullscreenElement) {
          screenOrient?.lock?.("portrait")?.catch(() => {});
        } else {
          try {
            screenOrient?.unlock?.();
          } catch {
            // Ignore orientation unlock errors
          }
        }
      }, [
        isCompactViewport,
        isFullscreen,
        revealControls,
        screenRotationMode,
        viewportSize.height,
        viewportSize.width,
      ]);

      useImperativeHandle(
        ref,
        () => ({
          togglePlay,
          pause,
          toggleFullscreen,
        }),
        [pause, toggleFullscreen, togglePlay]
      );

      const isGestureIgnoredTarget = (target: EventTarget | null): boolean => {
        if (!(target instanceof Element)) return false;
        return Boolean(
          target.closest(
            '[data-no-gesture="true"], button, input, select, textarea, a'
          )
        );
      };

      const handleZoneTap = useCallback(
        (clientX: number, clientY: number, rect: DOMRect) => {
          const now = Date.now();
          const last = lastTapRef.current;
          const tapCoord = isCssRotated90 ? clientY : clientX;

          if (
            playerSettings.doubleTapSeekEnabled &&
            last &&
            now - last.time < 280 &&
            Math.abs(tapCoord - last.x) < 90
          ) {
            if (doubleTapTimerRef.current) {
              window.clearTimeout(doubleTapTimerRef.current);
              doubleTapTimerRef.current = null;
            }
            lastTapRef.current = null;

            const relX = isCssRotated90
              ? (clientY - rect.top) / Math.max(1, rect.height)
              : (clientX - rect.left) / Math.max(1, rect.width);
            if (relX < 0.45) {
              seekRelative(-quickSeekSec, true);
            } else if (relX > 0.55) {
              seekRelative(quickSeekSec, true);
            } else {
              togglePlay();
            }
            return;
          }

          lastTapRef.current = { time: now, x: tapCoord };

          const toggleVisibilityNow = () => {
            if (zoomMenuOpen) {
              setZoomMenuOpen(false);
              return;
            }
            if (controlsVisible && playerSettings.autoHideControls) {
              clearHideTimer();
              setControlsVisible(false);
            } else {
              revealControls();
            }
          };

          if (playerSettings.doubleTapSeekEnabled) {
            if (doubleTapTimerRef.current) {
              window.clearTimeout(doubleTapTimerRef.current);
            }
            doubleTapTimerRef.current = window.setTimeout(() => {
              lastTapRef.current = null;
              toggleVisibilityNow();
            }, 240);
          } else {
            toggleVisibilityNow();
          }
        },
        [
          clearHideTimer,
          controlsVisible,
          isCssRotated90,
          playerSettings.autoHideControls,
          playerSettings.doubleTapSeekEnabled,
          quickSeekSec,
          revealControls,
          seekRelative,
          togglePlay,
          zoomMenuOpen,
        ]
      );

      useEffect(() => {
        const el = containerRef.current;
        if (!el || !videoUrl) return;

        const getTouchDistance = (t1: Touch, t2: Touch) =>
          Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

        const onTouchStart = (e: TouchEvent) => {
          if (isGestureIgnoredTarget(e.target)) return;

          if (
            e.touches.length === 2 &&
            playerSettings.pinchToZoomEnabled &&
            onChangeZoom
          ) {
            e.preventDefault();
            const dist = getTouchDistance(e.touches[0], e.touches[1]);
            touchSessionRef.current = {
              startX: 0,
              startY: 0,
              baseTime: 0,
              baseBrightness: brightnessRef.current,
              baseVolume: volumeRef.current,
              side: "center",
              mode: "pinch",
              targetTime: 0,
              deltaSec: 0,
              pinchStartDist: Math.max(10, dist),
              pinchBaseZoom: zoomRef.current,
            };
            return;
          }

          if (e.touches.length !== 1) return;
          const touch = e.touches[0];
          const rect = el.getBoundingClientRect();
          const relX = isCssRotated90
            ? (touch.clientY - rect.top) / Math.max(1, rect.height)
            : (touch.clientX - rect.left) / Math.max(1, rect.width);
          const side: "left" | "right" | "center" =
            relX < 0.45 ? "left" : relX > 0.55 ? "right" : "center";

          const vid = videoRef.current;
          touchSessionRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            baseTime: vid ? vid.currentTime : currentTime,
            baseBrightness: brightnessRef.current,
            baseVolume: volumeRef.current,
            side,
            mode: "pending",
            targetTime: vid ? vid.currentTime : currentTime,
            deltaSec: 0,
            pinchStartDist: 0,
            pinchBaseZoom: zoomRef.current,
          };
        };

        const onTouchMove = (e: TouchEvent) => {
          const sess = touchSessionRef.current;
          if (!sess) return;

          if (
            sess.mode === "pinch" &&
            e.touches.length === 2 &&
            playerSettings.pinchToZoomEnabled &&
            onChangeZoom
          ) {
            e.preventDefault();
            const dist = getTouchDistance(e.touches[0], e.touches[1]);
            const ratio = dist / sess.pinchStartDist;
            const nextScale = Math.min(
              3,
              Math.max(0.5, Number((sess.pinchBaseZoom * ratio).toFixed(2)))
            );
            onChangeZoom(nextScale);
            showTemporaryMeter(
              "zoom",
              Math.round(nextScale * 100),
              `Zoom ${nextScale.toFixed(2)}x`
            );
            return;
          }

          if (e.touches.length !== 1) return;
          const touch = e.touches[0];
          const rawDx = touch.clientX - sess.startX;
          const rawDy = touch.clientY - sess.startY;
          const dx = isCssRotated90 ? rawDy : rawDx;
          const dy = isCssRotated90 ? -rawDx : rawDy;

          if (sess.mode === "pending") {
            if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
            if (
              playerSettings.horizontalSwipeEnabled &&
              Math.abs(dx) > Math.abs(dy) * 1.15
            ) {
              sess.mode = "horizontal";
            } else if (
              Math.abs(dy) > Math.abs(dx) * 1.15 &&
              ((sess.side === "left" && playerSettings.brightnessGestureEnabled) ||
                (sess.side === "right" && playerSettings.volumeGestureEnabled))
            ) {
              sess.mode = "vertical";
            } else {
              return;
            }
          }

          if (sess.mode === "horizontal") {
            e.preventDefault();
            const vid = videoRef.current;
            const totalDur =
              vid && Number.isFinite(vid.duration) ? vid.duration : duration;
            const rawDelta = (dx / 100) * swipeSecPer100Px;
            const nextTime = Math.max(
              0,
              Math.min(
                totalDur || sess.baseTime + rawDelta,
                sess.baseTime + rawDelta
              )
            );
            sess.targetTime = nextTime;
            sess.deltaSec = Math.round(nextTime - sess.baseTime);
            showTemporarySeekOverlay(nextTime, sess.deltaSec, true);
          } else if (sess.mode === "vertical") {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const spanAxis = isCssRotated90 ? rect.width : rect.height;
            const heightSpan = Math.max(140, spanAxis * 0.72);
            // Swipe UP -> negative dy -> positive delta
            const normDelta = -dy / heightSpan;

            if (sess.side === "left" && playerSettings.brightnessGestureEnabled) {
              const deltaPct =
                normDelta * 130 * playerSettings.brightnessSensitivity;
              const nextBright = Math.round(
                Math.min(150, Math.max(20, sess.baseBrightness + deltaPct))
              );
              setBrightnessPct(nextBright);
              showTemporaryMeter(
                "brightness",
                nextBright,
                `Brightness ${nextBright}%`
              );
            } else if (
              sess.side === "right" &&
              playerSettings.volumeGestureEnabled
            ) {
              const deltaVol = normDelta * playerSettings.volumeSensitivity;
              const nextVol = Number(
                Math.min(1, Math.max(0, sess.baseVolume + deltaVol)).toFixed(2)
              );
              onChangeVolume(nextVol);
              const volPct = Math.round(nextVol * 100);
              showTemporaryMeter("volume", volPct, `Volume ${volPct}%`);
            }
          }
        };

        const onTouchEnd = (e: TouchEvent) => {
          const sess = touchSessionRef.current;
          touchSessionRef.current = null;
          if (!sess) return;

          if (sess.mode === "horizontal") {
            gestureSuppressClickRef.current = true;
            seekTo(sess.targetTime);
            showTemporarySeekOverlay(sess.targetTime, sess.deltaSec, false);
            revealControls();
            window.setTimeout(() => {
              gestureSuppressClickRef.current = false;
            }, 250);
            return;
          }

          if (sess.mode === "vertical" || sess.mode === "pinch") {
            gestureSuppressClickRef.current = true;
            window.setTimeout(() => {
              gestureSuppressClickRef.current = false;
            }, 250);
            return;
          }

          if (sess.mode === "pending") {
            gestureSuppressClickRef.current = true;
            const rect = el.getBoundingClientRect();
            const touch = e.changedTouches[0];
            if (touch) {
              handleZoneTap(touch.clientX, touch.clientY, rect);
            }
            window.setTimeout(() => {
              gestureSuppressClickRef.current = false;
            }, 250);
          }
        };

        const onTouchCancel = () => {
          touchSessionRef.current = null;
          setSeekOverlay(null);
        };

        el.addEventListener("touchstart", onTouchStart, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd, { passive: true });
        el.addEventListener("touchcancel", onTouchCancel, { passive: true });

        return () => {
          el.removeEventListener("touchstart", onTouchStart);
          el.removeEventListener("touchmove", onTouchMove);
          el.removeEventListener("touchend", onTouchEnd);
          el.removeEventListener("touchcancel", onTouchCancel);
        };
      }, [
        currentTime,
        duration,
        handleZoneTap,
        isCssRotated90,
        onChangeVolume,
        onChangeZoom,
        playerSettings.brightnessGestureEnabled,
        playerSettings.brightnessSensitivity,
        playerSettings.horizontalSwipeEnabled,
        playerSettings.pinchToZoomEnabled,
        playerSettings.volumeGestureEnabled,
        playerSettings.volumeSensitivity,
        revealControls,
        seekTo,
        showTemporaryMeter,
        showTemporarySeekOverlay,
        swipeSecPer100Px,
        videoUrl,
      ]);

      const mouseSwipeRef = useRef<{
        active: boolean;
        startX: number;
        startY: number;
        baseTime: number;
        baseBrightness: number;
        baseVolume: number;
        side: "left" | "right" | "center";
        mode: "pending" | "horizontal" | "vertical";
        targetTime: number;
        deltaSec: number;
      } | null>(null);

      const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0 || !videoUrl) return;
        if (isGestureIgnoredTarget(e.target)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = isCssRotated90
          ? (e.clientY - rect.top) / Math.max(1, rect.height)
          : (e.clientX - rect.left) / Math.max(1, rect.width);
        const side: "left" | "right" | "center" =
          relX < 0.45 ? "left" : relX > 0.55 ? "right" : "center";
        const vid = videoRef.current;
        mouseSwipeRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          baseTime: vid ? vid.currentTime : currentTime,
          baseBrightness: brightnessPct,
          baseVolume: volume,
          side,
          mode: "pending",
          targetTime: vid ? vid.currentTime : currentTime,
          deltaSec: 0,
        };
      };

      const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const ms = mouseSwipeRef.current;
        if (!ms || !ms.active) return;
        const rawDx = e.clientX - ms.startX;
        const rawDy = e.clientY - ms.startY;
        const dx = isCssRotated90 ? rawDy : rawDx;
        const dy = isCssRotated90 ? -rawDx : rawDy;

        if (ms.mode === "pending") {
          if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
          if (
            playerSettings.horizontalSwipeEnabled &&
            Math.abs(dx) > Math.abs(dy) * 1.15
          ) {
            ms.mode = "horizontal";
          } else if (
            Math.abs(dy) > Math.abs(dx) * 1.15 &&
            ((ms.side === "left" && playerSettings.brightnessGestureEnabled) ||
              (ms.side === "right" && playerSettings.volumeGestureEnabled))
          ) {
            ms.mode = "vertical";
          } else {
            return;
          }
        }

        if (ms.mode === "horizontal") {
          const vid = videoRef.current;
          const totalDur =
            vid && Number.isFinite(vid.duration) ? vid.duration : duration;
          const rawDelta = (dx / 100) * swipeSecPer100Px;
          const nextTime = Math.max(
            0,
            Math.min(totalDur || ms.baseTime + rawDelta, ms.baseTime + rawDelta)
          );
          ms.targetTime = nextTime;
          ms.deltaSec = Math.round(nextTime - ms.baseTime);
          showTemporarySeekOverlay(nextTime, ms.deltaSec, true);
        } else if (ms.mode === "vertical") {
          const rect = e.currentTarget.getBoundingClientRect();
          const spanAxis = isCssRotated90 ? rect.width : rect.height;
          const heightSpan = Math.max(140, spanAxis * 0.72);
          const normDelta = -dy / heightSpan;

          if (ms.side === "left" && playerSettings.brightnessGestureEnabled) {
            const deltaPct =
              normDelta * 130 * playerSettings.brightnessSensitivity;
            const nextBright = Math.round(
              Math.min(150, Math.max(20, ms.baseBrightness + deltaPct))
            );
            setBrightnessPct(nextBright);
            showTemporaryMeter(
              "brightness",
              nextBright,
              `Brightness ${nextBright}%`
            );
          } else if (ms.side === "right" && playerSettings.volumeGestureEnabled) {
            const deltaVol = normDelta * playerSettings.volumeSensitivity;
            const nextVol = Number(
              Math.min(1, Math.max(0, ms.baseVolume + deltaVol)).toFixed(2)
            );
            onChangeVolume(nextVol);
            const volPct = Math.round(nextVol * 100);
            showTemporaryMeter("volume", volPct, `Volume ${volPct}%`);
          }
        }
      };

      const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        const ms = mouseSwipeRef.current;
        mouseSwipeRef.current = null;
        if (!ms) return;
        if (ms.mode === "horizontal") {
          seekTo(ms.targetTime);
          showTemporarySeekOverlay(ms.targetTime, ms.deltaSec, false);
          revealControls();
          return;
        }
        if (ms.mode === "vertical") return;
        if (gestureSuppressClickRef.current) return;
        if (isGestureIgnoredTarget(e.target)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        handleZoneTap(e.clientX, e.clientY, rect);
      };

      const safeRect = useMemo(
        () =>
          computeVideoSafeRect(stageDimensions, videoNaturalSize, {
            aspectFitMode: playerSettings.aspectFitMode,
          }),
        [stageDimensions, videoNaturalSize, playerSettings.aspectFitMode]
      );

      const sourceBoxStyle = useMemo(
        () =>
          buildTrackBoxStyle(
            settings.sourceBackground ?? settings.background,
            settings.sourceOpacity ?? settings.opacity,
            settings.sourceOutline ?? settings.outline
          ),
        [
          settings.sourceBackground,
          settings.background,
          settings.sourceOpacity,
          settings.opacity,
          settings.sourceOutline,
          settings.outline,
        ]
      );

      const targetBoxStyle = useMemo(
        () =>
          buildTrackBoxStyle(
            settings.targetBackground ?? settings.background,
            settings.targetOpacity ?? settings.opacity,
            settings.targetOutline ?? settings.outline
          ),
        [
          settings.targetBackground,
          settings.background,
          settings.targetOpacity,
          settings.opacity,
          settings.targetOutline,
          settings.outline,
        ]
      );

      const sourceTypography = useMemo(
        () => resolveSourceTypography(sourceLanguageCode),
        [sourceLanguageCode]
      );

      const resolvedSourceFontFamily = useMemo(
        () =>
          resolveFontFamilyCss(
            settings.sourceFontFamily ?? "default",
            false,
            sourceTypography.fontFamily
          ),
        [settings.sourceFontFamily, sourceTypography.fontFamily]
      );

      const resolvedTargetFontFamily = useMemo(
        () =>
          resolveFontFamilyCss(
            settings.targetFontFamily ?? "default",
            true
          ),
        [settings.targetFontFamily]
      );

      const resolvedSourceDir = sourceDirection ?? sourceTypography.dir;
      const sourceFontPx = resolveSubtitleFontSizePx(
        settings.sourceFontSize,
        settings.sourceCustomFontSize
      );
      const targetFontPx = resolveSubtitleFontSizePx(
        settings.targetFontSize,
        settings.targetCustomFontSize
      );

      const scaledSourceFontPx = useMemo(
        () => computeResponsiveFontPx(sourceFontPx, safeRect, isFullscreen),
        [sourceFontPx, safeRect, isFullscreen]
      );
      const scaledTargetFontPx = useMemo(
        () => computeResponsiveFontPx(targetFontPx, safeRect, isFullscreen),
        [targetFontPx, safeRect, isFullscreen]
      );

      const effectiveSourceWidthPct = useMemo(() => {
        const base = settings.sourceMaxWidthPct ?? 80;
        if (safeRect.width < 480 && base === 80) return 88;
        return base;
      }, [safeRect.width, settings.sourceMaxWidthPct]);

      const effectiveTargetWidthPct = useMemo(() => {
        const base = settings.targetMaxWidthPct ?? 82;
        if (safeRect.width < 480 && base === 82) return 90;
        return base;
      }, [safeRect.width, settings.targetMaxWidthPct]);

      const sourceMaxBoxWidthPx = Math.max(
        100,
        Math.round(safeRect.width * (effectiveSourceWidthPct / 100))
      );
      const targetMaxBoxWidthPx = Math.max(
        100,
        Math.round(safeRect.width * (effectiveTargetWidthPct / 100))
      );

      const formattedSourceText = useMemo(() => {
        if (!activeSegment?.sourceText) return "";
        const estimatedChars = Math.max(
          16,
          Math.min(
            52,
            Math.floor(sourceMaxBoxWidthPx / Math.max(7, scaledSourceFontPx * 0.56))
          )
        );
        return formatSubtitleText(
          activeSegment.sourceText,
          settings.sourceLineMode ?? "auto",
          { maxSingleLineChars: estimatedChars }
        );
      }, [
        activeSegment?.sourceText,
        settings.sourceLineMode,
        sourceMaxBoxWidthPx,
        scaledSourceFontPx,
      ]);

      const formattedTargetText = useMemo(() => {
        if (!activeSegment?.targetText) return "";
        const estimatedChars = Math.max(
          14,
          Math.min(
            48,
            Math.floor(targetMaxBoxWidthPx / Math.max(7, scaledTargetFontPx * 0.6))
          )
        );
        return formatSubtitleText(
          activeSegment.targetText,
          settings.targetLineMode ?? "auto",
          { maxSingleLineChars: estimatedChars }
        );
      }, [
        activeSegment?.targetText,
        settings.targetLineMode,
        targetMaxBoxWidthPx,
        scaledTargetFontPx,
      ]);

      const showSourceLayer = Boolean(settings.showSource && formattedSourceText);
      const showTargetLayer = Boolean(settings.showTarget && formattedTargetText);

      const dualLayout = useMemo(
        () =>
          solveDualSubtitleLayout({
            safeWidth: safeRect.width,
            safeHeight: safeRect.height,
            autoDualLayout: settings.autoDualLayout ?? true,
            autoCollisionPrevention: settings.autoCollisionPrevention ?? true,
            groupSpacingPx: settings.dualGroupSpacingPx ?? 8,
            source: {
              visible: showSourceLayer,
              desiredH:
                dragPreviews.source?.h ??
                settings.sourcePosition.horizontalPercent,
              desiredV:
                dragPreviews.source?.v ??
                settings.sourcePosition.verticalPercent,
              boxWidth: Math.min(sourceMaxBoxWidthPx, trackSizes.source.width),
              boxHeight: trackSizes.source.height,
              fontPx: scaledSourceFontPx,
              bottomOffsetPx: settings.sourcePosition.bottomOffsetPx ?? 0,
            },
            target: {
              visible: showTargetLayer,
              desiredH:
                dragPreviews.target?.h ??
                settings.targetPosition.horizontalPercent,
              desiredV:
                dragPreviews.target?.v ??
                settings.targetPosition.verticalPercent,
              boxWidth: Math.min(targetMaxBoxWidthPx, trackSizes.target.width),
              boxHeight: trackSizes.target.height,
              fontPx: scaledTargetFontPx,
              bottomOffsetPx: settings.targetPosition.bottomOffsetPx ?? 0,
            },
          }),
        [
          safeRect.width,
          safeRect.height,
          settings.autoDualLayout,
          settings.autoCollisionPrevention,
          settings.dualGroupSpacingPx,
          showSourceLayer,
          showTargetLayer,
          dragPreviews.source,
          dragPreviews.target,
          settings.sourcePosition.horizontalPercent,
          settings.sourcePosition.verticalPercent,
          settings.sourcePosition.bottomOffsetPx,
          settings.targetPosition.horizontalPercent,
          settings.targetPosition.verticalPercent,
          settings.targetPosition.bottomOffsetPx,
          sourceMaxBoxWidthPx,
          targetMaxBoxWidthPx,
          trackSizes.source.width,
          trackSizes.source.height,
          trackSizes.target.width,
          trackSizes.target.height,
          scaledSourceFontPx,
          scaledTargetFontPx,
        ]
      );

      useEffect(() => {
        onOverlapChange?.(dualLayout.overlapDetected);
      }, [dualLayout.overlapDetected, onOverlapChange]);

      const showFloatingCluster = useMemo(() => {
        const mode = playerSettings.floatingButtonsMode;
        if (mode === "always_hidden") return false;
        if (mode === "always_visible") return true;
        if (mode === "show_on_tap") return controlsVisible;
        return (
          playerSettings.floatingButtonsCustom.showRewind ||
          playerSettings.floatingButtonsCustom.showPlayPause ||
          playerSettings.floatingButtonsCustom.showForward
        );
      }, [
        controlsVisible,
        playerSettings.floatingButtonsCustom,
        playerSettings.floatingButtonsMode,
      ]);

      const showRewindBtn =
        playerSettings.floatingButtonsMode === "custom"
          ? playerSettings.floatingButtonsCustom.showRewind
          : showFloatingCluster;
      const showPlayPauseBtn =
        playerSettings.floatingButtonsMode === "custom"
          ? playerSettings.floatingButtonsCustom.showPlayPause
          : showFloatingCluster;
      const showForwardBtn =
        playerSettings.floatingButtonsMode === "custom"
          ? playerSettings.floatingButtonsCustom.showForward
          : showFloatingCluster;

      const objectFitClass =
        playerSettings.aspectFitMode === "cover"
          ? "object-cover"
          : playerSettings.aspectFitMode === "fill"
          ? "object-fill"
          : "object-contain";

      const isCinemaLayout =
        isFullscreen || isCompactViewport || isLandscapeExpanded;
      const progressPct =
        duration > 0
          ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
          : 0;
      const btnDim = resolveButtonDimensions(playerSettings.buttonSize);
      const vis = playerSettings.controlsVisibility;

      const cycleSpeed = () => {
        if (!onChangePlaybackRate) return;
        const idx = SPEED_CYCLE.indexOf(playbackRate);
        const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
        onChangePlaybackRate(next);
      };

      const seekOverlayPosClass =
        playerSettings.seekOverlayPosition === "top"
          ? "items-start pt-14"
          : playerSettings.seekOverlayPosition === "bottom"
          ? "items-end pb-20"
          : "items-center";

      const seekOverlaySizeClass =
        playerSettings.seekOverlaySize === "large"
          ? "px-5 py-3 text-xl"
          : playerSettings.seekOverlaySize === "small"
          ? "px-3 py-1.5 text-sm"
          : "px-4 py-2 text-base";

      return (
        <div
          className={`flex flex-col ${
            isCompactViewport && !isFullscreen && !isLandscapeExpanded
              ? "-mx-3 sm:mx-0"
              : ""
          }`}
        >
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              if (mouseSwipeRef.current?.mode === "horizontal") {
                setSeekOverlay(null);
              }
              mouseSwipeRef.current = null;
            }}
            style={
              isCssRotated90
                ? {
                    width: `${viewportSize.height}px`,
                    height: `${viewportSize.width}px`,
                    zIndex: 60,
                  }
                : undefined
            }
            className={`relative bg-black overflow-hidden select-none ${
              isCssRotated90
                ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90"
                : isPortraitInLandscapeFullscreen
                ? "h-screen w-[min(100vw,56.25vh)] mx-auto"
                : isFullscreen
                ? "h-screen w-screen"
                : isLandscapeExpanded
                ? "fixed inset-0 z-50 w-screen h-screen"
                : isCompactViewport
                ? "w-full h-[54vh] min-h-[260px] max-h-[440px] rounded-none sm:rounded-2xl"
                : "w-full aspect-video rounded-2xl border border-slate-200 dark:border-slate-800"
            }`}
          >
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                playsInline
                preload="metadata"
                style={{
                  filter: `brightness(${brightnessPct}%)`,
                  transform:
                    playerSettings.zoomScale !== 1
                      ? `scale(${playerSettings.zoomScale})`
                      : undefined,
                }}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (Number.isFinite(v.duration)) {
                    setDuration(v.duration);
                    onDurationChange?.(v.duration);
                  }
                  if (v.videoWidth > 0 && v.videoHeight > 0) {
                    setVideoNaturalSize({
                      width: v.videoWidth,
                      height: v.videoHeight,
                    });
                  }
                }}
                onTimeUpdate={(e) => {
                  const t = e.currentTarget.currentTime;
                  setCurrentTime(t);
                  syncActiveSegmentAtTime(t);
                  onTimeUpdateRef.current(t);
                }}
                onPlay={() => {
                  setIsPlaying(true);
                  onPlayStateChange?.(true);
                  scheduleHideControls(true);
                }}
                onPause={() => {
                  setIsPlaying(false);
                  onPlayStateChange?.(false);
                  clearHideTimer();
                  setControlsVisible(true);
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  onPlayStateChange?.(false);
                  clearHideTimer();
                  setControlsVisible(true);
                }}
                className={`w-full h-full transition-transform duration-100 ${objectFitClass}`}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <p className="text-sm font-semibold text-slate-200">
                  Video preview unavailable
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Your saved subtitles are loaded below. Re-select the local video file on your device to play it in sync.
                </p>
              </div>
            )}

            {/* Safe Dual-Layer Subtitle Stage inside video bounds */}
            <div
              style={{
                position: "absolute",
                left: `${safeRect.left}px`,
                top: `${safeRect.top}px`,
                width: `${safeRect.width}px`,
                height: `${safeRect.height}px`,
                pointerEvents: "none",
                zIndex: 20,
              }}
            >
              {showSourceLayer && (
                <DraggableSubtitleTrack
                  track="source"
                  text={formattedSourceText}
                  dir={resolvedSourceDir}
                  scaledFontPx={scaledSourceFontPx}
                  maxBoxWidthPx={sourceMaxBoxWidthPx}
                  color={settings.sourceColor}
                  lineHeight={settings.sourceLineHeight ?? 1.38}
                  letterSpacingPx={settings.sourceLetterSpacing ?? 0}
                  fontClassName={sourceTypography.className}
                  fontFamilyStyle={resolvedSourceFontFamily}
                  position={settings.sourcePosition}
                  solvedLeftPx={dualLayout.sourceLeftPx}
                  solvedTopPx={dualLayout.sourceTopPx}
                  safeRect={safeRect}
                  boxStyle={sourceBoxStyle}
                  isRotated90={isCssRotated90}
                  onMeasure={handleMeasureTrack}
                  onDragPreview={handleDragPreview}
                  onUpdatePosition={onUpdateSubtitlePosition}
                />
              )}

              {showTargetLayer && (
                <DraggableSubtitleTrack
                  track="target"
                  text={formattedTargetText}
                  dir="ltr"
                  scaledFontPx={scaledTargetFontPx}
                  maxBoxWidthPx={targetMaxBoxWidthPx}
                  color={settings.targetColor}
                  lineHeight={settings.targetLineHeight ?? 1.42}
                  letterSpacingPx={settings.targetLetterSpacing ?? 0}
                  fontClassName="font-bengali font-semibold"
                  fontFamilyStyle={resolvedTargetFontFamily}
                  position={settings.targetPosition}
                  solvedLeftPx={dualLayout.targetLeftPx}
                  solvedTopPx={dualLayout.targetTopPx}
                  safeRect={safeRect}
                  boxStyle={targetBoxStyle}
                  isRotated90={isCssRotated90}
                  onMeasure={handleMeasureTrack}
                  onDragPreview={handleDragPreview}
                  onUpdatePosition={onUpdateSubtitlePosition}
                />
              )}

              {!settings.autoDualLayout && dualLayout.overlapDetected && (
                <div
                  data-no-gesture="true"
                  className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2 z-40 px-2.5 py-1 rounded-lg bg-amber-950/90 border border-amber-400/50 text-[11px] text-amber-100 shadow-lg flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Subtitle overlap detected</span>
                  {onAutoFixOverlap && (
                    <button
                      type="button"
                      onClick={onAutoFixOverlap}
                      className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px]"
                    >
                      Auto Fix Position
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Seek Overlay (Swipe + Double-Tap) */}
            {seekOverlay && playerSettings.showSeekPreview && (
              <div
                className={`absolute inset-0 z-30 pointer-events-none flex justify-center ${seekOverlayPosClass}`}
              >
                <div
                  style={{
                    opacity: (playerSettings.seekOverlayOpacity ?? 85) / 100,
                  }}
                  className={`rounded-2xl bg-slate-950/90 border border-white/15 text-center shadow-xl ${seekOverlaySizeClass}`}
                >
                  <p className="font-bold font-mono-tabular text-teal-300">
                    {seekOverlay.deltaSec >= 0
                      ? `↷ +${seekOverlay.deltaSec} sec`
                      : `↶ ${seekOverlay.deltaSec} sec`}
                  </p>
                  <p className="text-[11px] font-mono-tabular text-white/90 mt-0.5">
                    {formatClockTime(seekOverlay.targetTime)}
                  </p>
                </div>
              </div>
            )}

            {/* Brightness / Volume / Zoom Gesture Meter Overlay */}
            {meterOverlay && (
              <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
                <div className="px-4 py-2.5 rounded-2xl bg-slate-950/85 border border-white/15 text-white shadow-xl flex items-center gap-2.5 min-w-[160px]">
                  {meterOverlay.kind === "brightness" ? (
                    <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : meterOverlay.kind === "volume" ? (
                    meterOverlay.value === 0 ? (
                      <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-teal-400 shrink-0" />
                    )
                  ) : (
                    <ZoomIn className="w-4 h-4 text-teal-400 shrink-0" />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-mono-tabular font-semibold">
                      {meterOverlay.label}
                    </p>
                    {meterOverlay.kind !== "zoom" && (
                      <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            meterOverlay.kind === "brightness"
                              ? "bg-amber-400"
                              : "bg-teal-400"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                meterOverlay.kind === "brightness"
                                  ? (meterOverlay.value / 150) * 100
                                  : meterOverlay.value
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Optional Floating Overlay Buttons */}
            {showFloatingCluster && videoUrl && (
              <div
                data-no-gesture="true"
                className="absolute inset-0 z-25 pointer-events-none flex items-center justify-center gap-6"
              >
                {showRewindBtn && (
                  <button
                    type="button"
                    aria-label={`Rewind ${quickSeekSec} seconds`}
                    onClick={() => {
                      seekRelative(-quickSeekSec, true);
                      revealControls();
                    }}
                    className="pointer-events-auto w-11 h-11 rounded-full bg-slate-950/65 hover:bg-slate-950/85 text-white border border-white/15 flex items-center justify-center transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                )}

                {showPlayPauseBtn && (
                  <button
                    type="button"
                    aria-label={isPlaying ? "Pause" : "Play"}
                    onClick={togglePlay}
                    className="pointer-events-auto w-13 h-13 rounded-full bg-teal-600/90 hover:bg-teal-600 text-white shadow-lg flex items-center justify-center transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6" />
                    ) : (
                      <Play className="w-6 h-6 ml-0.5" />
                    )}
                  </button>
                )}

                {showForwardBtn && (
                  <button
                    type="button"
                    aria-label={`Forward ${quickSeekSec} seconds`}
                    onClick={() => {
                      seekRelative(quickSeekSec, true);
                      revealControls();
                    }}
                    className="pointer-events-auto w-11 h-11 rounded-full bg-slate-950/65 hover:bg-slate-950/85 text-white border border-white/15 flex items-center justify-center transition-colors"
                  >
                    <RotateCw className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Top Bar (Clean — no processing overlays inside video display) */}
            <div
              data-no-gesture="true"
              className={`absolute top-0 inset-x-0 z-30 p-2 sm:p-2.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-200 ${
                controlsVisible || !videoUrl
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {onBackHome && (
                    <button
                      type="button"
                      onClick={onBackHome}
                      aria-label="Back to videos"
                      className="w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center shrink-0 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-white truncate">
                      {videoTitle}
                    </p>
                    {sourceLanguageLabel && (
                      <p className="text-[10px] text-teal-300 font-medium truncate">
                        {sourceLanguageLabel} → বাংলা
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onOpenMobileSubtitles && isCompactViewport && (
                    <button
                      type="button"
                      onClick={onOpenMobileSubtitles}
                      aria-label="Open subtitle lines"
                      className="w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
                    >
                      <Subtitles className="w-4 h-4" />
                    </button>
                  )}

                  {onOpenMobileExport && isCompactViewport && (
                    <button
                      type="button"
                      onClick={onOpenMobileExport}
                      aria-label="Export subtitles"
                      className="w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}

                  {vis.settings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      aria-label="Open player and subtitle settings"
                      className="w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Compact Zoom Popover inside Stage */}
            {zoomMenuOpen && onChangeZoom && (
              <div
                data-no-gesture="true"
                className="absolute bottom-16 right-3 z-40 p-2 rounded-xl bg-slate-950/90 border border-white/15 text-white shadow-xl flex items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() =>
                    onChangeZoom(
                      Math.max(0.5, Number((playerSettings.zoomScale - 0.2).toFixed(2)))
                    )
                  }
                  aria-label="Zoom out"
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs inline-flex items-center gap-1"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChangeZoom(1, "contain")}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium"
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => onChangeZoom(1, "cover")}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium"
                >
                  Fill
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeZoom(
                      Math.min(3, Number((playerSettings.zoomScale + 0.2).toFixed(2)))
                    )
                  }
                  aria-label="Zoom in"
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs inline-flex items-center gap-1"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px] font-mono-tabular text-teal-300">
                  {playerSettings.zoomScale.toFixed(1)}x
                </span>
              </div>
            )}

            {/* Cinema / Fullscreen Bottom Controls */}
            {isCinemaLayout && videoUrl && (
              <div
                data-no-gesture="true"
                className={`absolute bottom-0 inset-x-0 z-30 px-2.5 pt-6 pb-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent space-y-1.5 transition-opacity duration-200 ${
                  controlsVisible
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono-tabular text-white/90 shrink-0">
                    {formatClockTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    aria-label="Seek video"
                    min={0}
                    max={Math.max(1, duration)}
                    step={0.1}
                    value={Math.min(currentTime, Math.max(1, duration))}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    className="studio-range flex-1 h-1.5 bg-white/30 rounded-full"
                  />
                  <span className="text-[10px] font-mono-tabular text-white/90 shrink-0">
                    {formatClockTime(duration)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 overflow-x-auto">
                  <div className="flex items-center gap-1 shrink-0">
                    {vis.playPause && (
                      <button
                        type="button"
                        onClick={togglePlay}
                        aria-label={isPlaying ? "Pause" : "Play"}
                        className={`${btnDim} rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center`}
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {vis.seekButtons && (
                      <>
                        <button
                          type="button"
                          onClick={() => seekRelative(-quickSeekSec, true)}
                          aria-label={`Rewind ${quickSeekSec}s`}
                          className={`${btnDim} rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono-tabular inline-flex items-center justify-center gap-0.5`}
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{quickSeekSec}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => seekRelative(quickSeekSec, true)}
                          aria-label={`Forward ${quickSeekSec}s`}
                          className={`${btnDim} rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono-tabular inline-flex items-center justify-center gap-0.5`}
                        >
                          <span>{quickSeekSec}</span>
                          <RotateCw className="w-3 h-3" />
                        </button>
                      </>
                    )}

                    {vis.volumeMute && (
                      <button
                        type="button"
                        onClick={onToggleMute}
                        aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                        title={isMuted || volume === 0 ? "Unmute" : "Mute"}
                        className={`${btnDim} rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center`}
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {vis.rotateScreen !== false && (
                      <button
                        type="button"
                        onClick={toggleRotateScreen}
                        aria-label={
                          isLandscapeExpanded
                            ? "Rotate to portrait"
                            : "Rotate screen"
                        }
                        title={
                          isLandscapeExpanded
                            ? "Rotate to Portrait"
                            : "Rotate Screen (Portrait / Landscape)"
                        }
                        aria-pressed={isLandscapeExpanded}
                        className={`${btnDim} rounded-lg flex items-center justify-center ${
                          isLandscapeExpanded
                            ? "bg-teal-600/80 text-white"
                            : "bg-white/10 hover:bg-white/20 text-white"
                        }`}
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {vis.subtitles && onToggleSubtitles && (
                      <button
                        type="button"
                        onClick={onToggleSubtitles}
                        aria-label="Toggle subtitles"
                        className={`${btnDim} rounded-lg flex items-center justify-center ${
                          settings.showTarget || settings.showSource
                            ? "bg-teal-600/80 text-white"
                            : "bg-white/10 text-white/70"
                        }`}
                      >
                        <Subtitles className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {vis.speed && onChangePlaybackRate && (
                      <button
                        type="button"
                        onClick={cycleSpeed}
                        aria-label="Playback speed"
                        className={`${btnDim} rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono-tabular font-semibold flex items-center justify-center`}
                      >
                        {playbackRate}x
                      </button>
                    )}

                    {vis.zoom && onChangeZoom && (
                      <button
                        type="button"
                        onClick={() => setZoomMenuOpen((z) => !z)}
                        aria-label="Zoom controls"
                        className={`${btnDim} rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center`}
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {vis.fullscreen && (
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                        className={`${btnDim} rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center`}
                      >
                        {isFullscreen ? (
                          <Minimize className="w-3.5 h-3.5" />
                        ) : (
                          <Maximize className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {vis.settings && (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        aria-label="Settings"
                        className={`${btnDim} rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center`}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Overlay slot inside fullscreen container so drawers remain accessible */}
            {overlaySlot}
          </div>

          {/* Desktop docked compact control bar below video */}
          {!isCinemaLayout && videoUrl && (
            <div className="mt-2.5 p-2.5 sm:p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono-tabular text-slate-600 dark:text-slate-400 w-12 shrink-0">
                  {formatClockTime(currentTime)}
                </span>
                <div className="relative flex-1 flex items-center">
                  <input
                    type="range"
                    aria-label="Seek video"
                    min={0}
                    max={Math.max(1, duration)}
                    step={0.1}
                    value={Math.min(currentTime, Math.max(1, duration))}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    style={{
                      background: `linear-gradient(to right, #0D9488 ${progressPct}%, rgba(148,163,184,0.35) ${progressPct}%)`,
                    }}
                    className="studio-range w-full h-1.5 rounded-full"
                  />
                </div>
                <span className="text-xs font-mono-tabular text-slate-600 dark:text-slate-400 w-12 text-right shrink-0">
                  {formatClockTime(duration)}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {vis.playPause && (
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? "Pause video" : "Play video"}
                      className={`${btnDim} rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold inline-flex items-center justify-center gap-1 px-2.5 transition-colors`}
                    >
                      {isPlaying ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {vis.seekButtons && (
                    <>
                      <button
                        type="button"
                        onClick={() => seekRelative(-quickSeekSec, true)}
                        aria-label={`Rewind ${quickSeekSec} seconds`}
                        className={`${btnDim} rounded-xl border border-slate-200 dark:border-slate-700 font-mono-tabular font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {quickSeekSec}s
                      </button>

                      <button
                        type="button"
                        onClick={() => seekRelative(quickSeekSec, true)}
                        aria-label={`Forward ${quickSeekSec} seconds`}
                        className={`${btnDim} rounded-xl border border-slate-200 dark:border-slate-700 font-mono-tabular font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1`}
                      >
                        {quickSeekSec}s
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {vis.volumeMute && (
                    <button
                      type="button"
                      onClick={onToggleMute}
                      aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                      title={isMuted || volume === 0 ? "Unmute" : "Mute"}
                      className={`${btnDim} rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center`}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {vis.rotateScreen !== false && (
                    <button
                      type="button"
                      onClick={toggleRotateScreen}
                      aria-label={
                        isLandscapeExpanded
                          ? "Rotate to portrait"
                          : "Rotate screen"
                      }
                      title={
                        isLandscapeExpanded
                          ? "Rotate to Portrait"
                          : "Rotate Screen (Portrait / Landscape)"
                      }
                      aria-pressed={isLandscapeExpanded}
                      className={`${btnDim} rounded-xl border inline-flex items-center justify-center transition-colors ${
                        isLandscapeExpanded
                          ? "border-teal-600 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {vis.subtitles && onToggleSubtitles && (
                    <button
                      type="button"
                      onClick={onToggleSubtitles}
                      aria-label="Toggle subtitles"
                      className={`${btnDim} rounded-xl border font-medium inline-flex items-center justify-center gap-1 ${
                        settings.showTarget || settings.showSource
                          ? "border-teal-600 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-500"
                      }`}
                    >
                      <Subtitles className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {vis.speed && onChangePlaybackRate && (
                    <button
                      type="button"
                      onClick={cycleSpeed}
                      aria-label="Cycle playback speed"
                      className={`${btnDim} rounded-xl border border-slate-200 dark:border-slate-700 font-mono-tabular font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`}
                    >
                      {playbackRate}x
                    </button>
                  )}

                  {vis.zoom && onChangeZoom && (
                    <button
                      type="button"
                      onClick={() => setZoomMenuOpen((z) => !z)}
                      aria-label="Zoom controls"
                      className={`${btnDim} rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center`}
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  )}

                  {vis.fullscreen && (
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label="Toggle fullscreen"
                      className={`${btnDim} rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center`}
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                  )}

                  {vis.settings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      aria-label="Settings"
                      className={`${btnDim} rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Compact Processing Status Button & Expandable Detail Panel (always below player & controls) */}
          {!isFullscreen &&
            processingStatus &&
            processingStatus.stage !== "idle" && (
              <div className={isCompactViewport ? "px-3 sm:px-0" : ""}>
                <PlayerProcessingStatusSection
                  status={processingStatus}
                  showButton={playerSettings.showProcessingButton}
                  showTotalPercentage={playerSettings.showProcessingPercentage}
                  detailOpen={playerSettings.showProcessingDetailPanel}
                  buttonSize={playerSettings.processingButtonSize}
                  buttonPosition={playerSettings.processingButtonPosition}
                  autoHide={playerSettings.autoHideProcessingStatus}
                  onToggleDetailPanel={() => onToggleProcessingDetail?.()}
                  onPause={onPauseProcessing}
                  onResume={onResumeProcessing}
                  onRetry={onRetryProcessing}
                />
              </div>
            )}
        </div>
      );
    }
  )
);

VideoPlayer.displayName = "VideoPlayer";
