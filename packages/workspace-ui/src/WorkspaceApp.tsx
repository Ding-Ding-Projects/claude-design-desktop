import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import type { DesignerBridge, Project, ShareRole } from "./bridge";
import { createWorkspaceController, WorkspaceController, WorkspaceState } from "./controller";
import "./styles.css";

type WorkspaceTab = {
  id: string;
  label: string;
  description: string;
};

const tabs: WorkspaceTab[] = [
  { id: "projects", label: "Projects", description: "Open or create a design project." },
  { id: "systems", label: "Design systems", description: "Browse design-system tokens and versions." },
  { id: "editor", label: "Editor", description: "Browse files and edit the active file." },
  { id: "preview", label: "Preview", description: "Review the active file in a safe read-only preview." },
  { id: "chat", label: "Chat", description: "Stream a conversation for the open project." },
  { id: "comments", label: "Comments", description: "Read comments and send replies." },
  { id: "share", label: "Share", description: "Manage project sharing roles." },
  { id: "settings", label: "Settings", description: "Save workspace preferences." },
  { id: "utilities", label: "Utilities", description: "Use local workspace utilities." },
  { id: "docs", label: "Docs", description: "Read bundled offline documentation." },
  { id: "history", label: "History", description: "Review local workspace history." },
  { id: "notifications", label: "Notifications", description: "Review workspace notifications." },
  { id: "downloads", label: "Downloads", description: "Review download state." },
  { id: "status", label: "Status", description: "Review service and operation status." },
  { id: "migration", label: "Migration", description: "Review available local migration records." }
];

const docs = [
  ["Getting started", "Sign in with a ready account, select a project, then open a file or preview the project."],
  ["Account access", "Only a ready authenticated account can load, create, or open projects. Server responses remain authoritative."],
  ["Roles", "Owners and editors can write. Commenters can comment. Viewers can read. Disabled controls explain the missing capability."],
  ["Streaming chat", "A chat request is cancellable. Cancellation aborts the active request and keeps the partial response visible."],
  ["Offline recovery", "The workspace keeps the last known view when a request fails and reports the exact failed operation."],
  ["Sharing", "Choose a recipient and a role. The bridge applies the role on the server; the UI does not grant access by itself."]
];

function safeCall(task: Promise<unknown>): void {
  void task.catch(() => undefined);
}

function useController(controller: WorkspaceController): WorkspaceState {
  const [state, setState] = useState(controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}

function ErrorNotice({ state }: { state: WorkspaceState }): ReactElement | null {
  if (!state.error && !state.notice) return null;
  return (
    <div className={state.error ? "notice notice-error" : "notice notice-success"} role={state.error ? "alert" : "status"}>
      <span aria-hidden="true">{state.error ? "!" : "✓"}</span>
      <span>{state.error ?? state.notice}</span>
    </div>
  );
}

function AuthPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  const [accountSearch, setAccountSearch] = useState("");
  const accounts = useMemo(() => state.accounts.filter((account) => `${account.label} ${account.email}`.toLowerCase().includes(accountSearch.toLowerCase())), [state.accounts, accountSearch]);
  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <div>
        <p className="eyebrow">Workspace access</p>
        <h1 id="auth-heading">Connect a ready design account</h1>
        <p className="muted">Project data stays behind the typed DesignerBridge. Nothing here invents an account identity.</p>
      </div>
      <div className="auth-actions">
        <button type="button" className="primary" onClick={() => safeCall(controller.beginBrowserLogin())} disabled={state.auth === "browser-pending" || state.auth === "device-pending"}>
          {state.auth === "browser-pending" ? "Waiting for browser sign-in…" : "Sign in in browser"}
        </button>
        <button type="button" className="secondary" onClick={() => safeCall(controller.beginDeviceLogin())} disabled={state.auth === "browser-pending" || state.auth === "device-pending"}>
          {state.auth === "device-pending" ? "Waiting for device approval…" : "Use device code"}
        </button>
      </div>
      {state.deviceCode && (
        <div className="device-code" role="status" aria-live="polite">
          <strong>Approve this device</strong>
          <span>Code: <code>{state.deviceCode.userCode}</code></span>
          <span>{state.deviceCode.expiresAt ? `Expires ${state.deviceCode.expiresAt}` : "Expiry is controlled by the host."}</span>
          <div className="inline-actions"><button type="button" className="secondary" onClick={() => safeCall(controller.copyDeviceCode())}>Copy code</button><button type="button" className="secondary" onClick={() => safeCall(controller.openDeviceVerification())}>Open verification page</button><button type="button" className="secondary" onClick={() => safeCall(controller.cancelDeviceLogin())}>Cancel</button><button type="button" className="secondary" onClick={() => safeCall(controller.retryDeviceLogin())}>Retry</button></div>
        </div>
      )}
      <div className="account-picker">
        <label htmlFor="account-search">Signed-in accounts</label>
        <input id="account-search" type="search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Search accounts" />
        {accounts.length === 0 ? <p className="empty">No signed-in account is available.</p> : (
          <ul className="account-list" aria-label="Signed-in accounts">
            {accounts.map((account) => (
              <li key={account.slotId}>
                <div>
                  <strong>{account.label}</strong>
                  <span className="muted">{account.email} · {account.state}{account.isOwner ? " · owner account" : ""}</span>
                </div>
                <button type="button" className="secondary" onClick={() => safeCall(controller.selectAccount(account.slotId))} disabled={account.state !== "ready"} title={account.state === "ready" ? "Use this account" : "This account is not ready for project access"}>
                  {account.state === "ready" ? "Use account" : "Not ready"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ProjectPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const projects = state.projects.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(search.toLowerCase()));
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await controller.createProject(name.trim(), description.trim());
    setName("");
    setDescription("");
  };
  return (
    <div className="panel-grid">
      <section className="surface-card" aria-labelledby="projects-heading">
        <div className="section-heading"><div><p className="eyebrow">Workspace</p><h2 id="projects-heading">Projects</h2></div><button type="button" className="secondary" onClick={() => safeCall(controller.loadWorkspace())} disabled={state.projectOperation === "loading"}>Refresh</button></div>
        <label htmlFor="project-search">Search projects</label>
        <input id="project-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or description" />
        {projects.length === 0 ? <p className="empty">No projects match this search. Create one when your account allows it.</p> : (
          <ul className="project-list">
            {projects.map((project) => <ProjectRow key={project.id} project={project} controller={controller} state={state} />)}
          </ul>
        )}
      </section>
      <section className="surface-card" aria-labelledby="create-heading">
        <p className="eyebrow">New project</p><h2 id="create-heading">Create a project</h2>
        <p className="muted">A ready owner account is required. The bridge validates this again when the action runs.</p>
        <form onSubmit={(event) => void create(event)}>
          <label htmlFor="project-name">Name</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} required />
          <label htmlFor="project-description">Description</label><textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          <button type="submit" className="primary" disabled={!controller.has("project:create") || state.projectOperation === "loading"} title={controller.has("project:create") ? "Create project" : "Your active account cannot create projects"}>Create project</button>
        </form>
      </section>
    </div>
  );
}

function ProjectRow({ project, controller, state }: { project: Project; controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  return <li className={state.activeProject?.id === project.id ? "project-row active" : "project-row"}>
    <div><strong>{project.name}</strong><span className="muted">{project.description || "No description"}</span><span className="meta">{project.role} · updated {project.updatedAt}</span></div>
    <button type="button" className="secondary" onClick={() => safeCall(controller.openProject(project.id))} disabled={!controller.has("project:open") || state.projectOperation === "loading"} title={controller.has("project:open") ? "Open project" : "A ready authenticated account is required"}>Open</button>
  </li>;
}

function SystemsPanel({ state }: { state: WorkspaceState }): ReactElement {
  return <section className="surface-card" aria-labelledby="systems-heading"><p className="eyebrow">Tokens and components</p><h2 id="systems-heading">Design systems</h2>{state.designSystems.length === 0 ? <p className="empty">No design systems have been loaded for this account.</p> : <ul className="system-list">{state.designSystems.map((system) => <li key={system.id}><div><strong>{system.name}</strong><span className="muted">v{system.version} · {system.tokenCount} tokens</span></div><span className="meta">updated {system.updatedAt}</span></li>)}</ul>}</section>;
}

function EditorPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  const [draft, setDraft] = useState(state.fileContent);
  useEffect(() => setDraft(state.fileContent), [state.activeFile, state.fileContent]);
  return <div className="editor-layout">
    <section className="surface-card file-tree" aria-labelledby="files-heading"><div className="section-heading"><h2 id="files-heading">Files</h2><span className="meta">{state.files.length} entries</span></div>{state.files.length === 0 ? <p className="empty">Open a project to browse its files.</p> : <ul>{state.files.map((file) => <li key={file.path}><button type="button" className={state.activeFile === file.path ? "file-button active" : "file-button"} onClick={() => file.kind === "file" && safeCall(controller.openFile(file.path))} disabled={file.kind !== "file" || !controller.has("file:read")} aria-current={state.activeFile === file.path ? "page" : undefined}><span aria-hidden="true">{file.kind === "folder" ? "▸" : "·"}</span>{file.path}</button></li>)}</ul>}</section>
    <section className="surface-card editor-surface" aria-labelledby="editor-heading"><div className="section-heading"><div><p className="eyebrow">{state.fileLanguage || "Plain text"}</p><h2 id="editor-heading">{state.activeFile || "No file selected"}</h2></div><button type="button" className="primary" onClick={() => safeCall(controller.saveFile(draft))} disabled={!state.activeFile || draft === state.fileContent || !controller.has("file:write") || state.fileOperation === "saving"} title={controller.has("file:write") ? "Save file" : "Your active account cannot edit files"}>{state.fileOperation === "saving" ? "Saving…" : "Save"}</button></div><textarea aria-label={state.activeFile ? `Editor for ${state.activeFile}` : "File editor"} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!state.activeFile || !controller.has("file:write")} spellCheck={false} />{!controller.has("file:write") && state.activeProject && <p className="inline-warning">Read-only role: editing is unavailable for this account.</p>}</section>
  </div>;
}

function PreviewPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  return <section className="surface-card" aria-labelledby="preview-heading"><div className="section-heading"><div><p className="eyebrow">Host-rendered</p><h2 id="preview-heading">Preview</h2></div><div className="inline-actions"><button type="button" className="primary" onClick={() => safeCall(controller.openPreview())} disabled={!state.activeProject || !controller.has("file:read") || state.previewOperation === "loading"}>Open preview</button><button type="button" className="secondary" onClick={() => safeCall(controller.closePreview())} disabled={!state.preview}>Close preview</button></div></div>{state.preview ? <><p className="muted">{state.preview.title}{state.preview.expiresAt ? ` · expires ${state.preview.expiresAt}` : ""}</p><iframe className="preview-frame" title={state.preview.title} src={state.preview.url} sandbox="allow-scripts" /></> : <p className="empty">Open a project, then request a preview handle from the host.</p>}</section>;
}

function ChatPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  const [prompt, setPrompt] = useState("");
  return <section className="surface-card" aria-labelledby="chat-heading"><div className="section-heading"><div><p className="eyebrow">Streamed operation</p><h2 id="chat-heading">Project chat</h2></div><button type="button" className="secondary" onClick={() => safeCall(controller.cancelChat())} disabled={state.chatOperation !== "streaming"}>Cancel</button></div><div className="chat-log" aria-live="polite">{state.chat.length === 0 ? <p className="empty">No messages yet. Ask about the open project.</p> : state.chat.map((item) => <article key={item.id} className={`chat-message ${item.role}`}><strong>{item.role}</strong><p>{item.text || "Waiting for response…"}</p></article>)}</div><form className="chat-form" onSubmit={(event) => { event.preventDefault(); if (prompt.trim()) { safeCall(controller.sendChat(prompt.trim())); setPrompt(""); } }}><label htmlFor="chat-prompt">Message</label><textarea id="chat-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} disabled={!controller.has("chat") || !state.activeProject || state.chatOperation === "streaming"} placeholder="Ask about this project" /><button type="submit" className="primary" disabled={!prompt.trim() || !controller.has("chat") || !state.activeProject || state.chatOperation === "streaming"}>Send message</button></form></section>;
}

function CommentsPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  const [body, setBody] = useState("");
  const [replyFor, setReplyFor] = useState<string>();
  const [reply, setReply] = useState("");
  return <section className="surface-card" aria-labelledby="comments-heading"><div className="section-heading"><div><p className="eyebrow">Review</p><h2 id="comments-heading">Comments</h2></div></div>{!state.activeProject ? <p className="empty">Open a project to see comments.</p> : <><div className="comment-list">{state.comments.length === 0 ? <p className="empty">No comments yet.</p> : state.comments.map((comment) => <article className="comment" key={comment.id}><strong>{comment.author}</strong><span className="meta">{comment.createdAt}</span><p>{comment.body}</p><button type="button" className="text-button" onClick={() => setReplyFor(replyFor === comment.id ? undefined : comment.id)}>Reply</button>{replyFor === comment.id && <form onSubmit={(event) => { event.preventDefault(); if (reply.trim()) { safeCall(controller.replyComment(comment.id, reply.trim())); setReply(""); setReplyFor(undefined); } }}><label htmlFor={`reply-${comment.id}`}>Reply to {comment.author}</label><textarea id={`reply-${comment.id}`} value={reply} onChange={(event) => setReply(event.target.value)} rows={2} /><button type="submit" className="secondary" disabled={!reply.trim() || !controller.has("comment")}>Send reply</button></form>}{comment.replies.map((item) => <div className="reply" key={item.id}><strong>{item.author}</strong><p>{item.body}</p></div>)}</article>)}</div><form onSubmit={(event) => { event.preventDefault(); if (body.trim()) { safeCall(controller.addComment(body.trim())); setBody(""); } }}><label htmlFor="new-comment">New comment</label><textarea id="new-comment" value={body} onChange={(event) => setBody(event.target.value)} rows={3} disabled={!controller.has("comment")} /><button type="submit" className="primary" disabled={!body.trim() || !controller.has("comment")} title={controller.has("comment") ? "Add comment" : "Your active account cannot comment"}>Add comment</button></form></>}</section>;
}

function SharePanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  const [recipient, setRecipient] = useState("");
  const [role, setRole] = useState<ShareRole>("can-view");
  const savedSlots = state.accounts.filter((account) => account.state === "ready" && account.slotId !== state.activeAccount?.slotId);
  return <section className="surface-card narrow-card" aria-labelledby="share-heading"><p className="eyebrow">Access</p><h2 id="share-heading">Share project</h2><p className="muted">Sharing is submitted to the bridge and enforced by the service. Only the project owner can grant, revoke, or transfer access.</p><form onSubmit={(event) => { event.preventDefault(); if (recipient) safeCall(controller.share(recipient, role)); }}><label htmlFor="share-recipient">Saved account slot</label><select id="share-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} required disabled={!state.activeProject || !controller.has("share")}><option value="">Choose an account</option>{savedSlots.map((account) => <option key={account.slotId} value={account.slotId}>{account.label} · {account.email}</option>)}</select><label htmlFor="share-role">Role</label><select id="share-role" value={role} onChange={(event) => setRole(event.target.value as ShareRole)} disabled={!state.activeProject || !controller.has("share")}><option value="can-view">Can view</option><option value="can-comment">Can comment</option><option value="can-edit">Can edit</option></select><div className="inline-actions"><button type="submit" className="primary" disabled={!recipient || !state.activeProject || !controller.has("share")}>Grant access</button><button type="button" className="secondary" onClick={() => recipient && safeCall(controller.revokeShare(recipient))} disabled={!recipient || !state.activeProject || !controller.has("share")}>Revoke access</button><button type="button" className="secondary" onClick={() => recipient && safeCall(controller.transferProject(recipient))} disabled={!recipient || !state.activeProject || !controller.has("transfer")}>Transfer ownership</button></div></form>{!controller.has("share") && state.activeProject && <p className="inline-warning">Only a project owner can change sharing.</p>}</section>;
}

function SettingsPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  const [compact, setCompact] = useState(Boolean(state.settings.compact));
  return <section className="surface-card narrow-card" aria-labelledby="settings-heading"><p className="eyebrow">Workspace preferences</p><h2 id="settings-heading">Settings</h2><label className="switch-row"><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} disabled={!controller.has("settings")} /><span>Compact project rows</span></label><p className="muted">Stored through the typed bridge. The active project owner must have settings access.</p><button type="button" className="primary" onClick={() => safeCall(controller.saveSettings({ compact }))} disabled={!controller.has("settings")}>Save settings</button></section>;
}

function UtilityPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  return <section className="surface-card" aria-labelledby="utilities-heading"><p className="eyebrow">Recovery and tools</p><h2 id="utilities-heading">Utilities</h2><div className="utility-grid"><button type="button" className="secondary" onClick={() => safeCall(controller.loadWorkspace())} disabled={!state.activeAccount || state.projectOperation === "loading"}>Reload workspace</button><button type="button" className="secondary" onClick={() => controller.signOut()}>Sign out</button><span className="unavailable" role="note">Local converter and authenticator are unavailable in this bridge version.</span></div></section>;
}

function DocsPanel(): ReactElement { return <section className="surface-card" aria-labelledby="docs-heading"><p className="eyebrow">Offline reference</p><h2 id="docs-heading">Documentation</h2><div className="docs-list">{docs.map(([title, body]) => <details key={title}><summary>{title}</summary><p>{body}</p></details>)}</div></section>; }
function SimplePanel({ id, title, body, state }: { id: string; title: string; body: string; state: WorkspaceState }): ReactElement { return <section className="surface-card" aria-labelledby={`${id}-heading`}><p className="eyebrow">Workspace state</p><h2 id={`${id}-heading`}>{title}</h2><p className="muted">{body}</p><dl className="status-list"><div><dt>Authentication</dt><dd>{state.auth}</dd></div><div><dt>Active account</dt><dd>{state.activeAccount?.label ?? "None"}</dd></div><div><dt>Open project</dt><dd>{state.activeProject?.name ?? "None"}</dd></div></dl></section>; }

function TabPanel({ id, controller, state }: { id: string; controller: WorkspaceController; state: WorkspaceState }): ReactElement {
  switch (id) {
    case "projects": return <ProjectPanel controller={controller} state={state} />;
    case "systems": return <SystemsPanel state={state} />;
    case "editor": return <EditorPanel controller={controller} state={state} />;
    case "preview": return <PreviewPanel controller={controller} state={state} />;
    case "chat": return <ChatPanel controller={controller} state={state} />;
    case "comments": return <CommentsPanel controller={controller} state={state} />;
    case "share": return <SharePanel controller={controller} state={state} />;
    case "settings": return <SettingsPanel controller={controller} state={state} />;
    case "utilities": return <UtilityPanel controller={controller} state={state} />;
    case "docs": return <DocsPanel />;
    case "history": return <SimplePanel id={id} title="History" body="History is provided by the app host. It is unavailable until the history capability is registered." state={state} />;
    case "notifications": return <SimplePanel id={id} title="Notifications" body="Notifications from bridge operations appear here when the host registers notification history." state={state} />;
    case "downloads": return <SimplePanel id={id} title="Downloads" body="No downloads are active. Download controls remain unavailable until the host exposes a verified transfer operation." state={state} />;
    case "migration": return <SimplePanel id={id} title="Migration" body="Local migration records are unavailable until the host registers a validated migration capability." state={state} />;
    default: return <SimplePanel id={id} title="Status" body="Current workspace state and the last bridge operation are shown here." state={state} />;
  }
}

export function WorkspaceApp({ bridge }: { bridge: DesignerBridge }): ReactElement {
  const [controller] = useState(() => createWorkspaceController(bridge));
  const state = useController(controller);
  const [activeTab, setActiveTab] = useState("projects");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  useEffect(() => { safeCall(controller.bootstrap()); return () => controller.dispose(); }, [controller]);
  const selectTab = (id: string, returnFocus = false) => {
    setActiveTab(id);
    if (returnFocus) requestAnimationFrame(() => tabRefs.current[id]?.focus());
  };
  const moveTab = (delta: number) => {
    const next = tabs[(activeIndex + delta + tabs.length) % tabs.length];
    if (next) selectTab(next.id, true);
  };
  if (state.auth !== "ready") return <main className="workspace-shell"><ErrorNotice state={state} /><AuthPanel controller={controller} state={state} /></main>;
  const firstTab = tabs.at(0);
  const lastTab = tabs.at(-1);
  return <main className="workspace-shell"><header className="workspace-header"><div><p className="eyebrow">Design workspace</p><h1>{state.activeProject?.name ?? "Choose a project"}</h1><p className="muted">{state.activeAccount?.label} · {state.activeProject?.role ?? (state.activeAccount?.isOwner ? "owner account" : "account slot")}</p></div><button type="button" className="secondary" onClick={() => controller.signOut()}>Sign out</button></header><ErrorNotice state={state} /><nav className="tab-strip" aria-label="Workspace sections"><div role="tablist" aria-orientation="horizontal">{tabs.map((tab) => <button key={tab.id} ref={(element) => { tabRefs.current[tab.id] = element; }} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? "tab active" : "tab"} onClick={() => selectTab(tab.id)} onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); moveTab(1); } else if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(-1); } else if (event.key === "Home" && firstTab) { event.preventDefault(); selectTab(firstTab.id, true); } else if (event.key === "End" && lastTab) { event.preventDefault(); selectTab(lastTab.id, true); } }}>{tab.label}<span className="sr-only">: {tab.description}</span></button>)}</div></nav><section id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="tab-panel"><TabPanel id={activeTab} controller={controller} state={state} /></section></main>;
}
