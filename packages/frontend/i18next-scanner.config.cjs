const fs = require("node:fs");
const path = require("node:path");

const { get, includes, set: setPath } = require("lodash");

const configDir = __dirname;

function resolveDefaultValueFromCall(
  fallback,
  key,
  callOptions
) {
  if (
    key.endsWith("_one") &&
    typeof callOptions.defaultValue_one === "string"
  ) {
    return callOptions.defaultValue_one;
  }
  if (
    key.endsWith("_other") &&
    typeof callOptions.defaultValue_other === "string"
  ) {
    return callOptions.defaultValue_other;
  }
  if (typeof callOptions.defaultValue === "string") {
    return callOptions.defaultValue;
  }
  if (typeof fallback.defaultValue === "function") {
    return fallback.defaultValue(
      fallback.defaultLng,
      callOptions.ns || fallback.defaultNs,
      key,
      callOptions
    );
  }
  return undefined;
}

function applyDefaultLngValue(parser, key, callOptions) {
  const options = parser.options;
  const lng = options.defaultLng;
  const ns = callOptions.ns || options.defaultNs;
  const scanRoot = parser.resScan[lng]?.[ns];
  if (!scanRoot) {
    return;
  }

  const keySeparator = options.keySeparator;
  const keyParts = keySeparator ? key.split(keySeparator) : [key];

  const assign = (leafSuffix, value) => {
    if (typeof value !== "string" || value.length === 0) {
      return;
    }

    const pathParts = [...keyParts];
    pathParts[pathParts.length - 1] += leafSuffix;
    setPath(scanRoot, pathParts, value);
  };

  if (typeof callOptions.defaultValue_one === "string") {
    assign("_one", callOptions.defaultValue_one);
  }
  if (typeof callOptions.defaultValue_other === "string") {
    assign("_other", callOptions.defaultValue_other);
  }

  const defaultValue = resolveDefaultValueFromCall(
    {
      defaultLng: options.defaultLng,
      defaultNs: options.defaultNs,
      defaultValue: options.defaultValue,
    },
    key,
    callOptions
  );
  if (typeof defaultValue === "string" && defaultValue.length > 0) {
    assign("", defaultValue);
  }
}

/** @type {import('i18next-scanner').Config} */
module.exports = {
  input: [path.resolve(configDir, "src/**/*.{ts,tsx}")],
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

    if (includes(get(options, "func.extensions"), extname)) {
      parser.parseFuncFromString(content, (key, callOptions = {}) => {
        parser.set(key, callOptions);
        applyDefaultLngValue(parser, key, callOptions);
      });
    }

    done();
  },
};
