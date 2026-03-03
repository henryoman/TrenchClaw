import { marked } from 'marked';

export type DocListItem = {
  slug: string;
  title: string;
  description: string;
  order: number;
};

export type DocPage = DocListItem & {
  html: string;
};

type FrontMatter = {
  title?: string;
  description?: string;
  order?: number;
};

const parseFrontMatter = (source: string): { data: FrontMatter; content: string } => {
  if (!source.startsWith('---\n')) {
    return { data: {}, content: source };
  }

  const closingIndex = source.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return { data: {}, content: source };
  }

  const rawFrontMatter = source.slice(4, closingIndex);
  const content = source.slice(closingIndex + 5);
  const data: FrontMatter = {};

  for (const line of rawFrontMatter.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (key === 'title' && value.length > 0) {
      data.title = value;
    } else if (key === 'description' && value.length > 0) {
      data.description = value;
    } else if (key === 'order') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        data.order = parsed;
      }
    }
  }

  return { data, content };
};

const rawDocs = import.meta.glob('/src/content/docs/*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
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

const parseDoc = (filePath: string, source: string): DocPage => {
  const slugMatch = filePath.match(/\/src\/content\/docs\/(.+)\.md$/);
  const slug = slugMatch?.[1];

  if (!slug) {
    throw new Error(`Invalid docs file path: ${filePath}`);
  }

  const { data: frontMatter, content } = parseFrontMatter(source);
  const title = frontMatter.title?.trim() || headingFromContent(content) || titleFromSlug(slug);
  const description = frontMatter.description?.trim() || 'TrenchClaw documentation page.';

  return {
    slug,
    title,
    description,
    order: normalizeOrder(frontMatter.order),
    html: marked.parse(content) as string
  };
};

const docs: DocPage[] = Object.entries(rawDocs)
  .map(([filePath, source]) => parseDoc(filePath, source))
  .sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    return a.title.localeCompare(b.title);
  });

export const getDocsList = (): DocListItem[] => docs.map(({ slug, title, description, order }) => ({ slug, title, description, order }));

export const getDocBySlug = (slug: string): DocPage | undefined => docs.find((doc) => doc.slug === slug);
