import { execFile } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { newId, nowIso, type HistoryRevision } from "../../project-domain/src/model";
const run = promisify(execFile); const SENSITIVE = /(secret|token|password|credential|authorization|cookie|api[_-]?key|private[_-]?key|otp|totp|pin)/i;
export class LocalGitHistory {
  constructor(private readonly root: string) {}
  async record(projectId: string, workspace: string, action: string, summary: string, metadata: Record<string, unknown> = {}): Promise<HistoryRevision> {
    const repo = path.join(this.root, "projects", `${projectId}.git`); const snapshot = path.join(this.root, "snapshots", projectId); await mkdir(repo, { recursive: true }); await mkdir(snapshot, { recursive: true });
    try { await run("git", ["--git-dir", repo, "rev-parse", "--git-dir"]); } catch { await run("git", ["init", "--bare", repo]); }
    await cp(workspace, snapshot, { recursive: true, force: true }); await writeFile(path.join(snapshot, ".project-history-event.json"), JSON.stringify({ action, summary, metadata: redact(metadata), createdAt: nowIso() }));
    const env = { ...process.env, GIT_DIR: repo, GIT_WORK_TREE: snapshot, GIT_AUTHOR_NAME: "Claude Fable 5.1", GIT_AUTHOR_EMAIL: "noreply@anthropic.com", GIT_COMMITTER_NAME: "Claude Fable 5.1", GIT_COMMITTER_EMAIL: "noreply@anthropic.com" }; await run("git", ["add", "-A"], { env }); let commit: string | null = null;
    try { await run("git", ["-c", "user.name=Claude Fable 5.1", "-c", "user.email=noreply@anthropic.com", "commit", "-m", `${summary}\n\n${action} recorded locally.\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`], { env }); commit = (await run("git", ["rev-parse", "HEAD"], { env })).stdout.trim(); } catch (error) { if (!String((error as Error).message || error).includes("nothing to commit")) throw error; }
    return { id: newId("history"), projectId, action, summary, commit, createdAt: nowIso(), metadata: redact(metadata) };
  }
}
function redact(value: Record<string, unknown>): Record<string, unknown> { const output: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) { if (SENSITIVE.test(key)) continue; output[key] = item && typeof item === "object" ? Array.isArray(item) ? item.map((entry) => entry && typeof entry === "object" ? redact(entry as Record<string, unknown>) : entry) : redact(item as Record<string, unknown>) : item; } return output; }
