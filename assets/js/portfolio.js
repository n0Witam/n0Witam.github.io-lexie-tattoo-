import { fetchJSON, resolveUrl, qs } from "./util.js";

const DATA_URL = "../data/portfolio.json";

function setupLightbox(items){
  const lb = qs("#lightbox");
  const lbImg = qs("#lightboxImg");
  const lbCap = qs("#lightboxCaption");
  const btnClose = qs("#lightboxClose");
  const btnPrev = qs("#lightboxPrev");
  const btnNext = qs("#lightboxNext");

  if(!lb || !lbImg) return;

  let index = 0;

  const open = (i) => {
    index = i;
    const item = items[index];
    lbImg.src = item._resolvedSrc;
    lbImg.alt = item.alt || "Tatuaż – praca Lexie";
    if(lbCap) lbCap.textContent = item.alt || "";
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    lb.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    // Optional: clear src to release memory
    // lbImg.src = "";
  };

  const prev = () => open((index - 1 + items.length) % items.length);
  const next = () => open((index + 1) % items.length);

  btnClose?.addEventListener("click", close);
  btnPrev?.addEventListener("click", prev);
  btnNext?.addEventListener("click", next);

  lb.addEventListener("click", (e) => {
    if(e.target === lb) close();
  });

  window.addEventListener("keydown", (e) => {
    const isOpen = lb.getAttribute("aria-hidden") === "false";
    if(!isOpen) return;
    if(e.key === "Escape") close();
    if(e.key === "ArrowLeft") prev();
    if(e.key === "ArrowRight") next();
  });

  return {open, close};
}

async function renderPortfolio(){
  const grid = qs("#portfolioGrid");
  if(!grid) return;

  try{
    const {data, url} = await fetchJSON(DATA_URL);
    const items = (data.items || []).map(x => ({
      ...x,
      _resolvedSrc: resolveUrl(x.src, url)
    }));

    const updated = qs("[data-updated]");
    if(updated && data.updated) updated.textContent = data.updated;

    const lb = setupLightbox(items);

    for(let i=0; i<items.length; i++){
      const item = items[i];

      const img = document.createElement("img");
      img.src = item._resolvedSrc;
      img.alt = item.alt || "Tatuaż – praca Lexie";
      img.loading = "lazy";
      img.decoding = "async";

      const tile = document.createElement("div");
      tile.className = "tile";
      tile.tabIndex = 0;
      tile.append(img);

      tile.addEventListener("click", () => lb?.open(i));
      tile.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " ") lb?.open(i);
      });

      grid.append(tile);
    }
  }catch(err){
    console.error(err);
    grid.innerHTML = "";
    grid.append("Nie udało się wczytać portfolio (sprawdź JSON / ścieżki).");
  }
}

window.addEventListener("DOMContentLoaded", renderPortfolio);
