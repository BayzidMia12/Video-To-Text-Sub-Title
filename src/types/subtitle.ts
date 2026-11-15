export type SubtitleFontSizePreset = 10 | 12 | 15 | 18 | "custom";
export type SubtitleSize = SubtitleFontSizePreset;
export type SubtitleVerticalPreset =
  | "top"
  | "top_center"
  | "middle"
  | "bottom_center"
  | "bottom"
  | "custom";
export type SubtitleHorizontalMode = "left" | "center" | "right" | "custom";
export type SubtitleBackground = "none" | "semi" | "solid";
export type SubtitleOutline = "none" | "subtle" | "strong";
export type SubtitleFontFamilyId =
  | "default"
  | "sans"
  | "hind"
  | "serif"
  | "mono";
export type SubtitleLineBreakMode = "auto" | "one_line" | "two_lines";
export type SubtitleTextAlign = "left" | "center" | "right";
export type SubtitleGridPreset =
  | "top_left"
  | "top_center"
  | "top_right"
  | "middle_left"
  | "middle_center"
  | "middle_right"
  | "bottom_left"
  | "bottom_center"
  | "bottom_right"
  | "custom";

export interface SubtitleTrackPosition {
  verticalPreset: SubtitleVerticalPreset;
  verticalPercent: number; // 0 to 100 (Y Position)
  horizontalMode: SubtitleHorizontalMode;
  horizontalPercent: number; // 0 to 100 (X Position)
  bottomOffsetPx?: number; // 0 to 200 px clearance from video display bottom
  textAlign?: SubtitleTextAlign; // Independent text alignment
  dragEnabled: boolean; // true = unlocked (draggable), false = locked
}

export type TranslationEngineMode = "ai" | "browser";

export type EnglishAccent = "us" | "uk" | "au";

export type QuickSeekIntervalOption = 1 | 2 | 4 | 5 | 6 | 10 | "custom";
export type SwipeSensitivityPreset =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "very_high"
  | "custom";

export type FloatingButtonsVisibilityMode =
  | "always_hidden"
  | "show_on_tap"
  | "always_visible"
  | "custom";

export interface FloatingButtonsCustomConfig {
  showRewind: boolean;
  showPlayPause: boolean;
  showForward: boolean;
}

export type PlayerControlButtonSize = "small" | "medium" | "large";

export interface PlayerControlsVisibilityConfig {
  playPause: boolean;
  seekButtons: boolean;
  volumeMute: boolean;
  volumeSlider: boolean;
  rotateScreen: boolean;
  subtitles: boolean;
  zoom: boolean;
  speed: boolean;
  settings: boolean;
  fullscreen: boolean;
}

export type SeekOverlayPosition = "center" | "top" | "bottom";
export type SeekOverlaySize = "small" | "medium" | "large";

export type VideoAspectFitMode = "contain" | "cover" | "fill";
export type ProcessingQualityMode = "fast" | "balanced" | "high";
export type ProcessingButtonPosition = "left" | "center" | "right";

export interface PlayerSettings {
  quickSeekPreset: QuickSeekIntervalOption;
  customSeekSeconds: number;
  horizontalSwipeEnabled: boolean;
  swipeSensitivity: SwipeSensitivityPreset;
  customSwipeSecondsPer100Px: number;
  doubleTapSeekEnabled: boolean;
  // Brightness & Volume vertical swipe gestures
  brightnessGestureEnabled: boolean;
  showBrightnessOverlay: boolean;
  brightnessSensitivity: number; // 0.5 to 2.5
  volumeGestureEnabled: boolean;
  showVolumeOverlay: boolean;
  volumeSensitivity: number; // 0.5 to 2.5
  // Seek overlay customization
  showSeekPreview: boolean;
  seekOverlayPosition: SeekOverlayPosition;
  seekOverlaySize: SeekOverlaySize;
  seekOverlayDurationMs: number; // 400 to 2000
  seekOverlayOpacity: number; // 30 to 100
  // Controls & Appearance
  showGestureGuide: boolean;
  rememberSettings: boolean;
  floatingButtonsMode: FloatingButtonsVisibilityMode;
  floatingButtonsCustom: FloatingButtonsCustomConfig;
  controlsVisibility: PlayerControlsVisibilityConfig;
  buttonSize: PlayerControlButtonSize;
  autoHideControls: boolean;
  autoHideDelayMs: number; // 3000, 5000, 10000, 15000, or custom
  pauseWhenSettingsOpen: boolean;
  aspectFitMode: VideoAspectFitMode;
  zoomScale: number; // 0.5 to 3.0 (1.0 = default fit/original)
  pinchToZoomEnabled: boolean;
  autoLandscapeFullscreen: boolean;
  // Processing options
  processingQuality: ProcessingQualityMode;
  autoStartProcessing: boolean;
  autoRetry: boolean;
  // Processing Status UI (below player controls)
  showProcessingButton: boolean;
  showProcessingPercentage: boolean;
  showProcessingDetailPanel: boolean;
  autoOpenProcessingDetail: boolean;
  processingButtonSize: PlayerControlButtonSize;
  processingButtonPosition: ProcessingButtonPosition;
  autoHideProcessingStatus: boolean;
}

export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
  speaker?: string;
}

export interface SubtitleSegment {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  sourceText: string; // original spoken language text
  targetText: string; // বাংলা translation
  speaker?: string;
}

export interface SubtitleSettings {
  showSource: boolean;
  showTarget: boolean;
  autoDualLayout: boolean; // ON: English top, Bengali bottom
  autoCollisionPrevention: boolean; // ON: Prevent track overlap dynamically
  dualGroupSpacingPx: number; // 0 to 48 px vertical gap between dual tracks
  sourceMaxWidthPct: number; // 40 to 96 (%)
  targetMaxWidthPct: number; // 40 to 96 (%)
  sourceFontSize: SubtitleFontSizePreset;
  sourceCustomFontSize: number; // 8 to 48 px
  targetFontSize: SubtitleFontSizePreset;
  targetCustomFontSize: number; // 8 to 48 px
  sourceFontFamily: SubtitleFontFamilyId;
  targetFontFamily: SubtitleFontFamilyId;
  sourceLineHeight: number; // 1.15 to 1.85
  targetLineHeight: number; // 1.15 to 1.85
  sourceLetterSpacing: number; // -0.5 to 4 px
  targetLetterSpacing: number; // -0.5 to 4 px
  sourceLineMode: SubtitleLineBreakMode;
  targetLineMode: SubtitleLineBreakMode;
  sourcePosition: SubtitleTrackPosition;
  targetPosition: SubtitleTrackPosition;
  sourceBackground: SubtitleBackground;
  targetBackground: SubtitleBackground;
  sourceOutline: SubtitleOutline;
  targetOutline: SubtitleOutline;
  sourceOpacity: number; // 0 to 100
  targetOpacity: number; // 0 to 100
  // Legacy shared fields retained for backward compatibility
  background: SubtitleBackground;
  sourceColor: string;
  targetColor: string;
  outline: SubtitleOutline;
  opacity: number; // 20 to 100
}

export interface VideoMetadata {
  id: string;
  fileName: string;
  fileSize: number; // bytes
  duration: number; // seconds
  mimeType: string;
  thumbnailDataUrl: string | null;
  width?: number;
  height?: number;
  lastModified?: number;
}

export interface DetectedLanguageInfo {
  code: string;
  name: string;
  nativeName?: string;
}

export interface TranslationProject {
  id: string;
  title: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  detectedLanguage?: DetectedLanguageInfo;
  videoMeta: VideoMetadata;
  segments: SubtitleSegment[];
  updatedAt: string;
  isSample?: boolean;
}

export type ProcessingStage =
  | "idle"
  | "preparing"
  | "analyzing"
  | "recognizing"
  | "generating"
  | "translating"
  | "synchronizing"
  | "ready"
  | "paused"
  | "error";

export type ProcessingErrorStage =
  | "extraction"
  | "recognition"
  | "translation"
  | "sync";

export type AudioExtractionMode =
  | "zero-transcode-copy"
  | "audio-only-transcode"
  | "pcm-fallback";

export interface StageLatencyBreakdown {
  audioDetectMs?: number;
  packetExtractMs?: number;
  containerMuxMs?: number;
  audioUploadMs?: number;
  speechRecognitionMs?: number;
  extractedAudioBytes?: number;
  extractionMode?: AudioExtractionMode;
  sourceAudioCodec?: string;
  outputAudioFormat?: string;
  outputMimeType?: string;
  fallbackReason?: string;
}

export interface PipelineMetrics {
  audioExtractionMs: number;
  speechRecognitionMs: number;
  translationMs: number;
  syncMs: number;
  totalMs: number;
  retryCount: number;
  failedRequests: number;
  concurrencyUsed: number;
  transcriptionModel: string;
  translationModel: string;
  tierWarning?: string;
  audioDetectMs?: number;
  packetExtractMs?: number;
  containerMuxMs?: number;
  audioUploadMs?: number;
  extractedAudioBytes?: number;
  extractionMode?: AudioExtractionMode;
  sourceAudioCodec?: string;
  outputAudioFormat?: string;
  outputMimeType?: string;
  fallbackReason?: string;
}

export interface ProcessingStatusState {
  stage: ProcessingStage;
  progress: number; // overall 0 to 100
  message: string;
  detail?: string;
  extractProgress: number; // 0 to 100
  speechProgress: number; // 0 to 100
  translateProgress: number; // 0 to 100
  syncProgress: number; // 0 to 100
  syncLabel?: string;
  processedSeconds: number;
  totalSeconds: number;
  completedChunks: number;
  totalChunks: number;
  completedSegmentsCount: number;
  retryCount: number;
  failedRequests: number;
  activeConcurrency: number;
  transcriptionModel?: string;
  translationModel?: string;
  tierWarning?: string;
  detectedLanguage?: DetectedLanguageInfo;
  canResume?: boolean;
  errorStage?: ProcessingErrorStage;
  errorCode?:
    | "RATE_LIMIT"
    | "AI_UNAVAILABLE"
    | "MODEL_UNAVAILABLE"
    | "NO_SPEECH"
    | "AUDIO_ERROR"
    | "ABORTED"
    | "UNKNOWN";
  stageMetrics?: StageLatencyBreakdown;
  metrics?: PipelineMetrics;
}
