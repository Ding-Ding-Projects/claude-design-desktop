const source = document.querySelector("#source");
const filename = document.querySelector("#filename");
const status = document.querySelector("#status");
const form = document.querySelector("#start-form");
const start = document.querySelector("#start");
const cancel = document.querySelector("#cancel");

chrome.runtime.sendMessage({ type: "get-pending" }).then((reply) => {
  if (reply?.request) { source.value = reply.request.sourceUrl; filename.value = reply.request.filename; }
}).catch(() => { status.textContent = "No pending link is available. Enter a source URL."; });

cancel.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "cancel-proposal" });
  status.textContent = "Cancelled. The download queue is unchanged.";
  source.value = ""; filename.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault(); start.disabled = true; cancel.disabled = true; status.textContent = "Handing the proposal to the installed desktop app…";
  try {
    const reply = await chrome.runtime.sendMessage({ type: "propose-download", sourceUrl: source.value, filename: filename.value, sourceLabel: "Browser extension" });
    if (!reply?.ok) throw new Error(reply?.error || "The download did not start");
    status.textContent = "Proposal handed off. Confirm it in the installed desktop app to begin the transfer.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "The download did not start";
    start.disabled = false; cancel.disabled = false;
  }
});
