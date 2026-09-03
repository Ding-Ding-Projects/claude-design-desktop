import type { ScheduleRule, ScheduledValues, ScheduleSource } from "./types";

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
  if (!isTime(rule.startTime) || !isTime(rule.endTime)) errors.push("invalid-time");
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

function isTime(value: { hour: number; minute: number }): boolean {
  return Number.isInteger(value.hour) && value.hour >= 0 && value.hour < 24 && Number.isInteger(value.minute) && value.minute >= 0 && value.minute < 60;
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
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isScheduleRuleActive(rule: ScheduleRule, context: ScheduleContext): boolean {
  if (!rule.enabled || validateScheduleRule(rule).length > 0) return false;
  const timezone = context.timezone ?? rule.timezone;
  const current = zonedParts(context.now, timezone);
  const dayValue = { year: current.year, month: current.month, day: current.day };
  if (rule.startDate && compareDate(dayValue, rule.startDate) < 0) return false;
  if (rule.endDate && compareDate(dayValue, rule.endDate) > 0) return false;
  const start = rule.startTime.hour * 60 + rule.startTime.minute;
  const end = rule.endTime.hour * 60 + rule.endTime.minute;
  const overnight = end < start;
  const dayMatches = rule.everyDay || rule.weekdays.includes(current.weekday);
  if (dayMatches && (overnight ? current.minutes >= start : current.minutes >= start && current.minutes < end)) return true;
  if (overnight && current.minutes < end) {
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
  return { values: { ...base, ...selected.values }, ruleId: selected.id, source: selected.source.kind, active: true };
}

export interface ExternalScheduleClient {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface ScheduleRefreshController {
  refresh(source: ScheduleSource): Promise<{ values: ScheduledValues; active: boolean; source: ScheduleResolution["source"] }>;
  cancel(): void;
}

export function createScheduleRefreshController(client: ExternalScheduleClient = { fetch: (...args) => globalThis.fetch(...args) }): ScheduleRefreshController {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    async refresh(source) {
      const currentGeneration = ++generation;
      controller?.abort();
      controller = new AbortController();
      if (source.kind === "local") return { values: {}, active: true, source: "local" };
      const errors = validateScheduleSource(source);
      if (errors.length) throw new Error(errors.join(","));
      const response = await client.fetch(source.kind === "api" ? source.url : `${source.baseUrl.replace(/\/$/, "")}/api/states/${source.entityId}`, { signal: controller.signal, redirect: "error" });
      if (currentGeneration !== generation) throw new Error("stale-generation");
      if (!response.ok) throw new Error(`schedule-source-http-${response.status}`);
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error("response-too-large");
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error("response-too-large");
      const parsed = JSON.parse(text) as unknown;
      if (source.kind === "home-assistant") {
        if (!isRecord(parsed) || (parsed.state !== "on" && parsed.state !== "off")) throw new Error("invalid-home-assistant-state");
        return { values: {}, active: parsed.state === "on", source: "home-assistant" as const };
      }
      if (!isRecord(parsed) || parsed.schemaVersion !== source.schemaVersion || !isRecord(parsed.values)) throw new Error("invalid-schedule-payload");
      const values: ScheduledValues = {};
      for (const [key, value] of Object.entries(parsed.values)) {
        if (!allowedValueKeys.has(key as keyof ScheduledValues)) throw new Error("unknown-schedule-field");
        if (typeof value !== "string" && typeof value !== "number") throw new Error("invalid-schedule-value");
        values[key as keyof ScheduledValues] = value as never;
      }
      return { values, active: true, source: "api" as const };
    },
    cancel() {
      generation++;
      controller?.abort();
      controller = null;
    }
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

