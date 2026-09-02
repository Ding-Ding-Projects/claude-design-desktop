export type ConverterCategory = "documents-pdf" | "images" | "audio" | "video" | "archives" | "structured-data" | "code-text" | "binary-encodings";
export interface ConverterAdapter { id: string; category: ConverterCategory; sourceSignatures: readonly string[]; targetFormat: string; bundled: boolean; packageProof: boolean; reason: string; lossy: boolean; }
export const converterCategories: readonly ConverterCategory[] = ["documents-pdf", "images", "audio", "video", "archives", "structured-data", "code-text", "binary-encodings"];
export function adapterCapability(adapter: ConverterAdapter): { enabled: boolean; reason: string } { return adapter.bundled && adapter.packageProof ? { enabled: true, reason: "Bundled package proof supplied by the owning adapter" } : { enabled: false, reason: adapter.reason || "Bundled package proof is pending" }; }
export interface QueueItem { id: string; path: string; state: "queued" | "running" | "paused" | "cancelled" | "converted" | "failed"; progress: number; error?: string; }
export interface OllamaCatalog { revision: string; refreshedAt: string; complete: boolean; pages: number; stale: boolean; models: OllamaModel[]; }
export interface OllamaModel { name: string; tag: string; capabilities: string[]; sizeBytes: number | null; parameters: number | null; quantization: string | null; }
export type FitVerdict = "Runs well" | "Runs with limits" | "Unlikely" | "Unknown";
export interface HardwareEvidence { ramBytes: number | null; vramBytes: number | null; diskBytes: number | null; driver: string | null; }
/** No fit verdict is inferred from names. The owning integration supplies measured evidence. */
export function unknownFit(hardware: HardwareEvidence): { verdict: FitVerdict; evidence: HardwareEvidence; reason: string } { return { verdict: "Unknown", evidence: hardware, reason: "Measured model metadata and hardware evidence are required" }; }
export interface PullItem { tag: string; state: "queued" | "pulling" | "paused" | "cancelled" | "pulled" | "failed"; completedBytes: number; totalBytes: number | null; }
export interface OllamaHarness { id: string; executable: string; args: string[]; workingDirectory: string; allowlistedByHost: boolean; }
/** Launch validation belongs to the host adapter. A caller cannot make an executable trusted here. */
export function harnessCapability(harness: OllamaHarness): { enabled: boolean; reason: string } { return harness.allowlistedByHost ? { enabled: true, reason: "Host adapter supplied allowlist proof" } : { enabled: false, reason: "Host allowlist proof is pending" }; }
export interface OllamaChat { id: string; model: string; systemPrompt: string; messages: Array<{ role: "user" | "assistant"; content: string }>; }
