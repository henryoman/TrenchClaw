#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { address } from "@solana/kit";
import { z } from "zod";

const IDL_ROOT = fileURLToPath(new URL("../idl/", import.meta.url));
const MANIFEST_PATH = path.join(IDL_ROOT, "sources.json");
const sourceFields = {
  file: z.string().regex(/^[a-z0-9-]+\.json$/u),
  repository: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u),
  branch: z.string().min(1),
  path: z.string().min(1),
  revision: z.string().regex(/^[a-f0-9]{40}$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  format: z.enum(["anchor", "codama"]),
  programAddress: z.string().min(1),
  status: z.literal("current"),
};
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ ...sourceFields, kind: z.literal("download") }),
  z.object({ ...sourceFields, kind: z.literal("anchor-build"), format: z.literal("anchor"), generator: z.literal("anchor-lang-idl@0.1.4") }),
]);
const manifestSchema = z.object({ version: z.literal(2), sources: z.array(sourceSchema).min(1) });
type IdlSource = z.infer<typeof sourceSchema>;

const checksum = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

const validateIdl = (source: IdlSource, data: Uint8Array): void => {
  address(source.programAddress);
  const root = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(data).toString("utf8")));
  const program = source.format === "codama"
    ? z.record(z.string(), z.unknown()).parse(root.program)
    : root;
  const instructions = z.array(z.object({ name: z.string().min(1) }).passthrough()).min(1).parse(program.instructions);
  if (new Set(instructions.map((instruction) => instruction.name)).size !== instructions.length) {
    throw new Error(`IDL ${source.file} contains duplicate instruction names.`);
  }
  const metadata = root.metadata && typeof root.metadata === "object"
    ? root.metadata as Record<string, unknown>
    : {};
  const declaredAddress = source.format === "codama" ? program.publicKey : root.address ?? metadata.address;
  if (declaredAddress !== source.programAddress) {
    throw new Error(`IDL ${source.file} program address does not match ${source.programAddress}.`);
  }
  if (source.format === "anchor") {
    z.array(z.object({ discriminator: z.array(z.number().int().min(0).max(255)).length(8) }).passthrough()).parse(instructions);
  }
  if (source.format === "codama" && (root.kind !== "rootNode" || program.kind !== "programNode")) {
    throw new Error(`IDL ${source.file} is not a Codama root/program tree.`);
  }
};

const fetchRequired = async (url: string): Promise<Response> => {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers = new URL(url).hostname === "api.github.com" && token
    ? { Authorization: `Bearer ${token}` }
    : undefined;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`IDL source request failed (${response.status}): ${url}`);
  }
  return response;
};

const runRequired = async (command: string[], env?: Record<string, string | undefined>): Promise<void> => {
  const process = Bun.spawn(command, { stdout: "inherit", stderr: "inherit", env });
  if (await process.exited !== 0) {
    throw new Error(`IDL generation command failed: ${command.join(" ")}`);
  }
};

const buildAnchorIdl = async (source: IdlSource, revision: string): Promise<Uint8Array> => {
  const scratchRoot = await mkdtemp(path.join(tmpdir(), "trenchclaw-idl-"));
  try {
    const response = await fetchRequired(`https://api.github.com/repos/${source.repository}/tarball/${revision}`);
    const archivePath = path.join(scratchRoot, "source.tar.gz");
    const checkoutPath = path.join(scratchRoot, "source");
    const outputPath = path.join(scratchRoot, "idl.json");
    await Bun.write(archivePath, await response.arrayBuffer());
    await mkdir(checkoutPath);
    await runRequired(["tar", "-xzf", archivePath, "-C", checkoutPath, "--strip-components=1"]);
    console.log(`Generating ${source.file} from ${source.repository}@${revision} with locked dependencies.`);
    await runRequired([
      "cargo", "run", "--locked", "--manifest-path",
      fileURLToPath(new URL("./idl-builder/Cargo.toml", import.meta.url)), "--",
      path.join(checkoutPath, source.path), outputPath,
    ], { ...process.env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? path.join(scratchRoot, "target") });
    return new Uint8Array(await Bun.file(outputPath).arrayBuffer());
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  const mode = process.argv[2] ?? "--check";
  if (process.argv.length > 3 || !["--check", "--check-upstream", "--update"].includes(mode)) {
    throw new Error("Usage: bun run scripts/syncIdls.ts [--check|--check-upstream|--update]");
  }
  const manifest = manifestSchema.parse(await Bun.file(MANIFEST_PATH).json());
  const files = manifest.sources.map((source) => source.file);
  if (new Set(files).size !== files.length) {
    throw new Error("IDL source manifest contains duplicate files.");
  }
  const trackedFiles = [...new Bun.Glob("*.json").scanSync({ cwd: IDL_ROOT })].filter((file) => file !== "sources.json");
  if (trackedFiles.some((file) => !files.includes(file))) {
    throw new Error("IDL catalog contains a JSON file without source provenance.");
  }

  if (mode !== "--update") {
    await Promise.all(manifest.sources.map(async (source) => {
      const data = new Uint8Array(await Bun.file(path.join(IDL_ROOT, source.file)).arrayBuffer());
      validateIdl(source, data);
      if (checksum(data) !== source.sha256) {
        throw new Error(`IDL ${source.file} does not match its pinned source checksum.`);
      }
    }));
    console.log(`Verified ${manifest.sources.length} IDLs: formats, program addresses, and source checksums.`);
    if (mode === "--check") {
      return;
    }
  }

  const revisions = new Map<string, Promise<string>>();
  const resolved = await Promise.all(manifest.sources.map(async (source) => {
    const key = `${source.repository}/${source.branch}`;
    if (!revisions.has(key)) {
      revisions.set(key, fetchRequired(`https://api.github.com/repos/${source.repository}/commits/${encodeURIComponent(source.branch)}`)
        .then((response) => response.json())
        .then((payload) => z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u) }).parse(payload).sha));
    }
    const revision = await revisions.get(key)!;
    if (mode === "--check-upstream" && revision !== source.revision) {
      throw new Error(`IDL ${source.file} is behind ${source.repository}/${source.branch}. Run bun run idl:update.`);
    }
    if (source.kind === "anchor-build") {
      return { source, revision, data: undefined };
    }
    const response = await fetchRequired(`https://raw.githubusercontent.com/${source.repository}/${revision}/${source.path}`);
    const data = new Uint8Array(await response.arrayBuffer());
    validateIdl(source, data);
    if (mode === "--check-upstream" && checksum(data) !== source.sha256) {
      throw new Error(`IDL ${source.file} differs from the current official upstream schema.`);
    }
    return { source, revision, data };
  }));
  if (mode === "--check-upstream") {
    console.log(`Verified all ${manifest.sources.length} interfaces against current official upstream revisions.`);
    return;
  }
  const updates = [];
  for (const { source, revision, data: downloadedData } of resolved) {
    // Build programs sequentially: Cargo shares dependency and build caches.
    // eslint-disable-next-line no-await-in-loop
    const data = downloadedData ?? await buildAnchorIdl(source, revision);
    validateIdl(source, data);
    updates.push({ source: { ...source, revision, sha256: checksum(data) }, data });
  }
  // Validate every download before replacing any catalog file.
  await Promise.all(updates.map(({ source, data }) => Bun.write(path.join(IDL_ROOT, source.file), data)));
  await Bun.write(MANIFEST_PATH, `${JSON.stringify({ ...manifest, sources: updates.map(({ source }) => source) }, null, 2)}\n`);
  console.log(`Updated ${updates.length} IDLs from current official source revisions.`);
};

await main();
