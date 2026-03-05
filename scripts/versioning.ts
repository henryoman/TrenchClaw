#!/usr/bin/env bun

export type VersioningStrategy = "auto" | "patch" | "beta";

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
  strategy: VersioningStrategy = "auto",
): string => {
  const parsed = parseVersion(current);

  if (strategy === "auto") {
    return incrementVersion(current, parsed.beta === null ? "patch" : "beta");
  }

  if (strategy === "patch") {
    if (parsed.beta !== null) {
      return formatVersion({
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch,
        beta: null,
      });
    }
    return formatVersion({
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch + 1,
      beta: null,
    });
  }

  if (parsed.beta !== null) {
    return formatVersion({
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      beta: parsed.beta + 1,
    });
  }

  return formatVersion({
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch + 1,
    beta: 1,
  });
};
