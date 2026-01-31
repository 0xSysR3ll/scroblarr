// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      collapsed: false,
      items: [
        "installation",
        {
          type: "category",
          label: "Configuration",
          collapsed: false,
          items: [
            "configuration",
            "configuration/plex",
            "configuration/jellyfin",
            "configuration/trakt",
            "configuration/tvtime",
          ],
        },
      ],
    },
    "how-it-works",
    "architecture",
    "troubleshooting",
  ],
};

module.exports = sidebars;
