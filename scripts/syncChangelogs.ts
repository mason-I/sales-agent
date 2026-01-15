import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Source = {
  id: string;
  url: string;
  destRelativePath: string;
};

type SyncStateEntry = {
  etag?: string;
  lastModified?: string;
  lastSyncedAtMs?: number;
};

type SyncState = {
  version: 1;
  entries: Record<string, SyncStateEntry>;
};

type SyncOptions = {
  checkOnly: boolean;
  quiet: boolean;
  force: boolean;
  minIntervalMs?: number;
  continueOnError: boolean;
};

const SOURCES: Source[] = [
  {
    id: "claude-agent-sdk-typescript",
    url: "https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/refs/heads/main/CHANGELOG.md",
    destRelativePath: path.join("AGENTS SDK Docs", "Agents SDK Changelog.md"),
  },
  {
    id: "claude-code",
    url: "https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md",
    destRelativePath: path.join("AGENTS SDK Docs", "Claude Code CHANGELOG.md"),
  },
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateFilePath = path.join(repoRoot, ".cache", "agent-sdk-doc-sync.json");

function print(message: string, options: { quiet: boolean }) {
  if (!options.quiet) process.stdout.write(`${message}\n`);
}

function eprint(message: string, options: { quiet: boolean }) {
  if (!options.quiet) process.stderr.write(`${message}\n`);
}

function normalizeMarkdown(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code === "ENOENT") return null;
    throw error;
  }
}

async function loadState(): Promise<SyncState> {
  const raw = await readTextIfExists(stateFilePath);
  if (!raw) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(raw) as SyncState;
    if (parsed?.version !== 1 || typeof parsed.entries !== "object") {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

async function saveState(state: SyncState) {
  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function syncSource(
  source: Source,
  state: SyncState,
  options: SyncOptions,
): Promise<{ changed: boolean; skipped: boolean }> {
  const destPath = path.join(repoRoot, source.destRelativePath);
  const entry = state.entries[source.url] ?? {};
  const nowMs = Date.now();

  if (!options.force && options.minIntervalMs && entry.lastSyncedAtMs) {
    const elapsedMs = nowMs - entry.lastSyncedAtMs;
    if (elapsedMs >= 0 && elapsedMs < options.minIntervalMs) {
      print(`skip (recent): ${source.destRelativePath}`, options);
      return { changed: false, skipped: true };
    }
  }

  const headers = new Headers();
  if (entry.etag) headers.set("If-None-Match", entry.etag);
  if (entry.lastModified) headers.set("If-Modified-Since", entry.lastModified);

  const response = await fetch(source.url, { headers });
  if (response.status === 304) {
    state.entries[source.url] = { ...entry, lastSyncedAtMs: nowMs };
    print(`up-to-date: ${source.destRelativePath} (304)`, options);
    return { changed: false, skipped: false };
  }
  if (!response.ok) {
    throw new Error(
      `Fetch failed (${response.status} ${response.statusText}) for ${source.url}`,
    );
  }

  const remoteText = normalizeMarkdown(await response.text());
  const localRaw = await readTextIfExists(destPath);
  const localText = localRaw === null ? null : normalizeMarkdown(localRaw);

  const same = localText === remoteText;
  if (!same) {
    if (options.checkOnly) {
      print(`outdated: ${source.destRelativePath}`, options);
    } else {
      await mkdir(path.dirname(destPath), { recursive: true });
      await writeFile(destPath, remoteText, "utf8");
      print(`updated: ${source.destRelativePath}`, options);
    }
  } else {
    print(`up-to-date: ${source.destRelativePath}`, options);
  }

  state.entries[source.url] = {
    etag: response.headers.get("etag") ?? entry.etag,
    lastModified: response.headers.get("last-modified") ?? entry.lastModified,
    lastSyncedAtMs: nowMs,
  };

  return { changed: !same, skipped: false };
}

function parseArgs(argv: string[]): SyncOptions {
  const args = new Set(argv);

  const checkOnly = args.has("--check") || args.has("--check-only");
  const quiet = args.has("--quiet") || args.has("-q");
  const force = args.has("--force");
  const continueOnError = args.has("--continue-on-error");

  const minIntervalArg = argv.find((a) => a.startsWith("--min-interval-hours="));
  const minIntervalHours = minIntervalArg
    ? Number(minIntervalArg.split("=", 2)[1])
    : undefined;

  const minIntervalMs =
    typeof minIntervalHours === "number" && Number.isFinite(minIntervalHours)
      ? Math.max(0, minIntervalHours) * 60 * 60 * 1000
      : undefined;

  return { checkOnly, quiet, force, minIntervalMs, continueOnError };
}

export async function syncChangelogs(options: SyncOptions): Promise<{
  anyChanged: boolean;
  anyOutdated: boolean;
}> {
  const state = await loadState();
  let anyChanged = false;
  let anyOutdated = false;

  for (const source of SOURCES) {
    try {
      const { changed } = await syncSource(source, state, options);
      anyChanged ||= changed;
      anyOutdated ||= options.checkOnly && changed;
    } catch (error) {
      eprint(
        `error: ${source.destRelativePath}: ${(error as Error).message}`,
        options,
      );
      if (!options.continueOnError) throw error;
    }
  }

  if (!options.checkOnly) await saveState(state);
  return { anyChanged, anyOutdated };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { anyOutdated } = await syncChangelogs(options);
  if (options.checkOnly && anyOutdated) process.exitCode = 2;
}

if (import.meta.main) {
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main();
}

