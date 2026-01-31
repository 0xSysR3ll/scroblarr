import { useTranslation } from "react-i18next";
import { FaGithub } from "react-icons/fa";
import { useAuth } from "@contexts/AuthContext";

const DOCS_URL =
  (import.meta as { env?: { VITE_DOCS_URL?: string } }).env?.VITE_DOCS_URL ||
  "https://0xsysr3ll.github.io/scroblarr/docs";

const GITHUB_URL =
  (import.meta as { env?: { VITE_GITHUB_URL?: string } }).env
    ?.VITE_GITHUB_URL || "https://github.com/0xsysr3ll/scroblarr";

export function Footer() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-[#2d2d2d] bg-white dark:bg-[#121212]">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-gray-500 dark:text-slate-400">
          <span className="font-medium text-gray-700 dark:text-slate-300">
            Scroblarr
          </span>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {t("footer.documentation", { defaultValue: "Documentation" })}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label={t("footer.githubAria", {
              defaultValue: "GitHub repository",
            })}
          >
            <FaGithub className="w-5 h-5" />
            <span>{t("footer.github", { defaultValue: "GitHub" })}</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
