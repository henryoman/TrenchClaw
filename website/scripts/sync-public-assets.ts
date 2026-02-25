import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const websiteDir = path.resolve(path.dirname(currentFile), '..');
const repoRoot = path.resolve(websiteDir, '..');
const sourcePublicDir = path.join(repoRoot, 'public');
const targetStaticDir = path.join(websiteDir, 'static');

await mkdir(targetStaticDir, { recursive: true });
try {
  await access(sourcePublicDir);
  await cp(sourcePublicDir, targetStaticDir, { recursive: true, force: true });
} catch {
  // On isolated deploy builders (e.g. website-only checkout), repo root public may not exist.
  // Keep existing website/static assets and continue.
}
