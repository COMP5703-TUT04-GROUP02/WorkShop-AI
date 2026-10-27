const fs = require("node:fs");
const path = require("node:path");
const ts = require("../frontend/mobile/node_modules/typescript");

const root = path.join(__dirname, "..", "frontend", "mobile", "src");
const translationFile = path.join(root, "i18n", "translations.ts");
const translationSource = ts.createSourceFile(translationFile, fs.readFileSync(translationFile, "utf8"), ts.ScriptTarget.Latest, true);
const translated = new Set();
function collectKeys(node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) translated.add(node.name.text);
  ts.forEachChild(node, collectKeys);
}
collectKeys(translationSource);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : entry.name.endsWith(".tsx") ? [full] : [];
  });
}
const missing = new Map();
for (const file of files(root)) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "T" && node.children.length === 1 && ts.isJsxText(node.children[0])) {
      const text = node.children[0].getText(ast).trim().replace(/\s+/g, " ");
      if (text && !["Workshop AI", "×", "·"].includes(text) && !translated.has(text)) {
        if (!missing.has(text)) missing.set(text, []);
        missing.get(text).push(path.relative(root, file));
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const argument = node.expression.text === "translateText" ? node.arguments[1] : node.expression.text === "t" ? node.arguments[0] : undefined;
      if (argument && ts.isStringLiteral(argument) && !translated.has(argument.text) && argument.text !== "Workshop AI") {
        if (!missing.has(argument.text)) missing.set(argument.text, []);
        missing.get(argument.text).push(path.relative(root, file));
      }
      if (/^set\w*(?:Error|Message|Notice|Warning|Success|Hint)$/.test(node.expression.text)) {
        const value = node.arguments[0];
        if (value && ts.isStringLiteral(value) && value.text && !translated.has(value.text)) {
          if (!missing.has(value.text)) missing.set(value.text, []);
          missing.get(value.text).push(path.relative(root, file));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
for (const [text, paths] of missing) process.stdout.write(`${text}\t${paths[0]}\n`);
process.stderr.write(`${missing.size} missing static translations\n`);
if (process.argv.includes("--check") && missing.size) process.exitCode = 1;
