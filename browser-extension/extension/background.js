const LIMITS = Object.freeze({ maxFilename: 240, maxUrl: 2048 });
const NATIVE_HOST = "com.claude.design.downloads";
const pendingKey = "downloadCompanion.pending";
const transfers = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "claude-design-download-link",
    title: "Download link with Claude Design Companion",
    contexts: ["link"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "claude-design-download-link" || !info.linkUrl) return;
  const request = makeRequest(info.linkUrl, filenameFromUrl(info.linkUrl), "Context-menu link");
  await chrome.storage.session.set({ [pendingKey]: request });
  if (chrome.action.openPopup) {
    try { await chrome.action.openPopup(); } catch { /* the user can open the action manually */ }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: safeError(error) }));
  return true;
});

chrome.downloads.onChanged.addListener((delta) => {
  const transfer = transfers.get(delta.id);
  if (!transfer) return;
  if (delta.bytesReceived?.current !== undefined) transfer.bytesReceived = boundedNumber(delta.bytesReceived.current, 0);
  if (delta.totalBytes?.current !== undefined && delta.totalBytes.current >= 0) transfer.totalBytes = boundedNumber(delta.totalBytes.current, 0);
  if (delta.state?.current === "complete") {
    transfer.phase = "completed";
    transfer.etaSeconds = 0;
    emitTransfer(transfer);
    void chrome.notifications.create(`download-complete-${delta.id}`, {
      type: "basic", iconUrl: chrome.runtime.getURL("extension/icon.svg"), title: "Download complete", message: transfer.filename
    });
  } else if (delta.state?.current === "interrupted") {
    transfer.phase = "failed";
    transfer.error = delta.error?.current || "The browser reported an interrupted transfer";
    emitTransfer(transfer);
  } else if (delta.paused?.current === true) {
    transfer.phase = "paused";
    emitTransfer(transfer);
  } else if (delta.paused?.current === false) {
    transfer.phase = "downloading";
    emitTransfer(transfer);
  } else if (delta.bytesReceived || delta.totalBytes) {
    transfer.phase = "downloading";
    recomputeRate(transfer);
    emitTransfer(transfer);
  }
});

async function handleMessage(message) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") throw new Error("Invalid message");
  if (message.type === "get-pending") {
    const stored = await chrome.storage.session.get(pendingKey);
    return { ok: true, request: stored[pendingKey] || null };
  }
  if (message.type === "cancel-proposal") {
    await chrome.storage.session.remove(pendingKey);
    return { ok: true, queueChanged: false };
  }
  if (message.type === "start-download") {
    const request = makeRequest(message.sourceUrl, message.filename, message.sourceLabel);
    const [downloadId] = await Promise.all([
      chrome.downloads.download({ url: request.sourceUrl, filename: request.filename, saveAs: false }),
      chrome.storage.session.remove(pendingKey)
    ]);
    const transfer = {
      id: `download-${downloadId}`,
      browserDownloadId: downloadId,
      filename: request.filename,
      sourceUrl: request.sourceUrl,
      phase: "queued",
      bytesReceived: 0,
      totalBytes: undefined,
      rateBytesPerSecond: 0,
      etaSeconds: undefined,
      sourceLabel: request.sourceLabel,
      progressWindow: { alwaysOnTop: true, visible: true }
    };
    transfers.set(downloadId, transfer);
    emitTransfer(transfer);
    await chrome.windows.create({
      url: chrome.runtime.getURL(`extension/progress.html?downloadId=${downloadId}`),
      type: "popup",
      focused: true,
      width: 430,
      height: 260
    });
    sendNative({ type: "open-progress-window", protocolVersion: 1, requestId: transfer.id, downloadId: transfer.id, title: request.filename });
    return { ok: true, queueChanged: true, transfer: publicTransfer(transfer) };
  }
  if (message.type === "control-download") {
    const id = boundedNumber(message.browserDownloadId, 0);
    const transfer = transfers.get(id);
    if (!transfer) throw new Error("Unknown download");
    if (message.action === "pause") await chrome.downloads.pause(id);
    else if (message.action === "resume") await chrome.downloads.resume(id);
    else if (message.action === "cancel") await chrome.downloads.cancel(id);
    else throw new Error("Unsupported download action");
    sendNative({ type: "download-control", protocolVersion: 1, requestId: transfer.id, downloadId: transfer.id, action: message.action });
    return { ok: true, transfer: publicTransfer(transfer) };
  }
  throw new Error("Unsupported message type");
}

function makeRequest(sourceUrl, filename, sourceLabel) {
  const url = boundedString(sourceUrl, LIMITS.maxUrl, "sourceUrl");
  const parsed = new URL(url);
  if (!/^https?:$/u.test(parsed.protocol) || parsed.username || parsed.password) throw new Error("Only credential-free HTTP(S) URLs are supported");
  const safeFilename = boundedString(filename, LIMITS.maxFilename, "filename");
  if (!/^[^\\/\u0000-\u001f\u007f]+$/u.test(safeFilename) || safeFilename === "." || safeFilename === "..") throw new Error("Filename must be one safe file name");
  return { sourceUrl: parsed.toString(), filename: safeFilename, sourceLabel: boundedString(sourceLabel || parsed.hostname, 160, "sourceLabel") };
}

function filenameFromUrl(value) {
  try { return decodeURIComponent(new URL(value).pathname.split("/").pop() || "download.bin").slice(0, LIMITS.maxFilename); }
  catch { return "download.bin"; }
}

function boundedString(value, limit, label) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`${label} is outside its limit`);
  return value.trim();
}

function boundedNumber(value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error("Numeric transfer value is outside its limit");
  return value;
}

function recomputeRate(transfer) {
  const now = Date.now();
  const elapsed = Math.max(1, now - (transfer.lastSampleAt || now));
  transfer.rateBytesPerSecond = Math.max(0, Math.round((transfer.bytesReceived - (transfer.lastSampleBytes || 0)) / (elapsed / 1000)));
  transfer.lastSampleAt = now;
  transfer.lastSampleBytes = transfer.bytesReceived;
  transfer.etaSeconds = transfer.totalBytes && transfer.rateBytesPerSecond > 0 ? Math.ceil((transfer.totalBytes - transfer.bytesReceived) / transfer.rateBytesPerSecond) : undefined;
}

function emitTransfer(transfer) {
  const snapshot = publicTransfer(transfer);
  void chrome.runtime.sendMessage({ type: "download-event", transfer: snapshot });
  sendNative({ type: "download-event", protocolVersion: 1, requestId: transfer.id, event: transfer.phase, record: nativeRecord(transfer) });
}

function nativeRecord(transfer) {
  return {
    id: transfer.id,
    request: {
      sourceUrl: transfer.sourceUrl,
      filename: transfer.filename,
      destination: "downloads",
      sourceLabel: transfer.sourceLabel
    },
    phase: transfer.phase,
    bytesReceived: transfer.bytesReceived,
    totalBytes: transfer.totalBytes,
    rateBytesPerSecond: transfer.rateBytesPerSecond,
    etaSeconds: transfer.etaSeconds,
    progressWindow: {
      alwaysOnTop: true,
      accessibleName: `Download progress for ${transfer.filename}`,
      windowId: `progress-${transfer.id}`,
      visible: transfer.progressWindow.visible
    }
  };
}

function publicTransfer(transfer) {
  return {
    id: transfer.id, browserDownloadId: transfer.browserDownloadId, filename: transfer.filename, sourceLabel: transfer.sourceLabel,
    phase: transfer.phase, bytesReceived: transfer.bytesReceived, totalBytes: transfer.totalBytes,
    rateBytesPerSecond: transfer.rateBytesPerSecond, etaSeconds: transfer.etaSeconds,
    progressWindow: { alwaysOnTop: true, visible: transfer.progressWindow.visible }
  };
}

function sendNative(message) {
  try { chrome.runtime.sendNativeMessage(NATIVE_HOST, message); } catch { /* native host is optional for browser-only progress */ }
}

function safeError(error) { return error instanceof Error ? error.message.slice(0, 240) : "Download request failed"; }
