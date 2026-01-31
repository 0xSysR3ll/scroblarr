const path = require("node:path");

const configDir = __dirname;

/** @type {import('i18next-scanner').Config} */
module.exports = {
  input: [path.resolve(configDir, "src/**/*.{ts,tsx}")],
  output: path.resolve(configDir, "src/i18n/locales"),
  options: {
    debug: false,
    removeUnusedKeys: false,
    sort: false,
    func: {
      list: ["t"],
      extensions: [".ts", ".tsx"],
    },
    lngs: ["en"],
    defaultLng: "en",
    ns: ["translation"],
    defaultNs: "translation",
    resource: {
      loadPath: path.resolve(configDir, "src/i18n/locales/{{lng}}.json"),
      savePath: "{{lng}}.json",
      jsonIndent: 2,
    },
    keySeparator: ".",
    nsSeparator: ":",
    interpolation: {
      prefix: "{{",
      suffix: "}}",
    },
    defaultValue: (lng, ns, key, options) => {
      if (options && typeof options.defaultValue === "string") {
        return options.defaultValue;
      }
      return "";
    },
  },
};


