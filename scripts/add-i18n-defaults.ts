import path from "node:path";
import fs from "node:fs";
import { Project, Node, ts } from "ts-morph";

const rootDir = process.cwd();
const frontendDir = path.join(rootDir, "packages/frontend");
const enJsonPath = path.join(frontendDir, "src/i18n/locales/en.json");

function loadEnMessages(): Record<string, unknown> {
  const raw = fs.readFileSync(enJsonPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function getMessageForKey(
  messages: Record<string, unknown>,
  key: string
): string | undefined {
  const parts = key.split(".");
  let current: unknown = messages;

  for (const part of parts) {
    if (
      typeof current === "object" &&
      current !== null &&
      part in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

function main() {
  const enMessages = loadEnMessages();

  const project = new Project({
    tsConfigFilePath: path.join(frontendDir, "tsconfig.json"),
    skipAddingFilesFromTsConfig: false,
  });

  project.addSourceFilesAtPaths(path.join(frontendDir, "src/**/*.{ts,tsx}"));

  let updatedCalls = 0;
  let updatedFiles = 0;

  for (const sourceFile of project.getSourceFiles()) {
    let fileChanged = false;

    sourceFile.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;

      const expression = node.getExpression();
      if (!Node.isIdentifier(expression)) return;
      if (expression.getText() !== "t") return;

      const args = node.getArguments();
      if (args.length === 0) return;

      const keyArg = args[0];
      if (!Node.isStringLiteral(keyArg)) return;

      const key = keyArg.getLiteralText();
      const defaultText = getMessageForKey(enMessages, key);
      if (!defaultText) return;

      let optionsArg = args[1];

      if (!optionsArg) {
        node.addArgument(`{ defaultValue: ${JSON.stringify(defaultText)} }`);
        updatedCalls += 1;
        fileChanged = true;
        return;
      }

      if (!Node.isObjectLiteralExpression(optionsArg)) return;

      const hasDefaultValue = optionsArg.getProperties().some((prop) => {
        if (
          Node.isPropertyAssignment(prop) ||
          Node.isShorthandPropertyAssignment(prop)
        ) {
          return prop.getName() === "defaultValue";
        }
        return false;
      });

      if (hasDefaultValue) return;

      optionsArg.addPropertyAssignment({
        name: "defaultValue",
        initializer: JSON.stringify(defaultText),
      });

      updatedCalls += 1;
      fileChanged = true;
    });

    if (fileChanged) {
      updatedFiles += 1;
    }
  }

  project.saveSync();

  // eslint-disable-next-line no-console
  console.log(
    `add-i18n-defaults: updated ${updatedCalls} t() calls across ${updatedFiles} files.`
  );
}

if (require.main === module) {
  main();
}
