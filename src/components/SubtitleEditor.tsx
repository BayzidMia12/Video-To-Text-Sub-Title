import React, { useMemo, useState } from "react";
import {
  Check,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { SubtitleSegment } from "../types/subtitle";
import { formatFullTimestamp, parseTimeInput } from "../utils/time";

interface SubtitleEditorProps {
  segments: SubtitleSegment[];
  activeSegmentId: string | null;
  sourceLanguageLabel?: string;
  sourceDirection?: "ltr" | "rtl";
  isRetranslating: boolean;
  isLiveListening: boolean;
  webSpeechSupported: boolean;
  onSeekTo: (time: number) => void;
  onUpdateSegment: (updated: SubtitleSegment) => void;
  onDeleteSegment: (id: string) => void;
  onAddSegment: () => void;
  onRetranslateSegment: (segment: SubtitleSegment) => void;
  onRetranslateAll: () => void;
  onToggleLiveSpeech: () => void;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = React.memo(
  ({
    segments,
    activeSegmentId,
    sourceLanguageLabel = "Original",
    sourceDirection = "ltr",
    isRetranslating,
    isLiveListening,
    webSpeechSupported,
    onSeekTo,
    onUpdateSegment,
    onDeleteSegment,
    onAddSegment,
    onRetranslateSegment,
    onRetranslateAll,
    onToggleLiveSpeech,
  }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftStart, setDraftStart] = useState("");
    const [draftEnd, setDraftEnd] = useState("");
    const [draftSource, setDraftSource] = useState("");
    const [draftTarget, setDraftTarget] = useState("");
    const [timeError, setTimeError] = useState<string | null>(null);

    const filteredSegments = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return segments;
      return segments.filter(
        (seg) =>
          seg.sourceText.toLowerCase().includes(q) ||
          seg.targetText.toLowerCase().includes(q)
      );
    }, [segments, searchQuery]);

    const beginEdit = (seg: SubtitleSegment) => {
      setEditingId(seg.id);
      setDraftStart(formatFullTimestamp(seg.startTime));
      setDraftEnd(formatFullTimestamp(seg.endTime));
      setDraftSource(seg.sourceText);
      setDraftTarget(seg.targetText);
      setTimeError(null);
    };

    const cancelEdit = () => {
      setEditingId(null);
      setTimeError(null);
    };

    const saveEdit = (original: SubtitleSegment) => {
      const parsedStart = parseTimeInput(draftStart);
      const parsedEnd = parseTimeInput(draftEnd);

      if (parsedStart === null || parsedEnd === null) {
        setTimeError("Use MM:SS or HH:MM:SS format (e.g., 01:12.50).");
        return;
      }
      if (parsedEnd <= parsedStart) {
        setTimeError("End time must be greater than start time.");
        return;
      }

      onUpdateSegment({
        ...original,
        startTime: parsedStart,
        endTime: parsedEnd,
        sourceText: draftSource.trim() || original.sourceText,
        targetText: draftTarget.trim(),
      });
      setEditingId(null);
      setTimeError(null);
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${sourceLanguageLabel} or বাংলা subtitles...`}
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAddSegment}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Line
            </button>

            <button
              type="button"
              onClick={onRetranslateAll}
              disabled={isRetranslating || segments.length === 0}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRetranslating ? "animate-spin" : ""}`} />
              Re-translate All
            </button>
          </div>
        </div>

        {webSpeechSupported && (
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Browser Live Speech Capture ({sourceLanguageLabel} → বাংলা)
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Capture spoken {sourceLanguageLabel} speech in real time using your browser&apos;s built-in speech recognition.
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleLiveSpeech}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                isLiveListening
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-teal-600 hover:bg-teal-700 text-white"
              }`}
            >
              {isLiveListening ? (
                <>
                  <MicOff className="w-3.5 h-3.5" />
                  Stop Capture
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  Start Live Capture
                </>
              )}
            </button>
          </div>
        )}

        {filteredSegments.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {segments.length === 0
                ? "No subtitle lines yet. Run translation, capture live speech, or click Add Line."
                : "No subtitles match your search filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
            {filteredSegments.map((seg) => {
              const isActive = seg.id === activeSegmentId;
              const isEditing = seg.id === editingId;

              if (isEditing) {
                return (
                  <div
                    key={seg.id}
                    className="p-4 rounded-xl border-2 border-teal-600 bg-teal-50/40 dark:bg-teal-950/20 space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Start time
                        </label>
                        <input
                          type="text"
                          value={draftStart}
                          onChange={(e) => setDraftStart(e.target.value)}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          End time
                        </label>
                        <input
                          type="text"
                          value={draftEnd}
                          onChange={(e) => setDraftEnd(e.target.value)}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    {timeError && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {timeError}
                      </p>
                    )}

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {sourceLanguageLabel} transcript
                      </label>
                      <textarea
                        rows={2}
                        dir={sourceDirection}
                        value={draftSource}
                        onChange={(e) => setDraftSource(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 font-bengali">
                          বাংলা translation
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            onRetranslateSegment({
                              ...seg,
                              sourceText: draftSource.trim() || seg.sourceText,
                            })
                          }
                          className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          Auto-translate
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={draftTarget}
                        onChange={(e) => setDraftTarget(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bengali text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(seg)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Save Line
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={seg.id}
                  onClick={() => onSeekTo(seg.startTime)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSeekTo(seg.startTime);
                    }
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    isActive
                      ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-mono-tabular font-semibold text-teal-700 dark:text-teal-400">
                      {formatFullTimestamp(seg.startTime)} →{" "}
                      {formatFullTimestamp(seg.endTime)}
                    </span>

                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label="Edit subtitle line"
                        onClick={() => beginEdit(seg)}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete subtitle line"
                        onClick={() => onDeleteSegment(seg.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p
                    dir={sourceDirection}
                    className="text-sm text-slate-700 dark:text-slate-300 leading-snug"
                  >
                    {seg.sourceText}
                  </p>
                  <p className="mt-1 text-base font-medium font-bengali text-slate-900 dark:text-slate-100 leading-snug">
                    {seg.targetText || "—"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

SubtitleEditor.displayName = "SubtitleEditor";
