import { useAuth } from "@contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { FaGithub } from "react-icons/fa";

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
    <footer className="mt-auto border-t border-border bg-card/80 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground sm:flex-row sm:gap-8">
          <span className="font-medium text-foreground">Scroblarr</span>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-primary"
          >
            {t("footer.documentation", { defaultValue: "Documentation" })}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            aria-label={t("footer.githubAria", {
              defaultValue: "GitHub repository",
            })}
          >
            <FaGithub className="h-5 w-5" />
            <span>{t("footer.github", { defaultValue: "GitHub" })}</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
