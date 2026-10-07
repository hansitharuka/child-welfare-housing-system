/**
 * UI-1: every screen string comes from the message files (messages/si.json, ta.json and en.json, UI-9).
 * This check fails when a component contains visible text or a text attribute written directly in the code.
 * That the three files match is checked by src/i18n/messages.test.ts.
 *
 * Usage: npm run check:strings
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOTS = ["src/app", "src/components"];
// shadcn/ui primitives are third-party code; our own components must not pass text to them either.
const SKIP_DIRS = new Set(["src/components/ui"]);
const TEXT_ATTRIBUTES = new Set(["placeholder", "title", "alt", "aria-label", "aria-description", "label"]);
// Letters of any script: Latin, Sinhala or Tamil.
const HAS_LETTERS = /\p{L}/u;

function listTsx(dir: string): string[] {
  if (SKIP_DIRS.has(dir.replaceAll("\\", "/"))) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsx(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

type Problem = { file: string; line: number; text: string };

function check(file: string): Problem[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems: Problem[] = [];
  const report = (node: ts.Node, text: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    problems.push({ file: relative(process.cwd(), file), line: line + 1, text: text.trim() });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && HAS_LETTERS.test(node.text)) report(node, node.text);
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(source);
      if (TEXT_ATTRIBUTES.has(name) && HAS_LETTERS.test(node.initializer.text))
        report(node, `${name}="${node.initializer.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

const problems = ROOTS.flatMap(listTsx).flatMap(check);

if (problems.length > 0) {
  console.error("Screen text must come from the message files in messages/ (UI-1). Found text written in the code:");
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.text}`);
  process.exit(1);
}
console.log("No hard-coded screen text found.");
