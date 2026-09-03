export type RegexWorkerResult = { matches: Array<{ index: number; text: string; groups: Record<string, string> }>; elapsedMs: number };

const WORKER_SOURCE = `self.onmessage = (event) => {
  const { pattern, flags, sample, requestId } = event.data;
  try {
    const expression = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    const matches = []; let result; let guard = 0;
    while ((result = expression.exec(sample)) && guard < 200) {
      matches.push({ index: result.index, text: result[0], groups: result.groups || {} }); guard++;
      if (result[0] === '') expression.lastIndex++;
    }
    self.postMessage({ requestId, matches });
  } catch (error) { self.postMessage({ requestId, error: error.message }); }
};`;

export type WorkerLike = { postMessage(message: unknown): void; terminate(): void; onmessage: ((event: { data: any }) => void) | null; onerror: (() => void) | null };

export class BoundedRegexEvaluator {
  private nextId = 0;
  private activeWorker?: WorkerLike;
  private activeReject?: (reason?: unknown) => void;
  constructor(private readonly createWorker: () => WorkerLike = () => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url) as unknown as WorkerLike;
    return worker;
  }) {}

  evaluate(pattern: string, flags: string, sample: string, timeoutMs = 250): Promise<RegexWorkerResult> {
    if (pattern.length > 4096 || sample.length > 32768) return Promise.reject(new Error("Regex input exceeds the bounded evaluation limit"));
    const started = Date.now();
    const requestId = ++this.nextId;
    const worker = this.createWorker();
    this.activeWorker = worker;
    return new Promise((resolve, reject) => {
      this.activeReject = reject;
      const timeout = setTimeout(() => { worker.terminate(); this.activeWorker = undefined; this.activeReject = undefined; reject(new Error("Regex evaluation timed out")); }, timeoutMs);
      worker.onmessage = (event) => {
        if (event.data.requestId !== undefined && event.data.requestId !== requestId) return;
        clearTimeout(timeout); worker.terminate(); this.activeWorker = undefined; this.activeReject = undefined;
        if (event.data.error) reject(new Error(event.data.error));
        else resolve({ matches: event.data.matches, elapsedMs: Date.now() - started });
      };
      worker.onerror = () => { clearTimeout(timeout); worker.terminate(); this.activeWorker = undefined; this.activeReject = undefined; reject(new Error("Regex worker failed")); };
      worker.postMessage({ requestId, pattern, flags, sample });
    });
  }

  cancel(): void {
    this.activeWorker?.terminate();
    this.activeWorker = undefined;
    this.activeReject?.(new Error("Regex evaluation cancelled"));
    this.activeReject = undefined;
  }
}

export { WORKER_SOURCE };
