import { MCP_TOOL_NAMES, McpToolName } from "../../compat/src/manifest";
const s = (description: string) => ({ description, type: "string" });
const a = (description: string) => ({ description, items: { type: "string" }, type: "array" });
const o = (properties: Record<string, unknown>, required: string[] = []) => ({ additionalProperties: false, properties, required, type: "object" });
const definitions: Record<McpToolName, { description: string; inputSchema: Record<string, unknown>; readOnlyHint: boolean; destructiveHint: boolean }> = {
  list_design_systems: { description: "List design-system projects.", inputSchema: o({}), readOnlyHint: true, destructiveHint: false },
  get_claude_design_prompt: { description: "Return local design project output conventions.", inputSchema: o({ design_system_id: s("Optional design-system project id."), project_id: s("Optional project id.") }), readOnlyHint: true, destructiveHint: false },
  list_projects: { description: "List projects visible to the active local account.", inputSchema: o({}), readOnlyHint: true, destructiveHint: false },
  get_project: { description: "Read project metadata and sharing state.", inputSchema: o({ project_id: s("Project id.") }, ["project_id"]), readOnlyHint: true, destructiveHint: false },
  list_files: { description: "List project files.", inputSchema: o({ path: s("Optional path prefix."), project_id: s("Project id.") }, ["project_id"]), readOnlyHint: true, destructiveHint: false },
  read_file: { description: "Read a project file.", inputSchema: o({ path: s("Project file path."), project_id: s("Project id.") }, ["project_id", "path"]), readOnlyHint: true, destructiveHint: false },
  get_conversation: { description: "Read a project's conversation.", inputSchema: o({ chat_id: s("Optional chat id."), project_id: s("Project id.") }, ["project_id"]), readOnlyHint: true, destructiveHint: false },
  list_members: { description: "List project members.", inputSchema: o({ project_id: s("Project id.") }, ["project_id"]), readOnlyHint: true, destructiveHint: false },
  create_project: { description: "Create a project.", inputSchema: o({ description: s("Optional description."), name: s("Project name."), type: s("Optional project type.") }, ["name"]), readOnlyHint: false, destructiveHint: false },
  put_conversation: { description: "Replace a project's conversation.", inputSchema: o({ messages: { items: o({ content: s("Message text."), role: s("Message role.") }, ["role", "content"]), type: "array" }, project_id: s("Project id."), title: s("Optional title.") }, ["project_id", "messages"]), readOnlyHint: false, destructiveHint: false },
  finalize_plan: { description: "Create a short-lived path-scoped plan.", inputSchema: o({ deletes: a("Paths to delete."), operation_id: s("Unique operation id."), project_id: s("Project id."), scope: s("paths or project."), writes: a("Paths to write.") }, ["project_id", "operation_id"]), readOnlyHint: false, destructiveHint: false },
  write_files: { description: "Write project files from inline data.", inputSchema: o({ files: { items: o({ content: s("UTF-8 or base64 file data."), content_type: s("MIME type."), data: s("UTF-8 or base64 file data."), encoding: s("utf8 or base64."), if_match: s("Expected current file version."), is_base64: { type: "boolean" }, path: s("Project file path.") }, ["path"]), type: "array" }, project_id: s("Project id.") }, ["project_id", "files"]), readOnlyHint: false, destructiveHint: false },
  copy_files: { description: "Copy files within or across projects.", inputSchema: o({ files: { items: o({ dest: s("Destination path."), if_match: s("Expected source version."), src: s("Source path."), src_project_id: s("Optional source project id.") }, ["src", "dest"]), type: "array" }, operation_id: s("Operation id from finalize_plan."), plan_token: s("Token from finalize_plan."), project_id: s("Destination project id.") }, ["project_id", "plan_token", "operation_id", "files"]), readOnlyHint: false, destructiveHint: false },
  delete_files: { description: "Delete project files.", inputSchema: o({ files: { items: o({ if_match: s("Expected current file version."), path: s("Project file path.") }, ["path"]), type: "array" }, operation_id: s("Operation id from finalize_plan."), paths: a("Paths to delete."), plan_token: s("Token from finalize_plan."), project_id: s("Project id.") }, ["project_id", "plan_token", "operation_id"]), readOnlyHint: false, destructiveHint: true },
  render_preview: { description: "Return a local preview URL.", inputSchema: o({ path: s("Optional file path."), project_id: s("Project id."), render: s("Optional render target."), validators: a("Optional validators.") }, ["project_id"]), readOnlyHint: false, destructiveHint: false },
  create_support_js: { description: "Create or refresh a local support file.", inputSchema: o({ if_match: s("Optional expected version."), path: s("Optional support path."), plan_token: s("Optional plan token."), project_id: s("Project id.") }, ["project_id"]), readOnlyHint: false, destructiveHint: false },
  add_member: { description: "Add a local project member.", inputSchema: o({ account_uuid: s("Member account id."), email: s("Member email."), project_id: s("Project id."), role: s("viewer, commenter, or editor.") }, ["project_id"]), readOnlyHint: false, destructiveHint: false },
  update_member_role: { description: "Update a local member role.", inputSchema: o({ account_uuid: s("Member account id."), project_id: s("Project id."), role: s("viewer, commenter, or editor.") }, ["project_id", "account_uuid", "role"]), readOnlyHint: false, destructiveHint: true },
  remove_member: { description: "Remove a local project member.", inputSchema: o({ account_uuid: s("Member account id."), project_id: s("Project id.") }, ["project_id", "account_uuid"]), readOnlyHint: false, destructiveHint: true },
  update_sharing: { description: "Update local project sharing metadata.", inputSchema: o({ link_permission: s("view, comment, or edit."), project_id: s("Project id."), scope: s("invited, org, or public.") }, ["project_id"]), readOnlyHint: false, destructiveHint: true }
};
export const MCP_TOOL_DEFINITIONS = MCP_TOOL_NAMES.map((name) => ({ name, description: definitions[name].description, inputSchema: definitions[name].inputSchema, annotations: { readOnlyHint: definitions[name].readOnlyHint, destructiveHint: definitions[name].destructiveHint } }));

export function validateMcpInput(name: McpToolName, value: unknown): void {
  const schema = definitions[name].inputSchema;
  const validate = (current: unknown, shape: any, path: string) => {
    if (shape.type === "object") {
      if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error(`${path} must be an object.`);
      const record = current as Record<string, unknown>;
      for (const required of shape.required || []) if (!(required in record)) throw new Error(`${path}.${required} is required.`);
      if (shape.additionalProperties === false) for (const key of Object.keys(record)) if (!(key in (shape.properties || {}))) throw new Error(`${path}.${key} is not supported.`);
      for (const [key, child] of Object.entries(shape.properties || {})) if (key in record) validate(record[key], child, `${path}.${key}`);
      return;
    }
    if (shape.type === "array") { if (!Array.isArray(current)) throw new Error(`${path} must be an array.`); if (shape.items) current.forEach((entry, index) => validate(entry, shape.items, `${path}[${index}]`)); return; }
    if (shape.type === "string" && typeof current !== "string") throw new Error(`${path} must be a string.`);
  };
  validate(value, schema, "arguments");
}
