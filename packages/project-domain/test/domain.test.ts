import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectDomainService, DomainError } from "../src/index";
import { inspectMigrationArchive, importMigrationArchive, type MigrationArchive } from "../../migration/src/index";
import { safeProjectPath } from "../../project-storage/src/index";

async function expectCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === code));
}

async function run(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "claude-design-domain-"));
  let service!: ProjectDomainService;
  try {
    service = new ProjectDomainService(root);
    await service.open();
    await service.upsertAccount({ slotId: "owner", label: "Owner", state: "ready" });
    await service.upsertAccount({ slotId: "editor", label: "Editor", state: "ready" });
    const project = await service.createProject({ id: "p1", name: "Prototype", ownerSlotId: "owner" });
    await service.setGrant({ projectId: project.id, actorSlotId: "owner", slotId: "editor", role: "editor" });
    await service.writeFile({ projectId: project.id, actorSlotId: "editor", path: "src/index.html", content: "<main>ok</main>" });
    assert.equal((await service.readFile(project.id, "editor", "src/index.html")).content, "<main>ok</main>");
    await service.deleteFile({ projectId: project.id, actorSlotId: "editor", path: "src/index.html", expectedVersion: 1 });
    assert.ok((await service.databaseState()).history.some((revision) => revision.action === "file-deleted"));
    await expectCode(() => service.writeFile({ projectId: project.id, actorSlotId: "editor", path: "../escape", content: "no" }), "UNSAFE_PROJECT_PATH");
    await expectCode(() => service.writeFile({ projectId: project.id, actorSlotId: "editor", path: "blocked.txt", content: "no", expectedVersion: 99 }), "VERSION_CONFLICT");
    await expectCode(() => service.addComment({ projectId: project.id, actorSlotId: "owner", body: "comment" }).then(() => service.removeAccount("owner")), "ACCOUNT_OWNS_PROJECTS");
    await service.transferOwnership(project.id, "owner", "editor");
    assert.equal((await service.role(project.id, "editor")), "owner");
    assert.equal((await service.role(project.id, "owner")), "editor");
    await service.removeAccount("owner");
    const archive: MigrationArchive = { manifest: { format: "claude-design-desktop-import-v1", schemaVersion: 1, sourceProductVersion: "0.1.0", sourceCommit: "4a3c267e7e22f6636a02542554309cd49cd41e9d", sourceDatabaseSha256: "db", exportedAt: new Date().toISOString(), idempotencyKey: "import-1", recordCounts: {}, exclusionCounts: { requests: 2 }, fileHashes: {} }, entries: [{ name: "projects/legacy/project.json", bytes: Buffer.from(JSON.stringify({ name: "Legacy", ownerKey: "editor" })) }, { name: "projects/legacy/files/readme.md", bytes: Buffer.from("hello") }, { name: "projects/legacy/request-logs/one.json", bytes: Buffer.from("secret") }] };
    const preflight = await inspectMigrationArchive(archive);
    assert.equal(preflight.projects[0]?.name, "Legacy");
    assert.equal(preflight.excluded.length, 1);
    const receipt = await importMigrationArchive(service, archive, { editor: "editor" }, { idempotencyKey: "import-1" });
    assert.equal(receipt.projectCount, 1);
    assert.equal((await importMigrationArchive(service, archive, { editor: "editor" }, { idempotencyKey: "import-1" })).sourceFingerprint, receipt.sourceFingerprint);
    const state = await service.databaseState();
    assert.equal(state.projects.length, 2);
    assert.ok(state.history.some((revision) => revision.action === "created"));
    await assert.rejects(() => safeProjectPath(root, "C:\\temp\\bad.txt"));
  } finally {
    service?.close();
    await rm(root, { recursive: true, force: true });
  }
}

void run();
