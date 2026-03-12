import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const websiteRoot = path.join(repoRoot, 'website');

describe('website smoke suite', () => {
  test('homepage uses the shared site content module', async () => {
    const page = await readFile(path.join(websiteRoot, 'src', 'routes', '+page.svelte'), 'utf8');
    expect(page).toContain("from '$lib/site/content'");
    expect(page).toContain('getHomepageQuickLinks()');
    expect(page).not.toContain('const quickLinks = [');
  });

  test('website scripts sync explicit shared content contract', async () => {
    const packageJson = await readFile(path.join(websiteRoot, 'package.json'), 'utf8');
    expect(packageJson).toContain('"content:sync": "bun run ./scripts/sync-shared-content.ts"');
    expect(packageJson).not.toContain('sync-public-assets');
  });

  test('maintainer guide documents the shared repo contract', async () => {
    const maintainersGuide = await readFile(path.join(websiteRoot, 'MAINTAINERS.md'), 'utf8');
    expect(maintainersGuide).toContain('../ARCHITECTURE.md');
    expect(maintainersGuide).toContain('../scripts/install-trenchclaw.sh');
    expect(maintainersGuide).toContain('Do not add a broad “copy all root public assets into website/static” step.');
  });

  test('brand color tokens are defined in css', async () => {
    const css = await readFile(path.join(websiteRoot, 'src', 'app.css'), 'utf8');
    expect(css).toContain('--color-background');
    expect(css).toContain('--color-foreground');
    expect(css).toContain('--color-cyan-brand');
    expect(css).toContain('--color-purple-brand');
    expect(css).toContain('--color-border-subtle');
    expect(css).toContain('--color-muted');
    expect(css).toContain('--color-muted-dark');
  });
});
