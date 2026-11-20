// Ícone da barra e atalho disparam a cópia na aba do YouTube.
function trigger(tab) {
  if (!tab || !tab.id || !/^https:\/\/www\.youtube\.com\//.test(tab.url || "")) return;
  chrome.tabs.sendMessage(tab.id, { type: "COPY_TRANSCRIPT" }).catch(() => {});
}

chrome.action.onClicked.addListener(trigger);

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "copy-transcript") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  trigger(tab);
});
