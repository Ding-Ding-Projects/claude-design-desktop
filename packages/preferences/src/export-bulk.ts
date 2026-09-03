import type { BulkActionPreview, ExportFormat, ExportRequest } from "./types.js";

const formats: ExportFormat[] = ["json", "jsonl", "yaml", "toml", "xml", "csv", "tsv", "markdown", "html", "sql", "typescript", "javascript", "python", "go", "rust", "json-schema", "protobuf"];

export function supportedExportFormats(): readonly ExportFormat[] {
  return formats;
}
export function prepareExport(request: ExportRequest): string {
  if (request.includeSensitive) throw new Error("sensitive-export-requires-super-confirmation");
  const records = request.records.map((record) => redactSensitive(record));
  const note = request.note.trim() || "Sensitive values and private file metadata were omitted.";
  switch (request.format) {
    case "json": return JSON.stringify({ note, records }, null, 2);
    case "jsonl": return records.map((record) => JSON.stringify(record)).join("\n");
    case "yaml": return `${records.map((record) => `- ${JSON.stringify(record)}`).join("\n")}\n# ${note}`;
    case "csv": return delimited(records, ",");
    case "tsv": return delimited(records, "\t");
    case "markdown": return `<!-- ${note} -->\n\n${records.map((record) => `- ${Object.entries(record).map(([key, value]) => `${key}: ${String(value)}`).join("; ")}`).join("\n")}`;
    case "html": return `<section><p>${escapeHtml(note)}</p><pre>${escapeHtml(JSON.stringify(records, null, 2))}</pre></section>`;
    case "toml": return records.map((record) => `[record]\n${Object.entries(record).map(([key, value]) => `${safeKey(key)} = ${JSON.stringify(value)}`).join("\n")}`).join("\n\n");
    case "xml": return `<records note="${escapeHtml(note)}">${records.map((record) => `<record>${Object.entries(record).map(([key, value]) => `<field name="${escapeHtml(key)}">${escapeHtml(String(value))}</field>`).join("")}</record>`).join("")}</records>`;
    case "sql": return `-- ${note}\n${records.map((record) => `INSERT INTO records (${Object.keys(record).map(safeKey).join(", ")}) VALUES (${Object.values(record).map((value) => quoteSql(String(value))).join(", ")});`).join("\n")}`;
    case "json-schema": return JSON.stringify({ type: "array", items: { type: "object", additionalProperties: true }, description: note }, null, 2);
    default: return `/* ${note} */\n${JSON.stringify(records, null, 2)}`;
  }
}

function redactSensitive(record: Record<string, unknown>): Record<string, unknown> {
  return redactValue(record, new WeakSet<object>()) as Record<string, unknown>;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[omitted-circular-value]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /secret|password|pin|token|credential|private|sourcePath|filePath|path/i.test(key)
      ? "[omitted]"
      : redactValue(item, seen);
  }
  return output;
}

function delimited(records: Record<string, unknown>[], separator: string): string {
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.map(quote).join(separator), ...records.map((record) => headers.map((key) => quote(record[key])).join(separator))].join("\n");
}

function safeKey(value: string): string { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : `field_${value.replace(/[^A-Za-z0-9_]/g, "_")}`; }
function quoteSql(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

export function previewBulkAction(input: {
  action: BulkActionPreview["action"];
  scope: BulkActionPreview["scope"];
  items: Array<{ id: string; label: string; selected: boolean; locked?: boolean; pinned?: boolean; unsaved?: boolean }>;
  includePinned?: boolean;
  includeLocked?: boolean;
}): BulkActionPreview {
  const items = input.items.map((item) => {
    const reasons: string[] = [];
    if (!item.selected) reasons.push("not-selected");
    if (item.locked && !input.includeLocked) reasons.push("locked");
    if (item.pinned && !input.includePinned) reasons.push("pinned");
    if (input.action === "delete" && item.unsaved) reasons.push("unsaved-work");
    return { id: item.id, label: item.label, selected: item.selected, eligible: reasons.length === 0, reason: reasons.join(",") || null };
  });
  return { action: input.action, scope: input.scope, selectedCount: items.filter((item) => item.selected).length, affectedCount: items.filter((item) => item.eligible).length, excludedCount: items.filter((item) => item.selected && !item.eligible).length, items };
}
