export type DocSourceKind = 'local' | 'shared';

export type DocHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type DocListItem = {
  slug: string;
  title: string;
  description: string;
  order: number;
  featured: boolean;
  source: DocSourceKind;
};

export type DocPage = DocListItem & {
  html: string;
  headings: DocHeading[];
  sourcePath: string;
};

export type FrontMatter = {
  title?: string;
  description?: string;
  order?: number;
  featured?: boolean;
};

export type DocSourceOverride = {
  slug: string;
  title: string;
  description: string;
  order: number;
  featured?: boolean;
  source: Extract<DocSourceKind, 'shared'>;
};
