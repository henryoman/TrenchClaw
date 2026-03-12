import { describe, expect, test } from 'bun:test';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const websiteRoot = path.join(repoRoot, 'website');
const docsDir = path.join(websiteRoot, 'src', 'content', 'docs');
const sharedDir = path.join(websiteRoot, 'src', 'content', 'shared');

const parseFrontMatter = (source: string): Record<string, string> => {
  if (!source.startsWith('---\n')) {
    return {};
  }

  const closingIndex = source.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return {};
  }

  const rawFrontMatter = source.slice(4, closingIndex);
  const result: Record<string, string> = {};

  for (const line of rawFrontMatter.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    result[key] = value;
  }

  return result;
};

describe('website docs contract', () => {
  test('canonical architecture doc is synced into shared content', async () => {
    await access(path.join(repoRoot, 'ARCHITECTURE.md'));
    await access(path.join(sharedDir, 'architecture.md'));

    const authoredDocs = await readdir(docsDir);
    expect(authoredDocs).not.toContain('architecture.md');
  });

  test('authored docs keep required metadata and unique slugs', async () => {
    const docFiles = (await readdir(docsDir)).filter((fileName) => fileName.endsWith('.md')).sort();
    const seenSlugs = new Set<string>();
    let featuredCount = 0;

    for (const fileName of docFiles) {
      const slug = fileName.replace(/\.md$/, '');
      expect(seenSlugs.has(slug)).toBe(false);
      seenSlugs.add(slug);

      const source = await readFile(path.join(docsDir, fileName), 'utf8');
      const frontMatter = parseFrontMatter(source);
      expect(frontMatter.title).toBeTruthy();
      expect(frontMatter.description).toBeTruthy();
      expect(Number.isFinite(Number(frontMatter.order))).toBe(true);

      if (frontMatter.featured === 'true') {
        featuredCount += 1;
      }
    }

    expect(featuredCount).toBeGreaterThan(0);
  });
});
