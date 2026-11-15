import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Cpu,
  Eye,
  Gauge,
  Hand,
  HardDrive,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  Subtitles,
  Trash2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ACTIVE_LANGUAGE_PAIRS,
  ENGLISH_ACCENT_OPTIONS,
} from "../config/languages";
import {
  clearAllCachedProcessingData,
  clearVideoProcessingCache,
  getCacheStats,
  type CacheStatsSummary,
} from "../services/cacheService";
import { DEFAULT_PLAYER_SETTINGS } from "../services/storageService";
import type {
  DetectedLanguageInfo,
  EnglishAccent,
  FloatingButtonsCustomConfig,
  FloatingButtonsVisibilityMode,
  PlayerControlButtonSize,
  PlayerControlsVisibilityConfig,
  PlayerSettings,
  ProcessingButtonPosition,
  ProcessingQualityMode,
  ProcessingStatusState,
  SubtitleSettings,
  TranslationEngineMode,
  VideoAspectFitMode,
} from "../types/subtitle";
import { formatFileSize } from "../utils/time";
import { PlayerSettingsPanel } from "./PlayerSettingsPanel";
import { ProcessingStatus } from "./ProcessingStatus";
import {
  BengaliSubtitleSettingsPanel,
  OriginalSubtitleSettingsPanel,
} from "./SubtitleSettingsPanel";

export type SettingsCategoryId =
  | "processing"
  | "processing_status"
  | "original_subtitle"
  | "bengali_subtitle"
  | "gesture"
  | "player"
  | "appearance";

interface UnifiedSettingsPanelProps {
  initialCategory?: SettingsCategoryId;
  playerSettings: PlayerSettings;
  subtitleSettings: SubtitleSettings;
  selectedPairId: string;
  englishAccent: EnglishAccent;
  detectedLanguage?: DetectedLanguageInfo;
  sourceLanguageLabel: string;
  engineMode: TranslationEngineMode;
  aiAvailable: boolean;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  processingStatus: ProcessingStatusState;
  activeVideoName: string;
  activeVideoCacheKey?: string | null;
  hasActiveVideo: boolean;
  hasSegments: boolean;
  overlapDetected?: boolean;
  onChangePlayerSettings: (next: PlayerSettings) => void;
  onChangeSubtitleSettings: (next: SubtitleSettings) => void;
  onSelectPair: (pairId: string) => void;
  onSelectEnglishAccent: (accent: EnglishAccent) => void;
  onReprocessWithLanguage?: () => void;
  onChangeEngineMode: (mode: TranslationEngineMode) => void;
  onChangePlaybackRate: (rate: number) => void;
  onChangeVolume: (vol: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onPauseProcessing?: () => void;
  onResumeProcessing?: () => void;
  onReprocessFresh?: () => void;
  onRetryTranslation?: () => void;
  onRetrySync?: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const ASPECT_OPTIONS: Array<{
  id: VideoAspectFitMode;
  label: string;
}> = [
  { id: "contain", label: "Fit Screen" },
  { id: "cover", label: "Crop Fill" },
  { id: "fill", label: "Stretch" },
];

const QUALITY_OPTIONS: Array<{
  id: ProcessingQualityMode;
  label: string;
  desc: string;
}> = [
  { id: "fast", label: "Fast", desc: "Zero-transcode stream" },
  { id: "balanced", label: "Balanced", desc: "Standard accuracy" },
  { id: "high", label: "High Accuracy", desc: "Detailed chunks" },
];

const AUTO_HIDE_OPTIONS: Array<{ ms: number; enabled: boolean; label: string }> = [
  { ms: 3000, enabled: true, label: "3 sec" },
  { ms: 5000, enabled: true, label: "5 sec" },
  { ms: 10000, enabled: true, label: "10 sec" },
  { ms: 15000, enabled: true, label: "15 sec" },
  { ms: 3000, enabled: false, label: "Never" },
];

const FLOATING_VISIBILITY_OPTIONS: Array<{
  value: FloatingButtonsVisibilityMode;
  label: string;
}> = [
  { value: "always_hidden", label: "Always Hidden" },
  { value: "show_on_tap", label: "Show on Tap" },
  { value: "always_visible", label: "Always Visible" },
  { value: "custom", label: "Custom" },
];

const CONTROL_TOGGLE_ITEMS: Array<{
  key: keyof PlayerControlsVisibilityConfig;
  label: string;
}> = [
  { key: "playPause", label: "Play / Pause" },
  { key: "seekButtons", label: "Seek (±Sec)" },
  { key: "volumeMute", label: "Mute / Unmute" },
  { key: "rotateScreen", label: "Rotate Screen" },
  { key: "subtitles", label: "Subtitle Toggle" },
  { key: "zoom", label: "Zoom Control" },
  { key: "speed", label: "Speed Pill" },
  { key: "settings", label: "Settings Gear" },
  { key: "fullscreen", label: "Fullscreen" },
];

export const UnifiedSettingsPanel: React.FC<UnifiedSettingsPanelProps> = ({
  initialCategory = "processing",
  playerSettings,
  subtitleSettings,
  selectedPairId,
  englishAccent,
  detectedLanguage,
  sourceLanguageLabel,
  engineMode,
  aiAvailable,
  playbackRate,
  volume,
  isMuted,
  isFullscreen,
  processingStatus,
  activeVideoName,
  activeVideoCacheKey,
  hasActiveVideo,
  hasSegments,
  overlapDetected = false,
  onChangePlayerSettings,
  onChangeSubtitleSettings,
  onSelectPair,
  onSelectEnglishAccent,
  onReprocessWithLanguage,
  onChangeEngineMode,
  onChangePlaybackRate,
  onChangeVolume,
  onToggleMute,
  onToggleFullscreen,
  onPauseProcessing,
  onResumeProcessing,
  onReprocessFresh,
  onRetryTranslation,
  onRetrySync,
}) => {
  const [openCategory, setOpenCategory] =
    useState<SettingsCategoryId | null>(initialCategory);
  const [cacheStats, setCacheStats] = useState<CacheStatsSummary>(() =>
    getCacheStats()
  );
  const [cacheClearedMsg, setCacheClearedMsg] = useState<string | null>(null);

  useEffect(() => {
    setOpenCategory(initialCategory);
  }, [initialCategory]);

  const refreshCacheStats = () => {
    setCacheStats(getCacheStats());
  };

  const toggleCategory = (id: SettingsCategoryId) => {
    setOpenCategory((prev) => (prev === id ? null : id));
    if (id === "processing") {
      refreshCacheStats();
    }
  };

  const updatePlayer = <K extends keyof PlayerSettings>(
    key: K,
    value: PlayerSettings[K]
  ) => {
    onChangePlayerSettings({ ...playerSettings, [key]: value });
  };

  const toggleControlButton = (key: keyof PlayerControlsVisibilityConfig) => {
    onChangePlayerSettings({
      ...playerSettings,
      controlsVisibility: {
        ...playerSettings.controlsVisibility,
        [key]: !playerSettings.controlsVisibility[key],
      },
    });
  };

  const toggleCustomFloating = (key: keyof FloatingButtonsCustomConfig) => {
    onChangePlayerSettings({
      ...playerSettings,
      floatingButtonsCustom: {
        ...playerSettings.floatingButtonsCustom,
        [key]: !playerSettings.floatingButtonsCustom[key],
      },
    });
  };

  const isRunningProcessing =
    processingStatus.stage !== "idle" &&
    processingStatus.stage !== "ready" &&
    processingStatus.stage !== "paused" &&
    processingStatus.stage !== "error";

  const categories: Array<{
    id: SettingsCategoryId;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "processing",
      title: "1. Processing",
      subtitle: "Extraction, speech, translation, sync, pause/resume & retry",
      icon: <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
    },
    {
      id: "processing_status",
      title: "2. Processing Status",
      subtitle: "Status button, percentage, detail panel, size & auto hide",
      icon: <Sliders className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
    },
    {
      id: "original_subtitle",
      title: "3. Original Subtitle",
      subtitle: `Top track (${sourceLanguageLabel}) · Font, color, spacing & lock`,
      icon: <Subtitles className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
    },
    {
      id: "bengali_subtitle",
      title: "4. Bengali Subtitle",
      subtitle: "Bottom track (বাংলা) · Independent font, color & position",
      icon: <Subtitles className="w-4 h-4 text-amber-500" />,
    },
    {
      id: "gesture",
      title: "5. Gesture",
      subtitle: "Brightness, volume, seek duration & seek overlay",
      icon: <Hand className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
    },
    {
      id: "player",
      title: "6. Player",
      subtitle: `Zoom ${playerSettings.zoomScale.toFixed(2)}x · ${playbackRate}x speed · Controls`,
      icon: <Gauge className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
    },
    {
      id: "appearance",
      title: "7. Appearance",
      subtitle: "Button size, auto-hide delay & floating overlay",
      icon: <Eye className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
    },
  ];

  const renderCategoryBody = (id: SettingsCategoryId) => {
    switch (id) {
      case "processing":
        return (
          <div className="space-y-4">
            {processingStatus.stage !== "idle" ? (
              <ProcessingStatus
                compact
                status={processingStatus}
                fileName={activeVideoName}
                sourceLanguageName={sourceLanguageLabel}
                selectedPairId={selectedPairId}
                onPause={onPauseProcessing}
                onResume={onResumeProcessing}
                onReprocessFresh={onReprocessFresh}
                onRetrySpeech={onResumeProcessing}
                onRetryTranslation={onRetryTranslation}
                onRetrySync={onRetrySync}
                onOverrideLanguage={onSelectPair}
              />
            ) : (
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Ready to extract audio, recognize speech, translate to Bengali, and synchronize subtitles.
                </p>
                {hasActiveVideo && onReprocessFresh && (
                  <button
                    type="button"
                    onClick={onReprocessFresh}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Start Processing Pipeline
                  </button>
                )}
              </div>
            )}

            {/* Source Language Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Source Language → Bengali (বাংলা)
                </p>
                {detectedLanguage && (
                  <span className="text-[11px] font-medium text-teal-700 dark:text-teal-400">
                    Detected: {detectedLanguage.name}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {ACTIVE_LANGUAGE_PAIRS.map((pair) => (
                  <button
                    key={pair.id}
                    type="button"
                    onClick={() => onSelectPair(pair.id)}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-left text-xs font-medium transition-colors ${
                      selectedPairId === pair.id
                        ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-100 font-semibold"
                        : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span className="block truncate">{pair.source.name}</span>
                  </button>
                ))}
              </div>
              {(selectedPairId === "en-bn" || selectedPairId === "auto-bn") && (
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {ENGLISH_ACCENT_OPTIONS.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => onSelectEnglishAccent(acc.id)}
                      className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-medium ${
                        englishAccent === acc.id
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {acc.label.replace(" English", "")}
                    </button>
                  ))}
                </div>
              )}
              {hasActiveVideo && onReprocessWithLanguage && (
                <button
                  type="button"
                  onClick={onReprocessWithLanguage}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-run with Selected Language
                </button>
              )}
            </div>

            {/* Translation Engine & Processing Speed */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Speech &amp; Translation Engine
              </p>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  disabled={!aiAvailable}
                  onClick={() => onChangeEngineMode("ai")}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                    engineMode === "ai" && aiAvailable
                      ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-sm font-semibold"
                      : "text-slate-600 dark:text-slate-400 disabled:opacity-40"
                  }`}
                >
                  AI Engine (Free Tier)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeEngineMode("browser")}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                    engineMode === "browser" || !aiAvailable
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-semibold"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Browser Free Mode
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Processing Speed
              </p>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {QUALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updatePlayer("processingQuality", opt.id)}
                    className={`min-h-[42px] px-2 py-1 rounded-lg text-xs font-medium flex flex-col items-center justify-center ${
                      playerSettings.processingQuality === opt.id
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-semibold"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] opacity-70">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Start, Auto Retry & Pause/Resume */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "autoStartProcessing",
                    !playerSettings.autoStartProcessing
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.autoStartProcessing
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Auto Start Processing</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.autoStartProcessing ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePlayer("autoRetry", !playerSettings.autoRetry)
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.autoRetry
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Auto Retry</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.autoRetry ? "ON" : "OFF"}
                </span>
              </button>
            </div>

            {/* Error Handling & Stage Retry Actions */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Pipeline Controls &amp; Error Handling
              </p>
              <div className="flex flex-wrap gap-2">
                {isRunningProcessing && onPauseProcessing && (
                  <button
                    type="button"
                    onClick={onPauseProcessing}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                )}

                {!isRunningProcessing &&
                  hasActiveVideo &&
                  onResumeProcessing && (
                    <button
                      type="button"
                      onClick={onResumeProcessing}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {processingStatus.stage === "paused" ||
                      processingStatus.stage === "error"
                        ? "Resume"
                        : "Retry Extraction / Speech"}
                    </button>
                  )}

                {hasSegments && onRetryTranslation && (
                  <button
                    type="button"
                    onClick={onRetryTranslation}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Translation
                  </button>
                )}

                {hasSegments && onRetrySync && (
                  <button
                    type="button"
                    onClick={onRetrySync}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Retry Sync
                  </button>
                )}
              </div>
            </div>

            {/* Cache Management */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <HardDrive className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Local Chunk &amp; Translation Cache</span>
                </div>
                <span className="text-[11px] font-mono-tabular text-slate-500">
                  {formatFileSize(cacheStats.estimatedBytes)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                {cacheStats.cachedVideosCount} videos ·{" "}
                {cacheStats.cachedPhrasesCount} Bengali phrases saved
              </p>
              <div className="flex flex-wrap gap-2">
                {activeVideoCacheKey && (
                  <button
                    type="button"
                    onClick={() => {
                      clearVideoProcessingCache(activeVideoCacheKey);
                      refreshCacheStats();
                      setCacheClearedMsg("Cleared cache for current video.");
                    }}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                  >
                    Clear Current Cache
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearAllCachedProcessingData();
                    refreshCacheStats();
                    setCacheClearedMsg("All cached chunks & phrases cleared.");
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-800 text-xs font-medium text-red-600 dark:text-red-400 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear All Cache
                </button>
              </div>
              {cacheClearedMsg && (
                <p className="text-[11px] text-teal-700 dark:text-teal-400">
                  {cacheClearedMsg}
                </p>
              )}
            </div>
          </div>
        );

      case "processing_status":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "showProcessingButton",
                    !playerSettings.showProcessingButton
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.showProcessingButton
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Show Processing Button</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.showProcessingButton ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "showProcessingPercentage",
                    !playerSettings.showProcessingPercentage
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.showProcessingPercentage
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Show Total Percentage</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.showProcessingPercentage ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "showProcessingDetailPanel",
                    !playerSettings.showProcessingDetailPanel
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.showProcessingDetailPanel
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Show Detail Panel</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.showProcessingDetailPanel ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "autoOpenProcessingDetail",
                    !playerSettings.autoOpenProcessingDetail
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.autoOpenProcessingDetail
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Auto Open Detail</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.autoOpenProcessingDetail ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "autoHideProcessingStatus",
                    !playerSettings.autoHideProcessingStatus
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between sm:col-span-2 ${
                  playerSettings.autoHideProcessingStatus
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Auto Hide When Complete</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.autoHideProcessingStatus ? "ON" : "OFF"}
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Button Size
              </p>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(["small", "medium", "large"] as PlayerControlButtonSize[]).map(
                  (sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => updatePlayer("processingButtonSize", sz)}
                      className={`min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium capitalize ${
                        playerSettings.processingButtonSize === sz
                          ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {sz}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Button Position
              </p>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(["left", "center", "right"] as ProcessingButtonPosition[]).map(
                  (pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() =>
                        updatePlayer("processingButtonPosition", pos)
                      }
                      className={`min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium capitalize ${
                        playerSettings.processingButtonPosition === pos
                          ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {pos}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Pause / Resume Processing
                </p>
                <p className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                  Overall: {Math.round(processingStatus.progress)}% (
                  {processingStatus.stage})
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isRunningProcessing && onPauseProcessing && (
                  <button
                    type="button"
                    onClick={onPauseProcessing}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                )}
                {!isRunningProcessing &&
                  hasActiveVideo &&
                  onResumeProcessing && (
                    <button
                      type="button"
                      onClick={onResumeProcessing}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Resume
                    </button>
                  )}
              </div>
            </div>
          </div>
        );

      case "original_subtitle":
        return (
          <OriginalSubtitleSettingsPanel
            settings={subtitleSettings}
            sourceLanguageLabel={sourceLanguageLabel}
            overlapDetected={overlapDetected}
            onChange={onChangeSubtitleSettings}
          />
        );

      case "bengali_subtitle":
        return (
          <BengaliSubtitleSettingsPanel
            settings={subtitleSettings}
            overlapDetected={overlapDetected}
            onChange={onChangeSubtitleSettings}
          />
        );

      case "gesture":
        return (
          <PlayerSettingsPanel
            settings={playerSettings}
            onChange={onChangePlayerSettings}
            onReset={() =>
              onChangePlayerSettings({
                ...DEFAULT_PLAYER_SETTINGS,
                controlsVisibility: playerSettings.controlsVisibility,
                buttonSize: playerSettings.buttonSize,
                autoHideControls: playerSettings.autoHideControls,
                autoHideDelayMs: playerSettings.autoHideDelayMs,
              })
            }
          />
        );

      case "player":
        return (
          <div className="space-y-4">
            {/* Zoom Controls & Pinch */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Video Zoom &amp; Aspect Ratio
                </p>
                <span className="text-xs font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
                  {playerSettings.zoomScale.toFixed(2)}x ·{" "}
                  {playerSettings.aspectFitMode}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updatePlayer(
                      "zoomScale",
                      Math.max(0.5, Number((playerSettings.zoomScale - 0.15).toFixed(2)))
                    )
                  }
                  className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium inline-flex items-center justify-center gap-1"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  Out
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangePlayerSettings({
                      ...playerSettings,
                      aspectFitMode: "contain",
                      zoomScale: 1,
                    })
                  }
                  className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                >
                  Fit (1x)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangePlayerSettings({
                      ...playerSettings,
                      aspectFitMode: "cover",
                      zoomScale: 1,
                    })
                  }
                  className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                >
                  Original/Fill
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updatePlayer(
                      "zoomScale",
                      Math.min(3, Number((playerSettings.zoomScale + 0.15).toFixed(2)))
                    )
                  }
                  className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium inline-flex items-center justify-center gap-1"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  In
                </button>
              </div>

              <input
                aria-label="Zoom scale"
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={playerSettings.zoomScale}
                onChange={(e) =>
                  updatePlayer("zoomScale", Number(e.target.value))
                }
                className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
              />

              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updatePlayer("aspectFitMode", opt.id)}
                    className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-medium ${
                      playerSettings.aspectFitMode === opt.id
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-semibold"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "pinchToZoomEnabled",
                    !playerSettings.pinchToZoomEnabled
                  )
                }
                className={`w-full min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
                  playerSettings.pinchToZoomEnabled
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Pinch-to-Zoom Gesture</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.pinchToZoomEnabled ? "ON" : "OFF"}
                </span>
              </button>
            </div>

            {/* Playback Speed & Volume */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Playback Speed
                </p>
                <span className="text-xs font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
                  {playbackRate}x
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {SPEED_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onChangePlaybackRate(rate)}
                    className={`min-h-[36px] px-1 py-1 rounded-lg text-xs font-mono-tabular font-medium ${
                      playbackRate === rate
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-bold"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Volume
                </p>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="text-xs font-medium text-teal-700 dark:text-teal-400 inline-flex items-center gap-1"
                >
                  {isMuted || volume === 0 ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      Muted
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      {Math.round(volume * 100)}%
                    </>
                  )}
                </button>
              </div>
              <input
                type="range"
                aria-label="Playback volume"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => onChangeVolume(Number(e.target.value))}
                className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
              />
            </div>

            {/* Individual Player Controls Visibility */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Player Controls (Show / Hide Buttons)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {CONTROL_TOGGLE_ITEMS.map((item) => {
                  const shown = playerSettings.controlsVisibility[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleControlButton(item.key)}
                      className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center justify-between gap-1 ${
                        shown
                          ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                          : "border-slate-200 dark:border-slate-700 text-slate-500"
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="font-mono-tabular font-bold shrink-0">
                        {shown ? "ON" : "OFF"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fullscreen Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "autoLandscapeFullscreen",
                    !playerSettings.autoLandscapeFullscreen
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.autoLandscapeFullscreen
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Auto-Landscape Lock</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.autoLandscapeFullscreen ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleFullscreen}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    Enter Fullscreen
                  </>
                )}
              </button>
            </div>
          </div>
        );

      case "appearance":
        return (
          <div className="space-y-4">
            {/* Button Size */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Player Button Size
              </p>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(["small", "medium", "large"] as PlayerControlButtonSize[]).map(
                  (sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => updatePlayer("buttonSize", sz)}
                      className={`min-h-[38px] px-2 py-1 rounded-lg text-xs font-medium capitalize ${
                        playerSettings.buttonSize === sz
                          ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {sz}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Auto-Hide Controls Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Auto-Hide Controls
                </p>
                <span className="text-[11px] font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
                  {playerSettings.autoHideControls
                    ? `${Math.round(playerSettings.autoHideDelayMs / 1000)}s`
                    : "Never Hide"}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {AUTO_HIDE_OPTIONS.map((opt) => {
                  const active = opt.enabled
                    ? playerSettings.autoHideControls &&
                      playerSettings.autoHideDelayMs === opt.ms
                    : !playerSettings.autoHideControls;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() =>
                        onChangePlayerSettings({
                          ...playerSettings,
                          autoHideControls: opt.enabled,
                          autoHideDelayMs: opt.ms,
                        })
                      }
                      className={`min-h-[36px] px-1 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                        active
                          ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floating Center Overlay Buttons */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Center Floating Overlay Buttons
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {FLOATING_VISIBILITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      updatePlayer("floatingButtonsMode", opt.value)
                    }
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium ${
                      playerSettings.floatingButtonsMode === opt.value
                        ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-100 font-semibold"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {playerSettings.floatingButtonsMode === "custom" && (
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleCustomFloating("showRewind")}
                    className={`min-h-[34px] px-2 py-1 rounded-lg border text-[11px] font-medium ${
                      playerSettings.floatingButtonsCustom.showRewind
                        ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                        : "border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}
                  >
                    Rewind
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCustomFloating("showPlayPause")}
                    className={`min-h-[34px] px-2 py-1 rounded-lg border text-[11px] font-medium ${
                      playerSettings.floatingButtonsCustom.showPlayPause
                        ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                        : "border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}
                  >
                    Play/Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCustomFloating("showForward")}
                    className={`min-h-[34px] px-2 py-1 rounded-lg border text-[11px] font-medium ${
                      playerSettings.floatingButtonsCustom.showForward
                        ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                        : "border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}
                  >
                    Forward
                  </button>
                </div>
              )}
            </div>

            {/* Pause Video in Settings & Remember Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "pauseWhenSettingsOpen",
                    !playerSettings.pauseWhenSettingsOpen
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.pauseWhenSettingsOpen
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Pause in Settings</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.pauseWhenSettingsOpen ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePlayer(
                    "rememberSettings",
                    !playerSettings.rememberSettings
                  )
                }
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  playerSettings.rememberSettings
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>Remember Settings</span>
                <span className="font-mono-tabular font-bold">
                  {playerSettings.rememberSettings ? "ON" : "OFF"}
                </span>
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-2.5">
      {categories.map((cat) => {
        const isOpen = openCategory === cat.id;
        return (
          <div
            key={cat.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleCategory(cat.id)}
              aria-expanded={isOpen}
              className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0">{cat.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {cat.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {cat.subtitle}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-teal-600 dark:text-teal-400" : ""
                }`}
              />
            </button>

            {isOpen && (
              <div className="px-3.5 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                {renderCategoryBody(cat.id)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface MobileBottomSheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  isVideoPlaying?: boolean;
  onToggleVideoPlay?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  open,
  title,
  subtitle,
  isVideoPlaying,
  onToggleVideoPlay,
  onClose,
  children,
}) => {
  if (!open) return null;

  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      data-no-gesture="true"
      className="fixed inset-0 z-50 flex flex-col justify-end lg:justify-center lg:items-end lg:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onTouchStart={stopBubble}
      onTouchMove={stopBubble}
      onTouchEnd={stopBubble}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full lg:w-[460px] max-h-[86vh] lg:max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-2xl lg:rounded-2xl border-t lg:border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to video player"
              className="min-w-[38px] min-h-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleVideoPlay && (
              <button
                type="button"
                onClick={onToggleVideoPlay}
                aria-label={isVideoPlaying ? "Pause video" : "Play video"}
                className="min-h-[38px] px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                {isVideoPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="min-w-[38px] min-h-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};
