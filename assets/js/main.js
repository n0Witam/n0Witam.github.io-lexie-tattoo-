import { fetchJSON, resolveUrl, qs, qsa } from "./util.js";

const DATA_URL = "./data/portfolio.json";

function setupCarousel(root) {
  const track = qs("[data-track]", root);
  if (!track) return;

  // Zapobiegamy ponownej inicjalizacji (np. gdyby ktoś wywołał setup 2x)
  if (track.dataset.carouselInit === "1") return;
  track.dataset.carouselInit = "1";

  const gap = 12;

  // ========== Anti-save (tylko karuzela) ==========
  // (Nie da się zablokować „na 100%”, ale blokujemy: prawy klik, drag, long-press iOS)
  track.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });
  track.addEventListener("dragstart", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });

  // ========== Helpers ==========
  const getStep = () => {
    const first = track.querySelector(".slide");
    const slideW = first ? first.getBoundingClientRect().width : 320;
    return slideW + gap;
  };

  // ========== Loop (klony na początku i końcu) ==========
  const initLoop = () => {
    if (track.dataset.loopInit === "1") return;

    const slides = Array.from(track.querySelectorAll(".slide"));
    if (slides.length < 2) return;

    const cloneCount = Math.min(3, slides.length);

    const headClones = slides
      .slice(0, cloneCount)
      .map((el) => el.cloneNode(true));
    const tailClones = slides
      .slice(-cloneCount)
      .map((el) => el.cloneNode(true));

    headClones.forEach((c) => c.setAttribute("data-clone", "1"));
    tailClones.forEach((c) => c.setAttribute("data-clone", "1"));

    // prepend: ostatnie
    tailClones.reverse().forEach((c) => track.prepend(c));
    // append: pierwsze
    headClones.forEach((c) => track.append(c));

    track.dataset.loopInit = "1";

    // Przeskok na „prawdziwy” start po renderze/layout
    requestAnimationFrame(() => {
      const step = getStep();
      track.scrollLeft = cloneCount * step;
    });

    // Teleport na scroll (niewidoczny dla usera)
    let lock = false;
    track.addEventListener("scroll", () => {
      if (lock) return;

      requestAnimationFrame(() => {
        const step = getStep();
        track.scrollLeft = cloneCount * step;

        // 🔥 dopnij do idealnego środka po starcie (bez animacji)
        requestAnimationFrame(() => centerToIndex(getCenteredIndex(), "auto"));
      });

      // Uwaga: track zawiera teraz: [tailClones][originals][headClones]
      const min = cloneOffset - step * 0.6;
      const max = cloneOffset + originals * step + step * 0.6;

      if (track.scrollLeft < min) {
        lock = true;
        track.scrollLeft += originals * step;
        requestAnimationFrame(() => {
          lock = false;
          centerToIndex(getCenteredIndex(), "auto");
        });
      } else if (track.scrollLeft > max) {
        lock = true;
        track.scrollLeft -= originals * step;
        requestAnimationFrame(() => {
          lock = false;
          centerToIndex(getCenteredIndex(), "auto");
        });
      }
    });
  };

  initLoop();

  // ========== Autoplay ==========
  // Ustawiasz w HTML: <div class="carousel" data-carousel data-autoplay="5000">
  const autoplayMs = Number(root.getAttribute("data-autoplay") || "5000");
  const enabledAutoplay = Number.isFinite(autoplayMs) && autoplayMs > 0;

  let timer = null;
  let paused = false;

  // ====== Center-snap helpers (działa niezależnie od gap/padding/klonów) ======
  const slidesAll = () => Array.from(track.querySelectorAll(".slide"));

  const getTrackCenterX = () => {
    const rT = track.getBoundingClientRect();
    return rT.left + rT.width / 2;
  };

  const getSlideCenterX = (el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  const getCenteredIndex = () => {
    const slides = slidesAll();
    if (!slides.length) return 0;

    const cx = getTrackCenterX();
    let best = 0;
    let bestDist = Infinity;

    slides.forEach((el, i) => {
      const d = Math.abs(getSlideCenterX(el) - cx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });

    return best;
  };

  const centerToIndex = (idx, behavior = "smooth") => {
    const slides = slidesAll();
    if (!slides.length) return;

    idx = Math.max(0, Math.min(slides.length - 1, idx));
    const el = slides[idx];

    const delta = getSlideCenterX(el) - getTrackCenterX();
    track.scrollBy({ left: delta, behavior });
  };

  const next = () => centerToIndex(getCenteredIndex() + 1);

  const start = () => {
    if (!enabledAutoplay) return;
    stop();
    timer = window.setInterval(() => {
      if (!paused) next();
    }, autoplayMs);
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
  };

  // pause na hover/focus + gdy user dotknie/scrolluje
  root.addEventListener("mouseenter", () => (paused = true));
  root.addEventListener("mouseleave", () => (paused = false));
  root.addEventListener("focusin", () => (paused = true));
  root.addEventListener("focusout", () => (paused = false));

  let userHold = null;
  const pauseOnUser = () => {
    paused = true;
    if (userHold) window.clearTimeout(userHold);
    userHold = window.setTimeout(() => (paused = false), 1200);
  };

  track.addEventListener("pointerdown", pauseOnUser, { passive: true });
  track.addEventListener("touchstart", pauseOnUser, { passive: true });
  track.addEventListener("wheel", pauseOnUser, { passive: true });

  start();
}

async function renderFeatured() {
  const carouselTrack = qs("#featuredTrack");
  if (!carouselTrack) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);
    const featured = (data.items || []).filter((x) => x.featured).slice(0, 12);

    if (featured.length === 0) {
      carouselTrack.innerHTML = "";
      carouselTrack.append(
        "Brak prac do wyświetlenia — dodaj je w data/portfolio.json.",
      );
      return;
    }

    for (const item of featured) {
      const src = resolveUrl(item.src, url);
      const img = document.createElement("img");
      img.src = src;
      img.alt = item.alt || "Tatuaż – praca Lexie";
      img.loading = "lazy";
      img.decoding = "async";
      img.draggable = false;

      const fig = document.createElement("figure");
      fig.className = "slide";
      fig.append(img);
      carouselTrack.append(fig);
    }
  } catch (err) {
    console.error(err);
    carouselTrack.innerHTML = "";
    carouselTrack.append(
      "Nie udało się wczytać galerii (sprawdź ścieżki i JSON).",
    );
  }
}

function setupContactForm() {
  const form = qs("#contactForm");
  if (!form) return;

  const status = qs(".form__status", form);
  const action = form.dataset.gformAction || "";

  // Uploadcare elements
  const ctxEl = document.getElementById("lexieUploadCtx");
  const msgEl = form.querySelector('textarea[name="entry.839337160"]');

  const SENTINEL_START = "\n\n---\nZdjęcia:\n";
  const SENTINEL_RE = /\n\n---\nZdjęcia:\n[\s\S]*$/;

  const stripImagesBlock = (s) => (s || "").replace(SENTINEL_RE, "");

  const getUploadcareUrls = () => {
    try {
      if (!ctxEl || typeof ctxEl.getAPI !== "function") return [];
      const api = ctxEl.getAPI();
      const state = api.getOutputCollectionState();
      const files = state?.files || [];
      return files
        .map((f) => f?.cdnUrl)
        .filter((u) => typeof u === "string" && u.length);
    } catch (_) {
      return [];
    }
  };

  const injectUrlsIntoMessage = () => {
    if (!msgEl) return;

    const urls = getUploadcareUrls();
    const base = stripImagesBlock(msgEl.value);

    // zdjęcia opcjonalne:
    msgEl.value = urls.length ? base + SENTINEL_START + urls.join("\n") : base;
  };

  if (!action || action.includes("FORM_ID")) {
    status.textContent =
      "Ustaw adres Google Forms w atrybucie data-gform-action (instrukcja w README).";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!action || action.includes("FORM_ID")) {
      status.textContent =
        "Formularz nie jest jeszcze podłączony (brak data-gform-action).";
      return;
    }

    // ✅ Najważniejsze: dopnij linki TUŻ PRZED FormData
    injectUrlsIntoMessage();

    status.textContent = "Wysyłam…";

    // ✅ dopnij linki do textarea *przed* zrobieniem FormData
    window.__lexieSyncUploadUrls?.();

    // ✅ teraz dopiero bierz FormData
    const fd = new FormData(form);

    try {
      // no-cors: Google Forms nie zwraca CORS — traktujemy brak błędu sieci jako sukces.
      await fetch(action, { method: "POST", body: fd, mode: "no-cors" });
      status.textContent = "Dzięki! Wiadomość została wysłana.";
      form.reset();
    } catch (err) {
      console.error(err);
      status.textContent =
        "Nie udało się wysłać. Najprościej: napisz DM na Instagramie.";
    }
  });
}

function setYear() {
  const year = new Date().getFullYear();
  const el = qs("[data-year]");
  if (el) el.textContent = String(year);
}

window.addEventListener("DOMContentLoaded", async () => {
  await renderFeatured();
  qsa("[data-carousel]").forEach(setupCarousel);
  setupContactForm();
  setYear();
});
