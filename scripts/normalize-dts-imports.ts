// @file: scripts/normalize-dts-imports.ts
// @spec: INFRA-BASE
// @consumers: N/A
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';
import { logger } from '../shared/common/logger.ts';

/**
 * @purpose Normalize declaration module references, including import types and source-only package aliases, into shipped declaration paths.
 * @consumer build:types
 * @sideEffect Filesystem: чтение/запись declaration-файлов в dist; Console: структурированные логи.
 */
async function normalizeDtsImports(): Promise<void> {
  logger.info(`[normalizeDtsImports] [idle → scanning] Searching declaration files`);
  const files = await fg('dist/**/*.d.ts');
  let rewrites = 0;

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const syntax = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest);
    const references: ts.StringLiteral[] = [];
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        references.push(node.moduleSpecifier);
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        references.push(node.argument.literal);
      if (
        ts.isExternalModuleReference(node) &&
        node.expression &&
        ts.isStringLiteral(node.expression)
      )
        references.push(node.expression);
      ts.forEachChild(node, visit);
    };
    visit(syntax);
    let normalized = source;
    for (const reference of references.sort((a, b) => b.getStart(syntax) - a.getStart(syntax))) {
      const specifier = reference.text;
      const alias =
        specifier === '#logger'
          ? 'services/logger/logger.js'
          : specifier.startsWith('#utils/')
            ? `utils/${specifier.slice('#utils/'.length)}`
            : null;
      const rewritten =
        alias === null
          ? specifier.replace(/\.ts$/, '.js')
          : `./${relative(dirname(resolve(filePath)), resolve('dist', alias))
              .split('\\')
              .join('/')}`.replace(/\.ts$/, '.js');
      if (rewritten !== specifier) {
        normalized =
          normalized.slice(0, reference.getStart(syntax)) +
          JSON.stringify(rewritten) +
          normalized.slice(reference.end);
      }
    }

    if (normalized !== source) {
      writeFileSync(filePath, normalized);
      rewrites += 1;
    }
  }

  logger.info(`[normalizeDtsImports] [scanning → completed] Imports normalized`, {
    files: files.length,
    rewrites,
  });
}

try {
  await normalizeDtsImports();
} catch (cause) {
  logger.error(`[normalizeDtsImports] [scanning → failed] Failed to normalize declarations`, {
    cause,
  });
  process.exit(1);
}
