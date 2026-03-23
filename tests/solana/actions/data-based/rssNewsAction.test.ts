import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import { getConfiguredNewsFeedsAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/api/news-feed-registry-actions";
import {
  DEFAULT_SOLANA_NEWS_FEED_URL,
  getLatestSolanaNewsAction,
} from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/api/rss-news-actions";
import { createPersistedTestInstance } from "../../../helpers/instance-fixtures";
import { runtimeStatePath } from "../../../helpers/core-paths";

const previousFetch = globalThis.fetch;
const TEST_ENV_KEYS = [
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
] as const;
const initialEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];
const createdPaths = new Set<string>();
const TEST_SAFE_SETTINGS_YAML = `
configVersion: 1
profile: safe
network:
  chain: solana
  cluster: devnet
  commitment: confirmed
  websocketEnabled: true
  requestTimeoutMs: 10000
  transactionTimeoutMs: 45000
  retry:
    readsMaxAttempts: 3
    writesMaxAttempts: 3
    backoffMs: 500
    backoffMultiplier: 1.5
  rpc:
    strategy: failover
    endpoints:
      - name: primary
        url: https://rpc.example
        wsUrl: wss://ws.example
        enabled: true
wallet:
  custodyMode: local-encrypted
  defaults:
    keyEncoding: base64
    createWalletCountLimit: 100
    exportFormat: base58
  dangerously:
    allowPrivateKeyAccess: false
    allowWalletSigning: false
    allowCreatingWallets: false
    allowDeletingWallets: false
    allowExportingWallets: false
    allowImportingWallets: false
    allowListingWallets: true
    allowShowingWallets: true
    allowUpdatingWallets: false
trading:
  enabled: false
  mode:
    simulation: true
    paperTrading: true
  confirmations:
    requireUserConfirmationForDangerousActions: true
    userConfirmationToken: confirm
  limits:
    maxSwapNotionalSol: 1
    maxSingleTransferSol: 1
    maxPriorityFeeLamports: 1000000
    maxSlippageBps: 100
  jupiter:
    ultra:
      enabled: false
      allowQuotes: false
      allowExecutions: false
      allowCancellations: false
    standard:
      enabled: false
      allowQuotes: false
      allowExecutions: false
  dexscreener:
    enabled: true
agent:
  enabled: true
  dangerously:
    allowFilesystemWrites: false
    allowNetworkAccess: true
    allowSystemAccess: false
    allowHardwareAccess: false
  internetAccess:
    trustedSitesOnly: true
    allowFullAccess: false
    trustedSites: []
    blockedSites: []
    allowedProtocols: [https]
    blockedProtocols: []
    allowedPorts: [443, 80]
    blockedPorts: []
runtime:
  scheduler:
    tickMs: 1000
    maxConcurrentJobs: 4
  dispatcher:
    maxActionAttempts: 3
    defaultActionTimeoutMs: 20000
    defaultBackoffMs: 500
  idempotency:
    enabled: true
    ttlHours: 24
storage:
  sqlite:
    enabled: false
    path: /tmp/trenchclaw-rss-news-tests.db
    walMode: true
    busyTimeoutMs: 5000
  sessions:
    enabled: false
    directory: /tmp/trenchclaw-rss-news-tests-sessions
    agentId: test-agent
    source: tests
  memory:
    enabled: false
    directory: /tmp/trenchclaw-rss-news-tests-memory
    longTermFile: memory.md
  retention:
    receiptsDays: 7
ui:
  cli:
    enabled: true
  webGui:
    enabled: false
    host: 127.0.0.1
    port: 3000
  tui:
    enabled: false
    overviewView: true
    botsView: true
    actionFeedView: true
    controlsView: true
observability:
  logging:
    level: info
    style: human
    pretty: false
    includeDecisionTrace: false
  metrics:
    enabled: false
  tracing:
    enabled: false
`;

const createXmlResponse = (xml: string, init?: { status?: number }) =>
  new Response(xml, {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
    },
  });

const asMockFetch = (
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch => handler as unknown as typeof fetch;

const writeTempFile = async (extension: "yaml" | "json", content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-rss-news-action-${crypto.randomUUID()}.${extension}`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

beforeEach(async () => {
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeTempFile("yaml", TEST_SAFE_SETTINGS_YAML);
  process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = await writeTempFile("json", "{}");
  delete process.env.TRENCHCLAW_SETTINGS_AGENT_FILE;
  delete process.env.TRENCHCLAW_VAULT_FILE;
  delete process.env.TRENCHCLAW_VAULT_TEMPLATE_FILE;
  process.env.TRENCHCLAW_PROFILE = "safe";
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";
  createdPaths.add(await createPersistedTestInstance("01", { markActive: true }));
});

afterEach(async () => {
  globalThis.fetch = previousFetch;
  for (const key of TEST_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }

  for (const filePath of createdFiles.splice(0)) {
    await Bun.file(filePath).delete().catch(() => {});
  }

  for (const targetPath of createdPaths) {
    await rm(targetPath, { recursive: true, force: true });
  }
  createdPaths.clear();
  await Bun.file(runtimeStatePath("instances", "active-instance.json")).delete().catch(() => {});
});

describe("rss news action", () => {
  test("returns the instance-scoped configured news feed registry from workspace configs", async () => {
    const result = await getConfiguredNewsFeedsAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      instanceId: "01",
      version: 1,
      totalFeedCount: 1,
      returnedFeedCount: 1,
      runtimePath: ".runtime-state/instances/01/workspace/configs/news-feeds.json",
      feeds: [
        {
          alias: "solana-cryptopotato",
          title: "CryptoPotato Solana",
          feedUrl: DEFAULT_SOLANA_NEWS_FEED_URL,
          enabled: true,
        },
      ],
    });

    const savedRegistry = await Bun.file(result.data!.filePath).json();
    expect(savedRegistry).toMatchObject({
      version: 1,
      feeds: [
        {
          alias: "solana-cryptopotato",
          feedUrl: DEFAULT_SOLANA_NEWS_FEED_URL,
        },
      ],
    });
  });

  test("loads default Solana RSS feed, saves a workspace news snapshot, and returns compact normalized articles", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const requestUrl = typeof input === "string" ? input : input.toString();
      expect(requestUrl).toBe(DEFAULT_SOLANA_NEWS_FEED_URL);
      return createXmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Solana Archives - CryptoPotato</title>
    <link>https://cryptopotato.com</link>
    <description>Latest Solana headlines</description>
    <language>en-US</language>
    <lastBuildDate>Mon, 02 Mar 2026 17:22:07 +0000</lastBuildDate>
    <item>
      <title>The End of Step Finance</title>
      <link>https://cryptopotato.com/step-finance</link>
      <dc:creator><![CDATA[Chayanika Deka]]></dc:creator>
      <pubDate>Sat, 28 Feb 2026 23:45:40 +0000</pubDate>
      <category><![CDATA[Crypto News]]></category>
      <category><![CDATA[Solana]]></category>
      <guid isPermaLink="false">step-finance-guid</guid>
      <media:content url="https://cryptopotato.com/step.jpg" medium="image"/>
      <description><![CDATA[After exploring fundraising and acquisition options, no sustainable recovery path remained.]]></description>
      <content:encoded><![CDATA[<p>Solana-based DeFi aggregator Step Finance shut down after a wallet compromise.</p>]]></content:encoded>
    </item>
    <item>
      <title>Santiment: Solana Growth Signals Hope</title>
      <link>https://cryptopotato.com/santiment-solana-growth</link>
      <dc:creator><![CDATA[Wayne Jones]]></dc:creator>
      <pubDate>Sat, 21 Feb 2026 20:19:52 +0000</pubDate>
      <category><![CDATA[Top News]]></category>
      <category><![CDATA[Solana]]></category>
      <guid isPermaLink="false">santiment-guid</guid>
      <description><![CDATA[New wallet creation is rising even as prices slump.]]></description>
      <content:encoded><![CDATA[<p>Longer article body that should not be included by default.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`);
    });

    const result = await getLatestSolanaNewsAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      instanceId: "01",
      request: {
        feedUrl: DEFAULT_SOLANA_NEWS_FEED_URL,
        limit: 5,
        includeFullContent: false,
      },
      feed: {
        kind: "rss",
        title: "Solana Archives - CryptoPotato",
        sourceHost: "cryptopotato.com",
        language: "en-US",
      },
      totalArticleCount: 2,
      returnedArticleCount: 2,
      hasMore: false,
    });
    expect(result.data?.runtimePath).toContain(".runtime-state/instances/01/workspace/news/");
    expect(result.data?.outputPath).toContain("/workspace/news/");
    expect(result.data?.articles).toEqual([
      expect.objectContaining({
        id: "step-finance-guid",
        title: "The End of Step Finance",
        link: "https://cryptopotato.com/step-finance",
        author: "Chayanika Deka",
        categories: ["Crypto News", "Solana"],
        excerpt: "After exploring fundraising and acquisition options, no sustainable recovery path remained.",
        contentText: null,
        imageUrl: "https://cryptopotato.com/step.jpg",
      }),
      expect.objectContaining({
        id: "santiment-guid",
        title: "Santiment: Solana Growth Signals Hope",
        contentText: null,
      }),
    ]);

    const savedSnapshot = await Bun.file(result.data!.outputPath).json();
    expect(savedSnapshot).toMatchObject({
      fetchedAt: result.data?.fetchedAt,
      artifactType: "news-feed-download",
      source: "rss-news",
      instanceId: "01",
      request: {
        feedUrl: DEFAULT_SOLANA_NEWS_FEED_URL,
      },
      returnedArticleCount: 2,
    });
    expect(Array.isArray(savedSnapshot.articles)).toBe(true);
    expect(savedSnapshot.articles[0]).toMatchObject({
      title: "The End of Step Finance",
    });
    const savedSnapshotText = await Bun.file(result.data!.outputPath).text();
    expect(savedSnapshotText.split("\n")[1]).toContain("\"fetchedAt\"");
  });

  test("resolves a configured feed alias from the instance registry", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const requestUrl = typeof input === "string" ? input : input.toString();
      expect(requestUrl).toBe(DEFAULT_SOLANA_NEWS_FEED_URL);
      return createXmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Solana Alias Feed</title>
    <link>https://cryptopotato.com</link>
    <description>Alias-backed feed</description>
    <item>
      <title>Alias-backed headline</title>
      <link>https://cryptopotato.com/alias-story</link>
      <guid>alias-story</guid>
      <description><![CDATA[Alias feed description.]]></description>
    </item>
  </channel>
</rss>`);
    });

    const result = await getLatestSolanaNewsAction.execute(createActionContext({ actor: "agent" }), {
      feedAlias: "solana-cryptopotato",
      limit: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      feedAlias: "solana-cryptopotato",
      feedRegistryRuntimePath: ".runtime-state/instances/01/workspace/configs/news-feeds.json",
      request: {
        feedUrl: DEFAULT_SOLANA_NEWS_FEED_URL,
        limit: 1,
      },
      returnedArticleCount: 1,
    });
  });

  test("supports overriding the feed URL and includes trimmed full content when requested", async () => {
    globalThis.fetch = asMockFetch(async (input: RequestInfo | URL) => {
      const requestUrl = typeof input === "string" ? input : input.toString();
      expect(requestUrl).toBe("https://example.com/solana.atom");
      return createXmlResponse(`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
  <title>Example Solana Feed</title>
  <subtitle>Fresh Solana updates</subtitle>
  <updated>2026-03-02T17:22:07Z</updated>
  <link href="https://example.com/news" rel="alternate" />
  <entry>
    <title>Validator Upgrade Restores Stability</title>
    <id>tag:example.com,2026:1</id>
    <updated>2026-03-02T16:00:00Z</updated>
    <link href="https://example.com/news/validator-upgrade" />
    <author>
      <name>Example Desk</name>
    </author>
    <category term="Solana" />
    <summary>Fast summary for operators.</summary>
    <content type="html"><![CDATA[<p>Validator operators patched the cluster&#8217;s networking issue and restored stability.</p>]]></content>
  </entry>
</feed>`);
    });

    const result = await getLatestSolanaNewsAction.execute(createActionContext({ actor: "agent" }), {
      feedUrl: "https://example.com/solana.atom",
      limit: 1,
      includeFullContent: true,
      contentMaxChars: 80,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      feed: {
        kind: "atom",
        title: "Example Solana Feed",
        websiteUrl: "https://example.com/news",
      },
      returnedArticleCount: 1,
    });
    expect(result.data?.articles[0]).toMatchObject({
      id: "tag:example.com,2026:1",
      title: "Validator Upgrade Restores Stability",
      author: "Example Desk",
      categories: ["Solana"],
      excerpt: "Fast summary for operators.",
      contentText: "Validator operators patched the cluster’s networking issue and restored…",
    });
  });

  test("marks exhausted retryable feed failures as retryable", async () => {
    let requestCount = 0;
    globalThis.fetch = asMockFetch(async () => {
      requestCount += 1;
      return createXmlResponse("<rss></rss>", { status: 503 });
    });

    const result = await getLatestSolanaNewsAction.execute(createActionContext({ actor: "agent" }), {});

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.code).toBe("RSS_NEWS_ACTION_RETRYABLE");
    expect(result.error).toContain("503");
    expect(requestCount).toBe(3);
  });
});
