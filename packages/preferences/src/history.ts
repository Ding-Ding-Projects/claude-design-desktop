export interface PreferenceHistoryRecord {
  id: string;
  timestamp: string;
  action: string;
  fields: string[];
  persisted: boolean;
}

export interface GitHistoryCommitInput {
  metadata: { id: string; timestamp: string; action: string; fields: string[] };
  snapshot: string;
}

/** Main-process-only adapter. Renderer code can hold this interface but cannot implement it. */
export interface MainProcessGitHistoryAdapter {
  readonly executionContext: "main";
  writeSnapshot(snapshot: string): Promise<void>;
  commit(input: GitHistoryCommitInput): Promise<{ revision: string }>;
  list(): Promise<PreferenceHistoryRecord[]>;
  diff(revisionA: string, revisionB: string): Promise<string>;
  restore(revision: string): Promise<void>;
}

export interface PreferenceHistoryOptions {
  onWriteFailure?: (error: Error, record: PreferenceHistoryRecord) => void;
}

export function createPreferenceHistory(adapter: MainProcessGitHistoryAdapter, options: PreferenceHistoryOptions = {}) {
  const ensureMain = () => {
    if (adapter.executionContext !== "main") throw new Error("history-adapter-must-run-in-main-process");
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
      await adapter.commit({ metadata: { id: next.id, timestamp: next.timestamp, action: next.action, fields: next.fields }, snapshot });
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
    restore: async (revision: string) => { ensureMain(); await adapter.restore(revision); return append("restored", [revision]); },
    reset: async () => append("history-reset", [])
  };
}

export function createMainProcessGitHistoryAdapter(options: {
  executionContext: "main";
  runGit: (args: string[]) => Promise<string>;
  writeSnapshot: (snapshot: string) => Promise<void>;
}): MainProcessGitHistoryAdapter {
  if (options.executionContext !== "main") throw new Error("history-adapter-must-run-in-main-process");
  return {
    executionContext: "main",
    writeSnapshot: options.writeSnapshot,
    async commit(input) {
      await options.writeSnapshot(input.snapshot);
      const revision = await options.runGit(["commit", "--allow-empty", "-m", `Preference mutation ${input.metadata.action}`]);
      return { revision: revision.trim() };
    },
    async list() {
      const raw = await options.runGit(["log", "--format=%H%x00%B"]);
      return parseHistoryLog(raw);
    },
    diff: (revisionA, revisionB) => options.runGit(["diff", revisionA, revisionB]),
    restore: async (revision) => { await options.runGit(["restore", "--source", revision, "--staged", "--worktree", "--", "preferences.snapshot"]); }
  };
}

function parseHistoryLog(raw: string): PreferenceHistoryRecord[] {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({ id: line.slice(0, 80), timestamp: "", action: line.replace(/^.*?Preference mutation\s*/i, ""), fields: [], persisted: true }));
}
