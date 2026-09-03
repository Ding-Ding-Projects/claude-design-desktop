export type VerificationState = "unrun" | "running" | "failed" | "verified";

export type ProductProvenance = {
  buildRecordedAt: string;
  commit: string;
  version: string;
};

export type ProductStatusProjection = {
  appId: string;
  commit: string | null;
  evidence: readonly StatusEvidence[];
  enrollment: "enrolled" | "enrollment-unavailable";
  updatedAt: string | null;
  verification: VerificationState;
  version: string | null;
};

export type StatusEvidence = {
  detail: string;
  state: VerificationState;
  subject: string;
};

export type StatusPublishResult =
  | { delivery: "delivered"; projection: ProductStatusProjection }
  | { delivery: "enrollment-unavailable"; projection: ProductStatusProjection; reason: string }
  | { delivery: "failed"; projection: ProductStatusProjection; reason: string };

export type StatusHubTransport = {
  publish(projection: ProductStatusProjection): Promise<void>;
};

export type ProductStatusOptions = {
  appId: string;
  evidence?: readonly StatusEvidence[];
  enrolled: boolean;
  provenance?: ProductProvenance;
  transport?: StatusHubTransport;
};

export type StatusHubProjectOptions = {
  app: ProductStatusOptions;
  defaultRef: string;
  projectId: string;
};

export type StatusHubProjectProjection = {
  app: ProductStatusProjection;
  defaultRef: string;
  enrollment: ProductStatusProjection["enrollment"];
  projectId: string;
};

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function validIso(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.includes("T") && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

export function createProductStatusProjection(options: ProductStatusOptions): ProductStatusProjection {
  if (!options.appId || options.appId.length > 128) throw new Error("Status appId must be a bounded non-empty value.");
  const provenance = options.provenance;
  if (provenance && (!provenance.version || !SHA_PATTERN.test(provenance.commit) || !validIso(provenance.buildRecordedAt))) {
    throw new Error("Status provenance is incomplete or invalid.");
  }
  const evidence = [...(options.evidence || [])];
  const verification = evidence.some((item) => item.state === "failed")
    ? "failed"
    : evidence.some((item) => item.state === "running")
      ? "running"
      : evidence.length > 0 && evidence.every((item) => item.state === "verified")
        ? "verified"
        : "unrun";
  return {
    appId: options.appId,
    commit: provenance?.commit || null,
    evidence,
    enrollment: options.enrolled ? "enrolled" : "enrollment-unavailable",
    updatedAt: provenance?.buildRecordedAt || null,
    verification,
    version: provenance?.version || null
  };
}

export function createStatusHubProjectProjection(options: StatusHubProjectOptions): StatusHubProjectProjection {
  if (!options.projectId || !options.defaultRef) throw new Error("Status project identity is incomplete.");
  const app = createProductStatusProjection(options.app);
  return {
    app,
    defaultRef: options.defaultRef,
    enrollment: app.enrollment,
    projectId: options.projectId
  };
}

export class ProductStatusProjector {
  private readonly options: ProductStatusOptions;
  private projection: ProductStatusProjection;

  public constructor(options: ProductStatusOptions) {
    this.options = options;
    this.projection = createProductStatusProjection(options);
  }

  public get current(): ProductStatusProjection {
    return {
      ...this.projection,
      evidence: [...this.projection.evidence]
    };
  }

  public updateEvidence(evidence: readonly StatusEvidence[]): ProductStatusProjection {
    this.projection = createProductStatusProjection({ ...this.options, evidence });
    return this.current;
  }

  public async publish(): Promise<StatusPublishResult> {
    if (!this.options.enrolled || !this.options.transport) {
      return {
        delivery: "enrollment-unavailable",
        projection: this.current,
        reason: "Status Hub enrollment is unavailable; no delivery was attempted."
      };
    }
    try {
      await this.options.transport.publish(this.current);
      return { delivery: "delivered", projection: this.current };
    } catch (error) {
      return {
        delivery: "failed",
        projection: this.current,
        reason: error instanceof Error ? error.message : "Status Hub delivery failed."
      };
    }
  }
}
