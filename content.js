// Transcript Copy: abre o painel de transcrição do próprio YouTube,
// lê os trechos, copia tudo (com título e link) e fecha o painel.

(() => {
  const LABEL = "Copiar transcrição";
  const PANEL_SEL =
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
  const SEGMENT_SEL = "ytd-transcript-segment-renderer, transcript-segment-view-model";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isWatch = () => location.pathname === "/watch" || location.pathname.startsWith("/shorts/");

  async function waitFor(fn, timeout = 8000, step = 150) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  // ---------- botão flutuante ----------
  const btn = document.createElement("button");
  btn.id = "tc-btn";
  btn.type = "button";
  btn.innerHTML = '<span class="tc-dot"></span><span class="tc-label"></span>';
  const setLabel = (t, state) => {
    btn.querySelector(".tc-label").textContent = t;
    btn.dataset.state = state || "";
  };
  setLabel(LABEL);
  btn.addEventListener("click", () => run());

  function mountButton() {
    if (!document.body.contains(btn)) document.body.appendChild(btn);
    btn.classList.toggle("tc-visible", location.pathname === "/watch");
  }

  // ---------- leitura da transcrição ----------
  function findOpenButton() {
    const candidates = [
      "ytd-video-description-transcript-section-renderer button",
      'button[aria-label*="transcri" i]',
      'button[aria-label*="Show transcript" i]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // fallback: qualquer botão cujo texto fale em transcrição
    return [...document.querySelectorAll("ytd-watch-metadata button, #description button")].find((b) =>
      /transcri/i.test(b.textContent || "")
    );
  }

  function readSegments() {
    const segs = [...document.querySelectorAll(`${PANEL_SEL} ${SEGMENT_SEL}`)];
    const list = segs.length ? segs : [...document.querySelectorAll(SEGMENT_SEL)];
    return list
      .map((s) => {
        const text =
          s.querySelector(".segment-text, [class*='segment-text'], yt-formatted-string")?.textContent ||
          s.textContent ||
          "";
        const time = s.querySelector(".segment-timestamp, [class*='timestamp']")?.textContent || "";
        return { time: time.trim(), text: text.replace(/\s+/g, " ").trim() };
      })
      .filter((s) => s.text);
  }

  function closePanel() {
    const panel = document.querySelector(PANEL_SEL);
    if (!panel) return;
    const close = panel.querySelector('#visibility-button button, button[aria-label*="Close" i], button[aria-label*="Fechar" i]');
    if (close) close.click();
    else panel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
  }

  async function getTranscript() {
    let segs = readSegments();
    let openedByUs = false;

    if (!segs.length) {
      // expande a descrição (o botão de transcrição mora lá)
      document.querySelector("tp-yt-paper-button#expand, #description-inline-expander #expand")?.click();
      const openBtn = await waitFor(findOpenButton, 4000);
      if (!openBtn) throw new Error("Este vídeo não tem transcrição disponível.");
      openBtn.click();
      openedByUs = true;
      await waitFor(() => readSegments().length, 10000);
      // espera a lista estabilizar (vídeos longos carregam em partes)
      let last = -1;
      for (let i = 0; i < 20; i++) {
        const n = readSegments().length;
        if (n && n === last) break;
        last = n;
        await sleep(250);
      }
      segs = readSegments();
    }

    if (openedByUs) closePanel();
    if (!segs.length) throw new Error("Não consegui ler a transcrição.");
    return segs;
  }

  function format(segs, withTime) {
    const title =
      document.querySelector("ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata")?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/, "");
    const channel = document.querySelector("ytd-watch-metadata ytd-channel-name a, #owner #channel-name a")?.textContent?.trim() || "";
    const id = new URLSearchParams(location.search).get("v");
    const url = id ? `https://www.youtube.com/watch?v=${id}` : location.href;

    const body = withTime
      ? segs.map((s) => (s.time ? `[${s.time}] ${s.text}` : s.text)).join("\n")
      : segs.map((s) => s.text).join(" ");

    const head = [`Título: ${title}`];
    if (channel) head.push(`Canal: ${channel}`);
    head.push(`Link: ${url}`);
    return [...head, "", "Transcrição:", body].join("\n");
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  let busy = false;
  async function run() {
    if (busy || location.pathname !== "/watch") return;
    busy = true;
    setLabel("Copiando…", "busy");
    try {
      const { withTime = false } = await chrome.storage.sync.get("withTime");
      const segs = await getTranscript();
      const text = format(segs, withTime);
      await copy(text);
      const words = text.split(/\s+/).length;
      setLabel(`Copiado · ${words.toLocaleString("pt-BR")} palavras`, "ok");
    } catch (e) {
      setLabel(e.message || "Erro ao copiar", "err");
    } finally {
      busy = false;
      setTimeout(() => setLabel(LABEL), 2600);
    }
  }

  // botão direito no botão alterna timestamps
  btn.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    const { withTime = false } = await chrome.storage.sync.get("withTime");
    await chrome.storage.sync.set({ withTime: !withTime });
    setLabel(!withTime ? "Com timestamps" : "Sem timestamps", "ok");
    setTimeout(() => setLabel(LABEL), 1600);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "COPY_TRANSCRIPT") run();
  });

  // YouTube é SPA: reposiciona o botão a cada navegação
  document.addEventListener("yt-navigate-finish", mountButton);
  mountButton();
})();
