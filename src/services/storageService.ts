import type {
  EnglishAccent,
  PlayerControlsVisibilityConfig,
  PlayerSettings,
  SubtitleBackground,
  SubtitleFontFamilyId,
  SubtitleFontSizePreset,
  SubtitleHorizontalMode,
  SubtitleLineBreakMode,
  SubtitleOutline,
  SubtitleSettings,
  SubtitleTextAlign,
  SubtitleTrackPosition,
  SubtitleVerticalPreset,
  SwipeSensitivityPreset,
  TranslationProject,
} from "../types/subtitle";

const SETTINGS_KEY = "vbt_subtitle_settings_v1";
const PLAYER_SETTINGS_KEY = "vbt_player_settings_v1";
const LANGUAGE_PREF_KEY = "vbt_language_pref_v1";
const PROJECTS_KEY = "vbt_saved_projects_v1";
const THEME_KEY = "vbt_theme_v1";

export const SUBTITLE_FONT_SIZE_PRESETS: Array<Exclude<SubtitleFontSizePreset, "custom">> = [
  10,
  12,
  15,
  18,
];
export const MIN_SUBTITLE_FONT_PX = 8;
export const MAX_SUBTITLE_FONT_PX = 48;

export const VERTICAL_PRESET_PERCENT_MAP: Record<
  Exclude<SubtitleVerticalPreset, "custom">,
  number
> = {
  top: 10,
  top_center: 25,
  middle: 50,
  bottom_center: 76,
  bottom: 88,
};

export const HORIZONTAL_MODE_PERCENT_MAP: Record<
  Exclude<SubtitleHorizontalMode, "custom">,
  number
> = {
  left: 8,
  center: 50,
  right: 92,
};

export const DEFAULT_SOURCE_SUBTITLE_POSITION: SubtitleTrackPosition = {
  verticalPreset: "bottom",
  verticalPercent: 82,
  horizontalMode: "center",
  horizontalPercent: 50,
  bottomOffsetPx: 0,
  textAlign: "center",
  dragEnabled: true,
};

export const DEFAULT_TARGET_SUBTITLE_POSITION: SubtitleTrackPosition = {
  verticalPreset: "bottom",
  verticalPercent: 95,
  horizontalMode: "center",
  horizontalPercent: 50,
  bottomOffsetPx: 0,
  textAlign: "center",
  dragEnabled: true,
};

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  showSource: true,
  showTarget: true,
  autoDualLayout: true,
  autoCollisionPrevention: true,
  dualGroupSpacingPx: 8,
  sourceMaxWidthPct: 80,
  targetMaxWidthPct: 82,
  sourceFontSize: 15,
  sourceCustomFontSize: 15,
  targetFontSize: 15,
  targetCustomFontSize: 15,
  sourceFontFamily: "default",
  targetFontFamily: "default",
  sourceLineHeight: 1.38,
  targetLineHeight: 1.42,
  sourceLetterSpacing: 0,
  targetLetterSpacing: 0,
  sourceLineMode: "auto",
  targetLineMode: "auto",
  sourcePosition: DEFAULT_SOURCE_SUBTITLE_POSITION,
  targetPosition: DEFAULT_TARGET_SUBTITLE_POSITION,
  sourceBackground: "semi",
  targetBackground: "semi",
  sourceOutline: "strong",
  targetOutline: "strong",
  sourceOpacity: 80,
  targetOpacity: 85,
  background: "semi",
  sourceColor: "#FFFFFF",
  targetColor: "#FEF08A",
  outline: "strong",
  opacity: 85,
};

export const DEFAULT_CONTROLS_VISIBILITY: PlayerControlsVisibilityConfig = {
  playPause: true,
  seekButtons: true,
  volumeMute: true,
  volumeSlider: false,
  rotateScreen: true,
  subtitles: true,
  zoom: true,
  speed: true,
  settings: true,
  fullscreen: true,
};

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  quickSeekPreset: 5,
  customSeekSeconds: 15,
  horizontalSwipeEnabled: true,
  swipeSensitivity: "medium",
  customSwipeSecondsPer100Px: 12,
  doubleTapSeekEnabled: true,
  brightnessGestureEnabled: true,
  showBrightnessOverlay: true,
  brightnessSensitivity: 1.0,
  volumeGestureEnabled: true,
  showVolumeOverlay: true,
  volumeSensitivity: 1.0,
  showSeekPreview: true,
  seekOverlayPosition: "center",
  seekOverlaySize: "medium",
  seekOverlayDurationMs: 700,
  seekOverlayOpacity: 85,
  showGestureGuide: true,
  rememberSettings: true,
  floatingButtonsMode: "always_hidden",
  floatingButtonsCustom: {
    showRewind: false,
    showPlayPause: false,
    showForward: false,
  },
  controlsVisibility: DEFAULT_CONTROLS_VISIBILITY,
  buttonSize: "small",
  autoHideControls: true,
  autoHideDelayMs: 3000,
  pauseWhenSettingsOpen: false,
  aspectFitMode: "contain",
  zoomScale: 1,
  pinchToZoomEnabled: true,
  autoLandscapeFullscreen: true,
  processingQuality: "fast",
  autoStartProcessing: true,
  autoRetry: true,
  showProcessingButton: true,
  showProcessingPercentage: true,
  showProcessingDetailPanel: false,
  autoOpenProcessingDetail: false,
  processingButtonSize: "small",
  processingButtonPosition: "left",
  autoHideProcessingStatus: false,
};

export const SWIPE_SENSITIVITY_SECONDS_PER_100PX: Record<
  Exclude<SwipeSensitivityPreset, "custom">,
  number
> = {
  very_low: 3,
  low: 6,
  medium: 12,
  high: 22,
  very_high: 35,
};

export function clampCustomSubtitleFontPx(value: unknown, fallback = 15): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(MAX_SUBTITLE_FONT_PX, Math.max(MIN_SUBTITLE_FONT_PX, Math.round(num)));
}

export function resolveSubtitleFontSizePx(
  preset: SubtitleFontSizePreset | unknown,
  customPx: unknown
): number {
  if (preset === 10 || preset === 12 || preset === 15 || preset === 18) {
    return preset;
  }
  if (preset === "custom") {
    return clampCustomSubtitleFontPx(customPx, 15);
  }
  if (typeof preset === "number" && Number.isFinite(preset)) {
    return clampCustomSubtitleFontPx(preset, 15);
  }
  return 15;
}

export function clampPositionPercent(value: unknown, fallback = 50): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
}

export function clampLineHeight(value: unknown, fallback = 1.38): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1.9, Math.max(1.1, Number(num.toFixed(2))));
}

export function clampLetterSpacing(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(4, Math.max(-0.5, Number(num.toFixed(1))));
}

export function clampSubtitleWidthPct(value: unknown, fallback = 80): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(96, Math.max(40, Math.round(num)));
}

export function clampBottomOffsetPx(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(200, Math.max(0, Math.round(num)));
}

export function clampGroupSpacingPx(value: unknown, fallback = 8): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(48, Math.max(0, Math.round(num)));
}

const VALID_VERTICAL_PRESETS = new Set<SubtitleVerticalPreset>([
  "top",
  "top_center",
  "middle",
  "bottom_center",
  "bottom",
  "custom",
]);

const VALID_HORIZONTAL_MODES = new Set<SubtitleHorizontalMode>([
  "left",
  "center",
  "right",
  "custom",
]);

const VALID_FONT_FAMILIES = new Set<SubtitleFontFamilyId>([
  "default",
  "sans",
  "hind",
  "serif",
  "mono",
]);

const VALID_LINE_MODES = new Set<SubtitleLineBreakMode>([
  "auto",
  "one_line",
  "two_lines",
]);

const VALID_BACKGROUNDS = new Set<SubtitleBackground>(["none", "semi", "solid"]);
const VALID_OUTLINES = new Set<SubtitleOutline>(["none", "subtle", "strong"]);

function normalizeTrackPosition(
  raw: unknown,
  fallback: SubtitleTrackPosition,
  legacyPos?: unknown,
  legacyAlign?: unknown,
  isSourceTrack = false
): SubtitleTrackPosition {
  if (raw && typeof raw === "object") {
    const obj = raw as Partial<SubtitleTrackPosition>;
    const verticalPreset = VALID_VERTICAL_PRESETS.has(
      obj.verticalPreset as SubtitleVerticalPreset
    )
      ? (obj.verticalPreset as SubtitleVerticalPreset)
      : fallback.verticalPreset;
    const horizontalMode = VALID_HORIZONTAL_MODES.has(
      obj.horizontalMode as SubtitleHorizontalMode
    )
      ? (obj.horizontalMode as SubtitleHorizontalMode)
      : fallback.horizontalMode;

    const validTextAlign: SubtitleTextAlign | undefined =
      obj.textAlign === "left" ||
      obj.textAlign === "center" ||
      obj.textAlign === "right"
        ? obj.textAlign
        : horizontalMode === "left" ||
          horizontalMode === "center" ||
          horizontalMode === "right"
        ? horizontalMode
        : fallback.textAlign;

    return {
      verticalPreset,
      verticalPercent: clampPositionPercent(
        obj.verticalPercent,
        fallback.verticalPercent
      ),
      horizontalMode,
      horizontalPercent: clampPositionPercent(
        obj.horizontalPercent,
        fallback.horizontalPercent
      ),
      bottomOffsetPx: clampBottomOffsetPx(
        obj.bottomOffsetPx,
        fallback.bottomOffsetPx ?? 0
      ),
      textAlign: validTextAlign,
      dragEnabled:
        typeof obj.dragEnabled === "boolean" ? obj.dragEnabled : fallback.dragEnabled,
    };
  }

  let verticalPreset = fallback.verticalPreset;
  let verticalPercent = fallback.verticalPercent;
  if (legacyPos === "top") {
    verticalPreset = "top";
    verticalPercent = isSourceTrack ? 10 : 20;
  } else if (legacyPos === "center") {
    verticalPreset = "middle";
    verticalPercent = isSourceTrack ? 44 : 56;
  } else if (legacyPos === "bottom") {
    verticalPreset = "bottom";
    verticalPercent = isSourceTrack ? 74 : 88;
  }

  let horizontalMode = fallback.horizontalMode;
  let horizontalPercent = fallback.horizontalPercent;
  if (legacyAlign === "left" || legacyAlign === "center" || legacyAlign === "right") {
    horizontalMode = legacyAlign;
    horizontalPercent = HORIZONTAL_MODE_PERCENT_MAP[legacyAlign];
  }

  return {
    verticalPreset,
    verticalPercent,
    horizontalMode,
    horizontalPercent,
    dragEnabled: fallback.dragEnabled,
  };
}

function normalizeLoadedFontSize(
  rawPreset: unknown,
  rawCustom: unknown,
  defaultPx = 15
): { preset: SubtitleFontSizePreset; customPx: number } {
  const legacyMap: Record<string, { preset: SubtitleFontSizePreset; customPx: number }> = {
    small: { preset: 12, customPx: 12 },
    medium: { preset: 15, customPx: 15 },
    large: { preset: 18, customPx: 18 },
    xlarge: { preset: "custom", customPx: 22 },
  };

  if (typeof rawPreset === "string" && legacyMap[rawPreset]) {
    return legacyMap[rawPreset];
  }

  if (rawPreset === 10 || rawPreset === 12 || rawPreset === 15 || rawPreset === 18) {
    return {
      preset: rawPreset,
      customPx: clampCustomSubtitleFontPx(rawCustom, rawPreset),
    };
  }

  if (rawPreset === "custom") {
    return {
      preset: "custom",
      customPx: clampCustomSubtitleFontPx(rawCustom, defaultPx),
    };
  }

  return { preset: 15, customPx: clampCustomSubtitleFontPx(rawCustom, defaultPx) };
}

export function resolveQuickSeekSeconds(settings: PlayerSettings): number {
  if (settings.quickSeekPreset === "custom") {
    const val = Number(settings.customSeekSeconds);
    return Number.isFinite(val) ? Math.min(120, Math.max(1, Math.round(val))) : 5;
  }
  return settings.quickSeekPreset;
}

export function resolveSwipeSecondsPer100Px(settings: PlayerSettings): number {
  if (settings.swipeSensitivity === "custom") {
    const val = Number(settings.customSwipeSecondsPer100Px);
    return Number.isFinite(val) ? Math.min(90, Math.max(1, val)) : 12;
  }
  return SWIPE_SENSITIVITY_SECONDS_PER_100PX[settings.swipeSensitivity];
}

export function loadSubtitleSettings(): SubtitleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SUBTITLE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SubtitleSettings> & Record<string, unknown>;
    const normalizedSource = normalizeLoadedFontSize(
      parsed.sourceFontSize,
      parsed.sourceCustomFontSize,
      DEFAULT_SUBTITLE_SETTINGS.sourceCustomFontSize
    );
    const normalizedTarget = normalizeLoadedFontSize(
      parsed.targetFontSize,
      parsed.targetCustomFontSize,
      DEFAULT_SUBTITLE_SETTINGS.targetCustomFontSize
    );
    const sourcePosition = normalizeTrackPosition(
      parsed.sourcePosition,
      DEFAULT_SOURCE_SUBTITLE_POSITION,
      parsed.position,
      parsed.alignment,
      true
    );
    const targetPosition = normalizeTrackPosition(
      parsed.targetPosition,
      DEFAULT_TARGET_SUBTITLE_POSITION,
      parsed.position,
      parsed.alignment,
      false
    );

    const legacyBg = VALID_BACKGROUNDS.has(parsed.background as SubtitleBackground)
      ? (parsed.background as SubtitleBackground)
      : DEFAULT_SUBTITLE_SETTINGS.background;
    const legacyOutline = VALID_OUTLINES.has(parsed.outline as SubtitleOutline)
      ? (parsed.outline as SubtitleOutline)
      : DEFAULT_SUBTITLE_SETTINGS.outline;
    const legacyOpacity =
      typeof parsed.opacity === "number" && Number.isFinite(parsed.opacity)
        ? Math.min(100, Math.max(0, Math.round(parsed.opacity)))
        : DEFAULT_SUBTITLE_SETTINGS.opacity;

    return {
      ...DEFAULT_SUBTITLE_SETTINGS,
      ...parsed,
      autoDualLayout:
        typeof parsed.autoDualLayout === "boolean"
          ? parsed.autoDualLayout
          : DEFAULT_SUBTITLE_SETTINGS.autoDualLayout,
      autoCollisionPrevention:
        typeof parsed.autoCollisionPrevention === "boolean"
          ? parsed.autoCollisionPrevention
          : DEFAULT_SUBTITLE_SETTINGS.autoCollisionPrevention,
      dualGroupSpacingPx: clampGroupSpacingPx(
        parsed.dualGroupSpacingPx,
        DEFAULT_SUBTITLE_SETTINGS.dualGroupSpacingPx
      ),
      sourceMaxWidthPct: clampSubtitleWidthPct(
        parsed.sourceMaxWidthPct,
        DEFAULT_SUBTITLE_SETTINGS.sourceMaxWidthPct
      ),
      targetMaxWidthPct: clampSubtitleWidthPct(
        parsed.targetMaxWidthPct,
        DEFAULT_SUBTITLE_SETTINGS.targetMaxWidthPct
      ),
      sourceFontSize: normalizedSource.preset,
      sourceCustomFontSize: normalizedSource.customPx,
      targetFontSize: normalizedTarget.preset,
      targetCustomFontSize: normalizedTarget.customPx,
      sourceFontFamily: VALID_FONT_FAMILIES.has(parsed.sourceFontFamily as SubtitleFontFamilyId)
        ? (parsed.sourceFontFamily as SubtitleFontFamilyId)
        : DEFAULT_SUBTITLE_SETTINGS.sourceFontFamily,
      targetFontFamily: VALID_FONT_FAMILIES.has(parsed.targetFontFamily as SubtitleFontFamilyId)
        ? (parsed.targetFontFamily as SubtitleFontFamilyId)
        : DEFAULT_SUBTITLE_SETTINGS.targetFontFamily,
      sourceLineHeight: clampLineHeight(
        parsed.sourceLineHeight,
        DEFAULT_SUBTITLE_SETTINGS.sourceLineHeight
      ),
      targetLineHeight: clampLineHeight(
        parsed.targetLineHeight,
        DEFAULT_SUBTITLE_SETTINGS.targetLineHeight
      ),
      sourceLetterSpacing: clampLetterSpacing(
        parsed.sourceLetterSpacing,
        DEFAULT_SUBTITLE_SETTINGS.sourceLetterSpacing
      ),
      targetLetterSpacing: clampLetterSpacing(
        parsed.targetLetterSpacing,
        DEFAULT_SUBTITLE_SETTINGS.targetLetterSpacing
      ),
      sourceLineMode: VALID_LINE_MODES.has(parsed.sourceLineMode as SubtitleLineBreakMode)
        ? (parsed.sourceLineMode as SubtitleLineBreakMode)
        : DEFAULT_SUBTITLE_SETTINGS.sourceLineMode,
      targetLineMode: VALID_LINE_MODES.has(parsed.targetLineMode as SubtitleLineBreakMode)
        ? (parsed.targetLineMode as SubtitleLineBreakMode)
        : DEFAULT_SUBTITLE_SETTINGS.targetLineMode,
      sourcePosition,
      targetPosition,
      sourceBackground: VALID_BACKGROUNDS.has(parsed.sourceBackground as SubtitleBackground)
        ? (parsed.sourceBackground as SubtitleBackground)
        : legacyBg,
      targetBackground: VALID_BACKGROUNDS.has(parsed.targetBackground as SubtitleBackground)
        ? (parsed.targetBackground as SubtitleBackground)
        : legacyBg,
      sourceOutline: VALID_OUTLINES.has(parsed.sourceOutline as SubtitleOutline)
        ? (parsed.sourceOutline as SubtitleOutline)
        : legacyOutline,
      targetOutline: VALID_OUTLINES.has(parsed.targetOutline as SubtitleOutline)
        ? (parsed.targetOutline as SubtitleOutline)
        : legacyOutline,
      sourceOpacity:
        typeof parsed.sourceOpacity === "number" && Number.isFinite(parsed.sourceOpacity)
          ? Math.min(100, Math.max(0, Math.round(parsed.sourceOpacity)))
          : legacyOpacity,
      targetOpacity:
        typeof parsed.targetOpacity === "number" && Number.isFinite(parsed.targetOpacity)
          ? Math.min(100, Math.max(0, Math.round(parsed.targetOpacity)))
          : legacyOpacity,
      background: legacyBg,
      outline: legacyOutline,
      opacity: legacyOpacity,
    };
  } catch {
    return DEFAULT_SUBTITLE_SETTINGS;
  }
}

export function saveSubtitleSettings(settings: SubtitleSettings): void {
  try {
    const sanitized: SubtitleSettings = {
      ...settings,
      dualGroupSpacingPx: clampGroupSpacingPx(settings.dualGroupSpacingPx, 8),
      sourceMaxWidthPct: clampSubtitleWidthPct(settings.sourceMaxWidthPct, 80),
      targetMaxWidthPct: clampSubtitleWidthPct(settings.targetMaxWidthPct, 82),
      sourceCustomFontSize: clampCustomSubtitleFontPx(settings.sourceCustomFontSize, 15),
      targetCustomFontSize: clampCustomSubtitleFontPx(settings.targetCustomFontSize, 15),
      sourceLineHeight: clampLineHeight(settings.sourceLineHeight, 1.38),
      targetLineHeight: clampLineHeight(settings.targetLineHeight, 1.42),
      sourceLetterSpacing: clampLetterSpacing(settings.sourceLetterSpacing, 0),
      targetLetterSpacing: clampLetterSpacing(settings.targetLetterSpacing, 0),
      sourcePosition: {
        ...settings.sourcePosition,
        verticalPercent: clampPositionPercent(
          settings.sourcePosition?.verticalPercent,
          DEFAULT_SOURCE_SUBTITLE_POSITION.verticalPercent
        ),
        horizontalPercent: clampPositionPercent(
          settings.sourcePosition?.horizontalPercent,
          DEFAULT_SOURCE_SUBTITLE_POSITION.horizontalPercent
        ),
        bottomOffsetPx: clampBottomOffsetPx(
          settings.sourcePosition?.bottomOffsetPx,
          0
        ),
      },
      targetPosition: {
        ...settings.targetPosition,
        verticalPercent: clampPositionPercent(
          settings.targetPosition?.verticalPercent,
          DEFAULT_TARGET_SUBTITLE_POSITION.verticalPercent
        ),
        horizontalPercent: clampPositionPercent(
          settings.targetPosition?.horizontalPercent,
          DEFAULT_TARGET_SUBTITLE_POSITION.horizontalPercent
        ),
        bottomOffsetPx: clampBottomOffsetPx(
          settings.targetPosition?.bottomOffsetPx,
          0
        ),
      },
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function loadPlayerSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(PLAYER_SETTINGS_KEY);
    if (!raw) return DEFAULT_PLAYER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PlayerSettings>;
    if (parsed.rememberSettings === false) {
      return DEFAULT_PLAYER_SETTINGS;
    }
    return {
      ...DEFAULT_PLAYER_SETTINGS,
      ...parsed,
      brightnessGestureEnabled:
        typeof parsed.brightnessGestureEnabled === "boolean"
          ? parsed.brightnessGestureEnabled
          : DEFAULT_PLAYER_SETTINGS.brightnessGestureEnabled,
      showBrightnessOverlay:
        typeof parsed.showBrightnessOverlay === "boolean"
          ? parsed.showBrightnessOverlay
          : DEFAULT_PLAYER_SETTINGS.showBrightnessOverlay,
      brightnessSensitivity:
        typeof parsed.brightnessSensitivity === "number" &&
        Number.isFinite(parsed.brightnessSensitivity)
          ? Math.min(2.5, Math.max(0.5, Number(parsed.brightnessSensitivity.toFixed(2))))
          : DEFAULT_PLAYER_SETTINGS.brightnessSensitivity,
      volumeGestureEnabled:
        typeof parsed.volumeGestureEnabled === "boolean"
          ? parsed.volumeGestureEnabled
          : DEFAULT_PLAYER_SETTINGS.volumeGestureEnabled,
      showVolumeOverlay:
        typeof parsed.showVolumeOverlay === "boolean"
          ? parsed.showVolumeOverlay
          : DEFAULT_PLAYER_SETTINGS.showVolumeOverlay,
      volumeSensitivity:
        typeof parsed.volumeSensitivity === "number" &&
        Number.isFinite(parsed.volumeSensitivity)
          ? Math.min(2.5, Math.max(0.5, Number(parsed.volumeSensitivity.toFixed(2))))
          : DEFAULT_PLAYER_SETTINGS.volumeSensitivity,
      seekOverlayPosition:
        parsed.seekOverlayPosition === "top" ||
        parsed.seekOverlayPosition === "bottom" ||
        parsed.seekOverlayPosition === "center"
          ? parsed.seekOverlayPosition
          : DEFAULT_PLAYER_SETTINGS.seekOverlayPosition,
      seekOverlaySize:
        parsed.seekOverlaySize === "small" ||
        parsed.seekOverlaySize === "medium" ||
        parsed.seekOverlaySize === "large"
          ? parsed.seekOverlaySize
          : DEFAULT_PLAYER_SETTINGS.seekOverlaySize,
      seekOverlayDurationMs:
        typeof parsed.seekOverlayDurationMs === "number" &&
        Number.isFinite(parsed.seekOverlayDurationMs)
          ? Math.min(2500, Math.max(300, Math.round(parsed.seekOverlayDurationMs)))
          : DEFAULT_PLAYER_SETTINGS.seekOverlayDurationMs,
      seekOverlayOpacity:
        typeof parsed.seekOverlayOpacity === "number" &&
        Number.isFinite(parsed.seekOverlayOpacity)
          ? Math.min(100, Math.max(20, Math.round(parsed.seekOverlayOpacity)))
          : DEFAULT_PLAYER_SETTINGS.seekOverlayOpacity,
      autoHideControls:
        typeof parsed.autoHideControls === "boolean"
          ? parsed.autoHideControls
          : DEFAULT_PLAYER_SETTINGS.autoHideControls,
      autoHideDelayMs:
        typeof parsed.autoHideDelayMs === "number" &&
        Number.isFinite(parsed.autoHideDelayMs)
          ? Math.min(30000, Math.max(1500, Math.round(parsed.autoHideDelayMs)))
          : DEFAULT_PLAYER_SETTINGS.autoHideDelayMs,
      pauseWhenSettingsOpen:
        typeof parsed.pauseWhenSettingsOpen === "boolean"
          ? parsed.pauseWhenSettingsOpen
          : DEFAULT_PLAYER_SETTINGS.pauseWhenSettingsOpen,
      aspectFitMode:
        parsed.aspectFitMode === "contain" ||
        parsed.aspectFitMode === "cover" ||
        parsed.aspectFitMode === "fill"
          ? parsed.aspectFitMode
          : DEFAULT_PLAYER_SETTINGS.aspectFitMode,
      zoomScale:
        typeof parsed.zoomScale === "number" && Number.isFinite(parsed.zoomScale)
          ? Math.min(3, Math.max(0.5, Number(parsed.zoomScale.toFixed(2))))
          : DEFAULT_PLAYER_SETTINGS.zoomScale,
      pinchToZoomEnabled:
        typeof parsed.pinchToZoomEnabled === "boolean"
          ? parsed.pinchToZoomEnabled
          : DEFAULT_PLAYER_SETTINGS.pinchToZoomEnabled,
      buttonSize:
        parsed.buttonSize === "small" ||
        parsed.buttonSize === "medium" ||
        parsed.buttonSize === "large"
          ? parsed.buttonSize
          : DEFAULT_PLAYER_SETTINGS.buttonSize,
      autoLandscapeFullscreen:
        typeof parsed.autoLandscapeFullscreen === "boolean"
          ? parsed.autoLandscapeFullscreen
          : DEFAULT_PLAYER_SETTINGS.autoLandscapeFullscreen,
      processingQuality:
        parsed.processingQuality === "fast" ||
        parsed.processingQuality === "balanced" ||
        parsed.processingQuality === "high"
          ? parsed.processingQuality
          : DEFAULT_PLAYER_SETTINGS.processingQuality,
      autoStartProcessing:
        typeof parsed.autoStartProcessing === "boolean"
          ? parsed.autoStartProcessing
          : DEFAULT_PLAYER_SETTINGS.autoStartProcessing,
      autoRetry:
        typeof parsed.autoRetry === "boolean"
          ? parsed.autoRetry
          : DEFAULT_PLAYER_SETTINGS.autoRetry,
      showProcessingButton:
        typeof parsed.showProcessingButton === "boolean"
          ? parsed.showProcessingButton
          : DEFAULT_PLAYER_SETTINGS.showProcessingButton,
      showProcessingPercentage:
        typeof parsed.showProcessingPercentage === "boolean"
          ? parsed.showProcessingPercentage
          : DEFAULT_PLAYER_SETTINGS.showProcessingPercentage,
      showProcessingDetailPanel:
        typeof parsed.showProcessingDetailPanel === "boolean"
          ? parsed.showProcessingDetailPanel
          : DEFAULT_PLAYER_SETTINGS.showProcessingDetailPanel,
      autoOpenProcessingDetail:
        typeof parsed.autoOpenProcessingDetail === "boolean"
          ? parsed.autoOpenProcessingDetail
          : DEFAULT_PLAYER_SETTINGS.autoOpenProcessingDetail,
      processingButtonSize:
        parsed.processingButtonSize === "small" ||
        parsed.processingButtonSize === "medium" ||
        parsed.processingButtonSize === "large"
          ? parsed.processingButtonSize
          : DEFAULT_PLAYER_SETTINGS.processingButtonSize,
      processingButtonPosition:
        parsed.processingButtonPosition === "left" ||
        parsed.processingButtonPosition === "center" ||
        parsed.processingButtonPosition === "right"
          ? parsed.processingButtonPosition
          : DEFAULT_PLAYER_SETTINGS.processingButtonPosition,
      autoHideProcessingStatus:
        typeof parsed.autoHideProcessingStatus === "boolean"
          ? parsed.autoHideProcessingStatus
          : DEFAULT_PLAYER_SETTINGS.autoHideProcessingStatus,
      floatingButtonsCustom: {
        ...DEFAULT_PLAYER_SETTINGS.floatingButtonsCustom,
        ...(parsed.floatingButtonsCustom ?? {}),
      },
      controlsVisibility: {
        ...DEFAULT_CONTROLS_VISIBILITY,
        ...(parsed.controlsVisibility ?? {}),
      },
    };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function savePlayerSettings(settings: PlayerSettings): void {
  try {
    if (!settings.rememberSettings) {
      localStorage.removeItem(PLAYER_SETTINGS_KEY);
      return;
    }
    localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function loadLanguagePreference(): {
  pairId: string;
  englishAccent: EnglishAccent;
} {
  try {
    const raw = localStorage.getItem(LANGUAGE_PREF_KEY);
    if (!raw) return { pairId: "en-bn", englishAccent: "us" };
    const parsed = JSON.parse(raw) as {
      pairId?: string;
      englishAccent?: EnglishAccent;
    };
    return {
      pairId: parsed.pairId || "en-bn",
      englishAccent:
        parsed.englishAccent === "uk" || parsed.englishAccent === "au"
          ? parsed.englishAccent
          : "us",
    };
  } catch {
    return { pairId: "en-bn", englishAccent: "us" };
  }
}

export function saveLanguagePreference(
  pairId: string,
  englishAccent: EnglishAccent
): void {
  try {
    localStorage.setItem(
      LANGUAGE_PREF_KEY,
      JSON.stringify({ pairId, englishAccent })
    );
  } catch {
    // Ignore
  }
}

export function loadSavedProjects(): TranslationProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TranslationProject[]) : [];
  } catch {
    return [];
  }
}

export function saveProjectLocally(project: TranslationProject): TranslationProject[] {
  const existing = loadSavedProjects().filter((item) => item.id !== project.id);
  const updated = [{ ...project, updatedAt: new Date().toISOString() }, ...existing].slice(0, 15);
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
  } catch {
    const compact = updated.map((item, idx) =>
      idx > 2
        ? { ...item, videoMeta: { ...item.videoMeta, thumbnailDataUrl: null } }
        : item
    );
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(compact));
    } catch {
      // Ignore storage full errors
    }
  }
  return updated;
}

export function deleteSavedProject(projectId: string): TranslationProject[] {
  const updated = loadSavedProjects().filter((item) => item.id !== projectId);
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore errors
  }
  return updated;
}

export function loadThemePreference(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // Ignore
  }
  return "light";
}

export function saveThemePreference(theme: "light" | "dark"): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore
  }
}
