import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ProjectDomainService } from "../src/index";

const run = promisify(execFile);

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "claude-design-history-"));
  const service = new ProjectDomainService(root);
  try {
    await service.open();
    await service.upsertAccount({ slotId: "owner", label: "Owner", state: "ready" });
    await service.createProject({ id: "history-project", name: "History", ownerSlotId: "owner" });
    const revision = (await service.databaseState()).history.find((entry) => entry.action === "created");
    assert.ok(revision?.commit);
    const bareRepository = path.join(root, "history", "projects", "history-project.git");
    await run("git", ["--git-dir", bareRepository, "cat-file", "-e", `${revision.commit}^{commit}`]);
    const tree = (await run("git", ["--git-dir", bareRepository, "show", "--format=", "--name-status", revision.commit])).stdout;
    assert.match(tree, /project-history-event\.json/);
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
}

void main();
