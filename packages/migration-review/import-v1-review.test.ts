import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { ProjectDomainService } from "../project-domain/src/index";
import { inspectMigrationArchive, importMigrationArchive, type ArchiveEntry, type ImportManifest, type MigrationArchive } from "../migration/src/import-v1";

const ACCOUNT = "account-main";

function manifest(overrides: Partial<ImportManifest> = {}): ImportManifest {
  return {
    format: "claude-design-desktop-import-v1",
    schemaVersion: 1,
    sourceProductVersion: "1.0.0",
    sourceCommit: "4a3c267e7e22f6636a02542554309cd49cd41e9d",
    sourceDatabaseSha256: "a".repeat(64),
    exportedAt: "2026-09-02T00:00:00.000Z",
    idempotencyKey: "import-key-1",
    recordCounts: { projects: 1 },
    exclusionCounts: {},
    fileHashes: {},
    ...overrides
  };
}

function entry(name: string, text: string, extra: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return { name, bytes: Buffer.from(text, "utf8"), ...extra };
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function archive(entries: ArchiveEntry[], archiveManifest = manifest()): MigrationArchive {
  return { manifest: archiveManifest, entries };
}

test("review probe rejects an unknown manifest field instead of trusting typed input", async () => {
  const invalid = manifest({ extraField: "must be rejected" } as unknown as Partial<ImportManifest>);
  await assert.rejects(() => inspectMigrationArchive(archive([], invalid)), /unknown|schema|manifest/i);
});

test("review probe verifies every safe entry against its declared hash", async () => {
  const invalid = manifest({ fileHashes: { "projects/project-legacy/project.json": "b".repeat(64) } });
  const projectJson = JSON.stringify({ name: "Imported", ownerKey: ACCOUNT });
  await assert.rejects(
    () => inspectMigrationArchive(archive([entry("projects/project-legacy/project.json", projectJson)], invalid)),
    /hash|integrity|mismatch/i
  );
});

test("review probe rejects device-like path syntax rather than normalizing it", async () => {
  await assert.rejects(
    () => inspectMigrationArchive(archive([entry("projects/project-legacy/files/CON.txt", "bad")])),
    /unsafe|device|path/i
  );
  await assert.rejects(
    () => inspectMigrationArchive(archive([entry("projects/project-legacy/files/notes:stream", "bad")])),
    /unsafe|device|path/i
  );
});

test("review probe preserves a one-shot entry stream across preflight and import", async () => {
  const projectJson = JSON.stringify({ name: "Imported", ownerKey: ACCOUNT });
  const readme = "real content";
  const data = [
    entry("projects/project-legacy/project.json", projectJson),
    entry("projects/project-legacy/files/readme.txt", readme)
  ];
  let consumed = false;
  const oneShot: MigrationArchive = {
    manifest: manifest({ fileHashes: {
      "projects/project-legacy/project.json": sha256(projectJson),
      "projects/project-legacy/files/readme.txt": sha256(readme)
    } }),
    entries: {
      async *[Symbol.asyncIterator]() {
        if (consumed) return;
        consumed = true;
        yield* data;
      }
    }
  };
  const root = await mkdtemp(`${tmpdir()}/migration-review-`);
  try {
    const service = new ProjectDomainService(root);
    await service.open();
    await service.upsertAccount({ slotId: ACCOUNT, label: "Main", state: "ready" });
    const receipt = await importMigrationArchive(service, oneShot, { [ACCOUNT]: ACCOUNT }, { idempotencyKey: "import-key-1" });
    assert.equal(receipt.projectCount, 1, "a streamed archive must still import after preflight");
    assert.equal(receipt.fileCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
