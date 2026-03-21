export interface InstanceLayoutDirectoryNode {
  kind: "directory";
  children: Record<string, InstanceLayoutNode>;
}

export interface InstanceLayoutFileNode {
  kind: "file";
}

export type InstanceLayoutNode = InstanceLayoutDirectoryNode | InstanceLayoutFileNode;

const file = (): InstanceLayoutFileNode => ({ kind: "file" });

const directory = (children: Record<string, InstanceLayoutNode>): InstanceLayoutDirectoryNode => ({
  kind: "directory",
  children,
});

export const INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES = [
  "strategies",
  "configs",
  "typescript",
  "notes",
  "scratch",
  "output",
  "routines",
] as const;

const workspaceChildren = Object.fromEntries(
  INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES.map((directoryName) => [
    directoryName,
    directory({
      ".gitkeep": file(),
    }),
  ]),
) as Record<string, InstanceLayoutNode>;

export const INSTANCE_LAYOUT_SCHEMA = directory({
  "WAKEUP.md": file(),
  cache: directory({
    generated: directory({
      ".gitkeep": file(),
    }),
    memory: directory({
      ".gitkeep": file(),
    }),
  }),
  data: directory({
    ".gitkeep": file(),
  }),
  "instance.json": file(),
  keypairs: directory({
    ".gitkeep": file(),
  }),
  logs: directory({
    live: directory({
      ".gitkeep": file(),
    }),
    sessions: directory({
      ".gitkeep": file(),
    }),
    summaries: directory({
      ".gitkeep": file(),
    }),
    system: directory({
      ".gitkeep": file(),
    }),
  }),
  secrets: directory({
    "vault.json": file(),
  }),
  settings: directory({
    "ai.json": file(),
    "settings.json": file(),
    "trading.json": file(),
  }),
  "shell-home": directory({
    ".gitkeep": file(),
  }),
  tmp: directory({
    ".gitkeep": file(),
  }),
  "tool-bin": directory({
    ".gitkeep": file(),
  }),
  workspace: directory(workspaceChildren),
});

const collectPaths = (
  node: InstanceLayoutNode,
  currentPath: string,
  buckets: {
    directories: string[];
    files: string[];
  },
): void => {
  if (node.kind === "file") {
    buckets.files.push(currentPath);
    return;
  }

  if (currentPath.length > 0) {
    buckets.directories.push(currentPath);
  }

  for (const [name, child] of Object.entries(node.children)) {
    collectPaths(child, currentPath.length > 0 ? `${currentPath}/${name}` : name, buckets);
  }
};

const collectedPaths = (() => {
  const buckets = {
    directories: [] as string[],
    files: [] as string[],
  };
  collectPaths(INSTANCE_LAYOUT_SCHEMA, "", buckets);
  return {
    directories: buckets.directories.toSorted((left, right) => left.localeCompare(right)),
    files: buckets.files.toSorted((left, right) => left.localeCompare(right)),
  };
})();

export const INSTANCE_LAYOUT_DIRECTORY_PATHS = collectedPaths.directories;
export const INSTANCE_LAYOUT_FILE_PATHS = collectedPaths.files;

