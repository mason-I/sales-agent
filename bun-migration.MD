# Bun migration (full runtime + package manager)

## Goal (plain English)
Switch the project to Bun for **everything**:
- Install dependencies with `bun install`
- Run scripts with `bun` (instead of `npm run` or `node`)
- Use Bun’s lockfile (`bun.lock`) as the source of truth
- Tell the Agent SDK to run with Bun (`executable: "bun"`)

This should be faster and simpler, with fewer moving parts.

## Scope
**In scope**
- `package.json` scripts → run via Bun
- Replace `tsx` usage with Bun’s built‑in TS runner
- Add `bun.lock` and remove `package-lock.json`
- Update any docs/CLI output that say `npm run …`
- Update Agent SDK `query()` options to use Bun

**Out of scope**
- Changing business logic or agent behavior
- Adding new features
- Restructuring the codebase

## What will actually change
1) **Scripts** in `package.json` will change from:
   - `tsx src/…` → `bun src/…`
2) **TS runtime**
   - We will remove `tsx` from devDependencies.
   - Bun can run `.ts` files directly.
3) **Lockfiles**
   - `bun.lock` becomes the primary lockfile.
   - `package-lock.json` is removed.
4) **Agent SDK runtime**
   - Set `executable: "bun"` in `query()` options (per `AGENTS SDK Docs/typescript.md`).
5) **CLI hints**
   - Update any user-facing messages that mention `npm run` to `bun`.

## Decisions needed (for approval)
Please confirm these before I make changes:
- [ ] **Run `bun install` now** in this repo to generate `bun.lock`, and **delete `package-lock.json`**.
- [ ] **Pin Bun version** using `packageManager` in `package.json` (e.g., `"packageManager": "bun@1.1.x"`).
- [ ] **Remove `tsx`** from devDependencies (since Bun runs TypeScript directly).

If you approve all three, I’ll do it in one pass.

## Planned edit list
- `package.json`
  - Update scripts to `bun …`
  - Remove `tsx` from devDependencies
  - (Optional) Add `packageManager: "bun@<version>"`
- `scripts/evalRunner.ts`
  - Update printed usage instructions from `npm run` → `bun`
- `src/runtime/*.ts` + `src/eval/*.ts` + `scripts/*.ts`
  - Wherever `query()` is called, add `executable: "bun"` in options
- `bun.lock`
  - Add generated lockfile
- Remove `package-lock.json`

## Step‑by‑step (simple)
1) Install Bun (if not already):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
2) Generate Bun lockfile:
   ```bash
   bun install
   ```
3) Run scripts with Bun:
   ```bash
   bun dev
   bun cron:stale-deals
   bun cron:dead-opps
   bun eval
   ```
4) (Optional) Use `bunx` if you ever replace `npx` usage:
   ```bash
   bunx <package>
   ```

## Validation checklist
- [ ] `bun --version` works
- [ ] `bun install` completes and creates `bun.lock`
- [ ] `bun dev` runs the agent
- [ ] `bun cron:*` scripts run without errors
- [ ] `bun eval` completes

## Rollback plan (if something breaks)
- Restore `package-lock.json` from git
- Revert script changes back to `tsx` + `npm run`
- Remove `bun.lock`

## Why this is worth it (ROI)
- Faster installs and script startup
- Fewer tools (no extra TS runner)
- Single runtime + package manager

---

If this looks good, reply “approved” and I’ll make the changes.
