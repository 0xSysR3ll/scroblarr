import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
      alwaysFormat: true,
    },
  });

(
  i18n.services.interpolator as unknown as {
    format: (value: unknown, format?: string, lng?: string) => unknown;
  }
).format = (value, _format, lng) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat(lng).format(value);
  }
  return value;
};

export default i18n;
