const { set: setPath } = require("lodash");

function resolveDefaultValueFromCall(fallback, key, callOptions) {
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

function decodeJsEscapes(inner) {
  let out = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) {
      break;
    }
    if (next === "x") {
      const hex = inner.slice(i + 2, i + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    if (next === "u") {
      if (inner[i + 2] === "{") {
        const end = inner.indexOf("}", i + 3);
        const hex = end === -1 ? "" : inner.slice(i + 3, end);
        if (/^[0-9a-fA-F]+$/.test(hex)) {
          out += String.fromCodePoint(parseInt(hex, 16));
          i = end;
          continue;
        }
      } else {
        const hex = inner.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
          continue;
        }
      }
    }
    const simple = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      v: "\v",
      0: "\0",
    };
    out += Object.prototype.hasOwnProperty.call(simple, next)
      ? simple[next]
      : next;
    i += 1;
  }
  return out;
}

function readStringLiteral(source, start) {
  const quote = source[start];
  let i = start + 1;
  let inner = "";
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      inner += ch;
      if (i + 1 < source.length) {
        inner += source[i + 1];
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === quote) {
      return { value: decodeJsEscapes(inner), end: i + 1 };
    }
    inner += ch;
    i += 1;
  }
  return { value: decodeJsEscapes(inner), end: i };
}

function extractBalancedObject(source, openIndex) {
  if (source[openIndex] !== "{") {
    return "";
  }
  let i = openIndex;
  let depth = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, i + 1);
      }
    }
    i += 1;
  }
  return "";
}

function skipObjectValue(source, start, end) {
  let i = start;
  let depth = 0;
  let quote = null;
  while (i < end) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      if (depth === 0) {
        return i;
      }
      depth -= 1;
      i += 1;
      continue;
    }
    if (ch === "," && depth === 0) {
      return i;
    }
    i += 1;
  }
  return i;
}

function parseObjectStringLiterals(body) {
  const result = {};
  if (!body.startsWith("{")) {
    return result;
  }
  const end = body.length - 1;
  let i = 1;

  const skipWs = () => {
    while (i < end && /\s/.test(body[i])) {
      i += 1;
    }
  };

  while (i < end) {
    skipWs();
    if (i >= end || body[i] === ",") {
      i += 1;
      continue;
    }

    let key;
    if (body[i] === '"' || body[i] === "'") {
      const literal = readStringLiteral(body, i);
      key = literal.value;
      i = literal.end;
    } else {
      const match = body.slice(i, end).match(/^[A-Za-z_$][\w$]*/);
      if (!match) {
        break;
      }
      key = match[0];
      i += key.length;
    }

    skipWs();
    if (body[i] !== ":") {
      continue;
    }
    i += 1;
    skipWs();

    if (body[i] === '"' || body[i] === "'") {
      const literal = readStringLiteral(body, i);
      result[key] = literal.value;
      i = literal.end;
      continue;
    }

    i = skipObjectValue(body, i, end);
  }

  return result;
}

function quotedOption(body, name) {
  const value = parseObjectStringLiterals(body)[name];
  return typeof value === "string" ? value : undefined;
}

function pluralDefaultsFromSource(content, key, ns, defaultNs = ns) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const callRe = new RegExp(
    String.raw`t\(\s*["']${escapedKey}["']\s*,\s*\{`,
    "g"
  );
  const result = {};
  let match = callRe.exec(content);
  while (match) {
    const body = extractBalancedObject(
      content,
      match.index + match[0].length - 1
    );
    const callNs = quotedOption(body, "ns") || defaultNs;
    if (callNs === ns) {
      const defaultValueOne = quotedOption(body, "defaultValue_one");
      const defaultValueOther = quotedOption(body, "defaultValue_other");
      if (typeof defaultValueOne === "string") {
        result.defaultValue_one = defaultValueOne;
      }
      if (typeof defaultValueOther === "string") {
        result.defaultValue_other = defaultValueOther;
      }
    }
    match = callRe.exec(content);
  }
  return result;
}

module.exports = {
  applyDefaultLngValue,
  extractBalancedObject,
  pluralDefaultsFromSource,
  quotedOption,
  resolveDefaultValueFromCall,
};
