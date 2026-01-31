import { fetchJSON, resolveUrl, qs } from "./util.js";

const DATA_URL = "../data/portfolio.json";

function downloadText(filename, text){
  const blob = new Blob([text], {type: "application/json;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function nowISODate(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function getOrderFromDOM(listEl){
  return Array.from(listEl.querySelectorAll("[data-id]")).map(el => el.dataset.id);
}

async function init(){
  const list = qs("#reorderList");
  const status = qs("#status");
  const btnDownload = qs("#btnDownload");
  const btnCopy = qs("#btnCopy");

  if(!list) return;

  status.textContent = "Wczytuję…";

  let data, url;
  try{
    ({data, url} = await fetchJSON(DATA_URL));
  }catch(err){
    console.error(err);
    status.textContent = "Nie udało się wczytać JSON (sprawdź ścieżkę ../data/portfolio.json).";
    return;
  }

  const items = (data.items || []).map(x => ({
    ...x,
    _resolvedSrc: resolveUrl(x.src, url)
  }));

  const renderItem = (item) => {
    const row = document.createElement("div");
    row.className = "row";
    row.draggable = true;
    row.dataset.id = item.id;

    const handle = document.createElement("div");
    handle.className = "handle";
    handle.textContent = "⋮⋮";

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.src = item._resolvedSrc;
    thumb.alt = item.alt || item.id;

    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.id;

    const alt = document.createElement("input");
    alt.className = "alt";
    alt.type = "text";
    alt.value = item.alt || "";
    alt.placeholder = "Opis (alt)";

    alt.addEventListener("input", () => {
      item.alt = alt.value;
    });

    meta.append(title, alt);

    const right = document.createElement("div");
    right.className = "right";

    const label = document.createElement("label");
    label.className = "check";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!item.featured;
    chk.addEventListener("change", () => item.featured = chk.checked);
    label.append(chk, document.createTextNode(" Featured"));

    right.append(label);

    row.append(handle, thumb, meta, right);

    // DnD
    row.addEventListener("dragstart", (e) => {
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
    });

    row.addEventListener("keydown", (e) => {
      // Quick move via keyboard: Alt+ArrowUp/Down
      if(!e.altKey) return;
      if(e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const rows = Array.from(list.querySelectorAll(".row"));
      const idx = rows.indexOf(row);
      const targetIdx = idx + dir;
      if(targetIdx < 0 || targetIdx >= rows.length) return;
      const target = rows[targetIdx];
      if(dir < 0) list.insertBefore(row, target);
      else list.insertBefore(target, row); // swap
      status.textContent = "Zmieniono kolejność (pamiętaj pobrać JSON).";
    });

    row.tabIndex = 0;
    return row;
  };

  list.innerHTML = "";
  for(const item of items) list.append(renderItem(item));

  const getDragAfterElement = (container, y) => {
    const rows = [...container.querySelectorAll(".row:not(.dragging)")];
    return rows.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if(offset < 0 && offset > closest.offset){
        return {offset, element: child};
      }
      return closest;
    }, {offset: Number.NEGATIVE_INFINITY, element: null}).element;
  };

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = list.querySelector(".dragging");
    if(!dragging) return;
    const afterEl = getDragAfterElement(list, e.clientY);
    if(afterEl == null) list.append(dragging);
    else list.insertBefore(dragging, afterEl);
  });

  const buildOutput = () => {
    const order = getOrderFromDOM(list);
    const byId = new Map(items.map(x => [x.id, x]));
    const ordered = order.map(id => byId.get(id)).filter(Boolean);

    return {
      version: data.version || 1,
      updated: nowISODate(),
      items: ordered.map(({_resolvedSrc, ...rest}) => rest)
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
    try{
      await navigator.clipboard.writeText(text);
      status.textContent = "Skopiowano JSON do schowka.";
    }catch(err){
      console.error(err);
      status.textContent = "Nie udało się skopiować. Użyj pobierania pliku.";
    }
  });

  status.textContent = "Gotowe. Przeciągaj elementy, zmieniaj opisy/Featured i zapisz JSON.";
}

window.addEventListener("DOMContentLoaded", init);
