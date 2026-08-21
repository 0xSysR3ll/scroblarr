import i18n, { type FormatFunction } from "i18next";
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

const formatter = i18n.services.formatter;
if (formatter) {
  const originalFormat = formatter.format.bind(formatter);
  formatter.format = ((value, format, lng, options) => {
    const resolvedFormat =
      format ||
      (typeof value === "number" && Number.isFinite(value) ? "number" : format);
    return originalFormat(value, resolvedFormat, lng, options);
  }) as FormatFunction;
  (i18n.services.interpolator as unknown as { format: FormatFunction }).format =
    formatter.format.bind(formatter);
}

export default i18n;
