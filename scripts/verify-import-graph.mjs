#!/usr/bin/env node

/**
 * Holds the source tree's dependency direction (`docs/ARCHITECTURE-FROM-SCRATCH.md`
 * §§5, 21.5 and 22.3) over the whole import graph, relative paths, dynamic
 * imports and worker URLs included. ESLint sees one import at a time; this
 * check sees the graph, so it also rejects cycles and a rule module that
 * reaches a procedure through a neighbour.
 *
 * Usage: node scripts/verify-import-graph.mjs [--list]
 * Set JASWA_IMPORT_GRAPH_ROOT to an app directory to check an isolated source
 * tree without changing the repository being checked.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import ts from 'typescript';

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), '..');
const appRoot = resolve(process.env.JASWA_IMPORT_GRAPH_ROOT ?? join(repositoryRoot, 'app'));
const rootPrefix = 'app/';
const toGraphPath = (file) => rootPrefix + relative(appRoot, file).split('\\').join('/');
const fromGraphPath = (file) => join(appRoot, file.slice(rootPrefix.length));

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(appRoot)
  .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file) && !/\.d\.ts$/.test(file))
  .map(toGraphPath);
const known = new Set(walk(appRoot).map(toGraphPath));
const candidates = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs',
];

function resolveSpecifier(from, specifier, line) {
  if (!specifier.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier.replace(/\?.*$/, '')));
  if (isTest(from) && /^tests\/fixtures\/[^/]+\.json$/.test(base)
    && existsSync(resolve(repositoryRoot, base))) return base;
  for (const extension of candidates) if (known.has(base + extension)) return base + extension;
  throw new Error(`${from}:${line}: cannot resolve ${specifier}`);
}


const rootEntries = new Set(['app/main.tsx']);
const isTest = (file) => /\.test\.(ts|tsx|js|jsx|mjs)$/.test(file);
const isStringSpecifier = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
const isReactPackage = (specifier) => specifier === 'react' || specifier.startsWith('react/')
  || specifier === 'react-dom' || specifier.startsWith('react-dom/');

/** Every module a file depends on, with whether the dependency exists only for types. */
function dependencies(file) {
  const text = readFileSync(fromGraphPath(file), 'utf8');
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX
    : file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : /\.(js|jsx|mjs)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
  const found = [];
  const problems = [];
  const add = (specifier, typeOnly, node) => {
    const line = lineOf(source, node);
    const target = resolveSpecifier(file, specifier, line);
    if (target) found.push({ target, typeOnly });
    else if (!isTest(file) && (layerOf(file) === 'domain' || layerOf(file) === 'ingest')) {
      problems.push(`${file}:${line}: ${layerOf(file)} may not import package '${specifier}'`);
    } else if (!isTest(file) && layerOf(file) === 'workspace' && isReactPackage(specifier)) {
      problems.push(`${file}:${line}: workspace may not import package '${specifier}'`);
    }
  };
  const nonLiteralImport = (node) => {
    problems.push(`${file}:${lineOf(source, node)}: dynamic import specifier must be a string literal`);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly = Boolean(clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings
        && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      add(node.moduleSpecifier.text, typeOnly, node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, node.isTypeOnly, node);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) add(argument.text, false, node);
      else nonLiteralImport(node);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      /* `import x = require(...)` is CommonJS interop this ESM project never
         uses; refusing the form outright leaves one import syntax to check. */
      problems.push(`${file}:${lineOf(source, node)}: import = require(...) is not allowed`);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node.argument.literal.text, true, node);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL'
      && node.arguments?.[0] && isStringSpecifier(node.arguments[0]) && node.arguments[1]?.getText(source) === 'import.meta.url') {
      add(node.arguments[0].text, false, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { edges: found, problems };
}

/** `app/<layer>/...`; only explicitly named root entries count as the shell. */
function layerOf(file) {
  const parts = file.split('/');
  if (parts.length === 2) return rootEntries.has(file) ? 'shell' : null;
  return parts[1];
}

const allowed = {
  domain: ['domain', 'data'],
  ingest: ['ingest', 'domain', 'data'],
  workspace: ['workspace', 'domain', 'ingest', 'data'],
  platform: ['platform', 'domain', 'ingest', 'workspace', 'data'],
  ui: ['ui', 'domain', 'data', 'styles'],
  /* A feature reaches the platform only through workspace ports the shell wires (§22.3). */
  features: ['features', 'ui', 'workspace', 'domain', 'data', 'styles'],
  shell: ['shell', 'features', 'ui', 'workspace', 'domain', 'ingest', 'platform', 'data', 'styles'],
  data: ['data'],
  styles: ['styles'],
};

/* Procedures compose rules; a rule never reaches back into a procedure. */
const procedures = ['app/domain/runes/cleanup/', 'app/domain/runes/craft-advice/', 'app/domain/runes/optimization/', 'app/domain/runes/simulator/'];
const procedureOf = (file) => procedures.find((prefix) => file.startsWith(prefix));
const featureOf = (file) => file.startsWith('app/features/') ? file.split('/')[2] : null;

const problems = [];
const graph = new Map();
for (const file of sources) {
  const layer = layerOf(file);
  if (!layer) problems.push(`${file}: root app file is not classified; add it to rootEntries only if it is a genuine entry`);
  const result = dependencies(file);
  graph.set(file, result.edges);
  problems.push(...result.problems);
}
for (const [file, edges] of graph) {
  if (isTest(file)) continue;
  const layer = layerOf(file);
  const permitted = allowed[layer];
  if (!permitted) {
    if (layer !== null) problems.push(`${file}: unknown layer '${layer}'`);
    continue;
  }
  for (const { target } of edges) {
    const targetLayer = layerOf(target);
    if (!targetLayer) problems.push(`${file} → ${target}: target is an unclassified root app file`);
    else if (!permitted.includes(targetLayer)) problems.push(`${file} → ${target}: ${layer} may not import ${targetLayer}`);
    const sourceFeature = featureOf(file);
    const targetFeature = featureOf(target);
    const isExactFeaturePublic = /^app\/features\/[^/]+\/public\.ts$/.test(target);
    if (sourceFeature && targetFeature && sourceFeature !== targetFeature && !isExactFeaturePublic) {
      problems.push(`${file} → ${target}: a feature may use another feature only through its public.ts`);
    }
    const targetProcedure = procedureOf(target);
    if (layer === 'domain' && targetProcedure && !procedureOf(file)) {
      problems.push(`${file} → ${target}: a domain rule may not depend on a procedure`);
    }
  }
}

/* Tarjan's strongly connected components over value imports: a cycle of types
   alone erases at compile time, but a value cycle depends on evaluation order. */
const index = new Map();
const low = new Map();
const onStack = new Set();
const stack = [];
const cycles = [];
let counter = 0;
function connect(file) {
  index.set(file, counter);
  low.set(file, counter);
  counter += 1;
  stack.push(file);
  onStack.add(file);
  for (const { target, typeOnly } of graph.get(file) ?? []) {
    if (typeOnly || !graph.has(target)) continue;
    if (!index.has(target)) {
      connect(target);
      low.set(file, Math.min(low.get(file), low.get(target)));
    } else if (onStack.has(target)) {
      low.set(file, Math.min(low.get(file), index.get(target)));
    }
  }
  if (low.get(file) === index.get(file)) {
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== file);
    if (component.length > 1) cycles.push(component.sort());
  }
}
for (const file of graph.keys()) if (!index.has(file)) connect(file);
for (const cycle of cycles) problems.push(`import cycle: ${cycle.join(' ↔ ')}`);

if (!existsSync(join(appRoot, 'main.tsx'))) problems.push('app/main.tsx is missing');
if (problems.length) {
  console.error(`Import graph: ${problems.length} problem(s).`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Import graph: ${graph.size} modules, dependency direction and acyclicity hold.`);
