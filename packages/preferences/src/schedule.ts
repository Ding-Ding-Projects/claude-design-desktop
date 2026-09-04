import type { ScheduleRule, ScheduledValues, ScheduleSource } from "./types.js";

export const MAX_SCHEDULE_RULES = 100;
export const MAX_REMOTE_RESPONSE_BYTES = 64 * 1024;
const allowedValueKeys = new Set<keyof ScheduledValues>([
  "languageMode", "theme", "density", "seedColor", "fontFamily", "fontSizeScale", "fontWeight", "displayName"
]);

export interface ScheduleContext {
  now: Date;
  timezone?: string;
}
export interface ScheduleResolution {
  values: ScheduledValues;
  ruleId: string | null;
  source: "base" | "local" | "api" | "home-assistant";
  active: boolean;
}

export function validateScheduleRule(rule: ScheduleRule): string[] {
  const errors: string[] = [];
  if (!rule.id || rule.id.length > 80) errors.push("invalid-id");
  if (!rule.label || rule.label.length > 120) errors.push("invalid-label");
  if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 100_000) errors.push("invalid-priority");
  if (!isTime(rule.startTime) || !isTime(rule.endTime, true)) errors.push("invalid-time");
  if (!rule.everyDay && (rule.weekdays.length === 0 || rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) errors.push("invalid-weekdays");
  if (rule.startDate && !isDate(rule.startDate)) errors.push("invalid-start-date");
  if (rule.endDate && !isDate(rule.endDate)) errors.push("invalid-end-date");
  if (rule.startDate && rule.endDate && compareDate(rule.startDate, rule.endDate) > 0) errors.push("date-order");
  try { new Intl.DateTimeFormat("en", { timeZone: rule.timezone }).format(); } catch { errors.push("invalid-timezone"); }
  errors.push(...validateScheduleSource(rule.source));
  for (const key of Object.keys(rule.values)) if (!allowedValueKeys.has(key as keyof ScheduledValues)) errors.push("unknown-value");
  return [...new Set(errors)];
}

function isDate(value: { year: number; month: number; day: number }): boolean {
  if (!Number.isInteger(value.year) || !Number.isInteger(value.month) || !Number.isInteger(value.day)) return false;
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return date.getUTCFullYear() === value.year && date.getUTCMonth() === value.month - 1 && date.getUTCDate() === value.day;
}

function isTime(value: { hour: number; minute: number }, allowEndOfDay = false): boolean {
  const hourValid = Number.isInteger(value.hour) && value.hour >= 0 && value.hour <= (allowEndOfDay ? 24 : 23);
  const endOfDayValid = value.hour !== 24 || value.minute === 0;
  return hourValid && endOfDayValid && Number.isInteger(value.minute) && value.minute >= 0 && value.minute < 60;
}

function compareDate(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): number {
  return Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
}

export function validateScheduleSource(source: ScheduleSource): string[] {
  if (source.kind === "local") return [];
  const errors: string[] = [];
  const rawUrl = source.kind === "api" ? source.url : source.baseUrl;
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) errors.push("embedded-credentials");
    if (url.protocol !== "https:" && !isLoopback(url.hostname)) errors.push("https-required");
    if (url.port && !["443", "80"].includes(url.port)) errors.push("unsafe-port");
  } catch { errors.push("invalid-url"); }
  if (source.kind === "api" && (!Number.isInteger(source.schemaVersion) || source.schemaVersion < 1)) errors.push("invalid-schema-version");
  if (source.kind === "home-assistant" && (!/^([a-z_]+\.)[a-z0-9_]+$/i.test(source.entityId) || !source.credentialKey)) errors.push("invalid-entity");
  return errors;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function zonedParts(date: Date, timezone: string): { year: number; month: number; day: number; weekday: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday ?? "");
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday, minutes: hour * 60 + Number(parts.minute) };
}

export function isScheduleRuleActive(rule: ScheduleRule, context: ScheduleContext): boolean {
  if (!rule.enabled || validateScheduleRule(rule).length > 0) return false;
  const timezone = context.timezone ?? rule.timezone;
  const current = zonedParts(context.now, timezone);
  const start = rule.startTime.hour * 60 + rule.startTime.minute;
  const end = rule.endTime.hour * 60 + rule.endTime.minute;
  const overnight = end < start;
  const dayValue = { year: current.year, month: current.month, day: current.day };
  const afterMidnight = overnight && current.minutes < end;
  const dateReference = afterMidnight
    ? (() => { const previous = new Date(Date.UTC(current.year, current.month - 1, current.day - 1)); return { year: previous.getUTCFullYear(), month: previous.getUTCMonth() + 1, day: previous.getUTCDate() }; })()
    : dayValue;
  if (rule.startDate && compareDate(dateReference, rule.startDate) < 0) return false;
  if (rule.endDate && compareDate(dateReference, rule.endDate) > 0) return false;
  const dayMatches = rule.everyDay || rule.weekdays.includes(current.weekday);
  if (dayMatches && (overnight ? current.minutes >= start : current.minutes >= start && current.minutes < end)) return true;
  if (afterMidnight) {
    const previousDay = (current.weekday + 6) % 7;
    return rule.everyDay || rule.weekdays.includes(previousDay);
  }
  return false;
}

export function resolveSchedule(rules: readonly ScheduleRule[], context: ScheduleContext, base: ScheduledValues): ScheduleResolution {
  const active = rules.filter((rule) => isScheduleRuleActive(rule, context));
  if (!active.length) return { values: { ...base }, ruleId: null, source: "base", active: false };
  active.sort((a, b) => b.priority - a.priority || b.id.localeCompare(a.id));
  const selected = active[0];
  if (!selected) return { values: { ...base }, ruleId: null, source: "base", active: false };
  return { values: { ...base, ...selected.values }, ruleId: selected.id, source: selected.source.kind, active: true };
}

export interface PrivilegedScheduleResponse {
  status: number;
  headers?: Record<string, string | undefined>;
  body?: ReadableStream<Uint8Array>;
  text?: () => Promise<string>;
}

export interface PrivilegedScheduleTransport {
  request(input: { url: string; headers: Record<string, string>; signal: AbortSignal; redirect: "error"; resolvedAddresses: string[] }): Promise<PrivilegedScheduleResponse>;
  resolveHost?(hostname: string): Promise<string[]>;
}

export interface ScheduleCredentialVault {
  getCredential(key: string): Promise<string | null>;
}

export interface ScheduleRefreshController {
  refresh(source: ScheduleSource): Promise<{ values: ScheduledValues; active: boolean; source: ScheduleResolution["source"] }>;
  cancel(): void;
}

export function createScheduleRefreshController(
  transport: PrivilegedScheduleTransport = unavailableScheduleTransport(),
  vault: ScheduleCredentialVault = { getCredential: async () => null },
  options: { deadlineMs?: number } = {}
): ScheduleRefreshController {
  let generation = 0;
  let controller: AbortController | null = null;
  const deadlineMs = Math.max(250, Math.min(30_000, options.deadlineMs ?? 5_000));
  return {
    async refresh(source) {
      const currentGeneration = ++generation;
      controller?.abort();
      controller = new AbortController();
      if (source.kind === "local") return { values: {}, active: true, source: "local" };
      const errors = validateScheduleSource(source);
      if (errors.length) throw new Error(errors.join(","));
      const url = source.kind === "api" ? source.url : `${source.baseUrl.replace(/\/$/, "")}/api/states/${source.entityId}`;
      const resolvedAddresses = await assertSafeResolvedUrl(url, transport);
      const deadlineAt = Date.now() + deadlineMs;
      const headers: Record<string, string> = {};
      if (source.kind === "home-assistant") {
        const credential = await vault.getCredential(source.credentialKey);
        if (!credential) throw new Error("home-assistant-credential-unavailable");
        headers.authorization = `Bearer ${credential}`;
      }
      const response = await requestWithDeadline(transport, { url, headers, signal: controller.signal, redirect: "error", resolvedAddresses }, deadlineAt);
      if (currentGeneration !== generation) throw new Error("stale-generation");
      if (response.status < 200 || response.status >= 300) throw new Error(`schedule-source-http-${response.status}`);
      const contentLengthHeader = headerValue(response.headers, "content-length");
      const contentLength = contentLengthHeader === undefined ? 0 : Number(contentLengthHeader);
      if (!Number.isFinite(contentLength) || contentLength < 0) throw new Error("invalid-content-length");
      if (contentLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error("response-too-large");
      const text = await readBoundedResponse(response, deadlineAt);
      if (currentGeneration !== generation) throw new Error("stale-generation");
      const parsed = JSON.parse(text) as unknown;
      if (source.kind === "home-assistant") {
        if (!isRecord(parsed) || (parsed.state !== "on" && parsed.state !== "off")) throw new Error("invalid-home-assistant-state");
        if (currentGeneration !== generation) throw new Error("stale-generation");
        return { values: {}, active: parsed.state === "on", source: "home-assistant" as const };
      }
      if (!isRecord(parsed) || parsed.schemaVersion !== source.schemaVersion || !isRecord(parsed.values)) throw new Error("invalid-schedule-payload");
      const values: ScheduledValues = {};
      for (const [key, value] of Object.entries(parsed.values)) {
        if (!allowedValueKeys.has(key as keyof ScheduledValues)) throw new Error("unknown-schedule-field");
        if (typeof value !== "string" && typeof value !== "number") throw new Error("invalid-schedule-value");
        values[key as keyof ScheduledValues] = value as never;
      }
      if (currentGeneration !== generation) throw new Error("stale-generation");
      return { values, active: true, source: "api" as const };
    },
    cancel() {
      generation++;
      controller?.abort();
      controller = null;
    }
  };
}

async function requestWithDeadline(transport: PrivilegedScheduleTransport, request: { url: string; headers: Record<string, string>; signal: AbortSignal; redirect: "error"; resolvedAddresses: string[] }, deadlineAt: number): Promise<PrivilegedScheduleResponse> {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  if (request.signal.aborted) requestController.abort();
  else request.signal.addEventListener("abort", abortRequest, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const remaining = Math.max(1, deadlineAt - Date.now());
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { requestController.abort(); reject(new Error("schedule-source-timeout")); }, remaining); });
  try {
    return await Promise.race([transport.request({ ...request, signal: requestController.signal }), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener("abort", abortRequest);
  }
}

async function readBoundedResponse(response: PrivilegedScheduleResponse, deadlineAt: number): Promise<string> {
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) { await reader.cancel(); throw new Error("schedule-body-timeout"); }
      const next = await readChunkWithDeadline(reader, remaining);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_REMOTE_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("response-too-large");
      }
      chunks.push(next.value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  }
  const text = await readTextWithDeadline(response.text?.() ?? Promise.resolve(""), deadlineAt);
  if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error("response-too-large");
  return text;
}

async function readTextWithDeadline(textPromise: Promise<string>, deadlineAt: number): Promise<string> {
  const remaining = Math.max(1, deadlineAt - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("schedule-body-timeout")), remaining); });
  try { return await Promise.race([textPromise, deadline]); }
  finally { if (timer) clearTimeout(timer); }
}

async function readChunkWithDeadline(reader: ReadableStreamDefaultReader<Uint8Array>, deadlineMs: number): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("schedule-body-timeout")), deadlineMs); });
  try {
    return await Promise.race([reader.read(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function headerValue(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === wanted)?.[1];
}

async function assertSafeResolvedUrl(rawUrl: string, transport: PrivilegedScheduleTransport): Promise<string[]> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && !isLoopback(url.hostname)) throw new Error("https-required");
  if (url.username || url.password) throw new Error("embedded-credentials");
  if (url.port && !["443", "80"].includes(url.port)) throw new Error("unsafe-port");
  const addresses = transport.resolveHost ? await transport.resolveHost(url.hostname) : isLoopback(url.hostname) ? [url.hostname] : [];
  if (addresses.length === 0) throw new Error("dns-resolution-required");
  if (addresses.some(isUnsafeAddress)) throw new Error("unsafe-resolved-address");
  return [...addresses];
}

function isUnsafeAddress(address: string): boolean {
  const normalized = address.trim().replace(/^\[|\]$/g, "").toLowerCase();
  const ipv4 = parseIPv4(normalized);
  if (ipv4) return isUnsafeIPv4(ipv4);
  const ipv6 = parseIPv6(normalized);
  if (!ipv6) return true;
  const mapped = ipv6.slice(-4);
  if (ipv6.slice(0, 10).every((part) => part === 0) && ipv6[10] === 0xffff) return isUnsafeIPv4(mapped);
  const first = ipv6[0] ?? 0;
  const last = ipv6[15] ?? 0;
  return ipv6.every((part) => part === 0) || (last === 1 && ipv6.slice(0, 15).every((part) => part === 0)) || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

function parseIPv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  return numbers.every((part) => part >= 0 && part <= 255) ? numbers : null;
}

function parseIPv6(value: string): number[] | null {
  if (!value.includes(":")) return null;
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const groups = half.split(":");
    const output: number[] = [];
    for (const group of groups) {
      if (group.includes(".")) {
        const ipv4 = parseIPv4(group);
        if (!ipv4) return null;
        output.push(((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0), ((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0));
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
        output.push(Number.parseInt(group, 16));
      }
    }
    return output;
  };
  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right || (halves.length === 1 && left.length !== 8) || (halves.length === 2 && left.length + right.length >= 8)) return null;
  return halves.length === 2 ? [...left, ...new Array(8 - left.length - right.length).fill(0), ...right] : left;
}

function isUnsafeIPv4(ip: number[]): boolean {
  const a = ip[0] ?? -1;
  const b = ip[1] ?? -1;
  const c = ip[2] ?? -1;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168) || a === 192 && b === 0 && c === 2) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113) || a >= 224;
}

function unavailableScheduleTransport(): PrivilegedScheduleTransport {
  return {
    request: async () => { throw new Error("privileged-schedule-transport-required"); }
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
