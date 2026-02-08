import { fetchJSON, resolveUrl, qs, el } from "./util.js";

// Uwaga: reorder.html bywa umieszczany w różnych katalogach (root / admin / portfolio).
// fetch() rozwiązuje ścieżki względne względem aktualnego URL dokumentu, więc używamy listy fallbacków.
const DATA_URL_CANDIDATES = [
  "../data/portfolio.json",
  "./data/portfolio.json",
  "data/portfolio.json",
  "/data/portfolio.json",
];

const PINNED_GROUP_ID = "wolne-wzory";
const PINNED_GROUP_NAME = "Wolne wzory";

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function nowISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniqId(prefix = "g") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Insert helper for grid: insert before the closest card by cursor distance
function getInsertBefore(container, x, y, draggingEl) {
  const cards = Array.from(container.querySelectorAll(".workCard"))
    .filter((c) => c !== draggingEl && !c.classList.contains("dragging"));
  if (!cards.length) return null;

  let best = null;
  let bestD = Infinity;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // Decide whether to insert before or after "best" based on cursor position relative to its center
  if (!best) return null;
  const rb = best.getBoundingClientRect();
  const before = x < rb.left + rb.width / 2;
  return before ? best : best.nextElementSibling;
}

function ensurePinnedGroup(groups) {
  const byId = new Map(groups.map((g) => [g.id, g]));
  if (!byId.has(PINNED_GROUP_ID)) {
    groups.unshift({ id: PINNED_GROUP_ID, name: PINNED_GROUP_NAME, items: [] });
  } else {
    // force name and move to top
    const g = byId.get(PINNED_GROUP_ID);
    g.name = PINNED_GROUP_NAME;
    const idx = groups.indexOf(g);
    if (idx > 0) groups.splice(idx, 1), groups.unshift(g);
  }
}

function normalizeData(data) {
  const out = { ...data };
  out.version = 2;

  out.items = Array.isArray(out.items) ? out.items : [];
  // ensure IDs
  for (const it of out.items) {
    if (!it.id) {
      const base = String(it.src || "").split("/").pop() || uniqId("p");
      it.id = base.replace(/\.[a-z0-9]+$/i, "");
    }
  }

  out.groups = Array.isArray(out.groups) ? out.groups : [];
  out.featuredOrder = Array.isArray(out.featuredOrder) ? out.featuredOrder : [];

  ensurePinnedGroup(out.groups);

  // If no groups defined (or only pinned empty), default: put everything into pinned
  const hasAnyAssigned =
    out.groups.some((g) => Array.isArray(g.items) && g.items.length) ||
    false;
  if (!hasAnyAssigned) {
    const pinned = out.groups.find((g) => g.id === PINNED_GROUP_ID);
    pinned.items = out.items.map((x) => x.id);
  }

  // If featuredOrder empty, derive from items order
  if (!out.featuredOrder.length) {
    out.featuredOrder = out.items.filter((x) => x.featured).map((x) => x.id);
  }

  // Make sure every item is in exactly one group (fallback to pinned)
  const allIds = new Set(out.items.map((x) => x.id));
  const seen = new Set();

  for (const g of out.groups) {
    g.items = Array.isArray(g.items) ? g.items : [];
    g.items = g.items.filter((id) => allIds.has(id));
    // dedupe
    g.items = g.items.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  }

  const pinned = out.groups.find((g) => g.id === PINNED_GROUP_ID);
  for (const id of allIds) if (!seen.has(id)) pinned.items.push(id);

  // featuredOrder: keep only featured & existing, keep order, then append any missing featured
  const featuredSet = new Set(out.items.filter((x) => x.featured).map((x) => x.id));
  const fo = [];
  const foSeen = new Set();
  for (const id of out.featuredOrder) {
    if (!featuredSet.has(id)) continue;
    if (foSeen.has(id)) continue;
    foSeen.add(id);
    fo.push(id);
  }
  for (const id of featuredSet) if (!foSeen.has(id)) fo.push(id);
  out.featuredOrder = fo;

  return out;
}

function buildCard(item, onFeaturedToggle) {
  const card = document.createElement("div");
  card.className = "workCard";
  card.tabIndex = 0;
  card.draggable = true;
  card.dataset.id = item.id;

  const img = document.createElement("img");
  img.className = "workCard__thumb";
  img.src = item._resolvedSrc;
  img.alt = item.alt || item.id;
  img.loading = "eager";
  img.decoding = "async";
  img.draggable = false;
  img.addEventListener("error", () => {
    // leave broken image icon; also helps debug missing src
    img.title = `Nie mogę wczytać: ${item._resolvedSrc}`;
  });

  const body = document.createElement("div");
  body.className = "workCard__body";

  const title = document.createElement("div");
  title.className = "workCard__title";
  title.textContent = item.id;

  const alt = document.createElement("input");
  alt.className = "workCard__alt";
  alt.type = "text";
  alt.value = item.alt || "";
  alt.placeholder = "Opis (alt)";
  alt.addEventListener("input", () => (item.alt = alt.value));

  const row = document.createElement("div");
  row.className = "workCard__row";

  const label = document.createElement("label");
  label.className = "check";
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.checked = !!item.featured;
  chk.addEventListener("change", () => {
    item.featured = chk.checked;
    onFeaturedToggle?.(item, chk.checked);
  });
  label.append(chk, document.createTextNode(" str. główna"));

  row.append(label);

  body.append(title, alt, row);
  card.append(img, body);

  return card;
}

async function init() {
  const status = qs("#status");
  const btnDownload = qs("#btnDownload");
  const btnCopy = qs("#btnCopy");
  const btnAddGroup = qs("#btnAddGroup");

  const featuredCards = qs("#featuredCards");
  const groupsWrap = qs("#groupsWrap");

  if (!status || !featuredCards || !groupsWrap) return;

  status.textContent = "Wczytuję…";

  let data, url;
  let lastErr = null;
  let usedPath = null;
  for (const candidate of DATA_URL_CANDIDATES) {
    try {
      ({ data, url } = await fetchJSON(candidate));
      usedPath = candidate;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!data) {
    console.error(lastErr);
    status.textContent =
      "Nie udało się wczytać portfolio.json. Sprawdź, czy plik istnieje w /data/portfolio.json oraz czy ścieżka względem strony reorder jest poprawna.";
    return;
  }

  data = normalizeData(data);

  const items = (data.items || []).map((x) => ({
    ...x,
    _resolvedSrc: resolveUrl(x.src, url),
  }));
  const byId = new Map(items.map((x) => [x.id, x]));

  // ------------ DOM state ------------
  // groups: map groupId -> grid element
  const groupGridById = new Map();

  // dragging state
  let draggingEl = null;
  let draggingId = null;

  const attachDnDToContainer = (container) => {
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggingEl) return;
      container.classList.add("dropTarget");
      const before = getInsertBefore(container, e.clientX, e.clientY, draggingEl);
      if (before == null) container.append(draggingEl);
      else container.insertBefore(draggingEl, before);
    });

    container.addEventListener("dragleave", () => {
      container.classList.remove("dropTarget");
    });

    container.addEventListener("drop", (e) => {
      e.preventDefault();
      container.classList.remove("dropTarget");
      status.textContent = "Zmieniono układ (pamiętaj pobrać JSON).";
    });
  };

  const refreshEmptyHints = () => {
    // show/hide empty placeholders
    for (const [gid, grid] of groupGridById.entries()) {
      const wrap = grid.closest(".group");
      const empty = wrap?.querySelector("[data-empty]");
      if (!empty) continue;
      const hasAny = !!grid.querySelector(".workCard");
      empty.style.display = hasAny ? "none" : "block";
    }
    // featured placeholder
    const emptyF = qs("[data-featured-empty]");
    if (emptyF) emptyF.style.display = featuredCards.querySelector(".workCard") ? "none" : "block";
  };

  const removeFromAllGroups = (id) => {
    for (const grid of groupGridById.values()) {
      const el = grid.querySelector(`.workCard[data-id="${CSS.escape(id)}"]`);
      if (el) el.remove();
    }
  };

  const ensureInPinnedIfInNoGroup = (id) => {
    const inAny = Array.from(groupGridById.values()).some((grid) =>
      grid.querySelector(`.workCard[data-id="${CSS.escape(id)}"]`),
    );
    if (!inAny) {
      const pinnedGrid = groupGridById.get(PINNED_GROUP_ID);
      const item = byId.get(id);
      if (pinnedGrid && item) pinnedGrid.append(renderedCards.get(id));
    }
  };

  const syncFeaturedListFromFlags = () => {
    // keep only cards with featured=true in featuredCards, in DOM order; add missing at end
    const want = items.filter((x) => x.featured).map((x) => x.id);

    const existingIds = new Set(
      Array.from(featuredCards.querySelectorAll(".workCard")).map((c) => c.dataset.id),
    );

    // remove those that are no longer featured
    for (const c of Array.from(featuredCards.querySelectorAll(".workCard"))) {
      if (!byId.get(c.dataset.id)?.featured) c.remove();
    }

    // append missing featured
    for (const id of want) {
      if (!existingIds.has(id) && byId.get(id)?.featured) {
        featuredCards.append(renderedCards.get(id));
      }
    }
    refreshEmptyHints();
  };

  // Keep one DOM card per item; we physically move it between containers.
  const renderedCards = new Map();

  const onFeaturedToggle = (item, isFeatured) => {
    if (isFeatured) {
      // add to featured area (end)
      if (!featuredCards.querySelector(`.workCard[data-id="${CSS.escape(item.id)}"]`)) {
        featuredCards.append(renderedCards.get(item.id));
      }
    } else {
      // remove from featured area if exists
      featuredCards
        .querySelector(`.workCard[data-id="${CSS.escape(item.id)}"]`)
        ?.remove();
    }
    // Note: card might have been in featured; after removal, ensure it still exists in some group
    ensureInPinnedIfInNoGroup(item.id);
    refreshEmptyHints();
    status.textContent = "Zmieniono ustawienia (pamiętaj pobrać JSON).";
  };

  const bindCardDnD = (card) => {
    card.addEventListener("dragstart", (e) => {
      draggingEl = card;
      draggingId = card.dataset.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggingId);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggingEl = null;
      draggingId = null;
      refreshEmptyHints();
    });
  };

  // ------------ render featured ------------
  featuredCards.innerHTML = "";
  const featuredEmpty = document.createElement("div");
  featuredEmpty.className = "emptyZone";
  featuredEmpty.dataset.featuredEmpty = "1";
  featuredEmpty.textContent = "Brak prac w karuzeli — zaznacz „str. główna” przy wybranych kartach.";
  featuredCards.append(featuredEmpty);

  attachDnDToContainer(featuredCards);

  // ------------ render groups ------------
  const renderGroup = (group) => {
    const wrap = document.createElement("div");
    wrap.className = "group";
    wrap.dataset.groupId = group.id;
    if (group.id === PINNED_GROUP_ID) wrap.classList.add("isPinned");

    const head = document.createElement("div");
    head.className = "group__head";

    const nameInput = document.createElement("input");
    nameInput.className = "group__nameInput";
    nameInput.type = "text";
    nameInput.value = group.name || "";
    nameInput.placeholder = "Nazwa grupy";

    if (group.id === PINNED_GROUP_ID) {
      nameInput.value = PINNED_GROUP_NAME;
      nameInput.disabled = true;
    } else {
      nameInput.addEventListener("input", () => (group.name = nameInput.value));
    }

    const actions = document.createElement("div");
    actions.className = "group__actions";

    if (group.id !== PINNED_GROUP_ID) {
      const btnDel = document.createElement("button");
      btnDel.className = "btn";
      btnDel.type = "button";
      btnDel.textContent = "Usuń grupę";
      btnDel.addEventListener("click", () => {
        // move cards to pinned
        const pinned = groupGridById.get(PINNED_GROUP_ID);
        const grid = groupGridById.get(group.id);
        if (pinned && grid) {
          Array.from(grid.querySelectorAll(".workCard")).forEach((c) => pinned.append(c));
        }
        wrap.remove();
        groupGridById.delete(group.id);
        // also remove group from data.groups
        data.groups = data.groups.filter((g) => g.id !== group.id);
        refreshEmptyHints();
        status.textContent = "Usunięto grupę (pamiętaj pobrać JSON).";
      });
      actions.append(btnDel);
    }

    head.append(nameInput, actions);

    const body = document.createElement("div");
    body.className = "group__body";

    const grid = document.createElement("div");
    grid.className = "cards";
    grid.dataset.groupGrid = group.id;

    const empty = document.createElement("div");
    empty.className = "emptyZone";
    empty.dataset.empty = "1";
    empty.textContent = "Przeciągnij tu prace…";

    body.append(grid, empty);
    wrap.append(head, body);

    groupGridById.set(group.id, grid);
    attachDnDToContainer(grid);

    return wrap;
  };

  groupsWrap.innerHTML = "";
  // ensure pinned first
  ensurePinnedGroup(data.groups);

  for (const g of data.groups) {
    groupsWrap.append(renderGroup(g));
  }

  // ------------ render items/cards & place them into groups/featured ------------
  for (const item of items) {
    const card = buildCard(item, onFeaturedToggle);
    bindCardDnD(card);
    renderedCards.set(item.id, card);
  }

  // place into groups according to data.groups[].items
  for (const g of data.groups) {
    const grid = groupGridById.get(g.id);
    if (!grid) continue;
    for (const id of g.items || []) {
      const card = renderedCards.get(id);
      if (card) grid.append(card);
    }
  }

  // place into featured according to featuredOrder (only featured)
  for (const id of data.featuredOrder) {
    const item = byId.get(id);
    const card = renderedCards.get(id);
    if (item?.featured && card) featuredCards.append(card);
  }

  // If some featured items aren't present yet (e.g. newly checked), add at end
  for (const it of items) {
    if (it.featured && renderedCards.get(it.id) && !featuredCards.querySelector(`.workCard[data-id="${CSS.escape(it.id)}"]`)) {
      featuredCards.append(renderedCards.get(it.id));
    }
  }

  // Ensure every card is in some group (if moved to featured only, keep also in group by design: cards are single DOM nodes)
  // Since one DOM node can't be in both places, we treat featured as "separate order list" but card must still live in a group.
  // Therefore: featured uses clones? We avoid clones by creating a lightweight "featured-only" clone wrapper.
  // To keep UX consistent, we will duplicate cards for featured area as lightweight clones WITHOUT editable fields.
  // ---- Rebuild featured area as clones:
  featuredCards.innerHTML = "";
  featuredCards.append(featuredEmpty);

  const makeFeaturedClone = (id) => {
    const item = byId.get(id);
    if (!item || !item.featured) return null;

    const clone = document.createElement("div");
    clone.className = "workCard";
    clone.tabIndex = 0;
    clone.draggable = true;
    clone.dataset.id = id;
    clone.dataset.featuredClone = "1";

    const img = document.createElement("img");
    img.className = "workCard__thumb";
    img.src = item._resolvedSrc;
    img.alt = item.alt || item.id;
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;

    const body = document.createElement("div");
    body.className = "workCard__body";

    const title = document.createElement("div");
    title.className = "workCard__title";
    title.textContent = item.id;

    const row = document.createElement("div");
    row.className = "workCard__row";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Karuzela";

    row.append(badge);
    body.append(title, row);
    clone.append(img, body);

    // DnD
    clone.addEventListener("dragstart", (e) => {
      draggingEl = clone;
      draggingId = clone.dataset.id;
      clone.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggingId);
    });
    clone.addEventListener("dragend", () => {
      clone.classList.remove("dragging");
      draggingEl = null;
      draggingId = null;
      refreshEmptyHints();
    });

    return clone;
  };

  // Rebuild featured clones from data.featuredOrder
  for (const id of data.featuredOrder) {
    const fc = makeFeaturedClone(id);
    if (fc) featuredCards.append(fc);
  }
  // append missing featured
  for (const it of items) {
    if (!it.featured) continue;
    if (featuredCards.querySelector(`.workCard[data-id="${CSS.escape(it.id)}"]`)) continue;
    const fc = makeFeaturedClone(it.id);
    if (fc) featuredCards.append(fc);
  }

  // Drag&drop for featured uses same container logic but must move clones only within featured
  featuredCards.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!draggingEl) return;
    if (!draggingEl.dataset.featuredClone) return;
    featuredCards.classList.add("dropTarget");
    const before = getInsertBefore(featuredCards, e.clientX, e.clientY, draggingEl);
    if (before == null) featuredCards.append(draggingEl);
    else featuredCards.insertBefore(draggingEl, before);
  });
  featuredCards.addEventListener("drop", (e) => {
    e.preventDefault();
    featuredCards.classList.remove("dropTarget");
    status.textContent = "Zmieniono kolejność karuzeli (pamiętaj pobrać JSON).";
  });
  featuredCards.addEventListener("dragleave", () => featuredCards.classList.remove("dropTarget"));

  // When featured checkbox toggled, add/remove clone
  const addOrRemoveFeaturedClone = (id, isFeatured) => {
    const existing = featuredCards.querySelector(`.workCard[data-id="${CSS.escape(id)}"]`);
    if (isFeatured) {
      if (!existing) {
        const fc = makeFeaturedClone(id);
        if (fc) featuredCards.append(fc);
      }
    } else {
      existing?.remove();
    }
    refreshEmptyHints();
  };

  // Rebind featured toggle to use clones (overwrite earlier hook)
  for (const it of items) {
    // card already created in groups; update its checkbox handler:
    const card = renderedCards.get(it.id);
    const chk = card?.querySelector('input[type="checkbox"]');
    if (!chk) continue;
    chk.onchange = null;
    chk.addEventListener("change", () => {
      it.featured = chk.checked;
      addOrRemoveFeaturedClone(it.id, it.featured);
      status.textContent = "Zmieniono ustawienia (pamiętaj pobrać JSON).";
    });
  }

  // ------------ Add group ------------
  btnAddGroup?.addEventListener("click", () => {
    const name = window.prompt("Nazwa grupy:", "Nowa grupa");
    if (!name) return;

    const id = slugify(name) || uniqId("g");
    if (groupGridById.has(id) || data.groups.some((g) => g.id === id)) {
      status.textContent = "Istnieje już grupa o takiej nazwie/ID — zmień nazwę.";
      return;
    }

    const group = { id, name, items: [] };
    // insert after pinned group
    const pinnedIdx = data.groups.findIndex((g) => g.id === PINNED_GROUP_ID);
    data.groups.splice(pinnedIdx + 1, 0, group);

    // render and insert
    const groupEl = renderGroup(group);
    const pinnedEl = groupsWrap.querySelector(`.group[data-group-id="${PINNED_GROUP_ID}"]`);
    if (pinnedEl && pinnedEl.nextElementSibling) groupsWrap.insertBefore(groupEl, pinnedEl.nextElementSibling);
    else groupsWrap.append(groupEl);

    refreshEmptyHints();
    status.textContent = "Dodano grupę (pamiętaj pobrać JSON).";
  });

  // ------------ Output builder ------------
  const getFeaturedOrderFromDOM = () =>
    Array.from(featuredCards.querySelectorAll(".workCard[data-featured-clone]"))
      .map((c) => c.dataset.id)
      .filter(Boolean);

  const getGroupsFromDOM = () => {
    const groups = [];
    // DOM order matters: groupsWrap children order
    for (const gEl of Array.from(groupsWrap.querySelectorAll(".group"))) {
      const id = gEl.dataset.groupId;
      const grid = gEl.querySelector(".cards");
      const input = gEl.querySelector(".group__nameInput");
      const name = id === PINNED_GROUP_ID ? PINNED_GROUP_NAME : (input?.value || "");
      const items = Array.from(grid.querySelectorAll(".workCard")).map((c) => c.dataset.id).filter(Boolean);
      groups.push({ id, name, items });
    }
    ensurePinnedGroup(groups);
    // drop empties from JSON? keep them; portfolio page already hides empties, but tool can keep them.
    return groups;
  };

  const buildOutput = () => {
    const featuredOrder = getFeaturedOrderFromDOM();
    const groups = getGroupsFromDOM();

    return {
      version: 2,
      updated: nowISODate(),
      featuredOrder,
      groups,
      items: items.map(({ _resolvedSrc, ...rest }) => rest),
    };
  };

  btnDownload?.addEventListener("click", () => {
    const out = buildOutput();
    downloadText("portfolio.json", JSON.stringify(out, null, 2));
    status.textContent = "Pobrano portfolio.json — podmień plik w /data i zacommituj.";
  });

  btnCopy?.addEventListener("click", async () => {
    const out = buildOutput();
    const text = JSON.stringify(out, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Skopiowano JSON do schowka.";
    } catch (err) {
      console.error(err);
      status.textContent = "Nie udało się skopiować. Użyj pobierania pliku.";
    }
  });

  // ------------ Missing items hint ------------
  // If user expects folder scan: show gentle hint with count
  const n = items.length;
  const pathInfo = usedPath ? ` (źródło: ${usedPath})` : "";
  status.textContent = `Gotowe. Wczytano ${n} prac z portfolio.json${pathInfo}. Przeciągaj karty i zapisz JSON.`;
  refreshEmptyHints();
}

window.addEventListener("DOMContentLoaded", init);
