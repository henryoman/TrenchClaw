import { XMLParser } from "fast-xml-parser";

const FEED_REQUEST_TIMEOUT_MS = 10_000;
const FEED_REQUEST_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
};

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

type FeedKind = "rss" | "atom" | "rdf";

export interface ReadNormalizedNewsFeedInput {
  feedUrl: string;
  limit: number;
  excerptMaxChars: number;
  includeFullContent: boolean;
  contentMaxChars: number;
  signal?: AbortSignal;
}

export interface NormalizedNewsArticle {
  id: string;
  title: string;
  link: string | null;
  publishedAt: string | null;
  publishedAtEpochMs: number | null;
  author: string | null;
  categories: string[];
  excerpt: string | null;
  contentText: string | null;
  contentLength: number | null;
  imageUrl: string | null;
}

export interface NormalizedNewsFeedDocument {
  kind: FeedKind;
  feedUrl: string;
  sourceHost: string;
  title: string | null;
  description: string | null;
  websiteUrl: string | null;
  language: string | null;
  updatedAt: string | null;
}

export interface NormalizedNewsFeedResult {
  fetchedAt: string;
  request: {
    feedUrl: string;
    limit: number;
    excerptMaxChars: number;
    includeFullContent: boolean;
    contentMaxChars: number;
  };
  feed: NormalizedNewsFeedDocument;
  totalArticleCount: number;
  returnedArticleCount: number;
  hasMore: boolean;
  articles: NormalizedNewsArticle[];
}

interface FeedRequestErrorOptions {
  retryable: boolean;
  status?: number;
  cause?: unknown;
}

class FeedRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: FeedRequestErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "FeedRequestError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toArray = <T>(value: T | readonly T[] | null | undefined): T[] => {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? Array.from(value) as T[] : [value as T];
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/gu, " ").trim();

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#([0-9]+);/gu, (_match, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&([a-z]+);/giu, (match, entity) => HTML_ENTITY_MAP[entity.toLowerCase()] ?? match);

const stripHtml = (value: string): string =>
  normalizeWhitespace(
    decodeHtmlEntities(
      value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
        .replace(/<br\s*\/?>/giu, " ")
        .replace(/<\/p>/giu, " ")
        .replace(/<[^>]+>/gu, " "),
    ),
  );

const truncateText = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }
  const slice = value.slice(0, Math.max(1, maxChars - 1));
  const lastBoundary = slice.search(/\s+\S*$/u);
  const trimmed = lastBoundary > 0 ? slice.slice(0, lastBoundary) : slice;
  return `${trimmed.trimEnd()}…`;
};

const asText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isRecord(value)) {
    const textValue = asText(value["#text"]) ?? asText(value.__cdata);
    return textValue;
  }
  return null;
};

const asIsoDate = (value: unknown): {
  iso: string | null;
  epochMs: number | null;
} => {
  const raw = asText(value);
  if (!raw) {
    return { iso: null, epochMs: null };
  }
  const epochMs = Date.parse(raw);
  if (!Number.isFinite(epochMs)) {
    return { iso: null, epochMs: null };
  }
  return {
    iso: new Date(epochMs).toISOString(),
    epochMs,
  };
};

const pickText = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    const value = asText(candidate);
    if (value) {
      return value;
    }
  }
  return null;
};

const pickSanitizedText = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    const value = asText(candidate);
    if (!value) {
      continue;
    }
    const sanitized = stripHtml(value);
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
};

const pickImageUrl = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    for (const item of toArray(candidate)) {
      if (typeof item === "string") {
        const normalized = item.trim();
        if (normalized) {
          return normalized;
        }
        continue;
      }
      if (!isRecord(item)) {
        continue;
      }
      const fromAttribute = pickText(item["@_url"], item.href, item.url);
      if (fromAttribute) {
        return fromAttribute;
      }
    }
  }
  return null;
};

const normalizeCategories = (value: unknown): string[] =>
  Array.from(
    new Set(
      toArray(value)
        .map((entry) => {
          if (isRecord(entry)) {
            return pickText(entry["@_term"], entry.term, entry.label, entry.name, entry);
          }
          return pickText(entry);
        })
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );

const normalizeLink = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  const candidates = toArray(value)
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const href = pickText(entry["@_href"], entry.href);
      const rel = pickText(entry["@_rel"], entry.rel);
      return {
        href,
        rel: rel?.toLowerCase() ?? null,
      };
    })
    .filter((entry): entry is { href: string | null; rel: string | null } => entry !== null);

  const preferred = candidates.find((entry) => entry.href && (entry.rel === null || entry.rel === "alternate"));
  return preferred?.href ?? candidates.find((entry) => entry.href)?.href ?? null;
};

const deriveWebsiteUrl = (feedUrl: string, explicitWebsiteUrl: string | null, firstArticleLink: string | null): string | null => {
  const preferred = explicitWebsiteUrl && explicitWebsiteUrl.trim().length > 0 ? explicitWebsiteUrl.trim() : null;
  if (preferred) {
    return preferred;
  }

  const candidate = firstArticleLink ?? feedUrl;
  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return null;
  }
};

const toNormalizedArticle = (
  item: UnknownRecord,
  input: ReadNormalizedNewsFeedInput,
  kind: FeedKind,
): NormalizedNewsArticle => {
  const title = pickSanitizedText(item.title) ?? "(untitled)";
  const link = normalizeLink(kind === "atom" ? item.link : pickText(item.link));
  const id = pickText(item.guid, item.id) ?? link ?? title;
  const published = asIsoDate(kind === "atom" ? item.published ?? item.updated : item.pubDate);
  const author = kind === "atom"
    ? pickSanitizedText(
      isRecord(item.author) ? item.author.name ?? item.author : item.author,
      item["dc:creator"],
    )
    : pickSanitizedText(item["dc:creator"], item.author);
  const categories = normalizeCategories(item.category);
  const descriptionText = pickSanitizedText(kind === "atom" ? item.summary : item.description);
  const contentTextRaw = pickSanitizedText(
    kind === "atom" ? item.content : item["content:encoded"],
    kind === "atom" ? item.summary : undefined,
  );
  const excerptSource = descriptionText ?? contentTextRaw;
  const excerpt = excerptSource ? truncateText(excerptSource, input.excerptMaxChars) : null;
  const fullContentText = input.includeFullContent && contentTextRaw
    ? truncateText(contentTextRaw, input.contentMaxChars)
    : null;

  return {
    id,
    title,
    link,
    publishedAt: published.iso,
    publishedAtEpochMs: published.epochMs,
    author,
    categories,
    excerpt,
    contentText: fullContentText,
    contentLength: contentTextRaw?.length ?? null,
    imageUrl: pickImageUrl(item["media:content"], item["media:thumbnail"], item.enclosure),
  };
};

const normalizeRssFeed = (
  channel: UnknownRecord,
  input: ReadNormalizedNewsFeedInput,
  kind: Extract<FeedKind, "rss" | "rdf">,
): Omit<NormalizedNewsFeedResult, "fetchedAt" | "request"> => {
  const allArticles = toArray(channel.item)
    .filter(isRecord)
    .map((item) => toNormalizedArticle(item, input, kind));
  const articles = allArticles.slice(0, input.limit);
  const updated = asIsoDate(channel.lastBuildDate);

  return {
    feed: {
      kind,
      feedUrl: input.feedUrl,
      sourceHost: new URL(input.feedUrl).hostname,
      title: pickSanitizedText(channel.title),
      description: pickSanitizedText(channel.description),
      websiteUrl: deriveWebsiteUrl(input.feedUrl, normalizeLink(channel.link), articles[0]?.link ?? null),
      language: pickText(channel.language),
      updatedAt: updated.iso,
    },
    totalArticleCount: allArticles.length,
    returnedArticleCount: articles.length,
    hasMore: allArticles.length > articles.length,
    articles,
  };
};

const normalizeAtomFeed = (
  feed: UnknownRecord,
  input: ReadNormalizedNewsFeedInput,
): Omit<NormalizedNewsFeedResult, "fetchedAt" | "request"> => {
  const allArticles = toArray(feed.entry)
    .filter(isRecord)
    .map((entry) => toNormalizedArticle(entry, input, "atom"));
  const articles = allArticles.slice(0, input.limit);
  const updated = asIsoDate(feed.updated);

  return {
    feed: {
      kind: "atom",
      feedUrl: input.feedUrl,
      sourceHost: new URL(input.feedUrl).hostname,
      title: pickSanitizedText(feed.title),
      description: pickSanitizedText(feed.subtitle),
      websiteUrl: deriveWebsiteUrl(input.feedUrl, normalizeLink(feed.link), articles[0]?.link ?? null),
      language: pickText(feed["@_xml:lang"], feed.language),
      updatedAt: updated.iso,
    },
    totalArticleCount: allArticles.length,
    returnedArticleCount: articles.length,
    hasMore: allArticles.length > articles.length,
    articles,
  };
};

const toFeedRequestError = (input: {
  error: unknown;
  feedUrl: string;
  requestSignal?: AbortSignal;
}): FeedRequestError => {
  if (input.error instanceof FeedRequestError) {
    return input.error;
  }

  if (input.requestSignal?.aborted) {
    return new FeedRequestError(`RSS feed request was aborted for ${input.feedUrl}`, {
      retryable: false,
      cause: input.error,
    });
  }

  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const normalized = message.toLowerCase();
  const timedOut = normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("abort");

  return new FeedRequestError(
    timedOut
      ? `RSS feed request timed out after ${FEED_REQUEST_TIMEOUT_MS}ms for ${input.feedUrl}`
      : `RSS feed request failed for ${input.feedUrl}: ${message}`,
    {
      retryable: true,
      cause: input.error,
    },
  );
};

const shouldRetry = (error: FeedRequestError, attempt: number, signal?: AbortSignal): boolean =>
  error.retryable && attempt < FEED_REQUEST_MAX_RETRIES && signal?.aborted !== true;

const fetchFeedXml = async (
  feedUrl: string,
  signal?: AbortSignal,
  attempt = 0,
): Promise<string> => {
  const timeoutSignal = AbortSignal.timeout(FEED_REQUEST_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await fetch(feedUrl, {
      method: "GET",
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      },
      signal: requestSignal,
    });

    if (!response.ok) {
      const error = new FeedRequestError(
        `RSS feed request failed (${response.status} ${response.statusText}) for ${feedUrl}`,
        {
          retryable: RETRYABLE_STATUS_CODES.has(response.status),
          status: response.status,
        },
      );
      if (shouldRetry(error, attempt, signal)) {
        await Bun.sleep(500 * (attempt + 1));
        return fetchFeedXml(feedUrl, signal, attempt + 1);
      }
      throw error;
    }

    return await response.text();
  } catch (error) {
    const requestError = toFeedRequestError({
      error,
      feedUrl,
      requestSignal: signal,
    });
    if (shouldRetry(requestError, attempt, signal)) {
      await Bun.sleep(500 * (attempt + 1));
      return fetchFeedXml(feedUrl, signal, attempt + 1);
    }
    throw requestError;
  }
};

export const isNormalizedNewsFeedRetryableError = (error: unknown): boolean =>
  error instanceof FeedRequestError && error.retryable;

export const readNormalizedNewsFeed = async (input: ReadNormalizedNewsFeedInput): Promise<NormalizedNewsFeedResult> => {
  const feedUrl = new URL(input.feedUrl).toString();
  const xml = await fetchFeedXml(feedUrl, input.signal);

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (error) {
    throw new FeedRequestError(`RSS feed parsing failed for ${feedUrl}: ${error instanceof Error ? error.message : String(error)}`, {
      retryable: false,
      cause: error,
    });
  }

  if (!isRecord(parsed)) {
    throw new FeedRequestError(`RSS feed returned an invalid root shape for ${feedUrl}`, {
      retryable: false,
    });
  }

  const fetchedAt = new Date().toISOString();
  const normalizedBase = (() => {
    if (isRecord(parsed.rss) && isRecord(parsed.rss.channel)) {
      return normalizeRssFeed(parsed.rss.channel, { ...input, feedUrl }, "rss");
    }
    if (isRecord(parsed.feed)) {
      return normalizeAtomFeed(parsed.feed, { ...input, feedUrl });
    }
    if (isRecord(parsed["rdf:RDF"])) {
      const rdf = parsed["rdf:RDF"];
      if (isRecord(rdf.channel)) {
        return normalizeRssFeed(
          {
            ...rdf.channel,
            item: rdf.item,
          },
          { ...input, feedUrl },
          "rdf",
        );
      }
    }
    throw new FeedRequestError(`Unsupported RSS/Atom feed shape for ${feedUrl}`, {
      retryable: false,
    });
  })();

  return {
    fetchedAt,
    request: {
      feedUrl,
      limit: input.limit,
      excerptMaxChars: input.excerptMaxChars,
      includeFullContent: input.includeFullContent,
      contentMaxChars: input.contentMaxChars,
    },
    ...normalizedBase,
  };
};
