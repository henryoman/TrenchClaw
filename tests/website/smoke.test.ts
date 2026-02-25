import { describe, expect, test } from 'bun:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const websiteRoot = path.join(repoRoot, 'website');

describe('website smoke suite', () => {
  test('root public logos exist', async () => {
    await access(path.join(repoRoot, 'public', 'logo.png'));
    await access(path.join(repoRoot, 'public', 'trenchclaw.png'));
  });

  test('site uses root logo paths on page', async () => {
    const page = await readFile(path.join(websiteRoot, 'src', 'routes', '+page.svelte'), 'utf8');
    expect(page).toContain('src="/logo.png"');
    expect(page).toContain('src="/trenchclaw.png"');
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
