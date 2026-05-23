// @file: Прочитать XML-шаблон, если файл существует.
// @consumers: load-review-verify-template.io, resolve-conflicts-template-load.io
// @tasks: N/A

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTS_DIRNAME = 'ai/agents';

/**
 * @purpose Прочитать XML-шаблон, если файл существует.
 * @consumer load-agent-template.io
 * @param candidatePath Абсолютный путь к потенциальному файлу шаблона.
 * @returns Promise с содержимым файла или null, если файл отсутствует.
 */
function readTemplateIfExists(candidatePath: string): Promise<string> | null {
  if (fs.existsSync(candidatePath)) {
    return fs.promises.readFile(candidatePath, 'utf-8');
  }
  return null;
}

/**
 * @purpose Найти корень установленного npm-пакета по ближайшему package.json.
 * @consumer load-agent-template.io
 * @param startDir Директория, от которой начинается поиск вверх по дереву.
 * @returns Абсолютный путь к корню пакета или null, если package.json не найден.
 */
function resolvePackageRoot(startDir: string): string | null {
  let probeDir = startDir;
  for (;;) {
    const packageJsonPath = path.join(probeDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return probeDir;
    }

    const parentDir = path.dirname(probeDir);
    if (parentDir === probeDir) {
      return null;
    }
    probeDir = parentDir;
  }
}

/**
 * @purpose Загрузить agent-шаблон из проекта (override) или fallback из gennady.
 * @consumer render-review-verify.xml, render-resolve-conflicts.xml
 * @param templateFilename Имя XML-файла в `ai/agents`.
 * @returns Содержимое XML-шаблона.
 */
export async function loadAgentTemplate(templateFilename: string): Promise<string> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectOverridePath = path.join(process.cwd(), AGENTS_DIRNAME, templateFilename);
  const projectOverride = readTemplateIfExists(projectOverridePath);
  if (projectOverride) {
    return projectOverride;
  }

  const packageRoot = resolvePackageRoot(__dirname);
  const candidates: string[] = [];
  if (packageRoot) {
    candidates.push(path.join(packageRoot, AGENTS_DIRNAME, templateFilename));
    candidates.push(path.join(packageRoot, 'dist', AGENTS_DIRNAME, templateFilename));
  } else {
    candidates.push(
      path.join(__dirname, '../../../../../../dist', AGENTS_DIRNAME, templateFilename)
    );
  }

  for (const candidatePath of candidates) {
    const template = readTemplateIfExists(candidatePath);
    if (template) {
      return template;
    }
  }

  throw new Error(`Не найден файл шаблона ${templateFilename}.`, {
    cause: {
      projectOverridePath,
      packageCandidates: candidates,
    },
  });
}
