// Parses the token/wallet address out of the page URL and asks the Gotham
// API for a verdict, then injects a small badge. No wallet connection, no
// DOM scraping beyond the URL — matches the brief's out-of-scope list.
const SOLANA_ADDRESS_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
const DEFAULT_API_BASE_URL = "https://robin-hood-rho.vercel.app";

const VERDICT_COLOR = {
  high_risk: "#ff4d4d",
  mixed: "#e6b800",
  clean: "#3ddc84",
  insufficient_data: "#999999",
};

function extractAddress() {
  const match = location.pathname.match(SOLANA_ADDRESS_RE);
  return match ? match[0] : null;
}

function renderBadge(text, color) {
  let el = document.getElementById("gotham-badge");
  if (!el) {
    el = document.createElement("div");
    el.id = "gotham-badge";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.borderColor = color;
  return el;
}

async function run() {
  const address = extractAddress();
  if (!address) return;

  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  const baseUrl = apiBaseUrl || DEFAULT_API_BASE_URL;

  const badge = renderBadge("GOTHAM: scanning…", "#999999");

  try {
    const res = await fetch(`${baseUrl}/api/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      renderBadge(`GOTHAM: ${err.message ?? "scan failed"}`, "#999999");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const event = JSON.parse(chunk.slice(6));
        if (event.type === "done") result = event.result;
      }
    }

    if (!result) {
      renderBadge("GOTHAM: no result", "#999999");
      return;
    }
    renderBadge(`GOTHAM: ${result.verdict.replace("_", " ")}`, VERDICT_COLOR[result.verdict]);
  } catch {
    badge.textContent = "GOTHAM: unreachable";
  }
}

run();
