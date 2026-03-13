const SUPPORTED_HOST_ARCHES = new Set(["arm64", "x64"]);
const SUPPORTED_HOST_PLATFORMS = new Set(["darwin", "linux"]);

export const normalizeTarget = (target: string): string => target.replace(/^bun-/, "");

export const resolveHostPlatformTarget = (
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null => {
  if (!SUPPORTED_HOST_PLATFORMS.has(platform) || !SUPPORTED_HOST_ARCHES.has(arch)) {
    return null;
  }
  return `${platform}-${arch}`;
};

export const shouldSmokeCompileTargetOnHost = (
  compileTarget: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): boolean => {
  const hostTarget = resolveHostPlatformTarget(platform, arch);
  if (!hostTarget) {
    return false;
  }
  return normalizeTarget(compileTarget) === hostTarget;
};
