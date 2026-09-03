import { randomUUID } from "node:crypto";
import { DomainError } from "./domain";
import { normalizeProjectPath, pathMatchesPrefix } from "./path-policy";

export const PLAN_TOKEN_TTL_MS = 900000;
type Plan = { projectId: string; scope: "paths" | "project"; writes: Set<string>; deletes: Set<string>; expiresAtMs: number; operationId: string; consumed: boolean };

export class PlanTokenManager {
  private readonly plans = new Map<string, Plan>();
  issue(projectId: string, scope: "paths" | "project", writes: string[] = [], deletes: string[] = [], operationId = randomUUID()) {
    const normalizedWrites: string[] = Array.from(new Set(writes.map(normalizeProjectPath)));
    const normalizedDeletes: string[] = Array.from(new Set(deletes.map(normalizeProjectPath)));
    if (scope === "paths" && !normalizedWrites.length && !normalizedDeletes.length) throw new DomainError("finalize_plan requires writes or deletes for path-scoped plans.", 400, "empty_plan");
    if (!operationId) throw new DomainError("operation_id is required.", 400, "operation_required");
    const token = `design-plan-${randomUUID()}`;
    const expiresAtMs = Date.now() + PLAN_TOKEN_TTL_MS;
    this.plans.set(token, { projectId, scope, writes: new Set(normalizedWrites), deletes: new Set(normalizedDeletes), expiresAtMs, operationId, consumed: false });
    const expiresAt = new Date(expiresAtMs).toISOString();
    return { token, plan_token: token, expiresAt, expires_at: expiresAt, writes: normalizedWrites, deletes: normalizedDeletes, scope, operation_id: operationId };
  }
  validate(token: string | undefined, projectId: string, targets: string[], kind: "writes" | "deletes", operationId?: string) {
    this.prune();
    if (!token) throw new DomainError(`${kind === "deletes" ? "delete_files" : "copy_files"} requires plan_token from finalize_plan.`, 400, "plan_required");
    const plan = this.plans.get(token);
    if (!plan) throw new DomainError("plan_token is invalid or expired.", 400, "plan_expired");
    if (plan.operationId !== operationId) throw new DomainError("operation_id does not match the plan.", 403, "plan_operation_mismatch");
    if (plan.consumed) throw new DomainError("plan_token has already been consumed.", 409, "plan_replay");
    if (plan.projectId !== projectId) throw new DomainError("plan_token was issued for a different project.", 403, "plan_project_mismatch");
    if (plan.scope !== "project") {
      const allowed = kind === "deletes" ? plan.deletes : plan.writes;
      for (const target of targets) if (![...allowed].some((prefix) => pathMatchesPrefix(target, prefix))) throw new DomainError(`plan_token does not cover ${target}.`, 403, "plan_scope");
    }
  }
  consume(token: string | undefined, projectId: string, operationId: string): void {
    this.prune();
    const plan = token ? this.plans.get(token) : undefined;
    if (!plan) throw new DomainError("plan_token is invalid or expired.", 400, "plan_expired");
    if (plan.projectId !== projectId || plan.operationId !== operationId) throw new DomainError("plan token binding does not match the operation.", 403, "plan_binding_mismatch");
    if (plan.consumed) throw new DomainError("plan_token has already been consumed.", 409, "plan_replay");
    plan.consumed = true;
  }
  prune(now = Date.now()) { for (const [token, plan] of this.plans) if (plan.expiresAtMs <= now) this.plans.delete(token); }
}
