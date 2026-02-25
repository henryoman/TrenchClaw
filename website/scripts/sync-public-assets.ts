import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const websiteDir = path.resolve(path.dirname(currentFile), '..');
const repoRoot = path.resolve(websiteDir, '..');
const sourcePublicDir = path.join(repoRoot, 'public');
const targetStaticDir = path.join(websiteDir, 'static');

await mkdir(targetStaticDir, { recursive: true });
await cp(sourcePublicDir, targetStaticDir, { recursive: true, force: true });
