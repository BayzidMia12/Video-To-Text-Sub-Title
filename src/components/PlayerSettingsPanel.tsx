import React from "react";
import { Hand, RotateCcw, Sun, Volume2 } from "lucide-react";
import type {
  PlayerSettings,
  QuickSeekIntervalOption,
  SeekOverlayPosition,
  SeekOverlaySize,
  SwipeSensitivityPreset,
} from "../types/subtitle";
import {
  resolveQuickSeekSeconds,
  resolveSwipeSecondsPer100Px,
} from "../services/storageService";
import { formatClockTime } from "../utils/time";

interface PlayerSettingsPanelProps {
  settings: PlayerSettings;
  onChange: (next: PlayerSettings) => void;
  onReset: () => void;
}

const SEEK_INTERVAL_OPTIONS: Array<{
  value: QuickSeekIntervalOption;
  label: string;
}> = [
  { value: 1, label: "1s" },
  { value: 2, label: "2s" },
  { value: 4, label: "4s" },
  { value: 5, label: "5s" },
  { value: 6, label: "6s" },
  { value: 10, label: "10s" },
  { value: "custom", label: "Custom" },
];

const SENSITIVITY_OPTIONS: Array<{
  value: SwipeSensitivityPreset;
  label: string;
  hint: string;
}> = [
  { value: "very_low", label: "Very Low", hint: "3s/100px" },
  { value: "low", label: "Low", hint: "6s/100px" },
  { value: "medium", label: "Medium", hint: "12s/100px" },
  { value: "high", label: "High", hint: "22s/100px" },
  { value: "very_high", label: "Very High", hint: "35s/100px" },
  { value: "custom", label: "Custom", hint: "Set sec" },
];

export const PlayerSettingsPanel: React.FC<PlayerSettingsPanelProps> = ({
  settings,
  onChange,
  onReset,
}) => {
  const update = <K extends keyof PlayerSettings>(
    key: K,
    value: PlayerSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  const activeIntervalSec = resolveQuickSeekSeconds(settings);
  const secPer100Px = resolveSwipeSecondsPer100Px(settings);
  const previewBaseSec = 135;

  return (
    <div className="space-y-5">
      {/* Brightness Vertical Swipe (Left Side) */}
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Left Swipe = Brightness
            </p>
          </div>
          <span className="text-[11px] font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
            {settings.brightnessSensitivity.toFixed(1)}x
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              update(
                "brightnessGestureEnabled",
                !settings.brightnessGestureEnabled
              )
            }
            className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
              settings.brightnessGestureEnabled
                ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            <span>Brightness Swipe</span>
            <span className="font-mono-tabular font-bold">
              {settings.brightnessGestureEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              update("showBrightnessOverlay", !settings.showBrightnessOverlay)
            }
            className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
              settings.showBrightnessOverlay
                ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            <span>Overlay</span>
            <span className="font-mono-tabular font-bold">
              {settings.showBrightnessOverlay ? "SHOW" : "HIDE"}
            </span>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1">
            <label htmlFor="brightness-sens-range">Brightness Sensitivity</label>
            <span className="font-mono-tabular">
              {settings.brightnessSensitivity.toFixed(1)}x
            </span>
          </div>
          <input
            id="brightness-sens-range"
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={settings.brightnessSensitivity}
            onChange={(e) =>
              update("brightnessSensitivity", Number(e.target.value))
            }
            className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
          />
        </div>
      </div>

      {/* Volume Vertical Swipe (Right Side) */}
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Right Swipe = Volume
            </p>
          </div>
          <span className="text-[11px] font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
            {settings.volumeSensitivity.toFixed(1)}x
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              update("volumeGestureEnabled", !settings.volumeGestureEnabled)
            }
            className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
              settings.volumeGestureEnabled
                ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            <span>Volume Swipe</span>
            <span className="font-mono-tabular font-bold">
              {settings.volumeGestureEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              update("showVolumeOverlay", !settings.showVolumeOverlay)
            }
            className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
              settings.showVolumeOverlay
                ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            <span>Overlay</span>
            <span className="font-mono-tabular font-bold">
              {settings.showVolumeOverlay ? "SHOW" : "HIDE"}
            </span>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1">
            <label htmlFor="volume-sens-range">Volume Sensitivity</label>
            <span className="font-mono-tabular">
              {settings.volumeSensitivity.toFixed(1)}x
            </span>
          </div>
          <input
            id="volume-sens-range"
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={settings.volumeSensitivity}
            onChange={(e) =>
              update("volumeSensitivity", Number(e.target.value))
            }
            className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
          />
        </div>
      </div>

      {/* Seek Duration */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Seek Duration (Buttons &amp; Double-Tap)
          </p>
          <span className="text-xs font-mono-tabular text-teal-700 dark:text-teal-400 font-semibold">
            ±{activeIntervalSec}s
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {SEEK_INTERVAL_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => update("quickSeekPreset", opt.value)}
              className={`min-h-[36px] px-1.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                settings.quickSeekPreset === opt.value
                  ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {settings.quickSeekPreset === "custom" && (
          <div className="mt-2 flex items-center gap-3">
            <label
              htmlFor="custom-seek-seconds"
              className="text-xs text-slate-600 dark:text-slate-400 shrink-0"
            >
              Custom seek seconds (1–120):
            </label>
            <input
              id="custom-seek-seconds"
              type="number"
              min={1}
              max={120}
              value={settings.customSeekSeconds}
              onChange={(e) =>
                update(
                  "customSeekSeconds",
                  Math.min(120, Math.max(1, Number(e.target.value) || 1))
                )
              }
              className="w-24 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-slate-100"
            />
          </div>
        )}
      </div>

      {/* Horizontal Swipe & Sensitivity */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              update("horizontalSwipeEnabled", !settings.horizontalSwipeEnabled)
            }
            className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
              settings.horizontalSwipeEnabled
                ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            <span className="truncate">Horizontal Swipe Seek</span>
            <span className="font-mono-tabular font-semibold shrink-0">
              {settings.horizontalSwipeEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              update("doubleTapSeekEnabled", !settings.doubleTapSeekEnabled)
            }
            className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
              settings.doubleTapSeekEnabled
                ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            <span className="truncate">Double-Tap Seeking</span>
            <span className="font-mono-tabular font-semibold shrink-0">
              {settings.doubleTapSeekEnabled ? "ON" : "OFF"}
            </span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Horizontal Swipe Sensitivity
          </p>
          <span className="text-xs font-mono-tabular text-teal-700 dark:text-teal-400 font-semibold">
            {secPer100Px}s / 100px
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {SENSITIVITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("swipeSensitivity", opt.value)}
              className={`min-h-[40px] px-2 py-1 rounded-lg text-xs font-medium transition-colors flex flex-col items-center justify-center ${
                settings.swipeSensitivity === opt.value
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-semibold"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-[10px] font-mono-tabular opacity-75">
                {opt.value === "custom" && settings.swipeSensitivity === "custom"
                  ? `${settings.customSwipeSecondsPer100Px}s`
                  : opt.hint}
              </span>
            </button>
          ))}
        </div>

        {settings.swipeSensitivity === "custom" && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <label htmlFor="custom-swipe-range">
                Seconds sought per 100px drag
              </label>
              <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                {settings.customSwipeSecondsPer100Px}s
              </span>
            </div>
            <input
              id="custom-swipe-range"
              type="range"
              min={1}
              max={60}
              step={1}
              value={settings.customSwipeSecondsPer100Px}
              onChange={(e) =>
                update("customSwipeSecondsPer100Px", Number(e.target.value))
              }
              className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
            />
          </div>
        )}

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
            <Hand className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            100px drag:
          </span>
          <span className="font-mono-tabular">
            {formatClockTime(previewBaseSec)} →{" "}
            <strong className="text-teal-700 dark:text-teal-400">
              {formatClockTime(previewBaseSec + secPer100Px)}
            </strong>{" "}
            (+{secPer100Px}s)
          </span>
        </div>
      </div>

      {/* Seek Overlay Customization */}
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Seek Overlay Appearance
          </p>
          <button
            type="button"
            onClick={() => update("showSeekPreview", !settings.showSeekPreview)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold font-mono-tabular ${
              settings.showSeekPreview
                ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200"
                : "border-slate-300 dark:border-slate-700 text-slate-500"
            }`}
          >
            {settings.showSeekPreview ? "SHOW" : "HIDE"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Position
            </p>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
              {(["top", "center", "bottom"] as SeekOverlayPosition[]).map(
                (pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => update("seekOverlayPosition", pos)}
                    className={`py-1 rounded text-[11px] font-medium capitalize ${
                      settings.seekOverlayPosition === pos
                        ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {pos}
                  </button>
                )
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Size
            </p>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
              {(["small", "medium", "large"] as SeekOverlaySize[]).map(
                (sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => update("seekOverlaySize", sz)}
                    className={`py-1 rounded text-[11px] font-medium capitalize ${
                      settings.seekOverlaySize === sz
                        ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {sz}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1">
              <label htmlFor="seek-overlay-duration">Duration</label>
              <span className="font-mono-tabular">
                {(settings.seekOverlayDurationMs / 1000).toFixed(1)}s
              </span>
            </div>
            <input
              id="seek-overlay-duration"
              type="range"
              min={300}
              max={2000}
              step={100}
              value={settings.seekOverlayDurationMs}
              onChange={(e) =>
                update("seekOverlayDurationMs", Number(e.target.value))
              }
              className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1">
              <label htmlFor="seek-overlay-opacity">Transparency</label>
              <span className="font-mono-tabular">
                {settings.seekOverlayOpacity}%
              </span>
            </div>
            <input
              id="seek-overlay-opacity"
              type="range"
              min={20}
              max={100}
              step={5}
              value={settings.seekOverlayOpacity}
              onChange={(e) =>
                update("seekOverlayOpacity", Number(e.target.value))
              }
              className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
            />
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Gesture Defaults
        </button>
      </div>
    </div>
  );
};
