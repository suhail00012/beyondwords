import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { t as translate } from "./i18n";

const I18nContext = createContext({ lang: "en", t: (k) => k, setLang: () => {} });

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("dm_lang") || "en");
  useEffect(() => {
    localStorage.setItem("dm_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback((k) => translate(k, lang), [lang]);
  const toggle = useCallback(() => setLang((l) => (l === "en" ? "hi" : "en")), []);
  return (
    <I18nContext.Provider value={{ lang, t, setLang, toggle }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
