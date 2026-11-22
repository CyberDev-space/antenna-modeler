import { useEffect, useId, useRef } from "react";
import type { Theme } from "../host";
import { type Language, N, t } from "../i18n";
import { Hint } from "./Help";

/** The languages of the page by their own names, which stay the same in either language. */
const LANGUAGES: [Language, string][] = [
  ["uk", N("Українська")],
  ["en", "English"],
];

/** The flag of a language: drawn, because the flags of emoji are letters on Windows. */
function Flag({ language }: { language: Language }) {
  const clip = `flag-${useId().replace(/[^\w-]/g, "")}`;
  if (language === "uk") {
    return (
      <svg className="flag" viewBox="0 0 3 2" aria-hidden="true">
        <rect width="3" height="1" fill="#0057b7" />
        <rect y="1" width="3" height="1" fill="#ffd700" />
      </svg>
    );
  }
  // The Union Flag: the white and red saltires lie off centre, as on the flag itself.
  return (
    <svg className="flag" viewBox="0 0 60 30" aria-hidden="true">
      <defs>
        <clipPath id={`${clip}-a`}>
          <path d="M0,0 v30 h60 v-30 z" />
        </clipPath>
        <clipPath id={`${clip}-b`}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip}-a)`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clip}-b)`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}

/** The choice of the language of the page: a list of flags and names. */
export function LanguageMenu({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  // A click elsewhere or Escape closes the list.
  useEffect(() => {
    const close = (event: Event) => {
      const element = menu.current;
      if (!element?.open) return;
      // Inside a shadow root the window sees the host of the root as the target: the path has the real one.
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !element.contains(event.composedPath()[0] as Node)) element.open = false;
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, []);
  const name = (one: Language): string => LANGUAGES.find(([code]) => code === one)![1];
  return (
    <Hint topic="language">
      <details className="language-menu" ref={menu}>
        <summary aria-label={t("Мова: {language}", { language: name(language) })}>
          <Flag language={language} />
          <span>{name(language)}</span>
        </summary>
        <ul>
          {LANGUAGES.map(([code]) => (
            <li key={code}>
              <button
                type="button"
                className={code === language ? "quiet on" : "quiet"}
                aria-pressed={code === language}
                lang={code}
                onClick={() => {
                  onChange(code);
                  if (menu.current) menu.current.open = false;
                }}
              >
                <Flag language={code} />
                {name(code)}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </Hint>
  );
}

/** The switch between the light and the dark theme. */
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const dark = theme === "dark";
  return (
    <Hint topic="theme">
      <button type="button" className="quiet theme-toggle" aria-pressed={dark} aria-label={t("Темна тема")} onClick={() => onChange(dark ? "light" : "dark")}>
        {dark ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.5" fill="currentColor" />
            <path
              d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" fill="currentColor" />
          </svg>
        )}
      </button>
    </Hint>
  );
}

/** The button that lets the program fill the window over the site around it, and gives the site back. */
export function MaximizeButton({ maximized, onChange }: { maximized: boolean; onChange: (maximized: boolean) => void }) {
  const label = maximized ? t("Вийти з повноекранного режиму") : t("На весь екран");
  return (
    <Hint topic="maximize">
      <button type="button" className="quiet maximize-toggle" aria-pressed={maximized} aria-label={label} title={label} onClick={() => onChange(!maximized)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d={maximized ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Hint>
  );
}
