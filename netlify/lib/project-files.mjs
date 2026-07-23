import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function candidateRoots() {
  return [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    SOURCE_ROOT
  ].filter(Boolean);
}

export function projectFilePath(fileName) {
  for (const root of candidateRoots()) {
    const candidate = resolve(root, fileName);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Required project file is missing from the Netlify function bundle: ${fileName}`);
}

export function readProjectText(fileName) {
  return readFileSync(projectFilePath(fileName), 'utf8');
}

export function readProjectJson(fileName) {
  return JSON.parse(readProjectText(fileName));
}
