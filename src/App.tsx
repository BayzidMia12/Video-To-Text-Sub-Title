import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Globe,
  Moon,
  ShieldCheck,
  Sliders,
  Sparkles,
  Subtitles,
  Sun,
  Upload,
} from "lucide-react";
import { ExportPanel } from "./components/ExportPanel";
import { Header, type AppSectionNav } from "./components/Header";
import { LanguagesPanel } from "./components/LanguagesPanel";
import { SubtitleEditor } from "./components/SubtitleEditor";
import {
  MobileBottomSheet,
  UnifiedSettingsPanel,
  type SettingsCategoryId,
} from "./components/UnifiedSettingsPanel";
import { UploadScreen } from "./components/UploadScreen";
import {
  VideoPlayer,
  type VideoPlayerHandle,
} from "./components/VideoPlayer";
import {
  ACTIVE_LANGUAGE_PAIRS,
  ENGLISH_ACCENT_OPTIONS,
  getLanguagePairById,
  getLanguagePairBySourceCode,
  resolveEffectiveSourceBcp47,
} from "./config/languages";
import { buildVideoCacheKey } from "./services/cacheService";
import {
  deleteSavedProject,
  loadLanguagePreference,
  loadPlayerSettings,
  loadSavedProjects,
  loadSubtitleSettings,
  loadThemePreference,
  saveLanguagePreference,
  savePlayerSettings,
  saveProjectLocally,
  saveSubtitleSettings,
  saveThemePreference,
} from "./services/storageService";
import {
  checkServerHealth,
  hasResumableCacheForFile,
  isWebSpeechSupported,
  parseSubtitleFile,
  processVideoStreamingPipeline,
  SAMPLE_SUBTITLE_SEGMENTS,
  translateSubtitleSegments,
  translateTextFreeFallback,
} from "./services/translationService";
import type {
  DetectedLanguageInfo,
  EnglishAccent,
  PlayerSettings,
  ProcessingErrorStage,
  ProcessingStatusState,
  SubtitleSegment,
  SubtitleSettings,
  SubtitleTrackPosition,
  TranslationEngineMode,
  TranslationProject,
  VideoAspectFitMode,
  VideoMetadata,
} from "./types/subtitle";
import {
  createInstantLocalVideoMeta,
  generateLocalSampleVideo,
  inspectVideoFile,
} from "./utils/audioExtractor";
import { computeAutoFixedPositions } from "./utils/subtitlePosition";
import { resyncSubtitleSegments } from "./utils/subtitleSync";

type StudioTab = "subtitles" | "settings" | "export";
type MobileSheetType = "settings" | "subtitles" | "export" | null;

const INITIAL_PROCESSING_STATUS: ProcessingStatusState = {
  stage: "idle",
  progress: 0,
  message: "",
  extractProgress: 0,
  speechProgress: 0,
  translateProgress: 0,
  syncProgress: 0,
  processedSeconds: 0,
  totalSeconds: 0,
  completedChunks: 0,
  totalChunks: 0,
  completedSegmentsCount: 0,
  retryCount: 0,
  failedRequests: 0,
  activeConcurrency: 1,
};

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function App() {
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const videoUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const currentTimeRef = useRef(0);
  const playerRef = useRef<VideoPlayerHandle>(null);

  const initialLangPref = useMemo(() => loadLanguagePreference(), []);
  const [selectedPairId, setSelectedPairId] = useState<string>(
    initialLangPref.pairId
  );
  const [englishAccent, setEnglishAccent] = useState<EnglishAccent>(
    initialLangPref.englishAccent
  );
  const [detectedLanguage, setDetectedLanguage] = useState<
    DetectedLanguageInfo | undefined
  >(undefined);

  const [theme, setTheme] = useState<"light" | "dark">(() =>
    loadThemePreference()
  );
  const [activeNav, setActiveNav] = useState<AppSectionNav>("studio");
  const [studioTab, setStudioTab] = useState<StudioTab>("subtitles");
  const [mobileSheet, setMobileSheet] = useState<MobileSheetType>(null);
  const [settingsCategory, setSettingsCategory] =
    useState<SettingsCategoryId>("processing");

  const [engineMode, setEngineMode] = useState<TranslationEngineMode>("ai");
  const [aiAvailable, setAiAvailable] = useState<boolean>(true);

  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(() =>
    loadSubtitleSettings()
  );
  const [playerSettings, setPlayerSettings] = useState<PlayerSettings>(() =>
    loadPlayerSettings()
  );
  const [recentProjects, setRecentProjects] = useState<TranslationProject[]>(() =>
    loadSavedProjects()
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedVideoMeta, setSelectedVideoMeta] =
    useState<VideoMetadata | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<TranslationProject | null>(
    null
  );

  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [seekRequestTime, setSeekRequestTime] = useState<number | null>(null);

  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [processingStatus, setProcessingStatus] = useState<ProcessingStatusState>(
    INITIAL_PROCESSING_STATUS
  );
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [isLiveListening, setIsLiveListening] = useState(false);
  const [savedConfirmation, setSavedConfirmation] = useState(false);
  const [subtitleOverlapDetected, setSubtitleOverlapDetected] = useState(false);

  const webSpeechSupported = useMemo(() => isWebSpeechSupported(), []);

  const activePair = useMemo(
    () => getLanguagePairById(selectedPairId),
    [selectedPairId]
  );

  const effectiveSourcePair = useMemo(() => {
    if (activePair.source.code === "auto" && detectedLanguage?.code) {
      return getLanguagePairBySourceCode(detectedLanguage.code);
    }
    return activePair;
  }, [activePair, detectedLanguage]);

  const activeSourceLabel =
    activePair.source.code === "auto"
      ? detectedLanguage?.name ?? "Auto Detect"
      : activePair.source.name;

  const activeVideoCacheKey = useMemo(() => {
    if (!selectedFile) return null;
    const cachePairKey =
      activePair.source.code === "en"
        ? `${activePair.id}-${englishAccent}`
        : activePair.id;
    return buildVideoCacheKey(selectedFile, cachePairKey);
  }, [selectedFile, activePair.id, activePair.source.code, englishAccent]);

  const resumableInfo = useMemo(() => {
    if (!selectedFile) return undefined;
    return hasResumableCacheForFile(selectedFile, selectedPairId, englishAccent);
  }, [selectedFile, selectedPairId, englishAccent]);

  useEffect(() => {
    saveLanguagePreference(selectedPairId, englishAccent);
  }, [selectedPairId, englishAccent]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    saveThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    saveSubtitleSettings(subtitleSettings);
  }, [subtitleSettings]);

  useEffect(() => {
    savePlayerSettings(playerSettings);
  }, [playerSettings]);

  useEffect(() => {
    let mounted = true;
    checkServerHealth().then(({ aiAvailable: available }) => {
      if (!mounted) return;
      setAiAvailable(available);
      if (!available) {
        setEngineMode("browser");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const replaceVideoObjectUrl = useCallback((nextUrl: string | null) => {
    if (videoUrlRef.current && videoUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(videoUrlRef.current);
    }
    videoUrlRef.current = nextUrl;
    setVideoUrl(nextUrl);
  }, []);

  const stopLiveSpeech = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsLiveListening(false);
  }, []);

  const openSettingsOverlay = useCallback(
    (category: SettingsCategoryId = "processing") => {
      setSettingsCategory(category);
      if (playerSettings.pauseWhenSettingsOpen) {
        playerRef.current?.pause();
      }
      const isCompact =
        typeof window !== "undefined" &&
        (window.innerWidth < 1024 || isFullscreen);
      if (isCompact) {
        setMobileSheet("settings");
      } else {
        setStudioTab("settings");
      }
    },
    [isFullscreen, playerSettings.pauseWhenSettingsOpen]
  );

  const runTranslationForFile = useCallback(
    async (
      file: File,
      meta: VideoMetadata,
      forceFresh = false,
      overridePairId?: string,
      overrideAccent?: EnglishAccent
    ) => {
      const targetPair = getLanguagePairById(overridePairId ?? selectedPairId);
      const targetAccent = overrideAccent ?? englishAccent;
      const useAi = engineMode === "ai" && aiAvailable;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const initialProject: TranslationProject = {
        id: meta.id,
        title: file.name.replace(/\.[^.]+$/, ""),
        sourceLanguageCode: targetPair.source.code,
        targetLanguageCode: "bn",
        videoMeta: meta,
        segments: activeProject?.id === meta.id ? activeProject.segments : [],
        updatedAt: new Date().toISOString(),
      };

      setActiveProject(initialProject);
      setActiveNav("studio");
      setStudioTab("subtitles");
      setAlertMessage(null);
      if (playerSettings.autoOpenProcessingDetail) {
        setPlayerSettings((prev) =>
          prev.showProcessingDetailPanel
            ? prev
            : { ...prev, showProcessingDetailPanel: true }
        );
      }

      if (!useAi) {
        setProcessingStatus({
          ...INITIAL_PROCESSING_STATUS,
          stage: "ready",
          progress: 100,
          extractProgress: 100,
          speechProgress: 100,
          translateProgress: 100,
          syncProgress: 100,
          syncLabel: "Complete",
          message: "Ready for Browser Free Mode",
          detail:
            "Use Live Capture or Import SRT/VTT while playing the video",
        });
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setProcessingStatus({
        ...INITIAL_PROCESSING_STATUS,
        stage: "preparing",
        progress: 2,
        message: "Preparing streaming pipeline...",
        detail: "Checking local cache & opening audio worker",
        totalSeconds: meta.duration,
      });

      try {
        const result = await processVideoStreamingPipeline({
          file,
          durationHint: meta.duration,
          languagePair: targetPair,
          englishAccent: targetAccent,
          processingQuality: playerSettings.processingQuality,
          autoRetry: playerSettings.autoRetry,
          forceFresh,
          signal: controller.signal,
          onDetectedLanguage: (lang) => {
            setDetectedLanguage(lang);
            setActiveProject((prev) =>
              prev ? { ...prev, detectedLanguage: lang } : prev
            );
          },
          onProgress: (state) => {
            setProcessingStatus(state);
          },
          onSegmentsUpdate: (liveSegments) => {
            setActiveProject((prev) =>
              prev
                ? {
                    ...prev,
                    segments: liveSegments,
                    updatedAt: new Date().toISOString(),
                  }
                : prev
            );
          },
        });

        const completedProject: TranslationProject = {
          ...initialProject,
          detectedLanguage: result.detectedLanguage,
          videoMeta: {
            ...meta,
            duration: result.totalDuration || meta.duration,
          },
          segments: result.segments,
          updatedAt: new Date().toISOString(),
        };

        setActiveProject(completedProject);
        if (result.detectedLanguage) {
          setDetectedLanguage(result.detectedLanguage);
        }
        const updatedList = saveProjectLocally(completedProject);
        setRecentProjects(updatedList);
      } catch (err) {
        const e = err as Error & {
          code?: string;
          errorStage?: ProcessingErrorStage;
        };
        if (e.code === "ABORTED" || controller.signal.aborted) {
          setProcessingStatus((prev) => ({
            ...prev,
            stage: "paused",
            message: "Processing paused",
            detail: "Completed chunks are cached locally for instant resume.",
            canResume: true,
          }));
          return;
        }

        const msg =
          e.message ||
          "Could not complete speech recognition. You can resume cached progress or edit subtitles manually.";
        setAlertMessage(msg);
        setProcessingStatus((prev) => ({
          ...prev,
          stage: "error",
          message:
            e.code === "RATE_LIMIT"
              ? "Free-tier rate limit reached"
              : e.errorStage === "extraction"
              ? "Audio extraction failed"
              : e.errorStage === "translation"
              ? "Translation failed on a chunk"
              : "Processing paused with partial results",
          detail: msg,
          canResume: true,
          errorStage: e.errorStage,
          errorCode: (e.code as ProcessingStatusState["errorCode"]) ?? "UNKNOWN",
        }));
      }
    },
    [
      activeProject,
      aiAvailable,
      englishAccent,
      engineMode,
      playerSettings.autoOpenProcessingDetail,
      playerSettings.autoRetry,
      playerSettings.processingQuality,
      selectedPairId,
    ]
  );

  const handleSelectVideoFile = useCallback(
    async (file: File) => {
      setAlertMessage(null);
      stopLiveSpeech();

      try {
        const instant = createInstantLocalVideoMeta(file);
        replaceVideoObjectUrl(instant.objectUrl);
        setSelectedFile(file);
        setSelectedVideoMeta(instant.videoMeta);
        setDetectedLanguage(undefined);
        setActiveNav("studio");
        setStudioTab("subtitles");
        setMobileSheet(null);

        const initialProj: TranslationProject = {
          id: instant.videoMeta.id,
          title: file.name.replace(/\.[^.]+$/, ""),
          sourceLanguageCode: activePair.source.code,
          targetLanguageCode: "bn",
          videoMeta: instant.videoMeta,
          segments: [],
          updatedAt: new Date().toISOString(),
        };
        setActiveProject(initialProj);
        setProcessingStatus(INITIAL_PROCESSING_STATUS);

        inspectVideoFile(file)
          .then(({ videoMeta: richMeta, objectUrl: tempInspectUrl }) => {
            if (tempInspectUrl && tempInspectUrl !== instant.objectUrl) {
              URL.revokeObjectURL(tempInspectUrl);
            }
            setSelectedVideoMeta(richMeta);
            setActiveProject((prev) =>
              prev && prev.id === instant.videoMeta.id
                ? { ...prev, videoMeta: richMeta }
                : prev
            );
          })
          .catch(() => {
            // Non-blocking: player already has instant objectUrl
          });

        if (
          playerSettings.autoStartProcessing &&
          engineMode === "ai" &&
          aiAvailable
        ) {
          void runTranslationForFile(file, instant.videoMeta, false);
        }
      } catch (err) {
        setAlertMessage(
          err instanceof Error ? err.message : "Could not read the video."
        );
      }
    },
    [
      activePair.source.code,
      aiAvailable,
      engineMode,
      playerSettings.autoStartProcessing,
      replaceVideoObjectUrl,
      runTranslationForFile,
      stopLiveSpeech,
    ]
  );

  const handleStartTranslation = useCallback(
    async (forceFresh = false) => {
      if (!selectedFile || !selectedVideoMeta) return;
      await runTranslationForFile(selectedFile, selectedVideoMeta, forceFresh);
    },
    [runTranslationForFile, selectedFile, selectedVideoMeta]
  );

  const handlePauseProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleResumeProcessing = () => {
    if (selectedFile && selectedVideoMeta) {
      void runTranslationForFile(selectedFile, selectedVideoMeta, false);
    }
  };

  const handleReprocessFresh = () => {
    if (selectedFile && selectedVideoMeta) {
      void runTranslationForFile(selectedFile, selectedVideoMeta, true);
    }
  };

  const handleToggleProcessingDetail = () => {
    setPlayerSettings((prev) => ({
      ...prev,
      showProcessingDetailPanel: !prev.showProcessingDetailPanel,
    }));
  };

  const handleRetrySync = () => {
    if (!activeProject || activeProject.segments.length === 0) return;
    try {
      const report = resyncSubtitleSegments(
        activeProject.segments,
        activeProject.videoMeta.duration
      );
      setActiveProject((prev) =>
        prev
          ? {
              ...prev,
              segments: report.segments,
              updatedAt: new Date().toISOString(),
            }
          : prev
      );
      setProcessingStatus((prev) => ({
        ...prev,
        syncProgress: 100,
        syncLabel: "Complete",
        message: "Subtitles re-synchronized",
        detail: `${report.segments.length} segments aligned (${report.overlapsFixed} overlaps fixed)`,
      }));
    } catch {
      setAlertMessage("Could not synchronize subtitles.");
      setProcessingStatus((prev) => ({
        ...prev,
        stage: "error",
        errorStage: "sync",
        message: "Subtitle synchronization failed",
      }));
    }
  };

  const handleLoadSampleProject = async () => {
    setAlertMessage(null);
    stopLiveSpeech();
    setSelectedPairId("en-bn");
    try {
      const sampleFile = await generateLocalSampleVideo();
      const { videoMeta, objectUrl } = await inspectVideoFile(sampleFile);
      replaceVideoObjectUrl(objectUrl);
      setSelectedFile(sampleFile);
      setSelectedVideoMeta(videoMeta);
      setDetectedLanguage({ code: "en", name: "English", nativeName: "English" });

      const sampleProject: TranslationProject = {
        id: `sample-${Date.now()}`,
        title: "Sample English Lesson (বাংলা Subtitles)",
        sourceLanguageCode: "en",
        targetLanguageCode: "bn",
        videoMeta,
        segments: SAMPLE_SUBTITLE_SEGMENTS,
        updatedAt: new Date().toISOString(),
        isSample: true,
      };
      setActiveProject(sampleProject);
      setActiveNav("studio");
      setStudioTab("subtitles");
      setProcessingStatus({
        ...INITIAL_PROCESSING_STATUS,
        stage: "ready",
        progress: 100,
        extractProgress: 100,
        speechProgress: 100,
        translateProgress: 100,
        syncProgress: 100,
        syncLabel: "Complete",
        message: "Sample clip loaded",
        detail: `${SAMPLE_SUBTITLE_SEGMENTS.length} sample bilingual subtitles ready`,
      });
    } catch {
      const fallbackProject: TranslationProject = {
        id: `sample-${Date.now()}`,
        title: "Sample English Lesson (বাংলা Subtitles)",
        sourceLanguageCode: "en",
        targetLanguageCode: "bn",
        videoMeta: {
          id: "sample-video",
          fileName: "sample_english_lesson.webm",
          fileSize: 0,
          duration: 12,
          mimeType: "video/webm",
          thumbnailDataUrl: null,
        },
        segments: SAMPLE_SUBTITLE_SEGMENTS,
        updatedAt: new Date().toISOString(),
        isSample: true,
      };
      setActiveProject(fallbackProject);
      setActiveNav("studio");
      setStudioTab("subtitles");
    }
  };

  const handleImportSubtitleFile = async (file: File) => {
    setAlertMessage(null);
    try {
      const raw = await file.text();
      const parsed = parseSubtitleFile(raw);
      if (parsed.length === 0) {
        setAlertMessage("No valid SRT or VTT subtitle timings were found in that file.");
        return;
      }

      const missingTarget = parsed.some((seg) => !seg.targetText.trim());
      const finalSegments = missingTarget
        ? await translateSubtitleSegments(
            parsed,
            activePair,
            engineMode === "ai" && aiAvailable ? "ai" : "browser"
          )
        : parsed;

      if (activeProject) {
        const updated: TranslationProject = {
          ...activeProject,
          segments: finalSegments,
          updatedAt: new Date().toISOString(),
        };
        setActiveProject(updated);
        setRecentProjects(saveProjectLocally(updated));
        setActiveNav("studio");
        setStudioTab("subtitles");
      } else {
        const importedMeta: VideoMetadata = selectedVideoMeta ?? {
          id: `imp-${Date.now()}`,
          fileName: file.name.replace(/\.[^.]+$/, ".mp4"),
          fileSize: file.size,
          duration: finalSegments[finalSegments.length - 1]?.endTime ?? 60,
          mimeType: "video/mp4",
          thumbnailDataUrl: null,
        };
        const importedProject: TranslationProject = {
          id: importedMeta.id,
          title: file.name.replace(/\.[^.]+$/, ""),
          sourceLanguageCode: activePair.source.code,
          targetLanguageCode: "bn",
          videoMeta: importedMeta,
          segments: finalSegments,
          updatedAt: new Date().toISOString(),
        };
        setActiveProject(importedProject);
        setRecentProjects(saveProjectLocally(importedProject));
        setActiveNav("studio");
        setStudioTab("subtitles");
      }
    } catch {
      setAlertMessage("Could not parse the selected subtitle file.");
    }
  };

  const handleOpenRecentProject = (project: TranslationProject) => {
    stopLiveSpeech();
    setAlertMessage(null);
    replaceVideoObjectUrl(null);
    setSelectedFile(null);
    setSelectedVideoMeta(null);
    if (project.sourceLanguageCode) {
      const matched = getLanguagePairBySourceCode(project.sourceLanguageCode);
      setSelectedPairId(
        project.sourceLanguageCode === "auto" ? "auto-bn" : matched.id
      );
    }
    setDetectedLanguage(project.detectedLanguage);
    setActiveProject(project);
    setActiveNav("studio");
    setStudioTab("subtitles");
    setProcessingStatus({
      ...INITIAL_PROCESSING_STATUS,
      stage: "ready",
      progress: 100,
      extractProgress: 100,
      speechProgress: 100,
      translateProgress: 100,
      syncProgress: 100,
      syncLabel: "Complete",
      message: "Project loaded from local history",
      detail: `${project.segments.length} saved subtitles`,
    });
  };

  const handleDeleteRecentProject = (projectId: string) => {
    setRecentProjects(deleteSavedProject(projectId));
  };

  const handleUpdateSegment = (updated: SubtitleSegment) => {
    setActiveProject((prev) => {
      if (!prev) return prev;
      const nextSegments = prev.segments
        .map((seg) => (seg.id === updated.id ? updated : seg))
        .sort((a, b) => a.startTime - b.startTime);
      return {
        ...prev,
        segments: nextSegments,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleDeleteSegment = (id: string) => {
    setActiveProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        segments: prev.segments.filter((s) => s.id !== id),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleAddSegment = () => {
    setActiveProject((prev) => {
      if (!prev) return prev;
      const t = Number(currentTimeRef.current.toFixed(1));
      const newSeg: SubtitleSegment = {
        id: `seg-manual-${Date.now()}`,
        startTime: t,
        endTime: Number((t + 3).toFixed(1)),
        sourceText: `New ${activeSourceLabel} line`,
        targetText: "নতুন বাংলা সাবটাইটেল",
      };
      return {
        ...prev,
        segments: [...prev.segments, newSeg].sort(
          (a, b) => a.startTime - b.startTime
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleRetranslateSegment = async (segment: SubtitleSegment) => {
    setIsRetranslating(true);
    try {
      const [translated] = await translateSubtitleSegments(
        [segment],
        effectiveSourcePair,
        engineMode === "ai" && aiAvailable ? "ai" : "browser"
      );
      if (translated) {
        handleUpdateSegment(translated);
      }
    } finally {
      setIsRetranslating(false);
    }
  };

  const handleRetranslateAll = async () => {
    if (!activeProject || activeProject.segments.length === 0) return;
    setIsRetranslating(true);
    try {
      const updatedSegments = await translateSubtitleSegments(
        activeProject.segments,
        effectiveSourcePair,
        engineMode === "ai" && aiAvailable ? "ai" : "browser"
      );
      setActiveProject((prev) =>
        prev
          ? {
              ...prev,
              segments: updatedSegments,
              updatedAt: new Date().toISOString(),
            }
          : prev
      );
    } catch {
      setAlertMessage("Could not re-translate all lines right now.");
      setProcessingStatus((prev) => ({
        ...prev,
        stage: "error",
        errorStage: "translation",
        message: "Translation retry failed",
      }));
    } finally {
      setIsRetranslating(false);
    }
  };

  const handleToggleLiveSpeech = () => {
    if (isLiveListening) {
      stopLiveSpeech();
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRec) {
      setAlertMessage("Browser speech capture is not supported in this browser.");
      return;
    }

    const rec = new SpeechRec();
    rec.lang = resolveEffectiveSourceBcp47(effectiveSourcePair, englishAccent);
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = async (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (!res.isFinal) continue;
        const spokenText = res[0]?.transcript?.trim();
        if (!spokenText) continue;

        const nowTime = Number(currentTimeRef.current.toFixed(1));
        const bnText = await translateTextFreeFallback(
          spokenText,
          effectiveSourcePair.source.code
        );
        const seg: SubtitleSegment = {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          startTime: Math.max(0, Number((nowTime - 2.5).toFixed(1))),
          endTime: Number(Math.max(nowTime + 0.5, nowTime).toFixed(1)),
          sourceText: spokenText,
          targetText: bnText,
        };

        setActiveProject((prev) =>
          prev
            ? {
                ...prev,
                segments: [...prev.segments, seg].sort(
                  (a, b) => a.startTime - b.startTime
                ),
                updatedAt: new Date().toISOString(),
              }
            : prev
        );
      }
    };

    rec.onerror = () => {
      setIsLiveListening(false);
    };

    rec.onend = () => {
      setIsLiveListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setIsLiveListening(true);
  };

  const handleSaveLocally = () => {
    if (!activeProject) return;
    const list = saveProjectLocally(activeProject);
    setRecentProjects(list);
    setSavedConfirmation(true);
    window.setTimeout(() => setSavedConfirmation(false), 2500);
  };

  const handleSelectPair = useCallback(
    (nextPairId: string) => {
      setSelectedPairId(nextPairId);
      setDetectedLanguage(undefined);
      const nextPair = getLanguagePairById(nextPairId);
      setActiveProject((prev) =>
        prev
          ? {
              ...prev,
              sourceLanguageCode: nextPair.source.code,
              detectedLanguage: undefined,
            }
          : prev
      );
      if (selectedFile && selectedVideoMeta && activeProject) {
        void runTranslationForFile(
          selectedFile,
          selectedVideoMeta,
          true,
          nextPairId,
          englishAccent
        );
      }
    },
    [
      activeProject,
      englishAccent,
      runTranslationForFile,
      selectedFile,
      selectedVideoMeta,
    ]
  );

  const handleUpdateSubtitlePosition = useCallback(
    (track: "source" | "target", nextPos: SubtitleTrackPosition) => {
      setSubtitleSettings((prev) => ({
        ...prev,
        [track === "source" ? "sourcePosition" : "targetPosition"]: nextPos,
      }));
    },
    []
  );

  const handleAutoFixOverlap = useCallback(() => {
    setSubtitleSettings((prev) => {
      const fixed = computeAutoFixedPositions(
        prev.sourcePosition,
        prev.targetPosition
      );
      return {
        ...prev,
        sourcePosition: fixed.sourcePosition,
        targetPosition: fixed.targetPosition,
      };
    });
  }, []);

  const handleToggleSubtitlesQuick = useCallback(() => {
    setSubtitleSettings((prev) => {
      const anyOn = prev.showSource || prev.showTarget;
      return {
        ...prev,
        showSource: !anyOn,
        showTarget: !anyOn,
      };
    });
  }, []);

  const handleChangeZoom = useCallback(
    (scale: number, aspectMode?: VideoAspectFitMode) => {
      setPlayerSettings((prev) => ({
        ...prev,
        zoomScale: scale,
        aspectFitMode: aspectMode ?? prev.aspectFitMode,
      }));
    },
    []
  );

  const handleVideoDurationChange = useCallback((dur: number) => {
    if (!Number.isFinite(dur) || dur <= 0) return;
    setSelectedVideoMeta((prev) =>
      prev && prev.duration <= 0 ? { ...prev, duration: dur } : prev
    );
    setActiveProject((prev) =>
      prev && prev.videoMeta.duration <= 0
        ? { ...prev, videoMeta: { ...prev.videoMeta, duration: dur } }
        : prev
    );
  }, []);

  const handleNavChange = (section: AppSectionNav) => {
    setActiveNav(section);
    if (section === "recent" && !activeProject) {
      window.setTimeout(() => {
        document
          .getElementById("recent-projects")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 60);
    }
  };

  const isRunningProcessing =
    processingStatus.stage !== "idle" &&
    processingStatus.stage !== "ready" &&
    processingStatus.stage !== "paused" &&
    processingStatus.stage !== "error";

  const handleRetryActiveErrorStage = () => {
    if (processingStatus.errorStage === "translation") {
      void handleRetranslateAll();
    } else if (processingStatus.errorStage === "sync") {
      handleRetrySync();
    } else {
      handleResumeProcessing();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <input
        ref={globalFileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleSelectVideoFile(file);
          e.target.value = "";
        }}
      />

      <Header
        activeNav={activeNav}
        onNavigate={handleNavChange}
        onTriggerUpload={() => globalFileInputRef.current?.click()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* Compact studio status & language control strip */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <select
                aria-label="Source language"
                value={selectedPairId}
                onChange={(e) => handleSelectPair(e.target.value)}
                className="bg-transparent font-medium text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                {ACTIVE_LANGUAGE_PAIRS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {(selectedPairId === "en-bn" || selectedPairId === "auto-bn") && (
              <select
                aria-label="English accent"
                value={englishAccent}
                onChange={(e) =>
                  setEnglishAccent(e.target.value as EnglishAccent)
                }
                className="min-h-[34px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {ENGLISH_ACCENT_OPTIONS.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label.replace(" English", "")}
                  </option>
                ))}
              </select>
            )}

            {detectedLanguage && (
              <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
                Detected: {detectedLanguage.name}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex md:hidden items-center gap-1 p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-xs">
              {(["studio", "languages", "privacy"] as AppSectionNav[]).map(
                (nav) => (
                  <button
                    key={nav}
                    type="button"
                    onClick={() => setActiveNav(nav)}
                    className={`px-2.5 py-1 rounded-lg font-medium capitalize ${
                      activeNav === nav
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {nav}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-xs">
              <button
                type="button"
                disabled={!aiAvailable}
                onClick={() => setEngineMode("ai")}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                  engineMode === "ai" && aiAvailable
                    ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 disabled:opacity-40"
                }`}
              >
                AI Engine
              </button>
              <button
                type="button"
                onClick={() => setEngineMode("browser")}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                  engineMode === "browser" || !aiAvailable
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                Browser Free Mode
              </button>
            </div>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {alertMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{alertMessage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedFile && (
                <button
                  type="button"
                  onClick={handleRetryActiveErrorStage}
                  className="text-xs font-semibold underline text-teal-800 dark:text-teal-300"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setAlertMessage(null)}
                className="text-xs font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {activeNav === "languages" ? (
          <LanguagesPanel
            selectedPairId={selectedPairId}
            englishAccent={englishAccent}
            onSelectPair={handleSelectPair}
            onSelectEnglishAccent={setEnglishAccent}
            onOpenStudio={() => setActiveNav("studio")}
          />
        ) : activeNav === "privacy" ? (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 max-w-3xl">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Local-First Privacy Architecture
              </h2>
            </div>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                Your selected video file plays directly inside your browser using a local Object URL. Video frames are never uploaded to external servers.
              </p>
              <p>
                When AI translation is active, a Web Worker extracts only compressed audio chunks without decoding video frames and sends them over HTTPS for speech recognition and Bengali translation.
              </p>
              <p>
                Your subtitle projects, player preferences, and chunk resume caches are stored exclusively in your device&apos;s local browser storage and can be cleared anytime inside Settings → Processing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav("studio")}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
            >
              Back to Studio
            </button>
          </section>
        ) : !activeProject || activeNav === "recent" ? (
          <UploadScreen
            selectedVideo={selectedVideoMeta}
            recentProjects={recentProjects}
            engineMode={engineMode}
            aiAvailable={aiAvailable}
            selectedPairId={selectedPairId}
            englishAccent={englishAccent}
            resumableInfo={resumableInfo}
            onSelectPair={handleSelectPair}
            onSelectEnglishAccent={setEnglishAccent}
            onSelectVideoFile={handleSelectVideoFile}
            onStartTranslation={handleStartTranslation}
            onLoadSampleProject={handleLoadSampleProject}
            onOpenRecentProject={handleOpenRecentProject}
            onDeleteRecentProject={handleDeleteRecentProject}
            onImportSubtitleFile={handleImportSubtitleFile}
            onClearSelectedVideo={() => {
              replaceVideoObjectUrl(null);
              setSelectedFile(null);
              setSelectedVideoMeta(null);
            }}
          />
        ) : (
          <div className="space-y-4">
            {/* Compact Studio Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    stopLiveSpeech();
                    setActiveProject(null);
                    setProcessingStatus(INITIAL_PROCESSING_STATUS);
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  All Videos
                </button>
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {activeProject.title}
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedFile && !isRunningProcessing && (
                  <button
                    type="button"
                    onClick={() => void handleStartTranslation(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {activeProject.segments.length > 0
                      ? "Re-run Translation"
                      : "Generate Subtitles"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => globalFileInputRef.current?.click()}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Replace Video
                </button>
              </div>
            </div>

            {/* Studio Grid: Video Player + Tabbed Workbench */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-7 space-y-3">
                <VideoPlayer
                  ref={playerRef}
                  videoUrl={videoUrl}
                  videoTitle={activeProject.title}
                  segments={activeProject.segments}
                  settings={subtitleSettings}
                  playerSettings={playerSettings}
                  processingStatus={processingStatus}
                  sourceLanguageCode={effectiveSourcePair.source.code}
                  sourceLanguageLabel={activeSourceLabel}
                  sourceDirection={effectiveSourcePair.source.scriptDirection}
                  playbackRate={playbackRate}
                  volume={volume}
                  isMuted={isMuted}
                  onChangePlaybackRate={setPlaybackRate}
                  onChangeVolume={(v) => {
                    setVolume(v);
                    if (v > 0 && isMuted) setIsMuted(false);
                  }}
                  onToggleMute={() => {
                    if (isMuted || volume === 0) {
                      setIsMuted(false);
                      if (volume === 0) setVolume(0.8);
                    } else {
                      setIsMuted(true);
                    }
                  }}
                  onChangeZoom={handleChangeZoom}
                  onToggleSubtitles={handleToggleSubtitlesQuick}
                  onTimeUpdate={(t) => {
                    currentTimeRef.current = t;
                  }}
                  onActiveSegmentChange={setActiveSegmentId}
                  onDurationChange={handleVideoDurationChange}
                  onPlayStateChange={setIsVideoPlaying}
                  onFullscreenChange={setIsFullscreen}
                  seekRequestTime={seekRequestTime}
                  onSeekHandled={() => setSeekRequestTime(null)}
                  onUpdateSubtitlePosition={handleUpdateSubtitlePosition}
                  onAutoFixOverlap={handleAutoFixOverlap}
                  onOverlapChange={setSubtitleOverlapDetected}
                  onPauseProcessing={handlePauseProcessing}
                  onResumeProcessing={handleResumeProcessing}
                  onRetryProcessing={handleRetryActiveErrorStage}
                  onToggleProcessingDetail={handleToggleProcessingDetail}
                  onOpenSettings={() => openSettingsOverlay("processing")}
                  onOpenMobileSubtitles={() => setMobileSheet("subtitles")}
                  onOpenMobileExport={() => setMobileSheet("export")}
                  onBackHome={() => {
                    stopLiveSpeech();
                    setActiveProject(null);
                    setProcessingStatus(INITIAL_PROCESSING_STATUS);
                  }}
                  settingsOpen={
                    mobileSheet !== null || studioTab === "settings"
                  }
                  overlaySlot={
                    <MobileBottomSheet
                      open={mobileSheet !== null}
                      title={
                        mobileSheet === "settings"
                          ? "Studio Settings"
                          : mobileSheet === "export"
                          ? "Export Subtitles"
                          : `Subtitles (${activeProject.segments.length})`
                      }
                      subtitle={activeProject.title}
                      isVideoPlaying={isVideoPlaying}
                      onToggleVideoPlay={() => playerRef.current?.togglePlay()}
                      onClose={() => setMobileSheet(null)}
                    >
                      {mobileSheet === "settings" && (
                        <UnifiedSettingsPanel
                          initialCategory={settingsCategory}
                          playerSettings={playerSettings}
                          subtitleSettings={subtitleSettings}
                          selectedPairId={selectedPairId}
                          englishAccent={englishAccent}
                          detectedLanguage={
                            detectedLanguage ?? activeProject.detectedLanguage
                          }
                          sourceLanguageLabel={activeSourceLabel}
                          engineMode={engineMode}
                          aiAvailable={aiAvailable}
                          playbackRate={playbackRate}
                          volume={volume}
                          isMuted={isMuted}
                          isFullscreen={isFullscreen}
                          processingStatus={processingStatus}
                          activeVideoName={activeProject.videoMeta.fileName}
                          activeVideoCacheKey={activeVideoCacheKey}
                          hasActiveVideo={Boolean(
                            selectedFile && selectedVideoMeta
                          )}
                          hasSegments={activeProject.segments.length > 0}
                          overlapDetected={subtitleOverlapDetected}
                          onChangePlayerSettings={setPlayerSettings}
                          onChangeSubtitleSettings={setSubtitleSettings}
                          onSelectPair={handleSelectPair}
                          onSelectEnglishAccent={setEnglishAccent}
                          onReprocessWithLanguage={handleReprocessFresh}
                          onChangeEngineMode={setEngineMode}
                          onChangePlaybackRate={setPlaybackRate}
                          onChangeVolume={(v) => {
                            setVolume(v);
                            if (v > 0 && isMuted) setIsMuted(false);
                          }}
                          onToggleMute={() => {
                            if (isMuted || volume === 0) {
                              setIsMuted(false);
                              if (volume === 0) setVolume(0.8);
                            } else {
                              setIsMuted(true);
                            }
                          }}
                          onToggleFullscreen={() =>
                            playerRef.current?.toggleFullscreen()
                          }
                          onPauseProcessing={handlePauseProcessing}
                          onResumeProcessing={handleResumeProcessing}
                          onReprocessFresh={handleReprocessFresh}
                          onRetryTranslation={() => void handleRetranslateAll()}
                          onRetrySync={handleRetrySync}
                        />
                      )}

                      {mobileSheet === "subtitles" && (
                        <SubtitleEditor
                          segments={activeProject.segments}
                          activeSegmentId={activeSegmentId}
                          sourceLanguageLabel={activeSourceLabel}
                          sourceDirection={
                            effectiveSourcePair.source.scriptDirection
                          }
                          isRetranslating={isRetranslating}
                          isLiveListening={isLiveListening}
                          webSpeechSupported={webSpeechSupported}
                          onSeekTo={(t) => {
                            setSeekRequestTime(t);
                            setMobileSheet(null);
                          }}
                          onUpdateSegment={handleUpdateSegment}
                          onDeleteSegment={handleDeleteSegment}
                          onAddSegment={handleAddSegment}
                          onRetranslateSegment={handleRetranslateSegment}
                          onRetranslateAll={handleRetranslateAll}
                          onToggleLiveSpeech={handleToggleLiveSpeech}
                        />
                      )}

                      {mobileSheet === "export" && (
                        <ExportPanel
                          project={activeProject}
                          videoUrl={videoUrl}
                          settings={subtitleSettings}
                          onSaveLocally={handleSaveLocally}
                          savedConfirmation={savedConfirmation}
                        />
                      )}
                    </MobileBottomSheet>
                  }
                />

                {/* Mobile quick action strip directly under cinema player */}
                <div className="grid grid-cols-3 gap-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileSheet("subtitles")}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1.5"
                  >
                    <Subtitles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Lines ({activeProject.segments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettingsOverlay("processing")}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1.5"
                  >
                    <Sliders className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileSheet("export")}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Export
                  </button>
                </div>
              </div>

              {/* Desktop / Tablet Right Studio Workbench */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setStudioTab("subtitles")}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      studioTab === "subtitles"
                        ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    <Subtitles className="w-3.5 h-3.5" />
                    Subtitles ({activeProject.segments.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab("settings")}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      studioTab === "settings"
                        ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Settings
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab("export")}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      studioTab === "export"
                        ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                </div>

                {studioTab === "subtitles" && (
                  <SubtitleEditor
                    segments={activeProject.segments}
                    activeSegmentId={activeSegmentId}
                    sourceLanguageLabel={activeSourceLabel}
                    sourceDirection={effectiveSourcePair.source.scriptDirection}
                    isRetranslating={isRetranslating}
                    isLiveListening={isLiveListening}
                    webSpeechSupported={webSpeechSupported}
                    onSeekTo={(t) => setSeekRequestTime(t)}
                    onUpdateSegment={handleUpdateSegment}
                    onDeleteSegment={handleDeleteSegment}
                    onAddSegment={handleAddSegment}
                    onRetranslateSegment={handleRetranslateSegment}
                    onRetranslateAll={handleRetranslateAll}
                    onToggleLiveSpeech={handleToggleLiveSpeech}
                  />
                )}

                {studioTab === "settings" && (
                  <UnifiedSettingsPanel
                    initialCategory={settingsCategory}
                    playerSettings={playerSettings}
                    subtitleSettings={subtitleSettings}
                    selectedPairId={selectedPairId}
                    englishAccent={englishAccent}
                    detectedLanguage={
                      detectedLanguage ?? activeProject.detectedLanguage
                    }
                    sourceLanguageLabel={activeSourceLabel}
                    engineMode={engineMode}
                    aiAvailable={aiAvailable}
                    playbackRate={playbackRate}
                    volume={volume}
                    isMuted={isMuted}
                    isFullscreen={isFullscreen}
                    processingStatus={processingStatus}
                    activeVideoName={activeProject.videoMeta.fileName}
                    activeVideoCacheKey={activeVideoCacheKey}
                    hasActiveVideo={Boolean(selectedFile && selectedVideoMeta)}
                    hasSegments={activeProject.segments.length > 0}
                    overlapDetected={subtitleOverlapDetected}
                    onChangePlayerSettings={setPlayerSettings}
                    onChangeSubtitleSettings={setSubtitleSettings}
                    onSelectPair={handleSelectPair}
                    onSelectEnglishAccent={setEnglishAccent}
                    onReprocessWithLanguage={handleReprocessFresh}
                    onChangeEngineMode={setEngineMode}
                    onChangePlaybackRate={setPlaybackRate}
                    onChangeVolume={(v) => {
                      setVolume(v);
                      if (v > 0 && isMuted) setIsMuted(false);
                    }}
                    onToggleMute={() => {
                      if (isMuted || volume === 0) {
                        setIsMuted(false);
                        if (volume === 0) setVolume(0.8);
                      } else {
                        setIsMuted(true);
                      }
                    }}
                    onToggleFullscreen={() =>
                      playerRef.current?.toggleFullscreen()
                    }
                    onPauseProcessing={handlePauseProcessing}
                    onResumeProcessing={handleResumeProcessing}
                    onReprocessFresh={handleReprocessFresh}
                    onRetryTranslation={() => void handleRetranslateAll()}
                    onRetrySync={handleRetrySync}
                  />
                )}

                {studioTab === "export" && (
                  <ExportPanel
                    project={activeProject}
                    videoUrl={videoUrl}
                    settings={subtitleSettings}
                    onSaveLocally={handleSaveLocally}
                    savedConfirmation={savedConfirmation}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
