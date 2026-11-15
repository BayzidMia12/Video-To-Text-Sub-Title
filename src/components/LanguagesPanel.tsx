import React from "react";
import { CheckCircle2, Clock } from "lucide-react";
import {
  ENGLISH_ACCENT_OPTIONS,
  LANGUAGE_PAIRS,
} from "../config/languages";
import type { EnglishAccent } from "../types/subtitle";

interface LanguagesPanelProps {
  selectedPairId: string;
  englishAccent: EnglishAccent;
  onSelectPair: (id: string) => void;
  onSelectEnglishAccent: (accent: EnglishAccent) => void;
  onOpenStudio?: () => void;
}

export const LanguagesPanel: React.FC<LanguagesPanelProps> = ({
  selectedPairId,
  englishAccent,
  onSelectPair,
  onSelectEnglishAccent,
  onOpenStudio,
}) => {
  const activePairs = LANGUAGE_PAIRS.filter((p) => p.enabled);
  const upcomingPairs = LANGUAGE_PAIRS.filter((p) => !p.enabled);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-teal-700 dark:text-teal-400 mb-1">
            Multilingual Speech Recognition & Natural Bengali Translation
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Supported Languages to বাংলা
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Select a spoken source language or Auto Detect. Speech recognition transcribes the original spoken language accurately, and a separate natural Bengali translation pass generates context-aware বাংলা subtitles.
          </p>
        </div>

        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold whitespace-nowrap shrink-0"
          >
            Go to Translator
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Active Source Languages → Target: Bengali (বাংলা)
          </span>
          <span className="font-mono-tabular">
            {activePairs.length} modes enabled
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {activePairs.map((pair) => {
            const isSelected = pair.id === selectedPairId;
            return (
              <button
                key={pair.id}
                type="button"
                onClick={() => onSelectPair(pair.id)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  isSelected
                    ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {pair.label}
                  </span>
                  <CheckCircle2
                    className={`w-4 h-4 shrink-0 ${
                      isSelected
                        ? "text-teal-600 dark:text-teal-400"
                        : "text-slate-300 dark:text-slate-600"
                    }`}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pair.source.nativeName}
                  {pair.source.notes ? ` · ${pair.source.notes}` : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Optional English Accent Preference
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Optimizes speech recognition for US, UK, or Australian English speakers.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ENGLISH_ACCENT_OPTIONS.map((acc) => {
            const active = englishAccent === acc.id;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => onSelectEnglishAccent(acc.id)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "border-teal-600 bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300"
                    : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {acc.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Modular Expansion Queue (Indian & Global)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hindi is active as the default Indian source language; Telugu, Urdu, Punjabi, Marathi, Japanese, Spanish, and French plug into this same pipeline cleanly.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {upcomingPairs.map((pair) => (
            <div
              key={pair.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40 opacity-80"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {pair.source.name}
                </span>
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {pair.source.nativeName} → বাংলা
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
