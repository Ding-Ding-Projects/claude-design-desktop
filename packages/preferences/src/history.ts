const MAIN_PROCESS_ADAPTER = Symbol("main-process-preference-history-adapter");

export interface PreferenceHistoryRecord {
  id: string;
  timestamp: string;
  action: string;
  fields: string[];
  revision?: string;
  persisted: boolean;
}

export interface GitHistoryCommitInput {
  metadata: { id: string; timestamp: string; action: string; fields: string[] };
  snapshot: string;
}

/** A renderer cannot construct this brand. The factory performs the runtime process check. */
export interface MainProcessGitHistoryAdapter {
  readonly [MAIN_PROCESS_ADAPTER]: true;
  writeSnapshot(snapshot: string): Promise<void>;
  commit(input: GitHistoryCommitInput): Promise<{ revision: string }>;
  list(): Promise<PreferenceHistoryRecord[]>;
  diff(revisionA: string, revisionB: string): Promise<string>;
  restore(revision: string): Promise<{ revision: string }>;
}

export interface PreferenceHistoryOptions {
  onWriteFailure?: (error: Error, record: PreferenceHistoryRecord) => void;
}

export function createPreferenceHistory(adapter: MainProcessGitHistoryAdapter, options: PreferenceHistoryOptions = {}) {
  const ensureMain = () => {
    if (adapter[MAIN_PROCESS_ADAPTER] !== true) throw new Error("history-adapter-must-run-in-main-process");
  };
  const record = (action: string, fields: string[]): PreferenceHistoryRecord => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    action,
    fields: [...new Set(fields)].slice(0, 100),
    persisted: false
  });
  const append = async (action: string, fields: string[], snapshot = "[redacted preference snapshot]"): Promise<PreferenceHistoryRecord> => {
    ensureMain();
    const next = record(action, fields);
    try {
      const result = await adapter.commit({ metadata: { id: next.id, timestamp: next.timestamp, action: next.action, fields: next.fields }, snapshot });
      next.revision = result.revision;
      next.persisted = true;
    } catch (error) {
      options.onWriteFailure?.(error instanceof Error ? error : new Error("history-write-failed"), next);
    }
    return next;
  };
  return {
    append,
    list: async () => { ensureMain(); return adapter.list(); },
    diff: async (revisionA: string, revisionB: string) => { ensureMain(); return adapter.diff(revisionA, revisionB); },
    restore: async (revision: string) => {
      ensureMain();
      const result = await adapter.restore(revision);
      const next = record("restored", [revision]);
      next.revision = result.revision;
      next.persisted = true;
      return next;
    },
    reset: async () => append("history-reset", [])
  };
}

export function createMainProcessGitHistoryAdapter(options: {
  runGit: (args: string[]) => Promise<string>;
  writeSnapshot: (snapshot: string) => Promise<void>;
}): MainProcessGitHistoryAdapter {
  const processKind = typeof process !== "undefined" && typeof (process as NodeJS.Process & { type?: string }).type === "string" ? (process as NodeJS.Process & { type?: string }).type : "main";
  if (processKind === "renderer") throw new Error("history-adapter-must-run-in-main-process");
  return {
    [MAIN_PROCESS_ADAPTER]: true,
    writeSnapshot: options.writeSnapshot,
    async commit(input) {
      await options.writeSnapshot(input.snapshot);
      await options.runGit(["add", "--", "preferences.snapshot"]);
      await options.runGit(["commit", "--allow-empty", "-m", `Preference mutation ${input.metadata.action}`]);
      const revision = await options.runGit(["rev-parse", "HEAD"]);
      return { revision: revision.trim() };
    },
    async list() {
      const raw = await options.runGit(["log", "--format=%H%x00%ct%x00%s%x00%b%x00"]);
      return parseHistoryLog(raw);
    },
    diff: (revisionA, revisionB) => options.runGit(["diff", revisionA, revisionB, "--", "preferences.snapshot"]),
    async restore(revision) {
      await options.runGit(["restore", "--source", revision, "--staged", "--worktree", "--", "preferences.snapshot"]);
      await options.runGit(["add", "--", "preferences.snapshot"]);
      await options.runGit(["commit", "--allow-empty", "-m", "Preference restore"]);
      const restored = await options.runGit(["rev-parse", "HEAD"]);
      return { revision: restored.trim() };
    }
  };
}

function parseHistoryLog(raw: string): PreferenceHistoryRecord[] {
  const fields = raw.split("\0");
  const records: PreferenceHistoryRecord[] = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const [id, timestamp, subject, body] = fields.slice(index, index + 4);
    if (!id || !subject) continue;
    const action = subject.replace(/^Preference mutation\s*/i, "").trim() || subject;
    records.push({ id, timestamp: timestamp ? new Date(Number(timestamp) * 1_000).toISOString() : "", action, fields: body ? body.split(/\s+/).filter(Boolean).slice(0, 100) : [], revision: id, persisted: true });
  }
  return records;
}
