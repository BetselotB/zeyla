import { useLanguage, languageLabels } from "../lib/language.js";
import type { LanguageCode } from "../lib/types.js";

interface LanguageSelectProps {
  onComplete?: () => void;
}

export function LanguageSelect({ onComplete }: LanguageSelectProps) {
  const { setLang } = useLanguage();

  function pick(code: LanguageCode) {
    setLang(code);
    onComplete?.();
  }

  return (
    <div className="z-lang-overlay">
      <div className="z-lang-modal">
        <h2>Choose your language</h2>
        <p>Pick the language you&apos;d like to use for describing your problem.</p>
        <div className="z-lang-buttons">
          {(Object.keys(languageLabels) as LanguageCode[]).map((code) => (
            <button
              key={code}
              type="button"
              className="z-btn z-btn-ghost"
              onClick={() => pick(code)}
            >
              {languageLabels[code]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
