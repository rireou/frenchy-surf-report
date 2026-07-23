import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function candidateRoots() {
  return [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd()
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
