import { fetchJSON, resolveUrl, qs } from "./util.js";

const DATA_URL = "../data/portfolio.json";
const DEFAULT_GROUP_NAME = "Wolne wzory";
const DEFAULT_GROUP_KEY = DEFAULT_GROUP_NAME.trim().toLowerCase();

function setupLightbox(items) {
  const lb = qs("#lightbox");
  const lbImg = qs("#lightboxImg");
  const lbCap = qs("#lightboxCaption");
  const btnClose = qs("#lightboxClose");
  const btnPrev = qs("#lightboxPrev");
  const btnNext = qs("#lightboxNext");

  if (!lb || !lbImg) return;

  let index = 0;

  const open = (i) => {
    index = i;
    const item = items[index];
    if (!item) return;

    lbImg.src = item._resolvedSrc;
    lbImg.alt = item.alt || "Tatuaż – praca Lexie";
    if (lbCap) lbCap.textContent = item.alt || "";
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    lb.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  const prev = () => {
    if (!items.length) return;
    open((index - 1 + items.length) % items.length);
  };

  const next = () => {
    if (!items.length) return;
    open((index + 1) % items.length);
  };

  btnClose?.addEventListener("click", close);
  btnPrev?.addEventListener("click", prev);
  btnNext?.addEventListener("click", next);

  lb.addEventListener("click", (e) => {
    if (e.target === lb) close();
  });

  window.addEventListener("keydown", (e) => {
    const isOpen = lb.getAttribute("aria-hidden") === "false";
    if (!isOpen) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  });

  return { open, close };
}

function normalizeGroups(data, items) {
  const idsAll = items.map((x) => x.id).filter(Boolean);
  const idSet = new Set(idsAll);

  // Wspieramy dwa formaty:
  // 1) nowy: data.groups = [{id,name,items:[id...]}]
  // 2) stary: brak data.groups -> wszystko wpada do "Wolne wzory"
  let groups = [];
  if (Array.isArray(data.groups) && data.groups.length) {
    groups = data.groups.map((g, idx) => ({
      id: String(g?.id || `g${idx}`),
      name: String(g?.name || ""),
      items: Array.isArray(g?.items)
        ? g.items
        : Array.isArray(g?.ids)
          ? g.ids
          : [],
    }));
  } else {
    groups = [
      { id: "wolne-wzory", name: DEFAULT_GROUP_NAME, items: idsAll.slice() },
    ];
  }

  // Zapewnij, że istnieje grupa domyślna i jest na górze
  let def = groups.find(
    (g) => String(g.name).trim().toLowerCase() === DEFAULT_GROUP_KEY,
  );
  if (!def) {
    def = { id: "wolne-wzory", name: DEFAULT_GROUP_NAME, items: [] };
    groups.unshift(def);
  } else {
    def.name = DEFAULT_GROUP_NAME;
    groups = [def, ...groups.filter((g) => g !== def)];
  }

  // Usuń duplikaty / nieistniejące ID, zachowując pierwsze przypisanie
  const assigned = new Set();
  for (const g of groups) {
    const cleaned = [];
    for (const id of g.items || []) {
      if (!idSet.has(id)) continue;
      if (assigned.has(id)) continue;
      assigned.add(id);
      cleaned.push(id);
    }
    g.items = cleaned;
  }

  // Dopnij nieprzypisane elementy do "Wolne wzory"
  for (const id of idsAll) {
    if (!assigned.has(id)) {
      assigned.add(id);
      def.items.push(id);
    }
  }

  return groups;
}

async function renderPortfolio() {
  const root = qs("#portfolioGrid");
  if (!root) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);

    const items = (data.items || []).map((x) => ({
      ...x,
      _resolvedSrc: resolveUrl(x.src, url),
    }));

    const byId = new Map(items.map((x) => [x.id, x]));

    const updated = qs("[data-updated]");
    if (updated && data.updated) updated.textContent = data.updated;

    // Kontener w HTML ma class="grid" — przy grupach robimy w środku osobne gridy
    root.classList.remove("grid");
    root.innerHTML = "";

    const orderedForLightbox = [];
    const lb = setupLightbox(orderedForLightbox);

    const groups = normalizeGroups(data, items);

    let renderedAny = false;

    for (const group of groups) {
      const ids = (group.items || []).filter((id) => byId.has(id));
      if (ids.length === 0) continue; // ✅ nie pokazuj pustych grup

      renderedAny = true;

      const section = document.createElement("section");
      section.className = "portfolio-group";

      const title = document.createElement("h2");
      title.className = "portfolio-group__title";
      const SUFFIX = " ✧˚₊";
      title.textContent = (group.name || "") + SUFFIX;

      const grid = document.createElement("div");
      grid.className = "grid";
      grid.setAttribute("aria-label", `Portfolio — ${group.name || ""}`);

      for (const id of ids) {
        const item = byId.get(id);
        if (!item) continue;

        const idx = orderedForLightbox.length;
        orderedForLightbox.push(item);

        const img = document.createElement("img");
        img.src = item._resolvedSrc;
        img.alt = item.alt || "Tatuaż – praca Lexie";
        img.loading = "lazy";
        img.decoding = "async";

        const tile = document.createElement("div");
        tile.className = "tile";
        tile.tabIndex = 0;
        tile.append(img);

        tile.addEventListener("click", () => lb?.open(idx));
        tile.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") lb?.open(idx);
        });

        grid.append(tile);
      }

      section.append(title, grid);
      root.append(section);
    }

    if (!renderedAny) {
      root.append("Brak prac do wyświetlenia — uzupełnij portfolio.json.");
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = "";
    root.append("Nie udało się wczytać portfolio (sprawdź JSON / ścieżki).");
  }
}

window.addEventListener("DOMContentLoaded", renderPortfolio);
