const fs = require("node:fs");
const path = require("node:path");

const { get, includes } = require("lodash");

const {
  applyDefaultLngValue,
  pluralDefaultsFromSource,
  resolveDefaultValueFromCall,
} = require("./i18next-scanner.helpers.cjs");

const configDir = __dirname;

/** @type {import('i18next-scanner').Config} */
module.exports = {
  input: [
    path.join(configDir, "src/**/*.{ts,tsx}"),
    "!" + path.join(configDir, "src/**/*.test.{ts,tsx}"),
    "!" + path.join(configDir, "src/**/*.spec.{ts,tsx}"),
  ],
  output: path.resolve(configDir, "src/i18n/locales"),
  options: {
    debug: false,
    removeUnusedKeys: true,
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
      return (
        resolveDefaultValueFromCall(
          { defaultLng: lng, defaultNs: ns, defaultValue: undefined },
          key,
          options ?? {}
        ) ?? ""
      );
    },
  },
  transform(file, enc, done) {
    const parser = this.parser;
    const options = parser.options;
    const content = fs.readFileSync(file.path, enc);
    const extname = path.extname(file.path);

    if (file.path.includes(".test.") || file.path.includes(".spec.")) {
      done();
      return;
    }

    if (includes(get(options, "func.extensions"), extname)) {
      parser.parseFuncFromString(content, (key, callOptions = {}) => {
        const ns = callOptions.ns || options.defaultNs;
        const enriched = {
          ...callOptions,
          ...pluralDefaultsFromSource(content, key, ns, options.defaultNs),
        };
        parser.set(key, enriched);
        applyDefaultLngValue(parser, key, enriched);
      });
    }

    done();
  },
};
