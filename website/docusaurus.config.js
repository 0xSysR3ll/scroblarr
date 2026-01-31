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
  onBrokenMarkdownLinks: "warn",

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
          sidebarPath: require.resolve("./sidebars.js"),
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
            href: "https://github.com/0xsysr3ll/scroblarr",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "light",
        links: [],
        copyright: `© ${new Date().getFullYear()} Scroblarr`,
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
        additionalLanguages: ["bash", "json", "yaml", "typescript"],
      },
      colorMode: {
        defaultMode: "light",
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
    }),
};

module.exports = config;
