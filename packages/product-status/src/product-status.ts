import { createHash } from "node:crypto";

export type VerificationState = "unrun" | "running" | "failed" | "verified";
export type ProductProvenance = {
  buildRecordedAt: string;
  commit: string;
  manifestSha256: string;
  packageSha256: string;
  version: string;
};
export type StatusEvidence = {
  captureId: string;
  checkId: string;
  commit: string;
  detail: string;
  packageSha256: string;
  state: VerificationState;
  subject: string;
};
export type ProductStatusProjection = {
  appId: string;
  commit: string | null;
  evidence: readonly StatusEvidence[];
  enrollment: "enrolled" | "enrollment-unavailable";
  packageSha256: string | null;
  updatedAt: string | null;
  verification: VerificationState;
  version: string | null;
};
export type StatusHubReceipt = {
  acceptedAt: string;
  projectionSha256: string;
  receiptId: string;
};
export type StatusHubTransport = {
  publish(projection: ProductStatusProjection): Promise<StatusHubReceipt>;
  readBack(receiptId: string): Promise<ProductStatusProjection>;
};
export type ProductStatusOptions = {
  appId: string;
  evidence?: readonly StatusEvidence[];
  enrolled: boolean;
  provenance?: ProductProvenance;
  transport?: StatusHubTransport;
};
export type StatusPublishResult =
  | { delivery: "delivered"; projection: ProductStatusProjection; receipt: StatusHubReceipt }
  | { delivery: "enrollment-unavailable"; projection: ProductStatusProjection; reason: string }
  | { delivery: "failed"; projection: ProductStatusProjection; reason: string };
export type StatusHubProjectOptions = { app: ProductStatusOptions; defaultRef: string; projectId: string };
export type StatusHubProjectProjection = {
  app: ProductStatusProjection;
  defaultRef: string;
  enrollment: ProductStatusProjection["enrollment"];
  projectId: string;
};

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const EVIDENCE_STATES = new Set<VerificationState>(["unrun", "running", "failed", "verified"]);
function validIso(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.includes("T") && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}
function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
export function projectionSha256(projection: ProductStatusProjection): string {
  return createHash("sha256").update(stableJson(projection)).digest("hex");
}
export function validateEvidence(evidence: readonly StatusEvidence[], provenance?: ProductProvenance): readonly StatusEvidence[] {
  for (const item of evidence) {
    if (!item.subject || item.subject.length > 256 || !item.checkId || item.checkId.length > 256 || !item.captureId || item.captureId.length > 256 ||
      item.detail.length > 4096 || !SHA_PATTERN.test(item.commit) || !HASH_PATTERN.test(item.packageSha256) || !EVIDENCE_STATES.has(item.state)) {
      throw new Error("Status evidence is missing an immutable check, capture, commit, or package reference.");
    }
    if (provenance && (item.commit !== provenance.commit || item.packageSha256 !== provenance.packageSha256)) {
      throw new Error("Status evidence is not bound to the packaged provenance.");
    }
  }
  return Object.freeze(evidence.map((item) => Object.freeze({ ...item })));
}
export function createProductStatusProjection(options: ProductStatusOptions): ProductStatusProjection {
  if (!options.appId || options.appId.length > 128) throw new Error("Status appId must be a bounded non-empty value.");
  const provenance = options.provenance;
  if (provenance && (!provenance.version || !SHA_PATTERN.test(provenance.commit) || !HASH_PATTERN.test(provenance.packageSha256) || !HASH_PATTERN.test(provenance.manifestSha256) || !validIso(provenance.buildRecordedAt))) {
    throw new Error("Status provenance is incomplete or invalid.");
  }
  const evidence = validateEvidence(options.evidence || [], provenance);
  const verification: VerificationState = evidence.some((item) => item.state === "failed")
    ? "failed" : evidence.some((item) => item.state === "running") ? "running"
      : evidence.length > 0 && evidence.every((item) => item.state === "verified") ? "verified" : "unrun";
  return Object.freeze({
    appId: options.appId, commit: provenance?.commit || null, evidence,
    enrollment: options.enrolled ? "enrolled" : "enrollment-unavailable",
    packageSha256: provenance?.packageSha256 || null, updatedAt: provenance?.buildRecordedAt || null,
    verification, version: provenance?.version || null
  });
}
export function createStatusHubProjectProjection(options: StatusHubProjectOptions): StatusHubProjectProjection {
  if (!options.projectId || !options.defaultRef) throw new Error("Status project identity is incomplete.");
  const app = createProductStatusProjection(options.app);
  return { app, defaultRef: options.defaultRef, enrollment: app.enrollment, projectId: options.projectId };
}

export class ProductStatusProjector {
  private readonly options: ProductStatusOptions;
  private projection: ProductStatusProjection;
  public constructor(options: ProductStatusOptions) {
    this.options = options;
    this.projection = createProductStatusProjection(options);
  }
  public get current(): ProductStatusProjection { return this.projection; }
  public updateEvidence(evidence: readonly StatusEvidence[]): ProductStatusProjection {
    this.projection = createProductStatusProjection({ ...this.options, evidence });
    return this.current;
  }
  public async publish(): Promise<StatusPublishResult> {
    if (!this.options.enrolled || !this.options.transport) {
      return { delivery: "enrollment-unavailable", projection: this.current, reason: "Status Hub enrollment is unavailable; no delivery was attempted." };
    }
    try {
      const receipt = await this.options.transport.publish(this.current);
      if (!receipt || !receipt.receiptId || !validIso(receipt.acceptedAt) || !HASH_PATTERN.test(receipt.projectionSha256) || receipt.projectionSha256 !== projectionSha256(this.current)) {
        throw new Error("Status Hub returned an invalid or mismatched receipt.");
      }
      const readBack = await this.options.transport.readBack(receipt.receiptId);
      if (stableJson(readBack) !== stableJson(this.current)) throw new Error("Status Hub read-back did not match the immutable projection.");
      return { delivery: "delivered", projection: this.current, receipt };
    } catch (error) {
      return { delivery: "failed", projection: this.current, reason: error instanceof Error ? error.message : "Status Hub delivery failed." };
    }
  }
}
