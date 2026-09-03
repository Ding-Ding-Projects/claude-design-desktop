const params = new URLSearchParams(location.search);
const browserDownloadId = Number(params.get("downloadId"));
const fileNode = document.querySelector("#filename");
const progressNode = document.querySelector("#progress");
const pause = document.querySelector("#pause");
const cancel = document.querySelector("#cancel");
let paused = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "download-event" || message.transfer?.browserDownloadId !== browserDownloadId) return;
  const transfer = message.transfer;
  fileNode.textContent = transfer.filename;
  progressNode.textContent = `${formatBytes(transfer.bytesReceived)} of ${transfer.totalBytes ? formatBytes(transfer.totalBytes) : "unknown size"}; ${transfer.rateBytesPerSecond ? `${formatBytes(transfer.rateBytesPerSecond)}/s` : "rate calculating"}; ${transfer.etaSeconds === undefined ? "ETA unknown" : `${transfer.etaSeconds}s remaining`}`;
  paused = transfer.phase === "paused"; pause.textContent = paused ? "Resume" : "Pause"; pause.disabled = transfer.phase !== "downloading" && !paused;
});

pause.addEventListener("click", () => send(paused ? "resume" : "pause"));
cancel.addEventListener("click", () => send("cancel"));
function send(action) { void chrome.runtime.sendMessage({ type: "control-download", browserDownloadId, action }); }
function formatBytes(bytes) { if (!Number.isFinite(bytes)) return "0 bytes"; if (bytes < 1024) return `${bytes} bytes`; const units = ["KiB", "MiB", "GiB"]; let value = bytes; let i = -1; do { value /= 1024; i++; } while (value >= 1024 && i < units.length - 1); return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`; }
