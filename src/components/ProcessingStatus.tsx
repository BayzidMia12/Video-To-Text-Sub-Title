import React from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Pause,
  PauseCircle,
  Play,
  RefreshCw,
  Settings,
} from "lucide-react";
import { ACTIVE_LANGUAGE_PAIRS } from "../config/languages";
import type {
  PlayerControlButtonSize,
  ProcessingButtonPosition,
  ProcessingStatusState,
} from "../types/subtitle";
import { formatClockTime } from "../utils/time";

interface ProcessingStatusProps {
  status: ProcessingStatusState;
  fileName: string;
  sourceLanguageName?: string;
  selectedPairId?: string;
  compact?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onReprocessFresh?: () => void;
  onRetrySpeech?: () => void;
  onRetryTranslation?: () => void;
  onRetrySync?: () => void;
  onOverrideLanguage?: (pairId: string) => void;
  onDismiss?: () => void;
}

type TaskRowState = "Waiting" | "Processing" | "Paused" | "Completed" | "Error";

function resolveTaskRowState(
  pct: number,
  status: ProcessingStatusState,
  stageKey: "extraction" | "recognition" | "translation" | "sync"
): TaskRowState {
  if (status.stage === "error" && status.errorStage === stageKey) {
    return "Error";
  }
  if (pct >= 100 || status.stage === "ready") {
    return "Completed";
  }
  if (status.stage === "paused") {
    if (pct > 0) return "Paused";
    if (stageKey === "extraction") return "Paused";
    if (stageKey === "recognition" && status.extractProgress >= 100) return "Paused";
    return "Waiting";
  }
  if (status.stage === "error") {
    return pct > 0 ? "Paused" : "Waiting";
  }
  if (pct > 0) return "Processing";
  if (
    stageKey === "extraction" &&
    (status.stage === "preparing" || status.stage === "analyzing")
  ) {
    return "Processing";
  }
  if (
    stageKey === "recognition" &&
    (status.stage === "recognizing" || status.stage === "generating")
  ) {
    return "Processing";
  }
  if (stageKey === "translation" && status.stage === "translating") {
    return "Processing";
  }
  if (stageKey === "sync" && status.stage === "synchronizing") {
    return "Processing";
  }
  return "Waiting";
}

export const PlayerProcessingStatusSection: React.FC<{
  status: ProcessingStatusState;
  showButton: boolean;
  showTotalPercentage: boolean;
  detailOpen: boolean;
  buttonSize: PlayerControlButtonSize;
  buttonPosition: ProcessingButtonPosition;
  autoHide: boolean;
  onToggleDetailPanel: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
}> = ({
  status,
  showButton,
  showTotalPercentage,
  detailOpen,
  buttonSize,
  buttonPosition,
  autoHide,
  onToggleDetailPanel,
  onPause,
  onResume,
  onRetry,
}) => {
  const [autoHiddenAfterComplete, setAutoHiddenAfterComplete] =
    React.useState(false);

  React.useEffect(() => {
    if (!autoHide || status.stage !== "ready") {
      setAutoHiddenAfterComplete(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoHiddenAfterComplete(true);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [autoHide, status.stage]);

  if (status.stage === "idle") return null;
  if (autoHide && autoHiddenAfterComplete && status.stage === "ready") {
    return null;
  }

  // If button itself is hidden, only render the detail panel if explicitly toggled on in settings
  if (!showButton && !detailOpen) return null;

  const isReady = status.stage === "ready";
  const isPaused = status.stage === "paused";
  const isError = status.stage === "error";
  const isRunning = !isReady && !isPaused && !isError;

  const clampedOverall = Math.min(100, Math.max(0, Math.round(status.progress)));

  const btnSizeClass =
    buttonSize === "large"
      ? "min-h-[38px] px-3.5 py-1.5 text-xs"
      : buttonSize === "medium"
      ? "min-h-[34px] px-3 py-1 text-xs"
      : "min-h-[30px] px-2.5 py-1 text-[11px]";

  const alignClass =
    buttonPosition === "center"
      ? "justify-center"
      : buttonPosition === "right"
      ? "justify-end"
      : "justify-start";

  const buttonLabel = isPaused
    ? showTotalPercentage
      ? `Paused ${clampedOverall}%`
      : "Paused"
    : isError
    ? showTotalPercentage
      ? `Error ${clampedOverall}%`
      : "Error"
    : showTotalPercentage
    ? `Processing ${clampedOverall}%`
    : isReady
    ? "Processing Complete"
    : "Processing";

  const rows: Array<{
    key: "extraction" | "recognition" | "translation" | "sync";
    label: string;
    pct: number;
    state: TaskRowState;
  }> = [
    {
      key: "extraction",
      label: "Audio Extraction",
      pct: Math.min(100, Math.max(0, Math.round(status.extractProgress))),
      state: resolveTaskRowState(status.extractProgress, status, "extraction"),
    },
    {
      key: "recognition",
      label: "Speech Recognition",
      pct: Math.min(100, Math.max(0, Math.round(status.speechProgress))),
      state: resolveTaskRowState(status.speechProgress, status, "recognition"),
    },
    {
      key: "translation",
      label: "Bengali Translation",
      pct: Math.min(100, Math.max(0, Math.round(status.translateProgress))),
      state: resolveTaskRowState(status.translateProgress, status, "translation"),
    },
    {
      key: "sync",
      label: "Subtitle Synchronization",
      pct: Math.min(100, Math.max(0, Math.round(status.syncProgress))),
      state: resolveTaskRowState(status.syncProgress, status, "sync"),
    },
  ];

  return (
    <div className="mt-2 space-y-2">
      {showButton && (
        <div className={`flex ${alignClass}`}>
          <button
            type="button"
            onClick={onToggleDetailPanel}
            aria-expanded={detailOpen}
            aria-label="Toggle processing details"
            className={`${btnSizeClass} rounded-xl border font-mono-tabular font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs ${
              isError
                ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100/80"
                : isPaused
                ? "border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                : isReady
                ? "border-teal-300 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 hover:bg-teal-100/60"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {isError ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <Settings
                className={`w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 ${
                  isRunning ? "animate-spin" : ""
                }`}
                style={isRunning ? { animationDuration: "3.2s" } : undefined}
              />
            )}
            <span>{buttonLabel}</span>
            {detailOpen ? (
              <ChevronUp className="w-3.5 h-3.5 opacity-60 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
            )}
          </button>
        </div>
      )}

      {detailOpen && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Processing Details
            </h3>

            <div className="flex items-center gap-1.5 shrink-0">
              {isRunning && onPause && (
                <button
                  type="button"
                  onClick={onPause}
                  className="min-h-[28px] px-2.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1"
                >
                  <Pause className="w-3 h-3" />
                  Pause
                </button>
              )}

              {(isPaused || isError) && onResume && (
                <button
                  type="button"
                  onClick={onResume}
                  className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  Resume
                </button>
              )}

              {isError && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="min-h-[28px] px-2.5 py-0.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {row.state === "Completed" ? (
                      <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    ) : row.state === "Processing" ? (
                      <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse mx-0.5 shrink-0" />
                    ) : row.state === "Paused" ? (
                      <Pause className="w-3 h-3 text-amber-500 shrink-0" />
                    ) : row.state === "Error" ? (
                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
                    )}
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {row.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono-tabular shrink-0">
                    <span
                      className={`text-[10px] font-medium ${
                        row.state === "Completed"
                          ? "text-teal-600 dark:text-teal-400"
                          : row.state === "Processing"
                          ? "text-teal-700 dark:text-teal-300"
                          : row.state === "Paused" || row.state === "Error"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {row.state}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 w-9 text-right">
                      {row.pct}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      row.state === "Error" || row.state === "Paused"
                        ? "bg-amber-500"
                        : "bg-teal-500"
                    }`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono-tabular">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Overall Progress
              </span>
              <span className="font-bold text-teal-700 dark:text-teal-400">
                {clampedOverall}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  isPaused || isError ? "bg-amber-500" : "bg-teal-600"
                }`}
                style={{ width: `${clampedOverall}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  status,
  fileName,
  sourceLanguageName = "Speech",
  selectedPairId,
  compact = false,
  onPause,
  onResume,
  onReprocessFresh,
  onRetrySpeech,
  onRetryTranslation,
  onRetrySync,
  onOverrideLanguage,
  onDismiss,
}) => {
  if (status.stage === "idle") return null;

  const isReady = status.stage === "ready";
  const isPausedOrError = status.stage === "paused" || status.stage === "error";
  const isError = status.stage === "error";
  const isRunning = !isReady && !isPausedOrError;

  const effectiveSourceLabel =
    status.detectedLanguage?.name ||
    (sourceLanguageName === "Auto Detect" ? "Speech" : sourceLanguageName);

  const stageRows = [
    {
      label: "Audio Extraction",
      pct: status.extractProgress,
      display: `${status.extractProgress}%`,
    },
    {
      label: `${effectiveSourceLabel} Recognition`,
      pct: status.speechProgress,
      display:
        status.speechProgress === 0 && isRunning
          ? "Waiting"
          : `${status.speechProgress}%`,
    },
    {
      label: "Bengali Translation",
      pct: status.translateProgress,
      display:
        status.translateProgress === 0 && isRunning
          ? "Waiting"
          : `${status.translateProgress}%`,
    },
    {
      label: "Subtitle Synchronization",
      pct: status.syncProgress,
      display:
        status.syncLabel ||
        (isReady
          ? "Complete"
          : status.syncProgress > 0
          ? "Running..."
          : "Waiting"),
    },
  ];

  const manualPairs = ACTIVE_LANGUAGE_PAIRS.filter((p) => p.id !== "auto-bn");

  return (
    <section
      aria-live="polite"
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl ${
        compact ? "p-3.5" : "p-5 sm:p-6"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isRunning && (
              <Loader2 className="w-4 h-4 text-teal-600 dark:text-teal-400 animate-spin shrink-0" />
            )}
            {isReady && (
              <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            )}
            {isError && (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {status.message}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate font-mono-tabular">
            {fileName}
            {status.totalSeconds > 0 && (
              <>
                {" "}
                · Processed {formatClockTime(status.processedSeconds)} /{" "}
                {formatClockTime(status.totalSeconds)}
              </>
            )}
            {" · "}
            {status.completedSegmentsCount} segments
            {status.detail ? ` · ${status.detail}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-sm sm:text-base font-bold font-mono-tabular text-teal-600 dark:text-teal-400">
            Processing: {status.progress}%
          </span>

          {isRunning && onPause && (
            <button
              type="button"
              onClick={onPause}
              className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              Pause
            </button>
          )}

          {isPausedOrError && onResume && (
            <button
              type="button"
              onClick={onResume}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              Resume
            </button>
          )}

          {isError && status.errorStage === "recognition" && onRetrySpeech && (
            <button
              type="button"
              onClick={onRetrySpeech}
              className="min-h-[34px] px-3 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Recognition
            </button>
          )}

          {isError && status.errorStage === "translation" && onRetryTranslation && (
            <button
              type="button"
              onClick={onRetryTranslation}
              className="min-h-[34px] px-3 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Translation
            </button>
          )}

          {isError && status.errorStage === "sync" && onRetrySync && (
            <button
              type="button"
              onClick={onRetrySync}
              className="min-h-[34px] px-3 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Sync
            </button>
          )}

          {isReady && onReprocessFresh && (
            <button
              type="button"
              onClick={onReprocessFresh}
              className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-run
            </button>
          )}

          {isReady && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Hide
            </button>
          )}
        </div>
      </div>

      {status.detectedLanguage && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
            <span>
              Detected Language:{" "}
              <strong className="text-slate-900 dark:text-slate-100">
                {status.detectedLanguage.name}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Target Language:{" "}
              <strong className="text-teal-700 dark:text-teal-400">
                Bengali (বাংলা)
              </strong>
            </span>
          </div>

          {onOverrideLanguage && (
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="override-detected-lang"
                className="text-slate-500 dark:text-slate-400"
              >
                Wrong language?
              </label>
              <select
                id="override-detected-lang"
                value={
                  selectedPairId === "auto-bn"
                    ? `${status.detectedLanguage.code}-bn`
                    : selectedPairId
                }
                onChange={(e) => onOverrideLanguage(e.target.value)}
                className="min-h-[32px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                {manualPairs.map((p) => (
                  <option key={p.id} value={p.id}>
                    Switch to {p.source.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ease-out ${
            isPausedOrError ? "bg-amber-500" : "bg-teal-600"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        {stageRows.map((row) => (
          <div key={row.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
              <span className="truncate">{row.label}</span>
              <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                {row.display}
              </span>
            </div>
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 transition-all duration-200"
                style={{ width: `${row.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {status.tierWarning && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{status.tierWarning}</span>
        </div>
      )}

      {(status.stageMetrics?.extractionMode || (isReady && status.metrics)) && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
          {(status.metrics?.extractionMode || status.stageMetrics?.extractionMode) && (
            <p className="truncate">
              Audio Path:{" "}
              <span className="text-slate-700 dark:text-slate-300 font-semibold">
                {(status.metrics?.extractionMode ?? status.stageMetrics?.extractionMode) ===
                "zero-transcode-copy"
                  ? "Zero-Transcode Copy"
                  : (status.metrics?.extractionMode ?? status.stageMetrics?.extractionMode) ===
                    "audio-only-transcode"
                  ? "Audio-Only Transcode"
                  : "PCM Fallback"}
              </span>
              {(status.metrics?.sourceAudioCodec ?? status.stageMetrics?.sourceAudioCodec) && (
                <>
                  {" · "}
                  {(
                    status.metrics?.sourceAudioCodec ??
                    status.stageMetrics?.sourceAudioCodec
                  )?.toUpperCase()}{" "}
                  →{" "}
                  {status.metrics?.outputAudioFormat ??
                    status.stageMetrics?.outputAudioFormat ??
                    "Audio"}
                </>
              )}
              {(status.metrics?.extractedAudioBytes ??
                status.stageMetrics?.extractedAudioBytes) ? (
                <>
                  {" · "}
                  {(
                    ((status.metrics?.extractedAudioBytes ??
                      status.stageMetrics?.extractedAudioBytes) ??
                      0) /
                    (1024 * 1024)
                  ).toFixed(2)}{" "}
                  MB extracted
                </>
              ) : null}
              {(status.metrics?.fallbackReason ?? status.stageMetrics?.fallbackReason) && (
                <>
                  {" · "}
                  <span className="text-amber-600 dark:text-amber-400">
                    {status.metrics?.fallbackReason ?? status.stageMetrics?.fallbackReason}
                  </span>
                </>
              )}
            </p>
          )}

          {isReady && status.metrics && (
            <p>
              Measured ·{" "}
              {status.metrics.audioDetectMs !== undefined
                ? `Detect ${status.metrics.audioDetectMs}ms · `
                : ""}
              {status.metrics.packetExtractMs !== undefined
                ? `Packets ${status.metrics.packetExtractMs}ms · `
                : ""}
              {status.metrics.containerMuxMs !== undefined
                ? `Mux ${status.metrics.containerMuxMs}ms · `
                : ""}
              Extract {(status.metrics.audioExtractionMs / 1000).toFixed(2)}s ·{" "}
              {status.metrics.audioUploadMs !== undefined
                ? `Upload ${(status.metrics.audioUploadMs / 1000).toFixed(2)}s · `
                : ""}
              Recognition {(status.metrics.speechRecognitionMs / 1000).toFixed(2)}s (
              {status.metrics.transcriptionModel}) · Translation{" "}
              {(status.metrics.translationMs / 1000).toFixed(2)}s (
              {status.metrics.translationModel}) · Total{" "}
              {(status.metrics.totalMs / 1000).toFixed(2)}s · Retries{" "}
              {status.metrics.retryCount} · Failed {status.metrics.failedRequests}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
