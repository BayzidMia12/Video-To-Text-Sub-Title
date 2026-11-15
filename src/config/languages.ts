import type { EnglishAccent } from "../types/subtitle";

export interface LanguageDefinition {
  code: string;
  name: string;
  nativeName: string;
  scriptDirection: "ltr" | "rtl";
  bcp47: string;
  enabledAsSource: boolean;
  enabledAsTarget: boolean;
  notes?: string;
}

export interface LanguagePairConfig {
  id: string;
  source: LanguageDefinition;
  target: LanguageDefinition;
  enabled: boolean;
  label: string;
}

export const ENGLISH_ACCENT_OPTIONS: Array<{
  id: EnglishAccent;
  label: string;
  bcp47: string;
  promptLabel: string;
}> = [
  { id: "us", label: "US English", bcp47: "en-US", promptLabel: "US English" },
  { id: "uk", label: "UK English", bcp47: "en-GB", promptLabel: "UK English" },
  {
    id: "au",
    label: "Australian English",
    bcp47: "en-AU",
    promptLabel: "Australian English (en-AU)",
  },
];

export const LANGUAGES: Record<string, LanguageDefinition> = {
  auto: {
    code: "auto",
    name: "Auto Detect",
    nativeName: "Auto",
    scriptDirection: "ltr",
    bcp47: "en-US",
    enabledAsSource: true,
    enabledAsTarget: false,
    notes: "Detects spoken language from audio",
  },
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    scriptDirection: "ltr",
    bcp47: "en-US",
    enabledAsSource: true,
    enabledAsTarget: false,
    notes: "US, UK & Australian accents",
  },
  ko: {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    scriptDirection: "ltr",
    bcp47: "ko-KR",
    enabledAsSource: true,
    enabledAsTarget: false,
  },
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    scriptDirection: "ltr",
    bcp47: "hi-IN",
    enabledAsSource: true,
    enabledAsTarget: false,
    notes: "Default Indian language",
  },
  zh: {
    code: "zh",
    name: "Chinese (Mandarin)",
    nativeName: "中文 (普通话)",
    scriptDirection: "ltr",
    bcp47: "zh-CN",
    enabledAsSource: true,
    enabledAsTarget: false,
    notes: "Simplified & Traditional",
  },
  ta: {
    code: "ta",
    name: "Tamil",
    nativeName: "தமிழ்",
    scriptDirection: "ltr",
    bcp47: "ta-IN",
    enabledAsSource: true,
    enabledAsTarget: false,
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    scriptDirection: "ltr",
    bcp47: "de-DE",
    enabledAsSource: true,
    enabledAsTarget: false,
  },
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    scriptDirection: "rtl",
    bcp47: "ar-SA",
    enabledAsSource: true,
    enabledAsTarget: false,
    notes: "Modern Standard & regional",
  },
  bn: {
    code: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
    scriptDirection: "ltr",
    bcp47: "bn-BD",
    enabledAsSource: false,
    enabledAsTarget: true,
  },
  // Modular future-ready language definitions (Indian & Global expansion)
  te: {
    code: "te",
    name: "Telugu",
    nativeName: "తెలుగు",
    scriptDirection: "ltr",
    bcp47: "te-IN",
    enabledAsSource: false,
    enabledAsTarget: false,
  },
  ur: {
    code: "ur",
    name: "Urdu",
    nativeName: "اردو",
    scriptDirection: "rtl",
    bcp47: "ur-PK",
    enabledAsSource: false,
    enabledAsTarget: false,
  },
  pa: {
    code: "pa",
    name: "Punjabi",
    nativeName: "ਪੰਜਾਬੀ",
    scriptDirection: "ltr",
    bcp47: "pa-IN",
    enabledAsSource: false,
    enabledAsTarget: false,
  },
  mr: {
    code: "mr",
    name: "Marathi",
    nativeName: "मराठी",
    scriptDirection: "ltr",
    bcp47: "mr-IN",
    enabledAsSource: false,
    enabledAsTarget: false,
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    scriptDirection: "ltr",
    bcp47: "ja-JP",
    enabledAsSource: true,
    enabledAsTarget: false,
    notes: "Kanji, Hiragana & Katakana",
  },
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    scriptDirection: "ltr",
    bcp47: "es-ES",
    enabledAsSource: false,
    enabledAsTarget: false,
  },
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    scriptDirection: "ltr",
    bcp47: "fr-FR",
    enabledAsSource: false,
    enabledAsTarget: false,
  },
};

export const LANGUAGE_PAIRS: LanguagePairConfig[] = [
  {
    id: "auto-bn",
    source: LANGUAGES.auto,
    target: LANGUAGES.bn,
    enabled: true,
    label: "Auto Detect → বাংলা",
  },
  {
    id: "en-bn",
    source: LANGUAGES.en,
    target: LANGUAGES.bn,
    enabled: true,
    label: "English → বাংলা",
  },
  {
    id: "ko-bn",
    source: LANGUAGES.ko,
    target: LANGUAGES.bn,
    enabled: true,
    label: "Korean → বাংলা",
  },
  {
    id: "hi-bn",
    source: LANGUAGES.hi,
    target: LANGUAGES.bn,
    enabled: true,
    label: "Hindi → বাংলা",
  },
  {
    id: "zh-bn",
    source: LANGUAGES.zh,
    target: LANGUAGES.bn,
    enabled: true,
    label: "Chinese → বাংলা",
  },
  {
    id: "ta-bn",
    source: LANGUAGES.ta,
    target: LANGUAGES.bn,
    enabled: true,
    label: "Tamil → বাংলা",
  },
  {
    id: "de-bn",
    source: LANGUAGES.de,
    target: LANGUAGES.bn,
    enabled: true,
    label: "German → বাংলা",
  },
  {
    id: "ar-bn",
    source: LANGUAGES.ar,
    target: LANGUAGES.bn,
    enabled: true,
    label: "Arabic → বাংলা",
  },
  // Upcoming modular languages
  {
    id: "te-bn",
    source: LANGUAGES.te,
    target: LANGUAGES.bn,
    enabled: false,
    label: "Telugu → বাংলা",
  },
  {
    id: "ur-bn",
    source: LANGUAGES.ur,
    target: LANGUAGES.bn,
    enabled: false,
    label: "Urdu → বাংলা",
  },
  {
    id: "pa-bn",
    source: LANGUAGES.pa,
    target: LANGUAGES.bn,
    enabled: false,
    label: "Punjabi → বাংলা",
  },
  {
    id: "mr-bn",
    source: LANGUAGES.mr,
    target: LANGUAGES.bn,
    enabled: false,
    label: "Marathi → বাংলা",
  },
  {
    id: "ja-bn",
    source: LANGUAGES.ja,
    target: LANGUAGES.bn,
    enabled: true,
    label: "Japanese → বাংলা",
  },
  {
    id: "es-bn",
    source: LANGUAGES.es,
    target: LANGUAGES.bn,
    enabled: false,
    label: "Spanish → বাংলা",
  },
  {
    id: "fr-bn",
    source: LANGUAGES.fr,
    target: LANGUAGES.bn,
    enabled: false,
    label: "French → বাংলা",
  },
];

export const ACTIVE_LANGUAGE_PAIRS = LANGUAGE_PAIRS.filter((p) => p.enabled);

export const DEFAULT_LANGUAGE_PAIR =
  LANGUAGE_PAIRS.find((p) => p.id === "en-bn") ?? LANGUAGE_PAIRS[0];

export function getLanguagePairById(id: string): LanguagePairConfig {
  return (
    LANGUAGE_PAIRS.find((pair) => pair.id === id && pair.enabled) ??
    DEFAULT_LANGUAGE_PAIR
  );
}

export function getLanguagePairBySourceCode(code: string): LanguagePairConfig {
  const normalized = code.toLowerCase().split("-")[0];
  return (
    LANGUAGE_PAIRS.find(
      (pair) => pair.enabled && pair.source.code === normalized
    ) ?? DEFAULT_LANGUAGE_PAIR
  );
}

export function resolveEffectiveSourceBcp47(
  pair: LanguagePairConfig,
  englishAccent: EnglishAccent
): string {
  if (pair.source.code === "en") {
    return (
      ENGLISH_ACCENT_OPTIONS.find((a) => a.id === englishAccent)?.bcp47 ??
      "en-US"
    );
  }
  return pair.source.bcp47;
}
