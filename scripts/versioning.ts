#!/usr/bin/env bun

export type VersioningStrategy = "beta" | "patch" | "minor";

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  beta: number | null;
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

const toNumber = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label} component "${value}"`);
  }
  return parsed;
};

export const parseVersion = (value: string): ParsedVersion => {
  const trimmed = value.trim();
  const match = VERSION_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(
      `Unsupported version "${value}". Expected "X.Y.Z" or "X.Y.Z-beta.N" (optional leading "v").`,
    );
  }

  const major = toNumber(match[1] ?? "", "major");
  const minor = toNumber(match[2] ?? "", "minor");
  const patch = toNumber(match[3] ?? "", "patch");
  const betaGroup = match[4];
  const beta = typeof betaGroup === "string" ? toNumber(betaGroup, "beta") : null;

  if (beta !== null && beta <= 0) {
    throw new Error(`Invalid beta number "${beta}". Beta number must be >= 1.`);
  }

  return { major, minor, patch, beta };
};

export const formatVersion = (parsed: ParsedVersion): string => {
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.beta === null ? base : `${base}-beta.${parsed.beta}`;
};

export const incrementVersion = (
  current: string,
  strategy: VersioningStrategy = "beta",
): string => {
  const parsed = parseVersion(current);
  if (strategy === "beta") {
    if (parsed.major !== 0 || parsed.minor !== 0 || parsed.patch !== 0 || parsed.beta === null) {
      throw new Error(`Current version "${current}" must stay on the 0.0.0-beta.N track for now.`);
    }

    return formatVersion({
      major: 0,
      minor: 0,
      patch: 0,
      beta: parsed.beta + 1,
    });
  }

  if (parsed.beta !== null) {
    throw new Error(
      `Cannot auto-increment "${strategy}" from prerelease version "${current}". Use a manual release or promote to a stable version first.`,
    );
  }

  if (strategy === "patch") {
    return formatVersion({
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch + 1,
      beta: null,
    });
  }

  if (strategy === "minor") {
    return formatVersion({
      major: parsed.major,
      minor: parsed.minor + 1,
      patch: 0,
      beta: null,
    });
  }

  throw new Error(`Unsupported version strategy "${strategy}"`);
};
