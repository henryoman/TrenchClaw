import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getDocRouteEntrySlugs, primaryDocSlugs, referenceDocSlugs } from '../../website/src/lib/docs/structure';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const websiteRoot = path.join(repoRoot, 'website');
const docsDir = path.join(websiteRoot, 'src', 'content', 'docs');

describe('beta docs structure', () => {
  test('keeps only the canonical authored beta docs', async () => {
    const docFiles = await Array.fromAsync(new Bun.Glob('*.md').scan({ cwd: docsDir }));
    docFiles.sort();
    expect(docFiles).toEqual(primaryDocSlugs.map((slug) => `${slug}.md`).toSorted());
  });

  test('defines the expected primary and reference doc slugs', () => {
    expect(primaryDocSlugs).toEqual([
      'getting-started',
      'keys-and-settings',
    ]);
    expect(referenceDocSlugs).toEqual(['architecture']);
  });
});

describe('beta docs routing', () => {
  test('route source uses canonical prerender entries', async () => {
    const routeSource = await readFile(path.join(websiteRoot, 'src', 'routes', 'docs', '[slug]', '+page.ts'), 'utf8');

    expect(getDocRouteEntrySlugs()).toEqual([
      'getting-started',
      'keys-and-settings',
      'architecture',
    ]);
    expect(routeSource).toContain('getDocRouteEntries()');
  });
});

describe('beta docs presentation', () => {
  test('docs nav keeps setup docs primary and hides reference by default', async () => {
    const navSource = await readFile(path.join(websiteRoot, 'src', 'lib', 'components', 'docs', 'DocsNav.svelte'), 'utf8');

    expect(navSource).toContain('Setup');
    expect(navSource).toContain("currentSlug === 'architecture'");
    expect(navSource).toContain('Reference');
  });

  test('wraps docs code blocks instead of enabling horizontal scrolling', async () => {
    const css = await readFile(path.join(websiteRoot, 'src', 'styles', 'docs.css'), 'utf8');

    expect(css).toContain('.docs-content pre {');
    expect(css).toContain('overflow: hidden;');
    expect(css).toContain('white-space: pre-wrap;');
    expect(css).toContain('word-break: break-word;');
  });
});
