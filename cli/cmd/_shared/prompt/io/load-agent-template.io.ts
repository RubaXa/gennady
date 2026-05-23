// @file: Read XML template if the file exists.
// @consumers: load-review-verify-template.io, resolve-conflicts-template-load.io
// @tasks: N/A

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTS_DIRNAME = 'ai/agents';

/**
 * @purpose Read XML template if the file exists.
 * @consumer load-agent-template.io
 * @param candidatePath Absolute path to the potential template file.
 * @returns Promise with file content or null if the file does not exist.
 */
function readTemplateIfExists(candidatePath: string): Promise<string> | null {
  if (fs.existsSync(candidatePath)) {
    return fs.promises.readFile(candidatePath, 'utf-8');
  }
  return null;
}

/**
 * @purpose Find the root of the installed npm package by the nearest package.json.
 * @consumer load-agent-template.io
 * @param startDir Directory from which the upward search in the tree starts.
 * @returns Absolute path to the package root or null if package.json is not found.
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
 * @purpose Load agent template from the project (override) or fallback from gennady.
 * @param templateFilename XML file name in `ai/agents`.
 * @returns XML template content.
 * @consumer render-review-verify.xml, render-resolve-conflicts.xml
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
