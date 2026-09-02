import { useEffect, useState, type ReactNode } from "react";

export function TitleBar({ title, children }: { title: string; children?: ReactNode }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let mounted = true;
    void window.designer.window.isMaximized().then((value) => { if (mounted) setMaximized(value); });
    return window.designer.window.onStateChange((state) => setMaximized(state.maximized));
  }, []);
  return (
    <header className="titlebar" onDoubleClick={() => void window.designer.window.toggleMaximize()}>
      <button className="titlebar-icon no-drag" aria-label="Show window menu" title="Show window menu" onClick={() => void window.designer.window.showSystemMenu()}>
        <span aria-hidden="true">✦</span>
      </button>
      <div className="titlebar-title" aria-label={title}>{title}</div>
      <div className="titlebar-extra no-drag">{children}</div>
      <div className="window-controls no-drag" role="group" aria-label="Window controls">
        <button aria-label="Minimize" title="Minimize" onClick={() => void window.designer.window.minimize()}>−</button>
        <button aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} onClick={() => void window.designer.window.toggleMaximize()}>{maximized ? "❐" : "□"}</button>
        <button className="close-control" aria-label="Close" title="Close" onClick={() => void window.designer.window.close()}>×</button>
      </div>
    </header>
  );
}
