import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  applyDefaultLngValue,
  extractBalancedObject,
  pluralDefaultsFromSource,
  quotedOption,
} = require("../../i18next-scanner.helpers.cjs") as {
  applyDefaultLngValue: (
    parser: {
      options: {
        defaultLng: string;
        defaultNs: string;
        keySeparator: string;
      };
      resScan: Record<string, Record<string, Record<string, string>>>;
    },
    key: string,
    callOptions: {
      ns?: string;
      defaultValue_one?: string;
      defaultValue_other?: string;
    }
  ) => void;
  extractBalancedObject: (source: string, openIndex: number) => string;
  pluralDefaultsFromSource: (
    content: string,
    key: string,
    ns: string,
    defaultNs?: string
  ) => { defaultValue_one?: string; defaultValue_other?: string };
  quotedOption: (body: string, name: string) => string | undefined;
};

describe("i18next-scanner helpers", () => {
  it("extracts option objects without treating braces inside quotes as delimiters", () => {
    const source = `t("item", { defaultValue_one: "Hello {name}", extra: 1 })`;
    const openIndex = source.indexOf("{");
    expect(extractBalancedObject(source, openIndex)).toBe(
      `{ defaultValue_one: "Hello {name}", extra: 1 }`
    );
  });

  it("reads single-quoted values and JavaScript hexadecimal escapes", () => {
    const body = `{ ns: 'other', defaultValue_one: 'It\\x27s {{count}}' }`;
    expect(quotedOption(body, "ns")).toBe("other");
    expect(quotedOption(body, "defaultValue_one")).toBe("It's {{count}}");
  });

  it("keeps plural defaults for identical keys in separate namespaces", () => {
    const content = `
      t("greeting", { ns: "alpha", defaultValue_one: "A one", defaultValue_other: "A other" });
      t("greeting", { ns: "beta", defaultValue_one: "B one", defaultValue_other: "B other" });
    `;

    expect(pluralDefaultsFromSource(content, "greeting", "alpha")).toEqual({
      defaultValue_one: "A one",
      defaultValue_other: "A other",
    });
    expect(pluralDefaultsFromSource(content, "greeting", "beta")).toEqual({
      defaultValue_one: "B one",
      defaultValue_other: "B other",
    });
  });

  it("applies plural defaults to the call's namespace", () => {
    const parser = {
      options: {
        defaultLng: "en",
        defaultNs: "translation",
        keySeparator: ".",
      },
      resScan: {
        en: {
          translation: {},
          other: {},
        },
      },
    };

    applyDefaultLngValue(parser, "greeting", {
      ns: "translation",
      defaultValue_one: "Hello",
      defaultValue_other: "Hellos",
    });
    applyDefaultLngValue(parser, "greeting", {
      ns: "other",
      defaultValue_one: "Hi",
      defaultValue_other: "His",
    });

    expect(parser.resScan.en.translation).toEqual({
      greeting_one: "Hello",
      greeting_other: "Hellos",
    });
    expect(parser.resScan.en.other).toEqual({
      greeting_one: "Hi",
      greeting_other: "His",
    });
  });
});
