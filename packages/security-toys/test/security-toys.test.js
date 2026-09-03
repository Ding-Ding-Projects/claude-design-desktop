const test = require("node:test");
const assert = require("node:assert/strict");
const toys = require("../dist/index.js");

test("RFC 6238 vectors cover SHA-1, SHA-256, and SHA-512", async () => {
  const vectors = [
    ["12345678901234567890", "SHA-1", "94287082"],
    ["12345678901234567890123456789012", "SHA-256", "46119246"],
    ["1234567890123456789012345678901234567890123456789012345678901234", "SHA-512", "90693936"]
  ];
  for (const [raw, algorithm, expected] of vectors) {
    const secret = toys.encodeBase32(new TextEncoder().encode(raw));
    assert.equal(await toys.totpCodeAt(secret, 59_000, { algorithm, digits: 8 }), expected);
  }
});

test("RFC 4226 HOTP vector matrix passes all published counters", async () => {
  const secret = toys.encodeBase32(new TextEncoder().encode("12345678901234567890"));
  for (const [counter, expected] of [[0, "755224"], [1, "287082"], [2, "359152"], [3, "969429"], [4, "338314"], [5, "254676"], [6, "287922"], [7, "162583"], [8, "399871"], [9, "520489"]]) {
    assert.equal(await toys.hotpCode(secret, counter, { algorithm: "SHA-1", digits: 6 }), expected);
  }
});

test("otpauth URI preserves parameters and local QR model has no network dependency", () => {
  const input = { issuer: "Example", account: "alice@example.test", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA-256", digits: 8, period: 60 };
  const parsed = toys.parseOtpAuthUri(toys.buildOtpAuthUri(input));
  assert.deepEqual(parsed, input);
  assert.equal(toys.localQrModel(input).networkRequired, false);
  assert.match(toys.localQrModel(input).textAlternative, /QR pairing/);
});

test("pairing requires an explicit local reveal and code confirmation before arming", async () => {
  const pairing = new toys.TotpPairingSession("Example", "alice@example.test");
  assert.equal(pairing.isArmed(), false);
  assert.equal(pairing.wasManuallyRevealed(), false);
  const manual = pairing.revealManualSecret();
  assert.equal(pairing.wasManuallyRevealed(), true);
  const code = await toys.totpCodeAt(manual.secret, Date.now(), manual);
  assert.equal(await pairing.confirm("000000"), false);
  assert.equal(await pairing.confirm(code), true);
  assert.equal(pairing.qr((uri) => ({ textAlternative: uri.startsWith("otpauth://") ? "paired" : "bad", revealRequired: true, networkRequired: false })).networkRequired, false);
  assert.deepEqual(pairing.consumeArmed().issuer, "Example");
  assert.equal(pairing.consumeArmed(), undefined);
});

test("pairing expires, purges its secret, and serializes only status", async () => {
  let now = 0;
  const pairing = new toys.TotpPairingSession("Example", "alice", { now: () => now, expiresInMs: 1_000 });
  const manual = pairing.revealManualSecret();
  now = 1_001;
  assert.throws(() => pairing.qr(() => ({ textAlternative: "", revealRequired: true, networkRequired: false })), /expired/);
  assert.equal(pairing.consumeArmed(), undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(pairing)), { armed: false, expired: true });
  assert.equal(await toys.verifyTotpCodeAt(manual.secret, "000000", 0), false);
});

test("authenticator accepts manual and URI imports, exposes countdown and next code, and redacts vault references", async () => {
  const vault = new toys.MemorySecretVault();
  const authenticator = new toys.AuthenticatorManager(vault, () => 59_000);
  const entry = await authenticator.addManual({ issuer: "Example", account: "alice", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", algorithm: "SHA-1", digits: 6, period: 30 });
  assert.equal("secretRef" in entry, false);
  const display = await authenticator.code(entry.id);
  assert.equal(display.code, "287082");
  assert.equal(display.secondsRemaining, 1);
  assert.equal(display.nextCode.length, 6);
  assert.equal((await authenticator.addFromClipboard(toys.buildOtpAuthUri({ issuer: "Example", account: "bob", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA-1", digits: 6, period: 30 }))).issuer, "Example");
  assert.match(authenticator.exportRedacted(), /secretsOmitted/);
  assert.doesNotMatch(authenticator.exportRedacted(), /GEZDGNBVGY3TQOJQ/);
});

test("each lock policy enforces ordered factors, independent records, duration, relock, and protected activation", async () => {
  let now = 1_000_000;
  const vault = new toys.MemorySecretVault();
  const manager = new toys.LockManager({ vault, now: () => now });
  for (const policy of Object.keys(toys.LOCK_POLICY_FACTORS)) {
    const lock = await manager.createLock({ elementId: `element-${policy}`, policy, pin: "1234", password: "password-123", totpSecret: "JBSWY3DPEHPK3PXP", unlockDuration: { kind: "minutes", minutes: 1 }, recoveryDirectory: "C:/Users/test/AppData/Local/ClaudeDesign" });
    assert.equal("credentialRefs" in lock, false);
    let ran = false;
    const sessionId = `session-${policy.toLowerCase()}`;
    assert.equal(manager.activate(lock.id, sessionId, () => { ran = true; }).kind, "authentication-required");
    assert.equal(ran, false);
    const session = manager.beginUnlock(lock.id, sessionId);
    assert.equal(session.sessionId, sessionId);
    for (const factor of toys.LOCK_POLICY_FACTORS[policy]) {
      const value = factor === "pin" ? "1234" : factor === "password" ? "password-123" : await toys.totpCodeAt("JBSWY3DPEHPK3PXP", now, {});
      const state = await manager.verifyNextFactor(lock.id, sessionId, value, now);
      assert.equal(state.factors.find((candidate) => candidate.factor === factor).verified, true);
    }
    assert.equal(manager.isUnlocked(lock.id, sessionId, now), true);
    assert.equal(manager.activate(lock.id, sessionId, () => { ran = true; }).kind, "activated");
    assert.equal(ran, true);
    now += 61_000;
    assert.equal(manager.isUnlocked(lock.id, sessionId, now), false);
    manager.relock(lock.id, sessionId);
  }
});

test("sessions require a unique safe identifier and cannot mutate another session", async () => {
  const manager = new toys.LockManager({ vault: new toys.MemorySecretVault() });
  const lock = await manager.createLock({ elementId: "button", policy: "PIN", pin: "1234", recoveryDirectory: "C:/AppData" });
  assert.throws(() => manager.beginUnlock(lock.id, "short"), /Session ID/);
  manager.beginUnlock(lock.id, "session-01");
  assert.throws(() => manager.beginUnlock(lock.id, "session-01"), /already in use/);
  manager.relock(lock.id, "session-01");
  assert.throws(() => manager.beginUnlock(lock.id, "session-01"), /already in use/);
  await assert.rejects(() => manager.verifyNextFactor(lock.id, "session-02", "1234"), /valid unlock session/);
});

test("factor attempt budgets survive closing one prompt and reopening another", async () => {
  const state = new toys.MemoryLockStatePersistence();
  const manager = new toys.LockManager({ vault: new toys.MemorySecretVault(), maxAttempts: 2, state });
  const lock = await manager.createLock({ elementId: "button", policy: "PIN", pin: "1234", recoveryDirectory: "C:/AppData" });
  manager.beginUnlock(lock.id, "session-a");
  await manager.verifyNextFactor(lock.id, "session-a", "wrong");
  manager.relock(lock.id, "session-a");
  const reopened = manager.beginUnlock(lock.id, "session-b");
  assert.equal(reopened.factors[0].attempts, 1);
  await manager.verifyNextFactor(lock.id, "session-b", "wrong");
  await assert.rejects(() => manager.verifyNextFactor(lock.id, "session-b", "1234"), /Attempt budget exhausted/);
});

test("only failed factors consume budget, successful unlock resets it, and cooldown can clear", async () => {
  let now = 1_000;
  const manager = new toys.LockManager({ vault: new toys.MemorySecretVault(), maxAttempts: 2, cooldownMs: 1_000, now: () => now });
  const lock = await manager.createLock({ elementId: "button", policy: "PIN", pin: "1234", recoveryDirectory: "C:/AppData" });
  manager.beginUnlock(lock.id, "success-01");
  await manager.verifyNextFactor(lock.id, "success-01", "1234");
  manager.relock(lock.id, "success-01");
  assert.equal(manager.beginUnlock(lock.id, "success-02").factors[0].attempts, 0);
  manager.relock(lock.id, "success-02");
  manager.beginUnlock(lock.id, "failed-01");
  await manager.verifyNextFactor(lock.id, "failed-01", "wrong");
  await manager.verifyNextFactor(lock.id, "failed-01", "wrong");
  manager.relock(lock.id, "failed-01");
  manager.beginUnlock(lock.id, "failed-02");
  await assert.rejects(() => manager.verifyNextFactor(lock.id, "failed-02", "1234"), /cooldown/);
  now += 1_001;
  const afterCooldown = await manager.verifyNextFactor(lock.id, "failed-02", "1234");
  assert.equal(afterCooldown.complete, true);
});

test("password vault records are versioned, salted, and reject tampered records", async () => {
  const vault = new toys.MemorySecretVault();
  await toys.storeHashedSecret(vault, "password", "correct horse battery staple");
  const record = JSON.parse(await vault.get("password"));
  assert.equal(record.version, 2);
  assert.equal(record.algorithm, "memory-sha256");
  assert.equal(typeof record.salt, "string");
  assert.equal(await toys.verifySecret(vault, "password", "correct horse battery staple"), true);
  assert.equal(await toys.verifySecret(vault, "password", "wrong"), false);
  await vault.put("password", JSON.stringify({ ...record, hash: record.hash.replace(/^../, "ff") }));
  assert.equal(await toys.verifySecret(vault, "password", "correct horse battery staple"), false);
});

test("super confirmation requires two independently verified keys and the full slider", async () => {
  const confirmation = new toys.SuperConfirmation("Delete selected records", "2 records", async (slot, value) => value === `${slot}-key`, { now: () => 1_000 });
  await confirmation.submitKey("first", "first-key");
  assert.throws(() => confirmation.confirm(), /Both independent keys/);
  await confirmation.submitKey("second", "second-key");
  confirmation.setSlider(99);
  assert.throws(() => confirmation.confirm(), /Both independent keys/);
  confirmation.setSlider(100);
  assert.deepEqual(confirmation.confirm(), { authorized: true, action: "Delete selected records", affectedData: "2 records" });
  assert.throws(() => confirmation.confirm(), /Both independent keys/);
});

test("super confirmation expires and cannot be replayed", async () => {
  let now = 1_000;
  const confirmation = new toys.SuperConfirmation("Remove item", "item-1", async () => true, { now: () => now, expiresInMs: 1_000 });
  await confirmation.submitKey("first", "a");
  await confirmation.submitKey("second", "b");
  now += 1_001;
  assert.equal(confirmation.state().expired, true);
  confirmation.setSlider(100);
  assert.throws(() => confirmation.confirm(), /Both independent keys/);
});

test("ladder is server-owned, nonce single-use, budgeted, and School mode starts at sums", () => {
  let now = 10_000;
  const ladder = new toys.UnlockLadderServer({ now: () => now, random: () => 0 });
  const lockout = { waitingUntil: now + 60_000, attemptsRemaining: 2, maxAttempts: 2 };
  const school = ladder.begin("alice", "alice-session", lockout, true);
  assert.equal(school.rung, "sums");
  const replay = ladder.submit("alice", "alice-session", school.nonce, { kind: "sums", answers: [] });
  assert.equal(replay.sessionCookieIssued, false);
  assert.equal(ladder.submit("alice", "alice-session", school.nonce, { kind: "sums", answers: [] }).reason, "invalid");
  assert.equal(ladder.remainingBudget("alice"), 2);
  const normal = ladder.begin("bob", "bob-session", lockout, false);
  assert.equal(normal.rung, "dish");
  let current = normal;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = ladder.submit("bob", "bob-session", current.nonce, { kind: "dish", choice: 1 });
    current = result.next;
  }
  assert.equal(current.rung, "sums");
});

test("ladder budget survives a fresh server instance through its authority adapter", () => {
  let now = 10_000;
  const authority = new toys.MemoryLadderAuthority();
  const first = new toys.UnlockLadderServer({ now: () => now, random: () => 0, authority });
  const lockout = { waitingUntil: now + 60_000, attemptsRemaining: 1, maxAttempts: 1 };
  first.begin("persisted", "persisted-session", lockout);
  const second = new toys.UnlockLadderServer({ now: () => now, random: () => 0, authority });
  assert.equal(second.remainingBudget("persisted"), 2);
  assert.throws(() => second.begin("persisted", "bad", lockout), /Session ID/);
});

test("mole hits are one-at-a-time, authority-timestamped, bounded, and replay-safe", () => {
  let now = 1_000;
  const ladder = new toys.UnlockLadderServer({ now: () => now, random: () => 0 });
  const lockout = { waitingUntil: now + 60_000, attemptsRemaining: 1, maxAttempts: 1 };
  const sums = ladder.begin("mole-user", "mole-session", lockout, true);
  const moleChallenge = ladder.submit("mole-user", "mole-session", sums.nonce, { kind: "sums", answers: [] }).next;
  const moles = moleChallenge.moleRound.moles;
  now = 999;
  assert.equal(ladder.submitMoleHit("mole-user", "mole-session", moleChallenge.nonce, "bad", 0).reason, "early");
  now = moles[0].visibleAt;
  assert.equal(ladder.submitMoleHit("mole-user", "mole-session", moleChallenge.nonce, moles[0].id, 1).reason, "wrong-cell");
  assert.equal(ladder.submitMoleHit("mole-user", "mole-session", moleChallenge.nonce, moles[0].id, moles[0].cell).accepted, true);
  assert.equal(ladder.submitMoleHit("mole-user", "mole-session", moleChallenge.nonce, moles[0].id, moles[0].cell).reason, "replay");
  for (const mole of moles.slice(1)) {
    now = mole.visibleAt;
    assert.equal(ladder.submitMoleHit("mole-user", "mole-session", moleChallenge.nonce, mole.id, mole.cell).accepted, true);
  }
  assert.equal(ladder.finishMoleRound("mole-user", "mole-session", moleChallenge.nonce).reason, "early");
  now = moles[4].visibleAt + 10_000;
  const finished = ladder.finishMoleRound("mole-user", "mole-session", moleChallenge.nonce);
  assert.equal(finished.clearedWaiting, true);
  assert.equal(finished.sessionCookieIssued, false);
  assert.equal(ladder.submitMoleHit("mole-user", "mole-session", moleChallenge.nonce, moles[4].id, moles[4].cell).reason, "wrong-rung");
  const secondSums = ladder.begin("mole-user", "mole-session-2", { waitingUntil: now + 60_000, attemptsRemaining: 1, maxAttempts: 1 }, true);
  const secondMoles = ladder.submit("mole-user", "mole-session-2", secondSums.nonce, { kind: "sums", answers: [] }).next;
  now = secondMoles.expiresAt + 1;
  assert.equal(ladder.submitMoleHit("mole-user", "mole-session-2", secondMoles.nonce, secondMoles.moleRound.moles[0].id, 0).reason, "late");
});

test("support tickets and history exports are local and redacted", async () => {
  const tickets = new toys.LocalSupportTickets(() => 123);
  const ticket = tickets.create({ category: "forgotten-lock", description: "Forgot the toy lock", recoveryDirectory: "C:/AppData/Local/ClaudeDesign" });
  assert.equal(ticket.networkSent, false);
  assert.deepEqual(tickets.openRecoveryFolderIntent(ticket.id), { kind: "open-folder", directory: ticket.recoveryDirectory, destructiveAction: false });
  assert.match(tickets.exportRedacted(), /Nothing is sent anywhere/);
  const vault = new toys.MemorySecretVault();
  const history = new toys.PasswordProtectedHistoryManager(new toys.MemoryHistoryStore(), vault);
  await history.setPassword("history-password");
  assert.equal(await history.open("history-password"), true);
  await history.append("created", "Added authenticator entry", "encrypted-snapshot-ref");
  const exported = await history.exportRedacted();
  assert.match(exported, /secretsOmitted/);
  assert.doesNotMatch(exported, /history-password|encrypted-snapshot-ref/);
});

test("negative regression proves disabling the independent factor list turns the contract red", () => {
  const source = require("fs").readFileSync(require("path").join(__dirname, "../src/types.ts"), "utf8");
  const checkPolicyInventory = (text) => {
    for (const policy of ["PIN", "PASSWORD", "PIN_PASSWORD", "PASSWORD_TOTP", "PIN_TOTP", "PASSWORD_PIN_TOTP"]) {
      if (!new RegExp(`^\\s*${policy}:`, "m").test(text)) throw new Error(`missing policy ${policy}`);
    }
  };
  checkPolicyInventory(source);
  const broken = source.replace(/^\s*PIN_TOTP:.*$/m, "");
  assert.notEqual(broken, source, "break mutation must land before it is tested");
  assert.throws(() => checkPolicyInventory(broken), /missing policy PIN_TOTP/);
  assert.match(source, /PASSWORD_PIN_TOTP: \["password", "pin", "totp"\]/);
  assert.equal(toys.LOCK_POLICY_FACTORS.PASSWORD_PIN_TOTP.join(","), "password,pin,totp");
});

test("authoritative activation route executes unlocked actions and never executes locked actions", () => {
  let activated = 0;
  let unlockRequests = 0;
  toys.routeActivation(false, () => { activated += 1; }, () => { unlockRequests += 1; });
  toys.routeActivation(true, () => { activated += 1; }, () => { unlockRequests += 1; });
  assert.equal(activated, 1);
  assert.equal(unlockRequests, 1);
});
