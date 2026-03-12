import { marked } from 'marked';

import type { DocHeading } from './types';

const slugifyHeading = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const renderDocContent = (content: string): { html: string; headings: DocHeading[] } => {
  const headings: DocHeading[] = [];
  const headingCounts = new Map<string, number>();
  const renderer = new marked.Renderer();

  renderer.heading = ({ tokens, depth }) => {
    const text = tokens
      .map((token) => {
        if ('text' in token && typeof token.text === 'string') {
          return token.text;
        }

        if ('raw' in token && typeof token.raw === 'string') {
          return token.raw;
        }

        return '';
      })
      .join('')
      .trim();

    const fallbackId = slugifyHeading(text);
    if (depth !== 2 && depth !== 3) {
      return `<h${depth}${fallbackId ? ` id="${fallbackId}"` : ''}>${text}</h${depth}>`;
    }

    const baseId = fallbackId || 'section';
    const seenCount = headingCounts.get(baseId) ?? 0;
    headingCounts.set(baseId, seenCount + 1);

    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`;
    headings.push({
      id,
      text,
      level: depth,
    });

    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  return {
    html: marked.parse(content, { renderer }) as string,
    headings,
  };
};
