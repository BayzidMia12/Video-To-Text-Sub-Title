import React, { useRef, useState } from "react";
import {
  FileText,
  Film,
  FolderOpen,
  Globe,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ACTIVE_LANGUAGE_PAIRS,
  ENGLISH_ACCENT_OPTIONS,
  getLanguagePairById,
} from "../config/languages";
import type {
  EnglishAccent,
  TranslationEngineMode,
  TranslationProject,
  VideoMetadata,
} from "../types/subtitle";
import { formatClockTime, formatFileSize } from "../utils/time";

interface UploadScreenProps {
  selectedVideo: VideoMetadata | null;
  recentProjects: TranslationProject[];
  engineMode: TranslationEngineMode;
  aiAvailable: boolean;
  selectedPairId: string;
  englishAccent: EnglishAccent;
  resumableInfo?: { hasCache: boolean; cachedChunks: number; totalChunks: number };
  onSelectPair: (pairId: string) => void;
  onSelectEnglishAccent: (accent: EnglishAccent) => void;
  onSelectVideoFile: (file: File) => void;
  onStartTranslation: (forceFresh?: boolean) => void;
  onLoadSampleProject: () => void;
  onOpenRecentProject: (project: TranslationProject) => void;
  onDeleteRecentProject: (projectId: string) => void;
  onImportSubtitleFile: (file: File) => void;
  onClearSelectedVideo: () => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
  selectedVideo,
  recentProjects,
  engineMode,
  aiAvailable,
  selectedPairId,
  englishAccent,
  resumableInfo,
  onSelectPair,
  onSelectEnglishAccent,
  onSelectVideoFile,
  onStartTranslation,
  onLoadSampleProject,
  onOpenRecentProject,
  onDeleteRecentProject,
  onImportSubtitleFile,
  onClearSelectedVideo,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const activePair = getLanguagePairById(selectedPairId);
  const quickPairs = ACTIVE_LANGUAGE_PAIRS.filter((p) => p.id !== "auto-bn");

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onSelectVideoFile(files[0]);
  };

  return (
    <div className="space-y-8">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-8 space-y-6">
        <div className="max-w-3xl">
          <p className="text-xs font-medium text-teal-700 dark:text-teal-400 tracking-wide mb-2">
            {activePair.label} · Dual Subtitle Studio
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">
            Turn spoken videos into natural Bengali subtitles
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            Select a video in English, Korean, Hindi, Mandarin Chinese, Tamil, German, Arabic, or Auto Detect. Plays instantly from local storage with dual original and natural বাংলা subtitles.
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label
                htmlFor="home-source-language"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Source Language
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="home-source-language"
                  value={selectedPairId}
                  onChange={(e) => onSelectPair(e.target.value)}
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {ACTIVE_LANGUAGE_PAIRS.map((pair) => (
                    <option key={pair.id} value={pair.id}>
                      {pair.source.name}
                      {pair.source.nativeName !== pair.source.name &&
                      pair.source.code !== "auto"
                        ? ` (${pair.source.nativeName})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-4">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Target Language
              </span>
              <div className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-sm font-medium text-slate-900 dark:text-slate-100">
                <span className="font-bengali">Bengali (বাংলা)</span>
                <span className="text-xs text-teal-700 dark:text-teal-400 font-semibold">
                  Default
                </span>
              </div>
            </div>

            {(selectedPairId === "en-bn" || selectedPairId === "auto-bn") && (
              <div className="md:col-span-3">
                <label
                  htmlFor="home-english-accent"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  English Accent
                </label>
                <select
                  id="home-english-accent"
                  value={englishAccent}
                  onChange={(e) =>
                    onSelectEnglishAccent(e.target.value as EnglishAccent)
                  }
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {ENGLISH_ACCENT_OPTIONS.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Quick selection
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectPair("auto-bn")}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedPairId === "auto-bn"
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                }`}
              >
                Auto Detect → বাংলা
              </button>
              {quickPairs.map((pair) => {
                const active = selectedPairId === pair.id;
                return (
                  <button
                    key={pair.id}
                    type="button"
                    onClick={() => onSelectPair(pair.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors font-bengali ${
                      active
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    {pair.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={srtInputRef}
          type="file"
          accept=".srt,.vtt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportSubtitleFile(file);
            e.target.value = "";
          }}
        />

        {!selectedVideo ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center transition-colors ${
              isDragging
                ? "border-teal-600 bg-teal-50/60 dark:bg-teal-950/30"
                : "border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/40"
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-teal-600/10 text-teal-700 dark:text-teal-400 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-6 h-6" />
            </div>

            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              Drop or pick a video from your device
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Supports MP4 · MOV · WebM · MKV · Plays immediately from local Gallery, Downloads, or File Manager
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Video
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Select Video
              </button>
              <button
                type="button"
                onClick={onLoadSampleProject}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <Play className="w-4 h-4" />
                Try Sample Clip
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 bg-slate-50/70 dark:bg-slate-950/50">
            <div className="flex flex-col md:flex-row gap-5 items-stretch">
              <div className="w-full md:w-64 aspect-video rounded-xl overflow-hidden bg-slate-900 shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-800">
                {selectedVideo.thumbnailDataUrl ? (
                  <img
                    src={selectedVideo.thumbnailDataUrl}
                    alt={`Preview frame of ${selectedVideo.fileName}`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Film className="w-8 h-8" />
                    <span className="text-xs">Video ready</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {selectedVideo.fileName}
                    </h2>
                    <button
                      type="button"
                      onClick={onClearSelectedVideo}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0"
                    >
                      Change Video
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-mono-tabular">
                    <span>{formatFileSize(selectedVideo.fileSize)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Duration {formatClockTime(selectedVideo.duration)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-bengali">{activePair.label}</span>
                  </div>

                  <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    {engineMode === "ai" && aiAvailable
                      ? "Using multilingual AI speech recognition & natural Bengali translation (API quota applies)."
                      : "Browser Free Mode active: capture live speech during playback or import an SRT/VTT file to translate."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onStartTranslation(false)}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    {resumableInfo?.hasCache
                      ? `Open & Resume (${resumableInfo.cachedChunks}/${resumableInfo.totalChunks} cached)`
                      : "Start Translation"}
                  </button>
                  {resumableInfo?.hasCache && (
                    <button
                      type="button"
                      onClick={() => onStartTranslation(true)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium whitespace-nowrap shrink-0 transition-colors"
                    >
                      Re-run Fresh
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => srtInputRef.current?.click()}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Import SRT / VTT
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
          <p>
            Your original video stays on your device and is never uploaded. Only extracted audio chunks are processed for speech recognition and Bengali translation.
          </p>
        </div>
      </section>

      <section
        id="recent-projects"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              Recent Subtitle Projects
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Saved locally in your browser · Video files are never stored on our servers
            </p>
          </div>
        </div>

        {recentProjects.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No saved subtitle projects yet. Select a video or try the sample clip above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {project.title}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onDeleteRecentProject(project.id)}
                      aria-label={`Delete ${project.title}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                    {project.segments.length} subtitles ·{" "}
                    {formatClockTime(project.videoMeta.duration)} ·{" "}
                    {project.sourceLanguageCode.toUpperCase()} → BN
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenRecentProject(project)}
                  className="min-h-[40px] w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors"
                >
                  Open Subtitles
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
