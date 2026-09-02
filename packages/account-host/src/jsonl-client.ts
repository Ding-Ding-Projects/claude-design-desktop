import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import { CLIENT_NAME, CLIENT_TITLE, CODEX_PACKAGE_VERSION, DEFAULT_REQUEST_TIMEOUT_MS, MAX_PROTOCOL_LINE_BYTES, sanitizeError } from "./config.js";
import type { Writable, Readable } from "node:stream";

export type JsonRpcId = number;
export interface JsonRpcResponse { id: JsonRpcId; result?: unknown; error?: { code?: number; message?: string; data?: unknown }; }
export interface JsonRpcNotification { method: string; params?: Record<string, unknown>; id?: JsonRpcId; }
export interface SpawnOptions { env: NodeJS.ProcessEnv; stdio: ["pipe", "pipe", "pipe"]; }
export type SpawnFn = (file: string, args: string[], options: SpawnOptions) => ChildProcess;
type State = "new" | "starting" | "ready" | "closed" | "failed";
interface Pending { resolve: (value: unknown) => void; reject: (reason?: unknown) => void; timer: NodeJS.Timeout; }
const STABLE_METHODS = new Set(["account/read", "account/login/start", "account/login/cancel", "account/logout", "account/rateLimits/read", "model/list", "thread/start", "thread/resume", "thread/read", "thread/inject_items", "turn/start", "turn/interrupt"]);
export interface AppServerClientOptions { codexExecutable: string; codexHome: string; appVersion?: string; requestTimeoutMs?: number; spawn?: SpawnFn; environment?: NodeJS.ProcessEnv; }

/** JSONL JSON-RPC client for one isolated app-server process. */
export class AppServerClient extends EventEmitter {
  private readonly options: AppServerClientOptions & { appVersion: string; requestTimeoutMs: number };
  private child: ChildProcess | undefined;
  private state: State = "new";
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  constructor(options: AppServerClientOptions) { super(); this.options = { ...options, appVersion: options.appVersion ?? "0.1.0", requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS }; }
  get ready(): boolean { return this.state === "ready"; }
  async start(): Promise<void> {
    if (this.state !== "new") throw new Error("App-server client has already started");
    this.state = "starting";
    try {
      const env = { ...(this.options.environment ?? {}), CODEX_HOME: this.options.codexHome };
      this.child = (this.options.spawn ?? spawn)(this.options.codexExecutable, ["app-server", "--listen", "stdio://"], { env, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) { this.state = "failed"; throw sanitizeError(error); }
    if (!this.child.stdin || !this.child.stdout) { this.state = "failed"; throw new Error("App-server stdio transport is unavailable"); }
    createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    this.child.stderr?.resume();
    this.child.on("error", (error) => this.fail(sanitizeError(error)));
    this.child.on("exit", (code, signal) => this.fail(new Error(`App-server exited (${code ?? "null"}, ${signal ?? "none"})`)));
    try {
      const response = await this.sendRequest("initialize", { clientInfo: { name: CLIENT_NAME, title: CLIENT_TITLE, version: this.options.appVersion || CODEX_PACKAGE_VERSION } }, true) as JsonRpcResponse;
      if (response.error || !Object.prototype.hasOwnProperty.call(response, "result")) throw new Error(response.error?.message || "App-server initialization returned no result");
      this.sendNotification("initialized", {});
      this.state = "ready";
    } catch (error) { await this.close(); throw sanitizeError(error); }
  }
  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!STABLE_METHODS.has(method)) throw new Error(`Unsupported app-server method: ${method}`);
    if (this.state !== "ready") throw new Error("App-server client is not initialized");
    const response = await this.sendRequest(method, params, false) as JsonRpcResponse;
    if (response.error) throw sanitizeError(new Error(response.error.message || "App-server request failed"));
    return response.result;
  }
  sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.child?.stdin || this.state === "closed" || this.state === "failed") return;
    this.child.stdin.write(`${JSON.stringify({ method, ...(params === undefined ? {} : { params }) })}\n`);
  }
  async close(): Promise<void> {
    if (!this.child) { this.state = "closed"; return; }
    this.state = "closed";
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("App-server client closed")); }
    this.pending.clear();
    this.child.stdin?.end();
    if (!this.child.killed) this.child.kill();
    this.child = undefined;
  }
  private sendRequest(method: string, params: Record<string, unknown> | undefined, initializing: boolean): Promise<unknown> {
    if (!initializing && this.state !== "ready") return Promise.reject(new Error("App-server client is not initialized"));
    const stdin = this.child?.stdin as Writable | undefined;
    if (!stdin || this.state === "closed" || this.state === "failed") return Promise.reject(new Error("App-server transport is unavailable"));
    const id = this.nextId++;
    const wire = JSON.stringify({ method, id, ...(params === undefined ? {} : { params }) });
    if (Buffer.byteLength(wire, "utf8") > MAX_PROTOCOL_LINE_BYTES) throw new Error("App-server request exceeded the size limit");
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`App-server request timed out: ${method}`)); }, this.options.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    stdin.write(`${wire}\n`);
    return response;
  }
  private handleLine(line: string): void {
    if (Buffer.byteLength(line, "utf8") + 1 > MAX_PROTOCOL_LINE_BYTES) { this.fail(new Error("App-server protocol line exceeded the size limit")); return; }
    let message: JsonRpcResponse | JsonRpcNotification;
    try { message = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification; } catch { const error = new Error("App-server returned malformed JSON"); this.emit("protocolError", error); this.fail(error); return; }
    if ("id" in message && typeof message.id === "number") {
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer); pending.resolve(message); return;
    }
    if ("method" in message && typeof message.method === "string") { if ("id" in message && typeof message.id === "number") this.sendError(message.id, -32601, "Server-initiated requests are not supported"); else this.emit("notification", message); return; }
    this.emit("protocolError", new Error("App-server returned an invalid JSON-RPC message"));
  }
  private fail(error: Error): void {
    if (this.state === "closed" || this.state === "failed") return;
    this.state = "failed";
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear(); this.emit("errorState", error);
  }
  private sendError(id: JsonRpcId, code: number, message: string): void { if (!this.child?.stdin || this.state === "closed" || this.state === "failed") return; this.child.stdin.write(`${JSON.stringify({ id, error: { code, message } })}\n`); }
}
