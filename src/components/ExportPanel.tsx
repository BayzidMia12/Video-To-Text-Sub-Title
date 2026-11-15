import React, { useMemo, useState } from "react";
import {
  BookmarkCheck,
  Download,
  FileCode2,
  FileText,
  Film,
  Loader2,
} from "lucide-react";
import type {
  SubtitleSegment,
  SubtitleSettings,
  TranslationProject,
} from "../types/subtitle";
import { LANGUAGES } from "../config/languages";
import {
  checkVideoExportSupport,
  downloadTextFile,
  exportVideoWithSubtitles,
  generateProjectJson,
  generateSrtContent,
  generateVttContent,
  type SubtitleExportFormat,
} from "../services/exportService";

interface ExportPanelProps {
  project: TranslationProject;
  videoUrl: string | null;
  settings: SubtitleSettings;
  onSaveLocally: () => void;
  savedConfirmation: boolean;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  project,
  videoUrl,
  settings,
  onSaveLocally,
  savedConfirmation,
}) => {
  const [exportScope, setExportScope] = useState<SubtitleExportFormat>("dual");
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoExportProgress, setVideoExportProgress] = useState(0);
  const [videoExportError, setVideoExportError] = useState<string | null>(null);

  const videoSupport = useMemo(() => checkVideoExportSupport(), []);
  const baseName = project.videoMeta.fileName.replace(/\.[^.]+$/, "") || "subtitles";
  const segments: SubtitleSegment[] = project.segments;
  const sourceLabel =
    project.detectedLanguage?.name ||
    (project.sourceLanguageCode && project.sourceLanguageCode !== "auto"
      ? LANGUAGES[project.sourceLanguageCode]?.name
      : undefined) ||
    "Original";

  const handleExportSrt = () => {
    const srt = generateSrtContent(segments, exportScope);
    downloadTextFile(srt, `${baseName}_${exportScope}.srt`, "text/plain");
  };

  const handleExportVtt = () => {
    const vtt = generateVttContent(segments, exportScope);
    downloadTextFile(vtt, `${baseName}_${exportScope}.vtt`, "text/vtt");
  };

  const handleExportJson = () => {
    const json = generateProjectJson(project);
    downloadTextFile(json, `${baseName}_subtitles.json`, "application/json");
  };

  const handleExportVideo = async () => {
    if (!videoUrl) return;
    setVideoExportError(null);
    setVideoExportProgress(0);
    setIsExportingVideo(true);
    try {
      await exportVideoWithSubtitles(
        videoUrl,
        segments,
        settings,
        project.videoMeta.fileName,
        (pct) => setVideoExportProgress(pct)
      );
    } catch (err) {
      setVideoExportError(
        err instanceof Error
          ? err.message
          : "Could not export subtitled video in this browser."
      );
    } finally {
      setIsExportingVideo(false);
    }
  };

  const previewSrt = useMemo(
    () => generateSrtContent(segments.slice(0, 2), exportScope),
    [segments, exportScope]
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Subtitle languages to include
        </p>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {[
            { id: "dual" as const, label: `${sourceLabel} + বাংলা` },
            { id: "source" as const, label: `${sourceLabel} Only` },
            { id: "target" as const, label: "বাংলা Only" },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setExportScope(opt.id)}
              className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                exportScope === opt.id
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handleExportSrt}
          disabled={segments.length === 0}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export SRT
        </button>

        <button
          type="button"
          onClick={handleExportVtt}
          disabled={segments.length === 0}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-100 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Export VTT
        </button>

        <button
          type="button"
          onClick={handleExportJson}
          disabled={segments.length === 0}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-100 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
        >
          <FileCode2 className="w-4 h-4" />
          Export JSON
        </button>

        <button
          type="button"
          onClick={onSaveLocally}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
        >
          <BookmarkCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          {savedConfirmation ? "Saved Locally" : "Save Project Locally"}
        </button>
      </div>

      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Export Video with Subtitles
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Renders your current dual subtitle styling onto the video locally in WebM format.
            </p>
          </div>
        </div>

        {!videoSupport.supported ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {videoSupport.reason}
          </p>
        ) : !videoUrl ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Re-select the original video file on your device to render a subtitled video export.
          </p>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleExportVideo}
              disabled={isExportingVideo || segments.length === 0}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 hover:opacity-90 disabled:opacity-50 text-white dark:text-slate-900 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-opacity"
            >
              {isExportingVideo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rendering Video ({videoExportProgress}%)
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  Export Subtitled Video (.webm)
                </>
              )}
            </button>
            {videoExportError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {videoExportError}
              </p>
            )}
          </div>
        )}
      </div>

      {segments.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            SRT output preview
          </p>
          <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono-tabular overflow-x-auto leading-relaxed">
            {previewSrt}
          </pre>
        </div>
      )}
    </div>
  );
};
