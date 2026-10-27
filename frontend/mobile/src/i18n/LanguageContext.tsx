import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { setApiLanguage } from "../api/client";
import { DEFAULT_LANGUAGE, isAppLanguage, localeFor, setCurrentLanguage, type AppLanguage } from "./language";
import { translateText } from "./translations";

const LANGUAGE_KEY = "workshop_ai_language";

type LanguageContextValue = {
  language: AppLanguage;
  locale: string;
  setLanguage: (nextLanguage: AppLanguage) => Promise<void>;
  t: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((stored) => {
        if (mounted && isAppLanguage(stored)) setLanguageState(stored);
      })
      .catch(() => {
        // Storage can be unavailable in private browser sessions; keep English usable.
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setApiLanguage(language);
    setCurrentLanguage(language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: localeFor(language),
    setLanguage: async (nextLanguage) => {
      setLanguageState(nextLanguage);
      setApiLanguage(nextLanguage);
      setCurrentLanguage(nextLanguage);
      try {
        await AsyncStorage.setItem(LANGUAGE_KEY, nextLanguage);
      } catch {
        // The current session still follows the selected language.
      }
    },
    t: (text) => translateText(language, text),
  }), [language]);

  // Wait for the saved choice so screens never flash in the wrong language.
  return ready ? <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider> : null;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
