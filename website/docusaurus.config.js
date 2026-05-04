// @ts-check

const { themes } = require("prism-react-renderer");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Scroblarr",
  tagline: "Media scrobbling service for Plex and Jellyfin",
  favicon: "img/favicon.png",

  url: "https://0xsysr3ll.github.io",
  baseUrl: process.env.BASE_URL || "/",

  organizationName: "0xsysr3ll",
  projectName: "scroblarr",
  trailingSlash: false,

  onBrokenLinks: "throw",

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.ts"),
          docItemComponent: "@theme/ApiItem",
          editUrl: "https://github.com/0xsysr3ll/scroblarr/tree/main/",
          routeBasePath: "/docs",
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          breadcrumbs: true,
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  plugins: [
    [
      "docusaurus-plugin-openapi-docs",
      {
        id: "openapi",
        docsPluginId: "default",
        config: {
          scroblarr: {
            specPath: "../packages/backend/openapi.yaml",
            outputDir: "docs/api",
            sidebarOptions: {
              groupPathsBy: "tag",
              categoryLinkSource: "tag",
            },
          },
        },
      },
    ],
  ],

  themes: ["docusaurus-theme-openapi-docs"],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "Scroblarr",
        logo: {
          alt: "Scroblarr Logo",
          src: "img/logo-icon.svg",
          width: 32,
          height: 32,
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "tutorialSidebar",
            position: "left",
            label: "Documentation",
          },
          {
            type: "doc",
            docId: "api/scroblarr-api",
            position: "left",
            label: "API",
          },
          {
            href: "https://github.com/0xsysr3ll/scroblarr",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "light",
        links: [],
        copyright: `© ${new Date().getFullYear()} Scroblarr · Plex, Jellyfin, Trakt, TVTime, and related marks are trademarks of their respective owners. This project is independent and is not sponsored, endorsed, or affiliated with those services.`,
        logo: {
          alt: "Scroblarr",
          src: "img/logo-icon.svg",
          href: "/",
          width: 24,
          height: 24,
        },
      },
      prism: {
        theme: themes.github,
        darkTheme: themes.dracula,
        additionalLanguages: ["bash", "json", "yaml", "typescript", "nginx"],
      },
      colorMode: {
        defaultMode: "light",
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
    }),
};

module.exports = config;
