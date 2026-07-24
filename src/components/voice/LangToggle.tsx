"use client";

export type DictationLang = "it-IT" | "en-US";

/**
 * A minimal Italian/English switch. Dictation only ever runs in these two
 * languages; anything else the user says is discarded by the reasoning layer.
 */
export function LangToggle({
  value,
  onChange,
  disabled,
}: {
  value: DictationLang;
  onChange: (lang: DictationLang) => void;
  disabled?: boolean;
}) {
  return (
    <div className="lang-toggle" role="group" aria-label="Lingua della dettatura">
      {(["it-IT", "en-US"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          className="lang-option"
          data-active={value === lang}
          aria-pressed={value === lang}
          disabled={disabled}
          onClick={() => onChange(lang)}
        >
          {lang === "it-IT" ? "IT" : "EN"}
        </button>
      ))}
    </div>
  );
}
