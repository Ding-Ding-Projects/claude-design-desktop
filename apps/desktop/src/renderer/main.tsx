import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { TitleBar } from "../../../../packages/ui-shell/src";
import type { AccountSlotSummary, AppProvenance, ProjectSummary } from "../../../../packages/contracts/src";
import "./styles.css";

function formatUpdatedAt(provenance: AppProvenance) {
  if (!provenance.updatedAt || Number.isNaN(Date.parse(provenance.updatedAt))) return "Updated at unavailable";
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(provenance.updatedAt))} (${provenance.timezone})`;
}

function App() {
  const [accounts, setAccounts] = useState<AccountSlotSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [provenance, setProvenance] = useState<AppProvenance | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [regexOpen, setRegexOpen] = useState(false);
  const [regexMode, setRegexMode] = useState(false);
  const [regexPattern, setRegexPattern] = useState("");
  const [regexFlags, setRegexFlags] = useState("");
  const [regexError, setRegexError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<"home" | "projects" | "settings">("home");
  const [newProject, setNewProject] = useState("");

  useEffect(() => {
    void Promise.allSettled([window.designer.accounts.list(), window.designer.projects.list(), window.designer.app.provenance()])
      .then(([accountResult, projectResult, provenanceResult]) => {
        if (accountResult.status === "fulfilled") setAccounts(accountResult.value);
        if (projectResult.status === "fulfilled") setProjects(projectResult.value);
        if (provenanceResult.status === "fulfilled") setProvenance(provenanceResult.value);
        const firstError = [accountResult, projectResult, provenanceResult].find((result) => result.status === "rejected");
        if (firstError?.status === "rejected") setNotice(firstError.reason instanceof Error ? firstError.reason.message : "A local host service is unavailable");
      });
    return window.designer.accounts.subscribe((event) => {
      if (event.type === "updated" || event.type === "login-completed") {
        setAccounts((current) => { const next = current.filter((item) => item.slotId !== event.account.slotId); return [...next, event.account]; });
      } else setNotice(event.message);
    });
  }, []);

  const projectFilter = useMemo(() => {
    if (!regexMode) return { items: projects.filter((project) => project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())), error: null };
    try {
      const matcher = new RegExp(regexPattern, regexFlags);
      return { items: projects.filter((project) => matcher.test(project.name)), error: null };
    } catch (error) {
      return { items: [], error: error instanceof Error ? error.message : "Invalid regular expression" };
    }
  }, [projects, query, regexMode, regexPattern, regexFlags]);
  const visibleProjects = projectFilter.items;
  useEffect(() => setRegexError(projectFilter.error), [projectFilter.error]);
  async function createProject() {
    try {
      const project = await window.designer.projects.create({ name: newProject });
      setProjects((current) => [...current, project]);
      setNewProject("");
      setNotice(`Created ${project.name}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Project creation failed"); }
  }
  async function startLogin(flow: "browser" | "deviceCode") {
    try {
      await window.designer.accounts.startLogin({ flow });
      setNotice("Sign-in is provided by the bundled account service and is not available in this foundation build.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Sign-in is unavailable"); }
  }
  async function openProject(projectId: string) {
    try { await window.designer.projects.open(projectId); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Project opening is unavailable"); }
  }

  return <div className="app-shell">
    <TitleBar title="Claude Design Desktop"><span className="connection-chip">Local workspace</span></TitleBar>
    <main className="workspace">
      <aside className="side-rail" aria-label="Primary navigation">
        <button className={`rail-item ${activePage === "home" ? "active" : ""}`} aria-current={activePage === "home" ? "page" : undefined} onClick={() => setActivePage("home")}>⌂<span>Home</span></button>
        <button className={`rail-item ${activePage === "projects" ? "active" : ""}`} aria-current={activePage === "projects" ? "page" : undefined} onClick={() => setActivePage("projects")}>▦<span>Projects</span></button>
        <button className={`rail-item ${activePage === "settings" ? "active" : ""}`} aria-current={activePage === "settings" ? "page" : undefined} onClick={() => setActivePage("settings")}>⚙<span>Settings</span></button>
      </aside>
      <section className="content" aria-labelledby="welcome-heading">
        <div className="page-context" aria-live="polite">{activePage === "home" ? "Home" : activePage === "projects" ? "Projects" : "Settings"}</div>
        <div className="hero-card">
          <div className="eyebrow">Local design workspace</div>
          <h1 id="welcome-heading">Make something clear.</h1>
          <p>Claude Design Desktop keeps projects, files, and conversations on this computer. Connect an account before opening a project workspace.</p>
          <div className="provenance" aria-label="Build provenance">
            <span><strong>Version</strong> {provenance?.version ?? "Unavailable"}</span>
            <span><strong>Updated</strong> {provenance ? formatUpdatedAt(provenance) : "Unavailable"}</span>
          </div>
        </div>
        <section className="section-card" aria-labelledby="account-heading">
          <div className="section-heading"><div><h2 id="account-heading">Accounts</h2><p>Sign-in state is kept in the operating system credential store by the account service.</p></div><div className="button-row"><button className="secondary" onClick={() => void startLogin("deviceCode")}>Use device code</button><button className="primary" onClick={() => void startLogin("browser")}>Sign in</button></div></div>
          {accounts.length === 0 ? <div className="empty-state"><span className="empty-icon">◎</span><div><strong>No account connected</strong><p>Connect an account to unlock project workspaces. Local settings remain available.</p></div></div> : <ul className="account-list">{accounts.map((account) => <li key={account.slotId}><span className="avatar">{account.label.slice(0, 1).toUpperCase()}</span><span><strong>{account.label}</strong><small>{account.email ?? "Email unavailable"} · {account.state}</small></span><button className="text-button" onClick={() => void window.designer.accounts.activate(account.slotId)}>Use account</button></li>)}</ul>}
        </section>
        <section className="section-card" aria-labelledby="projects-heading">
          <div className="section-heading"><div><h2 id="projects-heading">Projects</h2><p>Truthful empty state, no sample documents.</p></div><div><label className="search-field"><span className="sr-only">Search projects</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /><button aria-label={regexOpen ? "Close advanced regex builder" : "Open advanced regex builder"} title="Advanced regex builder" type="button" onClick={() => setRegexOpen((value) => !value)} aria-expanded={regexOpen}>.*</button></label>{regexOpen && <div className="regex-builder" role="region" aria-label="Advanced regex builder"><div><strong>Advanced regex builder</strong><button type="button" className="text-button" onClick={() => { setRegexOpen(false); setRegexMode(false); }}>Close</button></div><label>Pattern<input value={regexPattern} onChange={(event) => { setRegexPattern(event.target.value); setRegexMode(true); }} placeholder="Project pattern" /></label><label>Flags<input value={regexFlags} onChange={(event) => { setRegexFlags(event.target.value); setRegexMode(true); }} placeholder="gim" /></label>{regexError && <p className="inline-error" role="alert">{regexError}</p>}<p className="builder-help">Plain text remains the default. Regex evaluation stays local to project names.</p></div>}</div></div>
          {visibleProjects.length === 0 ? <div className="empty-state"><span className="empty-icon">＋</span><div><strong>No projects yet</strong><p>Create a local project when an account is connected.</p></div></div> : <ul className="project-list">{visibleProjects.map((project) => <li key={project.projectId}><span><strong>{project.name}</strong><small>{project.role} · updated {new Date(project.updatedAt).toLocaleString()}</small></span><button className="text-button" onClick={() => void openProject(project.projectId)}>Open</button></li>)}</ul>}
          <div className="create-row"><input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="New project name" aria-label="New project name" /><button className="primary" onClick={() => void createProject()} disabled={!newProject.trim()}>Create project</button></div>
        </section>
      </section>
    </main>
    {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
