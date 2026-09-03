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
  const digest = (value) => { let result = 2166136261; for (const char of String(value)) { result ^= char.codePointAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16); };
  const policyNames = new Set(['PIN', 'password', 'PIN plus password', 'password plus TOTP', 'PIN plus TOTP', 'password plus PIN plus TOTP']);
  return {
    state,
    addTab(label = 'New tab') { const id = `tab-${state.tabs.length + 1}`; state.tabs.push({ id, label, pinned: false, groupId: null }); persist(); return id; },
    togglePin(tabId) { const tab = state.tabs.find((candidate) => candidate.id === tabId); if (!tab) return false; tab.pinned = !tab.pinned; persist(); return tab.pinned; },
    createGroup(label = 'New group') { const group = { id: `group-${state.groups.length + 1}`, label, collapsed: false }; state.groups.push(group); persist(); return group; },
    moveToGroup(tabId, groupId) { const tab = state.tabs.find((candidate) => candidate.id === tabId); if (!tab || (groupId && !state.groups.some((group) => group.id === groupId))) return false; tab.groupId = groupId || null; persist(); return true; },
    lock(targetId, phrase, options = {}) {
      const policy = options.policy || 'password';
      const durationMs = Number.isFinite(options.durationMs) && options.durationMs >= 0 ? options.durationMs : 0;
      if (!targetId || typeof phrase !== 'string' || phrase.length < 4 || !policyNames.has(policy)) return false;
      state.locks[targetId] = { targetId, policy, credentialStorage: 'browser-storage-only', browserStorageOnly: true, credentialDigest: digest(phrase), locked: true, unlockExpiresAt: null, attempts: [], durationMs };
      persist();
      return true;
    },
    unlock(targetId, phrase, now = Date.now()) {
      const lock = state.locks[targetId];
      if (!lock) return false;
      if (!lock.locked && lock.unlockExpiresAt && now >= lock.unlockExpiresAt) { lock.locked = true; lock.unlockExpiresAt = null; }
      lock.attempts = (lock.attempts || []).filter((attempt) => now - attempt < 60_000);
      if (lock.attempts.length >= 5) return false;
      lock.attempts.push(now);
      if (typeof phrase !== 'string' || digest(phrase) !== lock.credentialDigest) { persist(); return false; }
      lock.locked = false;
      lock.unlockExpiresAt = lock.durationMs > 0 ? now + lock.durationMs : null;
      lock.attempts = [];
      persist();
      return true;
    },
    dispatchAction(targetId, eventType = 'click', now = Date.now()) {
      const lock = state.locks[targetId];
      if (lock && !lock.locked && lock.unlockExpiresAt && now >= lock.unlockExpiresAt) { lock.locked = true; lock.unlockExpiresAt = null; persist(); }
      if (lock?.locked && ['click', 'keydown', 'touchstart', 'programmatic'].includes(eventType)) return { kind: 'unlock-required', targetId, policy: lock.policy };
      return { kind: 'action', targetId, eventType };
    },
    search(items, query, scope = (item) => item) { const normalized = String(query || '').trim().toLocaleLowerCase(); return items.filter((item) => !normalized || String(scope(item)).toLocaleLowerCase().includes(normalized)); },
    snapshot() { return structuredClone(state); }
  };
}

export function styleFunnyCopy(english, cantonese, levels, mode = 'bilingual') {
  const en = Number(levels?.english || 5) >= 5 ? `${english} (with one small wink)` : english;
  const zh = Number(levels?.cantonese || 5) >= 5 ? `${cantonese}（加少少笑意）` : cantonese;
  if (mode === 'en') return en;
  if (mode === 'zh') return zh;
  return `${en}<span class="secondary-copy">${zh}</span>`;
}

export function interceptLockedActivation(target, event) {
  const locked = target?.closest?.('[data-locked="true"]');
  if (!locked || event?.type === 'contextmenu') return false;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  return true;
}
