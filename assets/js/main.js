import { fetchJSON, resolveUrl, qs, qsa } from "./util.js";

const DATA_URL = "./data/portfolio.json";

function setupCarousel(root) {
  const track = qs("[data-track]", root);
  const prev = qs("[data-prev]", root);
  const next = qs("[data-next]", root);
  if (!track) return;

  const scrollBySlide = (dir) => {
    const first = track.querySelector(".slide");
    const slideW = first ? first.getBoundingClientRect().width : 320;
    const gap = 12;
    track.scrollBy({ left: dir * (slideW + gap), behavior: "smooth" });
  };

  prev?.addEventListener("click", () => scrollBySlide(-1));
  next?.addEventListener("click", () => scrollBySlide(1));
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
