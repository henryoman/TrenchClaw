#!/usr/bin/env bun

import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { address } from "@solana/kit";
import { z } from "zod";

const IDL_ROOT = fileURLToPath(new URL("../idl/", import.meta.url));
const MANIFEST_PATH = path.join(IDL_ROOT, "sources.json");
const sourceSchema = z.object({
  file: z.string().regex(/^[a-z0-9-]+\.json$/u),
  repository: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u),
  branch: z.string().min(1),
  path: z.string().min(1),
  revision: z.string().regex(/^[a-f0-9]{40}$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  format: z.enum(["anchor", "anchor-legacy", "codama"]),
  programAddress: z.string().min(1),
  status: z.enum(["current", "archived"]),
});
const manifestSchema = z.object({ version: z.literal(1), sources: z.array(sourceSchema).min(1) });
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
  if (source.format !== "anchor-legacy" && declaredAddress !== source.programAddress) {
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
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`IDL source request failed (${response.status}): ${url}`);
  }
  return response;
};

const main = async (): Promise<void> => {
  const mode = process.argv[2] ?? "--check";
  if (process.argv.length > 3 || (mode !== "--check" && mode !== "--update")) {
    throw new Error("Usage: bun run scripts/syncIdls.ts [--check|--update]");
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

  if (mode === "--check") {
    await Promise.all(manifest.sources.map(async (source) => {
      const data = new Uint8Array(await Bun.file(path.join(IDL_ROOT, source.file)).arrayBuffer());
      validateIdl(source, data);
      if (checksum(data) !== source.sha256) {
        throw new Error(`IDL ${source.file} does not match its pinned source checksum.`);
      }
    }));
    console.log(`Verified ${manifest.sources.length} IDLs: formats, program addresses, and source checksums.`);
    return;
  }

  const revisions = new Map<string, Promise<string>>();
  const updates = await Promise.all(manifest.sources.map(async (source) => {
    const key = `${source.repository}/${source.branch}`;
    if (source.status === "current" && !revisions.has(key)) {
      revisions.set(key, fetchRequired(`https://api.github.com/repos/${source.repository}/commits/${encodeURIComponent(source.branch)}`)
        .then((response) => response.json())
        .then((payload) => z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u) }).parse(payload).sha));
    }
    const revision = source.status === "archived" ? source.revision : await revisions.get(key)!;
    const response = await fetchRequired(`https://raw.githubusercontent.com/${source.repository}/${revision}/${source.path}`);
    const data = new Uint8Array(await response.arrayBuffer());
    validateIdl(source, data);
    return { source: { ...source, revision, sha256: checksum(data) }, data };
  }));
  // Validate every download before replacing any catalog file.
  await Promise.all(updates.map(({ source, data }) => Bun.write(path.join(IDL_ROOT, source.file), data)));
  await Bun.write(MANIFEST_PATH, `${JSON.stringify({ ...manifest, sources: updates.map(({ source }) => source) }, null, 2)}\n`);
  console.log(`Updated ${updates.length} IDLs from pinned official source revisions; archived sources remain pinned.`);
};

await main();
