export function createVisitorController(store, initial = {}) {
  const state = {
    tabs: initial.tabs ? structuredClone(initial.tabs) : [
      { id: 'home', label: 'Home', pinned: false, groupId: null },
      { id: 'features', label: 'Features', pinned: false, groupId: null },
      { id: 'documentation', label: 'Documentation', pinned: false, groupId: null }
    ],
    groups: initial.groups ? structuredClone(initial.groups) : [],
    locks: initial.locks ? structuredClone(initial.locks) : {}
  };
  const persist = () => store.set('workspace', structuredClone(state));
  return {
    state,
    addTab(label = 'New tab') { const id = `tab-${state.tabs.length + 1}`; state.tabs.push({ id, label, pinned: false, groupId: null }); persist(); return id; },
    togglePin(tabId) { const tab = state.tabs.find((candidate) => candidate.id === tabId); if (!tab) return false; tab.pinned = !tab.pinned; persist(); return tab.pinned; },
    createGroup(label = 'New group') { const group = { id: `group-${state.groups.length + 1}`, label, collapsed: false }; state.groups.push(group); persist(); return group; },
    moveToGroup(tabId, groupId) { const tab = state.tabs.find((candidate) => candidate.id === tabId); if (!tab || (groupId && !state.groups.some((group) => group.id === groupId))) return false; tab.groupId = groupId || null; persist(); return true; },
    lock(targetId, phrase) { if (!targetId || typeof phrase !== 'string' || phrase.length === 0) return false; state.locks[targetId] = { targetId, policy: 'password', locked: true }; persist(); return true; },
    unlock(targetId, phrase) { if (!state.locks[targetId] || typeof phrase !== 'string' || phrase.length === 0) return false; delete state.locks[targetId]; persist(); return true; },
    dispatchAction(targetId, eventType = 'click') { if (state.locks[targetId]?.locked && ['click', 'keydown', 'touchstart', 'programmatic'].includes(eventType)) return { kind: 'unlock-required', targetId }; return { kind: 'action', targetId, eventType }; },
    search(items, query, scope = (item) => item) { const normalized = String(query || '').trim().toLocaleLowerCase(); return items.filter((item) => !normalized || String(scope(item)).toLocaleLowerCase().includes(normalized)); },
    snapshot() { return structuredClone(state); }
  };
}
