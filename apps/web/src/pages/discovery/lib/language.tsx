import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LanguageCode } from "./types.js";

const STORAGE_KEY = "zeyla_lang";

const labels: Record<LanguageCode, string> = {
  en: "English",
  am: "Amharic",
  om: "Afaan Oromo",
};

interface LanguageContextValue {
  lang: LanguageCode;
  setLang: (code: LanguageCode) => void;
  label: string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLang(): LanguageCode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "am" || stored === "om") return stored;
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(readStoredLang);

  const setLang = useCallback((code: LanguageCode) => {
    localStorage.setItem(STORAGE_KEY, code);
    setLangState(code);
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, label: labels[lang] }),
    [lang, setLang],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export { labels as languageLabels };
