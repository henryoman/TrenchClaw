import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
import plaintext from 'highlight.js/lib/languages/plaintext';

import type { DocHeading } from './types';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('zsh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('plaintext', plaintext);

const slugifyHeading = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const renderDocContent = (content: string): { html: string; headings: DocHeading[] } => {
  const headings: DocHeading[] = [];
  const headingCounts = new Map<string, number>();
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang }) => {
    const normalizedLang = lang?.trim().toLowerCase() ?? '';
    const supportedLanguage = normalizedLang && hljs.getLanguage(normalizedLang) ? normalizedLang : null;
    const highlighted = supportedLanguage
      ? hljs.highlight(text, { language: supportedLanguage, ignoreIllegals: true }).value
      : hljs.highlightAuto(text, ['bash', 'typescript', 'javascript', 'json', 'xml', 'plaintext']).value;
    const label = supportedLanguage || normalizedLang || 'code';
    const safeLabel = escapeHtml(label);

    return `<pre data-language="${safeLabel}"><code class="hljs language-${safeLabel}">${highlighted}</code></pre>`;
  };

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
