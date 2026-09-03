import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectDatabase } from "../src/index";

async function run(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "claude-design-sqlite-"));
  const database = new ProjectDatabase(root);
  try {
    await database.open();
    const sqlite = new Database(database.sqlitePath, { readonly: true });
    assert.equal(sqlite.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(sqlite.pragma("foreign_keys", { simple: true }), 1);
    const tableNames = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => (row as { name: string }).name);
    for (const required of ["account_slots", "projects", "project_grants", "project_files", "design_systems", "chats", "chat_messages", "account_thread_bindings", "comments", "comment_replies", "previews", "settings", "background_operations", "migration_receipts", "history_revisions", "notification_history", "version_provenance"]) assert.ok(tableNames.includes(required), `missing SQLite table ${required}`);
    sqlite.close();
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
}
void run();
