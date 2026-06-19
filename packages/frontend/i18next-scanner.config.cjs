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
      if (
        key.endsWith("_one") &&
        options &&
        typeof options.defaultValue_one === "string"
      ) {
        return options.defaultValue_one;
      }
      if (
        key.endsWith("_other") &&
        options &&
        typeof options.defaultValue_other === "string"
      ) {
        return options.defaultValue_other;
      }
      if (options && typeof options.defaultValue === "string") {
        return options.defaultValue;
      }
      return "";
    },
  },
};
