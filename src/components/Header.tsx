import React from "react";

export type AppSectionNav = "studio" | "recent" | "languages" | "privacy";

interface HeaderProps {
  onNavigate: (section: AppSectionNav) => void;
  onTriggerUpload: () => void;
  activeNav: AppSectionNav;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigate,
  onTriggerUpload,
  activeNav,
}) => {
  const navItems: Array<{ id: AppSectionNav; label: string }> = [
    { id: "studio", label: "Studio" },
    { id: "recent", label: "Recent" },
    { id: "languages", label: "Languages" },
    { id: "privacy", label: "Privacy" },
  ];

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate("studio")}
          className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded-md"
        >
          Video Bangla Translator
        </button>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`py-2 whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 dark:hover:text-slate-100 border-b-2 ${
                activeNav === item.id
                  ? "border-teal-600 text-slate-900 dark:text-slate-100"
                  : "border-transparent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onTriggerUpload}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 active:scale-[0.99] text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            Upload English Video
          </button>
        </div>
      </div>
    </header>
  );
};
