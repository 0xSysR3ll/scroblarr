import path from "node:path";
import fs from "node:fs";
import { Project, Node } from "ts-morph";

const rootDir = process.cwd();
const frontendDir = path.join(rootDir, "packages/frontend");
const enJsonPath = path.join(frontendDir, "src/i18n/locales/en.json");

function loadEnMessages(): Record<string, unknown> {
  const raw = fs.readFileSync(enJsonPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function setMessageForKey(
  messages: Record<string, unknown>,
  key: string,
  value: string
): void {
  const parts = key.split(".");
  let current: unknown = messages;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      typeof current === "object" &&
      current !== null &&
      part in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[part];
    } else {
      // Create nested object if it doesn't exist
      if (typeof current === "object" && current !== null) {
        (current as Record<string, unknown>)[part] = {};
        current = (current as Record<string, unknown>)[part];
      }
    }
  }

  const lastPart = parts[parts.length - 1];
  if (typeof current === "object" && current !== null) {
    (current as Record<string, unknown>)[lastPart] = value;
  }
}

function main() {
  const enMessages = loadEnMessages();
  const defaultValueMap = new Map<string, string>();
  let updatedKeys = 0;

  const project = new Project({
    tsConfigFilePath: path.join(frontendDir, "tsconfig.json"),
    skipAddingFilesFromTsConfig: false,
  });

  project.addSourceFilesAtPaths(path.join(frontendDir, "src/**/*.{ts,tsx}"));

  // First pass: collect all defaultValue from code
  for (const sourceFile of project.getSourceFiles()) {
    sourceFile.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;

      const expression = node.getExpression();
      if (!Node.isIdentifier(expression)) return;
      if (expression.getText() !== "t") return;

      const args = node.getArguments();
      if (args.length < 2) return;

      const keyArg = args[0];
      if (!Node.isStringLiteral(keyArg)) return;

      const key = keyArg.getLiteralText();
      const optionsArg = args[1];

      if (!Node.isObjectLiteralExpression(optionsArg)) return;

      // Find defaultValue in options
      const defaultValueProp = optionsArg.getProperties().find((prop) => {
        if (
          Node.isPropertyAssignment(prop) ||
          Node.isShorthandPropertyAssignment(prop)
        ) {
          return prop.getName() === "defaultValue";
        }
        return false;
      });

      if (!defaultValueProp) return;

      let defaultValue: string | undefined;

      if (Node.isPropertyAssignment(defaultValueProp)) {
        const initializer = defaultValueProp.getInitializer();
        if (Node.isStringLiteral(initializer)) {
          defaultValue = initializer.getLiteralText();
        }
      }

      if (defaultValue) {
        // Store the last encountered defaultValue for each key
        defaultValueMap.set(key, defaultValue);
      }
    });
  }

  // Second pass: update en.json with defaultValue from code
  for (const [key, defaultValue] of defaultValueMap.entries()) {
    setMessageForKey(enMessages, key, defaultValue);
    updatedKeys += 1;
  }

  // Write updated JSON back to file
  fs.writeFileSync(
    enJsonPath,
    JSON.stringify(enMessages, null, 2) + "\n",
    "utf8"
  );

  // eslint-disable-next-line no-console
  console.log(
    `update-i18n-from-defaults: updated ${updatedKeys} keys in en.json from code defaultValue.`
  );
}

if (require.main === module) {
  main();
}
