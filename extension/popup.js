const DEFAULT_API_BASE_URL = "https://robin-hood-rho.vercel.app";

const input = document.getElementById("apiBaseUrl");
const status = document.getElementById("status");

chrome.storage.sync.get("apiBaseUrl").then(({ apiBaseUrl }) => {
  input.value = apiBaseUrl || DEFAULT_API_BASE_URL;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/$/, "");
  await chrome.storage.sync.set({ apiBaseUrl: value });
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
});
