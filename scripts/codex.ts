import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncChangelogs } from "./syncChangelogs";

function parseArgs(argv: string[]) {
  const passthrough: string[] = [];
  let noSync = false;
  let forceSync = false;
  let noDepsUpdate = false;
  let forceDepsUpdate = false;
  let sdkOnly = false;
  let noTypecheck = false;

  const depsMinIntervalArg = argv.find((a) =>
    a.startsWith("--deps-min-interval-hours="),
  );
  const depsMinIntervalHours = depsMinIntervalArg
    ? Number(depsMinIntervalArg.split("=", 2)[1])
    : 20;
  const depsMinIntervalMs =
    typeof depsMinIntervalHours === "number" && Number.isFinite(depsMinIntervalHours)
      ? Math.max(0, depsMinIntervalHours) * 60 * 60 * 1000
      : 20 * 60 * 60 * 1000;

  for (const arg of argv) {
    if (arg === "--no-sync") noSync = true;
    else if (arg === "--sync-now") forceSync = true;
    else if (arg === "--no-deps") noDepsUpdate = true;
    else if (arg === "--deps-now") forceDepsUpdate = true;
    else if (arg === "--sdk-only") sdkOnly = true;
    else if (arg === "--no-typecheck") noTypecheck = true;
    else passthrough.push(arg);
  }

  return {
    passthrough,
    noSync,
    forceSync,
    noDepsUpdate,
    forceDepsUpdate,
    sdkOnly,
    depsMinIntervalMs,
    noTypecheck,
  };
}

type DepsUpdateState = {
  version: 1;
  lastUpdatedAtMs?: number;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const depsStatePath = path.join(repoRoot, ".cache", "deps-update.json");

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code === "ENOENT") return null;
    throw error;
  }
}

async function loadDepsState(): Promise<DepsUpdateState> {
  const raw = await readTextIfExists(depsStatePath);
  if (!raw) return { version: 1 };
  try {
    const parsed = JSON.parse(raw) as DepsUpdateState;
    if (parsed?.version !== 1) return { version: 1 };
    return parsed;
  } catch {
    return { version: 1 };
  }
}

async function saveDepsState(state: DepsUpdateState) {
  await mkdir(path.dirname(depsStatePath), { recursive: true });
  await writeFile(depsStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function run(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd });
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

async function maybeUpdateDeps(options: {
  force: boolean;
  minIntervalMs: number;
  sdkOnly: boolean;
}): Promise<void> {
  const state = await loadDepsState();
  const nowMs = Date.now();

  if (!options.force && state.lastUpdatedAtMs && options.minIntervalMs > 0) {
    const elapsedMs = nowMs - state.lastUpdatedAtMs;
    if (elapsedMs >= 0 && elapsedMs < options.minIntervalMs) return;
  }

  const bunBin = process.env.BUN_BIN || process.execPath;
  const script = options.sdkOnly ? "deps:update:sdk" : "deps:update";
  const exitCode = await run(bunBin, ["run", script], repoRoot);
  if (exitCode !== 0) throw new Error(`${script} failed (${exitCode})`);

  state.lastUpdatedAtMs = nowMs;
  await saveDepsState(state);
}

async function main() {
  const {
    passthrough,
    noSync,
    forceSync,
    noDepsUpdate,
    forceDepsUpdate,
    sdkOnly,
    depsMinIntervalMs,
    noTypecheck,
  } = parseArgs(process.argv.slice(2));

  if (!noDepsUpdate) {
    try {
      await maybeUpdateDeps({
        force: forceDepsUpdate,
        minIntervalMs: depsMinIntervalMs,
        sdkOnly,
      });
    } catch {
      // continue; codex should still start
    }
  }

  if (!noSync) {
    try {
      await syncChangelogs({
        checkOnly: false,
        quiet: true,
        force: forceSync,
        minIntervalMs: 12 * 60 * 60 * 1000,
        continueOnError: true,
      });
    } catch {
      // continue; codex should still start
    }
  }

  if (!noTypecheck) {
    try {
      const bunBin = process.env.BUN_BIN || process.execPath;
      await run(bunBin, ["run", "typecheck"], repoRoot);
    } catch {
      // continue; codex should still start
    }
  }

  const bin = process.env.CODEX_BIN || "codex";
  const child = spawn(bin, passthrough, { stdio: "inherit" });

  child.on("exit", (code, signal) => {
    if (typeof code === "number") process.exit(code);
    if (signal) process.kill(process.pid, signal);
    process.exit(1);
  });
}

main();
