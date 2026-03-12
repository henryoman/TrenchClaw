import type { FrontMatter } from './types';

const parseBoolean = (value: string): boolean | undefined => {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
};

export const parseFrontMatter = (source: string): { data: FrontMatter; content: string } => {
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
      continue;
    }

    if (key === 'description' && value.length > 0) {
      data.description = value;
      continue;
    }

    if (key === 'order') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        data.order = parsed;
      }
      continue;
    }

    if (key === 'featured') {
      data.featured = parseBoolean(value) ?? data.featured;
    }
  }

  return { data, content };
};
