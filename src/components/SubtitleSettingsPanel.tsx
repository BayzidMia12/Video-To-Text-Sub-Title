import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Lock,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Sparkles,
  Unlock,
} from "lucide-react";
import {
  clampBottomOffsetPx,
  clampCustomSubtitleFontPx,
  clampGroupSpacingPx,
  clampLetterSpacing,
  clampLineHeight,
  clampPositionPercent,
  clampSubtitleWidthPct,
  DEFAULT_SOURCE_SUBTITLE_POSITION,
  DEFAULT_TARGET_SUBTITLE_POSITION,
  MAX_SUBTITLE_FONT_PX,
  MIN_SUBTITLE_FONT_PX,
  resolveSubtitleFontSizePx,
  SUBTITLE_FONT_SIZE_PRESETS,
} from "../services/storageService";
import type {
  SubtitleBackground,
  SubtitleFontFamilyId,
  SubtitleFontSizePreset,
  SubtitleLineBreakMode,
  SubtitleOutline,
  SubtitleSettings,
  SubtitleTextAlign,
  SubtitleTrackPosition,
} from "../types/subtitle";
import { SUBTITLE_FONT_FAMILIES } from "../utils/subtitleFormatting";
import {
  applyGridPresetToPosition,
  computeAutoFixedPositions,
  GRID_POSITION_OPTIONS,
  resolveGridPresetFromPosition,
  resolveTrackTextAlign,
} from "../utils/subtitlePosition";

interface SubtitleSettingsPanelProps {
  settings: SubtitleSettings;
  sourceLanguageLabel?: string;
  overlapDetected?: boolean;
  onChange: (next: SubtitleSettings) => void;
  onReset: () => void;
}

const BACKGROUND_OPTIONS: Array<{ value: SubtitleBackground; label: string }> = [
  { value: "none", label: "None" },
  { value: "semi", label: "Semi" },
  { value: "solid", label: "Solid" },
];

const OUTLINE_OPTIONS: Array<{ value: SubtitleOutline; label: string }> = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "strong", label: "Strong" },
];

const LINE_MODE_OPTIONS: Array<{
  value: SubtitleLineBreakMode;
  label: string;
}> = [
  { value: "auto", label: "Auto Line Break" },
  { value: "one_line", label: "One Line" },
  { value: "two_lines", label: "Two Lines" },
];

const TEXT_ALIGN_OPTIONS: Array<{
  value: SubtitleTextAlign;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "left", label: "Left", icon: <AlignLeft className="w-3.5 h-3.5" /> },
  {
    value: "center",
    label: "Center",
    icon: <AlignCenter className="w-3.5 h-3.5" />,
  },
  {
    value: "right",
    label: "Right",
    icon: <AlignRight className="w-3.5 h-3.5" />,
  },
];

const COLOR_PRESETS = [
  { label: "White", value: "#FFFFFF" },
  { label: "Warm Yellow", value: "#FEF08A" },
  { label: "Soft Cyan", value: "#A5F3FC" },
  { label: "Mint", value: "#A7F3D0" },
  { label: "Amber", value: "#FDBA74" },
];

const BOTTOM_OFFSET_PRESETS = [0, 5, 10, 15, 20, 30, 50];

export const AutoDualLayoutControl: React.FC<{
  settings: SubtitleSettings;
  overlapDetected?: boolean;
  onChange: (next: SubtitleSettings) => void;
}> = ({ settings, overlapDetected = false, onChange }) => {
  const handleAutoFix = () => {
    const fixed = computeAutoFixedPositions(
      settings.sourcePosition,
      settings.targetPosition
    );
    onChange({
      ...settings,
      sourcePosition: fixed.sourcePosition,
      targetPosition: fixed.targetPosition,
    });
  };

  const groupY = clampPositionPercent(
    settings.targetPosition.verticalPercent,
    95
  );
  const groupSpacingPx = clampGroupSpacingPx(settings.dualGroupSpacingPx, 8);
  const autoCollisionEnabled = settings.autoCollisionPrevention ?? true;

  const updateGroupY = (nextGroupY: number) => {
    const nextTargetY = clampPositionPercent(nextGroupY, groupY);
    const span =
      settings.targetPosition.verticalPercent >
      settings.sourcePosition.verticalPercent
        ? Math.min(
            24,
            Math.max(
              6,
              settings.targetPosition.verticalPercent -
                settings.sourcePosition.verticalPercent
            )
          )
        : 13;
    const nextSourceY = Math.max(0, nextTargetY - span);

    onChange({
      ...settings,
      sourcePosition: {
        ...settings.sourcePosition,
        verticalPreset: "custom",
        verticalPercent: nextSourceY,
      },
      targetPosition: {
        ...settings.targetPosition,
        verticalPreset: "custom",
        verticalPercent: nextTargetY,
      },
    });
  };

  return (
    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Dual Subtitle
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {settings.autoDualLayout
              ? "Auto Layout ON · Original above বাংলা"
              : "Manual mode · Independent free placement"}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              ...settings,
              autoDualLayout: !settings.autoDualLayout,
            })
          }
          className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-mono-tabular font-bold shrink-0 transition-colors ${
            settings.autoDualLayout
              ? "border-teal-600 bg-teal-600 text-white"
              : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
          }`}
        >
          Auto Layout: {settings.autoDualLayout ? "ON" : "OFF"}
        </button>
      </div>

      {/* Dual Subtitle Group Position (0% Top -> 100% Bottom) */}
      <div className="space-y-1.5 pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="dual-group-y"
            className="text-[11px] font-semibold text-slate-700 dark:text-slate-300"
          >
            Dual Subtitle Group Position
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateGroupY(0)}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono-tabular text-slate-600 dark:text-slate-300 hover:border-teal-500"
            >
              0%
            </button>
            <button
              type="button"
              onClick={() => updateGroupY(50)}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono-tabular text-slate-600 dark:text-slate-300 hover:border-teal-500"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => updateGroupY(100)}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono-tabular text-teal-700 dark:text-teal-300 font-semibold hover:border-teal-500"
            >
              100%
            </button>
            <input
              type="number"
              aria-label="Dual subtitle group Y percent"
              min={0}
              max={100}
              value={groupY}
              onChange={(e) =>
                updateGroupY(clampPositionPercent(e.target.value, groupY))
              }
              className="w-12 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-mono-tabular text-center"
            />
            <span className="text-[11px] text-slate-500">%</span>
          </div>
        </div>
        <input
          id="dual-group-y"
          type="range"
          min={0}
          max={100}
          step={1}
          value={groupY}
          onChange={(e) =>
            updateGroupY(clampPositionPercent(e.target.value, groupY))
          }
          className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
        />
      </div>

      {/* Group Spacing & Auto Collision Prevention */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="dual-group-spacing"
              className="text-[11px] font-semibold text-slate-600 dark:text-slate-400"
            >
              Group Spacing
            </label>
            <span className="text-[11px] font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
              {groupSpacingPx}px
            </span>
          </div>
          <input
            id="dual-group-spacing"
            type="range"
            min={0}
            max={48}
            step={1}
            value={groupSpacingPx}
            onChange={(e) =>
              onChange({
                ...settings,
                dualGroupSpacingPx: clampGroupSpacingPx(
                  e.target.value,
                  groupSpacingPx
                ),
              })
            }
            className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
          />
        </div>

        <div className="flex items-center justify-between gap-2 sm:pl-2">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-tight">
            Auto Collision Prevention
          </span>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...settings,
                autoCollisionPrevention: !autoCollisionEnabled,
              })
            }
            className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-mono-tabular font-bold shrink-0 transition-colors ${
              autoCollisionEnabled
                ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300"
                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
            }`}
          >
            {autoCollisionEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {!settings.autoDualLayout && overlapDetected && (
        <div className="p-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Subtitle overlap detected</span>
          </div>
          <button
            type="button"
            onClick={handleAutoFix}
            className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            Auto Fix Position
          </button>
        </div>
      )}
    </div>
  );
};

interface TrackFullSettingsEditorProps {
  trackKind: "source" | "target";
  title: string;
  subtitleLabel: string;
  enabled: boolean;
  maxWidthPct: number;
  fontSizePreset: SubtitleFontSizePreset;
  customFontSizePx: number;
  fontFamily: SubtitleFontFamilyId;
  color: string;
  background: SubtitleBackground;
  outline: SubtitleOutline;
  opacity: number;
  lineHeight: number;
  letterSpacing: number;
  lineMode: SubtitleLineBreakMode;
  position: SubtitleTrackPosition;
  onToggleEnabled: () => void;
  onChangeMaxWidthPct: (nextPct: number) => void;
  onChangeFontSizePreset: (nextPreset: SubtitleFontSizePreset) => void;
  onChangeCustomFontPx: (nextPx: number) => void;
  onChangeFontFamily: (next: SubtitleFontFamilyId) => void;
  onChangeColor: (next: string) => void;
  onChangeBackground: (next: SubtitleBackground) => void;
  onChangeOutline: (next: SubtitleOutline) => void;
  onChangeOpacity: (next: number) => void;
  onChangeLineHeight: (next: number) => void;
  onChangeLetterSpacing: (next: number) => void;
  onChangeLineMode: (next: SubtitleLineBreakMode) => void;
  onChangePosition: (next: SubtitleTrackPosition) => void;
  onResetPosition: () => void;
  onResetTrack: () => void;
}

const TrackFullSettingsEditor: React.FC<TrackFullSettingsEditorProps> = ({
  trackKind,
  title,
  subtitleLabel,
  enabled,
  maxWidthPct,
  fontSizePreset,
  customFontSizePx,
  fontFamily,
  color,
  background,
  outline,
  opacity,
  lineHeight,
  letterSpacing,
  lineMode,
  position,
  onToggleEnabled,
  onChangeMaxWidthPct,
  onChangeFontSizePreset,
  onChangeCustomFontPx,
  onChangeFontFamily,
  onChangeColor,
  onChangeBackground,
  onChangeOutline,
  onChangeOpacity,
  onChangeLineHeight,
  onChangeLetterSpacing,
  onChangeLineMode,
  onChangePosition,
  onResetPosition,
  onResetTrack,
}) => {
  const effectivePx = resolveSubtitleFontSizePx(fontSizePreset, customFontSizePx);
  const [draftPx, setDraftPx] = useState(String(effectivePx));

  useEffect(() => {
    setDraftPx(String(effectivePx));
  }, [effectivePx]);

  const stepFontSize = (delta: number) => {
    const next = clampCustomSubtitleFontPx(effectivePx + delta, effectivePx);
    onChangeCustomFontPx(next);
  };

  const activeGridPreset = resolveGridPresetFromPosition(position, trackKind);
  const effectiveAlign = resolveTrackTextAlign(position);
  const isLocked = !position.dragEnabled;
  const idPrefix = `${trackKind}-track`;

  return (
    <div className="space-y-4">
      {/* Enable + Reset Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleEnabled}
          className={`flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
            enabled
              ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200"
              : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
          }`}
        >
          <span className="truncate">{title}</span>
          <span className="font-mono-tabular font-bold shrink-0">
            {enabled ? "ON" : "OFF"}
          </span>
        </button>

        <button
          type="button"
          onClick={onResetTrack}
          className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All
        </button>
      </div>

      {/* Position: 9-Point Grid + X / Y + Lock / Unlock + Reset Position */}
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/35 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Position &amp; Drag Placement
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {activeGridPreset === "custom"
                ? "Custom placement"
                : GRID_POSITION_OPTIONS.find((g) => g.id === activeGridPreset)
                    ?.label ?? "Custom"}
            </p>
          </div>

          <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono-tabular text-teal-700 dark:text-teal-300 font-semibold">
            X {position.horizontalPercent}% · Y {position.verticalPercent}%
          </span>
        </div>

        {/* 3x3 Screen Position Grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {GRID_POSITION_OPTIONS.map((opt) => (
            <button
              key={`${idPrefix}-grid-${opt.id}`}
              type="button"
              onClick={() =>
                onChangePosition(
                  applyGridPresetToPosition(position, opt.id, trackKind)
                )
              }
              className={`min-h-[34px] px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                activeGridPreset === opt.id
                  ? "border-teal-600 bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                  : "border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* X Position & Y Position */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`${idPrefix}-xpos`}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400"
              >
                X Position (Horizontal)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label={`${subtitleLabel} X position percent`}
                  min={0}
                  max={100}
                  value={position.horizontalPercent}
                  onChange={(e) =>
                    onChangePosition({
                      ...position,
                      horizontalMode: "custom",
                      horizontalPercent: clampPositionPercent(
                        e.target.value,
                        position.horizontalPercent
                      ),
                    })
                  }
                  className="w-12 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-mono-tabular text-center"
                />
                <span className="text-[11px] text-slate-500">%</span>
              </div>
            </div>
            <input
              id={`${idPrefix}-xpos`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={position.horizontalPercent}
              onChange={(e) =>
                onChangePosition({
                  ...position,
                  horizontalMode: "custom",
                  horizontalPercent: clampPositionPercent(
                    e.target.value,
                    position.horizontalPercent
                  ),
                })
              }
              className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`${idPrefix}-ypos`}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400"
              >
                Y Position (0% Top → 100% Bottom)
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onChangePosition({
                      ...position,
                      verticalPreset: "bottom",
                      verticalPercent: 100,
                    })
                  }
                  className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono-tabular text-teal-700 dark:text-teal-300 font-semibold hover:border-teal-500"
                >
                  100%
                </button>
                <input
                  type="number"
                  aria-label={`${subtitleLabel} Y position percent`}
                  min={0}
                  max={100}
                  value={position.verticalPercent}
                  onChange={(e) =>
                    onChangePosition({
                      ...position,
                      verticalPreset: "custom",
                      verticalPercent: clampPositionPercent(
                        e.target.value,
                        position.verticalPercent
                      ),
                    })
                  }
                  className="w-12 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-mono-tabular text-center"
                />
                <span className="text-[11px] text-slate-500">%</span>
              </div>
            </div>
            <input
              id={`${idPrefix}-ypos`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={position.verticalPercent}
              onChange={(e) =>
                onChangePosition({
                  ...position,
                  verticalPreset: "custom",
                  verticalPercent: clampPositionPercent(
                    e.target.value,
                    position.verticalPercent
                  ),
                })
              }
              className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
            />
          </div>
        </div>

        {/* Bottom Offset (0px flush to video bottom -> 200px custom clearance) */}
        <div className="space-y-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-800/70">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`${idPrefix}-bottom-offset`}
              className="text-[11px] font-semibold text-slate-600 dark:text-slate-400"
            >
              Bottom Offset (from video bottom)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                aria-label={`${subtitleLabel} bottom offset px`}
                min={0}
                max={200}
                value={position.bottomOffsetPx ?? 0}
                onChange={(e) =>
                  onChangePosition({
                    ...position,
                    bottomOffsetPx: clampBottomOffsetPx(
                      e.target.value,
                      position.bottomOffsetPx ?? 0
                    ),
                  })
                }
                className="w-14 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-mono-tabular text-center"
              />
              <span className="text-[11px] text-slate-500">px</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {BOTTOM_OFFSET_PRESETS.map((px) => (
              <button
                key={`${idPrefix}-bo-${px}`}
                type="button"
                onClick={() =>
                  onChangePosition({
                    ...position,
                    bottomOffsetPx: px,
                  })
                }
                className={`min-h-[28px] px-2 py-0.5 rounded-md border text-[11px] font-mono-tabular transition-colors ${
                  (position.bottomOffsetPx ?? 0) === px
                    ? "border-teal-600 bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                    : "border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400"
                }`}
              >
                {px}px
              </button>
            ))}
          </div>

          <input
            id={`${idPrefix}-bottom-offset`}
            type="range"
            min={0}
            max={200}
            step={1}
            value={position.bottomOffsetPx ?? 0}
            onChange={(e) =>
              onChangePosition({
                ...position,
                bottomOffsetPx: clampBottomOffsetPx(
                  e.target.value,
                  position.bottomOffsetPx ?? 0
                ),
              })
            }
            className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
          />
        </div>

        {/* Independent Text Alignment (Left / Center / Right) */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            Text Alignment
          </p>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
            {TEXT_ALIGN_OPTIONS.map((opt) => (
              <button
                key={`${idPrefix}-ta-${opt.value}`}
                type="button"
                onClick={() =>
                  onChangePosition({
                    ...position,
                    textAlign: opt.value,
                  })
                }
                className={`min-h-[32px] px-2 py-1 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                  effectiveAlign === opt.value
                    ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Lock/Unlock Drag & Reset Position */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() =>
              onChangePosition({
                ...position,
                dragEnabled: !position.dragEnabled,
              })
            }
            className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center justify-between gap-2 transition-colors ${
              isLocked
                ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                : "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {isLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Unlock className="w-3.5 h-3.5" />
              )}
              {isLocked ? "Locked" : "Drag Unlocked"}
            </span>
            <Move className="w-3.5 h-3.5 opacity-75" />
          </button>

          <button
            type="button"
            onClick={onResetPosition}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Position
          </button>
        </div>
      </div>

      {/* Font Size + Increase / Decrease Buttons */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Font Size ({subtitleLabel})
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Decrease ${subtitleLabel} font size`}
              onClick={() => stepFontSize(-1)}
              className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 py-1 rounded-md bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs font-mono-tabular font-semibold text-teal-700 dark:text-teal-300 min-w-[46px] text-center">
              {effectivePx}px
            </span>
            <button
              type="button"
              aria-label={`Increase ${subtitleLabel} font size`}
              onClick={() => stepFontSize(1)}
              className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {SUBTITLE_FONT_SIZE_PRESETS.map((sizePx) => (
            <button
              key={`${idPrefix}-sz-${sizePx}`}
              type="button"
              onClick={() => onChangeFontSizePreset(sizePx)}
              className={`min-h-[36px] px-1 rounded-lg text-xs font-mono-tabular font-medium transition-colors ${
                fontSizePreset === sizePx
                  ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {sizePx}px
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChangeFontSizePreset("custom")}
            className={`min-h-[36px] px-1 rounded-lg text-xs font-medium transition-colors ${
              fontSizePreset === "custom"
                ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Custom
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            aria-label={`${subtitleLabel} font size slider`}
            type="range"
            min={MIN_SUBTITLE_FONT_PX}
            max={MAX_SUBTITLE_FONT_PX}
            step={1}
            value={effectivePx}
            onChange={(e) =>
              onChangeCustomFontPx(
                clampCustomSubtitleFontPx(e.target.value, effectivePx)
              )
            }
            className="studio-range flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
          />
          <input
            type="number"
            aria-label={`${subtitleLabel} font size px`}
            min={MIN_SUBTITLE_FONT_PX}
            max={MAX_SUBTITLE_FONT_PX}
            value={draftPx}
            onChange={(e) => {
              setDraftPx(e.target.value);
              const val = Number(e.target.value);
              if (
                Number.isFinite(val) &&
                val >= MIN_SUBTITLE_FONT_PX &&
                val <= MAX_SUBTITLE_FONT_PX
              ) {
                onChangeCustomFontPx(Math.round(val));
              }
            }}
            onBlur={() => {
              const clamped = clampCustomSubtitleFontPx(draftPx, effectivePx);
              setDraftPx(String(clamped));
              onChangeCustomFontPx(clamped);
            }}
            className="w-16 min-h-[34px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular text-center"
          />
        </div>
      </div>

      {/* Font Family */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Font
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {SUBTITLE_FONT_FAMILIES.map((ff) => (
            <button
              key={`${idPrefix}-ff-${ff.id}`}
              type="button"
              onClick={() => onChangeFontFamily(ff.id)}
              className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                fontFamily === ff.id
                  ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 font-semibold"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
              }`}
            >
              {ff.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text Color */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {trackKind === "target" ? "Bengali Text Color" : "Color"}
          </p>
          <input
            type="color"
            aria-label={`${subtitleLabel} custom color`}
            value={color}
            onChange={(e) => onChangeColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-slate-300 dark:border-slate-700 bg-transparent"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={`${idPrefix}-col-${preset.value}`}
              type="button"
              aria-label={`${subtitleLabel} color ${preset.label}`}
              onClick={() => onChangeColor(preset.value)}
              style={{ backgroundColor: preset.value }}
              className={`w-8 h-8 rounded-full border-2 transition-transform ${
                color.toLowerCase() === preset.value.toLowerCase()
                  ? "border-teal-600 scale-110"
                  : "border-slate-300 dark:border-slate-600"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Background, Outline, Opacity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Background
          </p>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {BACKGROUND_OPTIONS.map((opt) => (
              <button
                key={`${idPrefix}-bg-${opt.value}`}
                type="button"
                onClick={() => onChangeBackground(opt.value)}
                className={`min-h-[34px] px-1.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  background === opt.value
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-semibold"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Text Outline
          </p>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {OUTLINE_OPTIONS.map((opt) => (
              <button
                key={`${idPrefix}-ol-${opt.value}`}
                type="button"
                onClick={() => onChangeOutline(opt.value)}
                className={`min-h-[34px] px-1.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  outline === opt.value
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-semibold"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor={`${idPrefix}-opacity`}
            className="text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Background Opacity
          </label>
          <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
            {opacity}%
          </span>
        </div>
        <input
          id={`${idPrefix}-opacity`}
          type="range"
          min={0}
          max={100}
          step={5}
          value={opacity}
          onChange={(e) => onChangeOpacity(Number(e.target.value))}
          className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
        />
      </div>

      {/* Width, Line Break, Line Spacing & Letter Spacing */}
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor={`${idPrefix}-width`}
              className="text-[11px] font-semibold text-slate-600 dark:text-slate-400"
            >
              Maximum Subtitle Width
            </label>
            <span className="text-xs font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
              {maxWidthPct}%
            </span>
          </div>
          <input
            id={`${idPrefix}-width`}
            type="range"
            min={40}
            max={96}
            step={2}
            value={maxWidthPct}
            onChange={(e) =>
              onChangeMaxWidthPct(
                clampSubtitleWidthPct(e.target.value, maxWidthPct)
              )
            }
            className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor={`${idPrefix}-line-height`}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400"
              >
                Line Spacing
              </label>
              <span className="text-xs font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                {lineHeight.toFixed(2)}x
              </span>
            </div>
            <input
              id={`${idPrefix}-line-height`}
              type="range"
              min={1.1}
              max={1.85}
              step={0.05}
              value={lineHeight}
              onChange={(e) =>
                onChangeLineHeight(clampLineHeight(e.target.value, lineHeight))
              }
              className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor={`${idPrefix}-letter-spacing`}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400"
              >
                Letter Spacing
              </label>
              <span className="text-xs font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                {letterSpacing}px
              </span>
            </div>
            <input
              id={`${idPrefix}-letter-spacing`}
              type="range"
              min={-0.5}
              max={4}
              step={0.5}
              value={letterSpacing}
              onChange={(e) =>
                onChangeLetterSpacing(
                  clampLetterSpacing(e.target.value, letterSpacing)
                )
              }
              className="studio-range w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            Line Break
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {LINE_MODE_OPTIONS.map((opt) => (
              <button
                key={`${idPrefix}-lm-${opt.value}`}
                type="button"
                onClick={() => onChangeLineMode(opt.value)}
                className={`min-h-[38px] px-2 py-1 rounded-lg border text-center transition-colors ${
                  lineMode === opt.value
                    ? "border-teal-600 bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-semibold shadow-sm"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span className="block text-[11px] leading-tight">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const OriginalSubtitleSettingsPanel: React.FC<{
  settings: SubtitleSettings;
  sourceLanguageLabel?: string;
  overlapDetected?: boolean;
  onChange: (next: SubtitleSettings) => void;
}> = ({
  settings,
  sourceLanguageLabel = "Original",
  overlapDetected = false,
  onChange,
}) => {
  return (
    <div className="space-y-4">
      <AutoDualLayoutControl
        settings={settings}
        overlapDetected={overlapDetected}
        onChange={onChange}
      />
      <TrackFullSettingsEditor
        trackKind="source"
        title={`Enable ${sourceLanguageLabel} Subtitle`}
        subtitleLabel={sourceLanguageLabel}
        enabled={settings.showSource}
        maxWidthPct={settings.sourceMaxWidthPct}
        fontSizePreset={settings.sourceFontSize}
        customFontSizePx={settings.sourceCustomFontSize}
        fontFamily={settings.sourceFontFamily}
        color={settings.sourceColor}
        background={settings.sourceBackground}
        outline={settings.sourceOutline}
        opacity={settings.sourceOpacity}
        lineHeight={settings.sourceLineHeight}
        letterSpacing={settings.sourceLetterSpacing}
        lineMode={settings.sourceLineMode}
        position={settings.sourcePosition}
        onToggleEnabled={() =>
          onChange({ ...settings, showSource: !settings.showSource })
        }
        onChangeMaxWidthPct={(w) =>
          onChange({ ...settings, sourceMaxWidthPct: w })
        }
        onChangeFontSizePreset={(next) =>
          onChange({ ...settings, sourceFontSize: next })
        }
        onChangeCustomFontPx={(px) =>
          onChange({
            ...settings,
            sourceFontSize: "custom",
            sourceCustomFontSize: px,
          })
        }
        onChangeFontFamily={(ff) =>
          onChange({ ...settings, sourceFontFamily: ff })
        }
        onChangeColor={(c) => onChange({ ...settings, sourceColor: c })}
        onChangeBackground={(bg) =>
          onChange({ ...settings, sourceBackground: bg })
        }
        onChangeOutline={(ol) => onChange({ ...settings, sourceOutline: ol })}
        onChangeOpacity={(op) => onChange({ ...settings, sourceOpacity: op })}
        onChangeLineHeight={(lh) =>
          onChange({ ...settings, sourceLineHeight: lh })
        }
        onChangeLetterSpacing={(ls) =>
          onChange({ ...settings, sourceLetterSpacing: ls })
        }
        onChangeLineMode={(lm) => onChange({ ...settings, sourceLineMode: lm })}
        onChangePosition={(pos) =>
          onChange({ ...settings, sourcePosition: pos })
        }
        onResetPosition={() =>
          onChange({
            ...settings,
            sourcePosition: DEFAULT_SOURCE_SUBTITLE_POSITION,
          })
        }
        onResetTrack={() =>
          onChange({
            ...settings,
            showSource: true,
            sourceMaxWidthPct: 80,
            sourceFontSize: 15,
            sourceCustomFontSize: 15,
            sourceFontFamily: "default",
            sourceColor: "#FFFFFF",
            sourceBackground: "semi",
            sourceOutline: "strong",
            sourceOpacity: 80,
            sourceLineHeight: 1.38,
            sourceLetterSpacing: 0,
            sourceLineMode: "auto",
            sourcePosition: DEFAULT_SOURCE_SUBTITLE_POSITION,
          })
        }
      />
    </div>
  );
};

export const BengaliSubtitleSettingsPanel: React.FC<{
  settings: SubtitleSettings;
  overlapDetected?: boolean;
  onChange: (next: SubtitleSettings) => void;
}> = ({ settings, overlapDetected = false, onChange }) => {
  return (
    <div className="space-y-4">
      <AutoDualLayoutControl
        settings={settings}
        overlapDetected={overlapDetected}
        onChange={onChange}
      />
      <TrackFullSettingsEditor
        trackKind="target"
        title="Enable বাংলা Subtitle"
        subtitleLabel="বাংলা"
        enabled={settings.showTarget}
        maxWidthPct={settings.targetMaxWidthPct}
        fontSizePreset={settings.targetFontSize}
        customFontSizePx={settings.targetCustomFontSize}
        fontFamily={settings.targetFontFamily}
        color={settings.targetColor}
        background={settings.targetBackground}
        outline={settings.targetOutline}
        opacity={settings.targetOpacity}
        lineHeight={settings.targetLineHeight}
        letterSpacing={settings.targetLetterSpacing}
        lineMode={settings.targetLineMode}
        position={settings.targetPosition}
        onToggleEnabled={() =>
          onChange({ ...settings, showTarget: !settings.showTarget })
        }
        onChangeMaxWidthPct={(w) =>
          onChange({ ...settings, targetMaxWidthPct: w })
        }
        onChangeFontSizePreset={(next) =>
          onChange({ ...settings, targetFontSize: next })
        }
        onChangeCustomFontPx={(px) =>
          onChange({
            ...settings,
            targetFontSize: "custom",
            targetCustomFontSize: px,
          })
        }
        onChangeFontFamily={(ff) =>
          onChange({ ...settings, targetFontFamily: ff })
        }
        onChangeColor={(c) => onChange({ ...settings, targetColor: c })}
        onChangeBackground={(bg) =>
          onChange({ ...settings, targetBackground: bg })
        }
        onChangeOutline={(ol) => onChange({ ...settings, targetOutline: ol })}
        onChangeOpacity={(op) => onChange({ ...settings, targetOpacity: op })}
        onChangeLineHeight={(lh) =>
          onChange({ ...settings, targetLineHeight: lh })
        }
        onChangeLetterSpacing={(ls) =>
          onChange({ ...settings, targetLetterSpacing: ls })
        }
        onChangeLineMode={(lm) => onChange({ ...settings, targetLineMode: lm })}
        onChangePosition={(pos) =>
          onChange({ ...settings, targetPosition: pos })
        }
        onResetPosition={() =>
          onChange({
            ...settings,
            targetPosition: DEFAULT_TARGET_SUBTITLE_POSITION,
          })
        }
        onResetTrack={() =>
          onChange({
            ...settings,
            showTarget: true,
            targetMaxWidthPct: 82,
            targetFontSize: 15,
            targetCustomFontSize: 15,
            targetFontFamily: "default",
            targetColor: "#FEF08A",
            targetBackground: "semi",
            targetOutline: "strong",
            targetOpacity: 85,
            targetLineHeight: 1.42,
            targetLetterSpacing: 0,
            targetLineMode: "auto",
            targetPosition: DEFAULT_TARGET_SUBTITLE_POSITION,
          })
        }
      />
    </div>
  );
};

// Compatibility wrappers preserved for existing imports
export const SubtitleStyleControls: React.FC<{
  settings: SubtitleSettings;
  sourceLanguageLabel?: string;
  onChange: (next: SubtitleSettings) => void;
}> = ({ settings, sourceLanguageLabel = "Original", onChange }) => (
  <div className="space-y-6">
    <OriginalSubtitleSettingsPanel
      settings={settings}
      sourceLanguageLabel={sourceLanguageLabel}
      onChange={onChange}
    />
    <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
      <BengaliSubtitleSettingsPanel settings={settings} onChange={onChange} />
    </div>
  </div>
);

export const SubtitlePositionControls: React.FC<{
  settings: SubtitleSettings;
  onChange: (next: SubtitleSettings) => void;
}> = ({ settings, onChange }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        Quick Position Reset
      </p>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...settings,
            sourcePosition: DEFAULT_SOURCE_SUBTITLE_POSITION,
            targetPosition: DEFAULT_TARGET_SUBTITLE_POSITION,
          })
        }
        className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
      >
        <RotateCcw className="w-3 h-3" />
        Reset Both Positions
      </button>
    </div>
  </div>
);

export const SubtitleSettingsPanel: React.FC<SubtitleSettingsPanelProps> = ({
  settings,
  sourceLanguageLabel = "Original",
  overlapDetected = false,
  onChange,
  onReset,
}) => {
  return (
    <div className="space-y-5 max-h-[600px] overflow-y-auto pr-1">
      <OriginalSubtitleSettingsPanel
        settings={settings}
        sourceLanguageLabel={sourceLanguageLabel}
        overlapDetected={overlapDetected}
        onChange={onChange}
      />
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
        <BengaliSubtitleSettingsPanel
          settings={settings}
          overlapDetected={overlapDetected}
          onChange={onChange}
        />
      </div>
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All Subtitle Defaults
        </button>
      </div>
    </div>
  );
};
