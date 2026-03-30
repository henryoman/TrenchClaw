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
  "configs",
  "added-knowledge",
  "added-knowledge/skills",
] as const;

const workspaceChildren = {
  configs: directory({
    ".gitkeep": file(),
    "news-feeds.json": file(),
    "tracker.json": file(),
  }),
  "added-knowledge": directory({
    ".gitkeep": file(),
    skills: directory({
      ".gitkeep": file(),
    }),
  }),
} satisfies Record<string, InstanceLayoutNode>;

export const INSTANCE_LAYOUT_SCHEMA = directory({
  "instance.json": file(),
  secrets: directory({
    "vault.json": file(),
  }),
  settings: directory({
    "ai.json": file(),
    "settings.json": file(),
    "trading.json": file(),
    "wakeup.json": file(),
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

