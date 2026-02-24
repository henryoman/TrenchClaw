import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const TEMPLATE_DIR = `${ROOT_DIR}/deploy/systemd`;
const TARGET_ENV_DIR = "/etc/trenchclaw";
const TARGET_SERVICE_PATH = "/etc/systemd/system/trenchclaw.service";

const ensureDir = async (path: string): Promise<void> => {
  await Bun.$`mkdir -p ${path}`.quiet();
};

const writeFile = async (path: string, content: string): Promise<void> => {
  await Bun.write(path, content);
};

const copyIfMissing = async (fromPath: string, toPath: string): Promise<boolean> => {
  const target = Bun.file(toPath);
  if (await target.exists()) {
    return false;
  }

  const sourceText = await Bun.file(fromPath).text();
  await writeFile(toPath, sourceText);
  return true;
};

const detectBunBin = (): string => {
  const fromEnv = process.env.BUN_BIN?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const fromPath = Bun.which("bun");
  if (fromPath) {
    return fromPath;
  }

  throw new Error("Unable to find bun binary. Set BUN_BIN and retry.");
};

const detectServiceUser = (): string =>
  process.env.TRENCHCLAW_SERVICE_USER?.trim() ||
  process.env.SUDO_USER?.trim() ||
  process.env.USER?.trim() ||
  "root";
const detectServiceGroup = (): string =>
  process.env.TRENCHCLAW_SERVICE_GROUP?.trim() || detectServiceUser();
const detectWorkingDirectory = (): string =>
  process.env.TRENCHCLAW_WORKING_DIRECTORY?.trim() || ROOT_DIR;

const renderServiceFile = async (): Promise<string> => {
  const template = await Bun.file(`${TEMPLATE_DIR}/trenchclaw.service.template`).text();
  return template
    .replaceAll("__BUN_BIN__", detectBunBin())
    .replaceAll("__SERVICE_USER__", detectServiceUser())
    .replaceAll("__SERVICE_GROUP__", detectServiceGroup())
    .replaceAll("__WORKING_DIRECTORY__", detectWorkingDirectory());
};

const install = async (): Promise<void> => {
  if (process.platform !== "linux") {
    throw new Error("systemd install only supports Linux hosts.");
  }

  await ensureDir(TARGET_ENV_DIR);

  await copyIfMissing(`${TEMPLATE_DIR}/user.env.example`, `${TARGET_ENV_DIR}/user.env`);
  await copyIfMissing(`${TEMPLATE_DIR}/agent.env.example`, `${TARGET_ENV_DIR}/agent.env`);
  await copyIfMissing(`${TEMPLATE_DIR}/settings.user.yaml`, `${TARGET_ENV_DIR}/settings.user.yaml`);
  await copyIfMissing(`${TEMPLATE_DIR}/settings.agent.yaml`, `${TARGET_ENV_DIR}/settings.agent.yaml`);

  await writeFile(TARGET_SERVICE_PATH, await renderServiceFile());

  console.log(`Wrote ${TARGET_SERVICE_PATH}`);
  console.log(`Config directory: ${TARGET_ENV_DIR}`);
  console.log("Run: sudo systemctl daemon-reload");
  console.log("Run: sudo systemctl enable trenchclaw");
  console.log("Run: sudo systemctl restart trenchclaw");
};

await install();
