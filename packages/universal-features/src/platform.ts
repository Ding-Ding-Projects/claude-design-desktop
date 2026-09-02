import type { Provenance } from "./types.js";

export interface StatusSnapshot { project: string; state: "idle" | "running" | "waiting" | "blocked" | "failed" | "verified"; updatedAt: string; evidence: string[]; }
export interface VerifiedReceipt { commit: string; runUrl: string; verdict: "verified"; }
export class StatusHubProjection {
  private snapshot: StatusSnapshot;
  constructor(project: string, now = new Date().toISOString()) { this.snapshot = { project, state: "idle", updatedAt: now, evidence: [] }; }
  update(state: Exclude<StatusSnapshot["state"], "verified">, evidence: readonly string[], now = new Date().toISOString()): StatusSnapshot { this.snapshot = { ...this.snapshot, state, evidence: [...evidence], updatedAt: now }; return this.read(); }
  markVerified(receipt: VerifiedReceipt, now = new Date().toISOString()): StatusSnapshot { if (!/^[0-9a-f]{7,64}$/i.test(receipt.commit) || !/^https:\/\//.test(receipt.runUrl) || receipt.verdict !== "verified") throw new Error("Verified status requires a typed commit and run receipt"); this.snapshot = { ...this.snapshot, state: "verified", evidence: [`commit:${receipt.commit}`, `run:${receipt.runUrl}`, `verdict:${receipt.verdict}`], updatedAt: now }; return this.read(); }
  read(): StatusSnapshot { return { ...this.snapshot, evidence: [...this.snapshot.evidence] }; }
}
export function validateProvenance(value: Provenance): boolean { return value.source !== "unavailable" && Boolean(value.version && value.updatedAt && value.timezone) && !Number.isNaN(Date.parse(value.updatedAt)); }
export function formatProvenance(value: Provenance): string { return validateProvenance(value) ? `Version ${value.version}, updated ${value.updatedAt} (${value.timezone})` : "Version and update time unavailable"; }
export type LogoPreset = "default" | "monogram" | "outline" | "sunrise";
export interface LogoAsset { source: "preset" | "upload"; preset?: LogoPreset; mime: "image/png" | "image/svg+xml"; bytes: number; width: number; height: number; focalPoint: { x: number; y: number }; fit: "contain" | "cover"; }
export function validateLogo(asset: LogoAsset): void { if (asset.bytes > 2 * 1024 * 1024 || asset.width < 16 || asset.height < 16 || asset.width > 4096 || asset.height > 4096 || asset.focalPoint.x < 0 || asset.focalPoint.x > 1 || asset.focalPoint.y < 0 || asset.focalPoint.y > 1) throw new Error("Logo is outside the supported bounds"); }
export type DownloadState = "idle" | "awaiting-confirmation" | "downloading" | "paused" | "complete" | "cancelled" | "failed";
export interface DownloadTask { id: string; filename: string; source: string; destination: string; state: DownloadState; receivedBytes: number; totalBytes: number | null; rateBytesPerSecond: number | null; }
export class DownloadStateMachine {
  constructor(private task: DownloadTask) {}
  transition(next: DownloadState): DownloadTask { const allowed: Record<DownloadState, DownloadState[]> = { idle: ["awaiting-confirmation"], "awaiting-confirmation": ["downloading", "cancelled"], downloading: ["paused", "complete", "cancelled", "failed"], paused: ["downloading", "cancelled", "failed"], complete: [], cancelled: [], failed: [] }; if (!allowed[this.task.state].includes(next)) throw new Error(`Invalid download transition ${this.task.state} -> ${next}`); this.task = { ...this.task, state: next }; return this.read(); }
  progress(receivedBytes: number, totalBytes: number | null, rateBytesPerSecond: number | null): DownloadTask { if (this.task.state !== "downloading") throw new Error("Download is not active"); this.task = { ...this.task, receivedBytes: Math.max(0, receivedBytes), totalBytes, rateBytesPerSecond }; return this.read(); }
  read(): DownloadTask { return { ...this.task }; }
}
