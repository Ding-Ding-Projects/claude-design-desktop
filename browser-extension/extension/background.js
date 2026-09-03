import { validateNativeResponse } from "./native-response.js";

const LIMITS = Object.freeze({ maxFilename: 240, maxUrl: 2048 });
const NATIVE_HOST = "com.claude.design.downloads";
const pendingKey = "downloadCompanion.pending";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "claude-design-download-link", title: "Send link to Claude Design Download Companion", contexts: ["link"] });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "claude-design-download-link" || !info.linkUrl) return;
  try {
    await chrome.storage.session.set({ [pendingKey]: makeRequest(info.linkUrl, filenameFromUrl(info.linkUrl), "Context-menu link") });
    if (chrome.action.openPopup) await chrome.action.openPopup();
  } catch { /* the popup reports a bounded validation message */ }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: safeError(error) }));
  return true;
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
  if (message.type === "propose-download") {
    const request = makeRequest(message.sourceUrl, message.filename, message.sourceLabel);
    const response = await sendNative({ type: "propose-download", protocolVersion: 1, requestId: `request-${Date.now().toString(36)}`, request });
    if (response.type !== "proposal-ready") throw new Error(response.error || "The installed desktop app rejected the proposal");
    await chrome.storage.session.remove(pendingKey);
    return { ok: true, queueChanged: false, proposalId: response.proposalId, handedOff: true };
  }
  throw new Error("Unsupported message type");
}

function makeRequest(sourceUrl, filename, sourceLabel) {
  const url = boundedString(sourceUrl, LIMITS.maxUrl, "sourceUrl");
  const parsed = new URL(url);
  if (!/^https?:$/u.test(parsed.protocol) || parsed.username || parsed.password) throw new Error("Only credential-free HTTP(S) URLs are supported");
  if (isPrivateOrLocalHost(parsed.hostname)) throw new Error("Loopback, private, and local sources are not supported");
  const safeFilename = boundedString(filename, LIMITS.maxFilename, "filename");
  if (!/^[^\\/\u0000-\u001f\u007f]+$/u.test(safeFilename) || safeFilename === "." || safeFilename === "..") throw new Error("Filename must be one safe file name");
  return { sourceUrl: parsed.toString(), suggestedFilename: safeFilename, destination: "downloads", sourceLabel: boundedString(sourceLabel || parsed.hostname, 160, "sourceLabel") };
}

function filenameFromUrl(value) {
  try { return decodeURIComponent(new URL(value).pathname.split("/").pop() || "download.bin").slice(0, LIMITS.maxFilename); }
  catch { return "download.bin"; }
}

function isPrivateOrLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 169 && octets[1] === 254);
}

function boundedString(value, limit, label) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`${label} is outside its limit`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is outside its limit`);
  return normalized;
}

async function sendNative(message) {
  const response = await Promise.race([
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message),
    new Promise((_, reject) => setTimeout(() => reject(new Error("The installed desktop app did not respond")), 10_000))
  ]);
  return validateNativeResponse(response);
}

function safeError(error) { return error instanceof Error ? error.message.slice(0, 240) : "Download request failed"; }
