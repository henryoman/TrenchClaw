export const compactRpcRequestConfig = <T extends Record<string, unknown>>(
  options: T,
): Partial<T> | undefined => {
  const entries = Object.entries(options).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as Partial<T>;
};
