import { parseFrontMatter } from './frontmatter';
import { renderDocContent } from './render';
import { homepageFeaturedDocCount, sharedDocSources } from './shared-contract';
import type { DocListItem, DocPage, DocSourceOverride } from './types';

const localDocSources = import.meta.glob('/src/content/docs/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const sharedDocFiles = import.meta.glob('/src/content/shared/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const titleFromSlug = (slug: string): string =>
  slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const headingFromContent = (content: string): string | null => {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
};

const normalizeOrder = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return Number.MAX_SAFE_INTEGER;
};

const parseLocalDoc = (filePath: string, source: string): DocPage => {
  const slugMatch = filePath.match(/\/src\/content\/docs\/(.+)\.md$/);
  const slug = slugMatch?.[1];

  if (!slug) {
    throw new Error(`Invalid local docs file path: ${filePath}`);
  }

  const { data: frontMatter, content } = parseFrontMatter(source);
  const title = frontMatter.title?.trim() || headingFromContent(content) || titleFromSlug(slug);
  const description = frontMatter.description?.trim() || `Installation and usage guide for ${title}.`;
  const rendered = renderDocContent(content);

  return {
    slug,
    title,
    description,
    order: normalizeOrder(frontMatter.order),
    featured: frontMatter.featured ?? false,
    html: rendered.html,
    headings: rendered.headings,
    source: 'local',
    sourcePath: filePath,
  };
};

const parseSharedDoc = (filePath: string, source: string, config: DocSourceOverride): DocPage => {
  const rendered = renderDocContent(source);

  return {
    slug: config.slug,
    title: config.title,
    description: config.description,
    order: config.order,
    featured: config.featured ?? false,
    html: rendered.html,
    headings: rendered.headings,
    source: config.source,
    sourcePath: filePath,
  };
};

const assertDocsContract = (
  docs: DocPage[],
  sharedFilePaths: string[],
): void => {
  const seenSlugs = new Set<string>();
  for (const doc of docs) {
    if (seenSlugs.has(doc.slug)) {
      throw new Error(`Duplicate docs slug "${doc.slug}" found in ${doc.sourcePath}`);
    }

    seenSlugs.add(doc.slug);
  }

  const configuredSharedPaths = new Set(Object.keys(sharedDocSources));
  for (const filePath of sharedFilePaths) {
    if (!configuredSharedPaths.has(filePath)) {
      throw new Error(`Shared docs file "${filePath}" is missing shared-contract metadata`);
    }
  }

  for (const configuredPath of configuredSharedPaths) {
    if (!sharedFilePaths.includes(configuredPath)) {
      throw new Error(`Shared docs contract expects "${configuredPath}" but the file was not found`);
    }
  }
};

const docs: DocPage[] = [
  ...Object.entries(localDocSources).map(([filePath, source]) => parseLocalDoc(filePath, source)),
  ...Object.entries(sharedDocFiles).map(([filePath, source]) => {
    const config = sharedDocSources[filePath];

    if (!config) {
      throw new Error(`Missing shared docs config for ${filePath}`);
    }

    return parseSharedDoc(filePath, source, config);
  }),
]
  .toSorted((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    return a.title.localeCompare(b.title);
  });

assertDocsContract(docs, Object.keys(sharedDocFiles));

export const getDocsList = (): DocListItem[] =>
  docs.map(({ slug, title, description, order, featured, source }) => ({
    slug,
    title,
    description,
    order,
    featured,
    source,
  }));

export const getDocBySlug = (slug: string): DocPage | undefined => docs.find((doc) => doc.slug === slug);

export const getFeaturedDocs = (limit = homepageFeaturedDocCount): DocListItem[] => {
  const featuredDocs = docs.filter((doc) => doc.featured);
  const visibleDocs = featuredDocs.length > 0 ? featuredDocs : docs;

  return visibleDocs.slice(0, limit).map(({ slug, title, description, order, featured, source }) => ({
    slug,
    title,
    description,
    order,
    featured,
    source,
  }));
};
