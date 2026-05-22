import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

import generatedApiSidebar from "./docs/api/sidebar";

const sidebars: SidebarsConfig = {
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
  apiSidebar: generatedApiSidebar,
};

export default sidebars;
