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
    const slides = Array.from(track.querySelectorAll(".slide"));
    if (slides.length >= 2) {
      // realny krok (uwzględnia gap z CSS i responsywne szerokości)
      return slides[1].offsetLeft - slides[0].offsetLeft;
    }
    const first = slides[0];
    return first ? first.getBoundingClientRect().width : 320;
  };

  // ========== Kontrolki (Prev/Next) ==============
  const isDesktopPointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  if (isDesktopPointer) {
    track.addEventListener("click", (e) => {
      const slide = e.target.closest(".slide");
      if (!slide) return;

      const slides = slidesAll();
      const idx = slides.indexOf(slide);
      if (idx < 0) return;

      const behavior = prefersReduced ? "auto" : "smooth";
      centerToIndex(idx, behavior);
    });
  }

  if (isDesktopPointer) {
    // nie twórz ponownie
    if (!root.querySelector(".carousel__nav--prev")) {
      const btnPrev = document.createElement("button");
      btnPrev.type = "button";
      btnPrev.className = "carousel__nav carousel__nav--prev";
      btnPrev.setAttribute("aria-label", "Poprzednie zdjęcie");
      btnPrev.addEventListener("click", () => prev());

      const btnNext = document.createElement("button");
      btnNext.type = "button";
      btnNext.className = "carousel__nav carousel__nav--next";
      btnNext.setAttribute("aria-label", "Następne zdjęcie");
      btnNext.addEventListener("click", () => next());

      root.append(btnPrev, btnNext);
    }
  }

  // ========== Loop (klony na początku i końcu) ==========
  const initLoop = () => {
    if (track.dataset.loopInit === "1") return;

    const slides = Array.from(track.querySelectorAll(".slide"));
    if (slides.length < 2) return;

    const originalsCount = slides.length;
    const cloneCount = Math.min(3, originalsCount);

    // klony
    const headClones = slides
      .slice(0, cloneCount)
      .map((el) => el.cloneNode(true));

    const tailClones = slides
      .slice(-cloneCount)
      .map((el) => el.cloneNode(true));

    headClones.forEach((c) => c.setAttribute("data-clone", "1"));
    tailClones.forEach((c) => c.setAttribute("data-clone", "1"));

    // prepend tail clones
    tailClones.reverse().forEach((c) => track.prepend(c));
    // append head clones
    headClones.forEach((c) => track.append(c));

    track.dataset.loopInit = "1";

    const firstReal = cloneCount;
    const lastReal = cloneCount + originalsCount - 1;

    // przeskok na początek prawdziwych slajdów
    requestAnimationFrame(() => {
      const step = getStep();
      track.scrollLeft = cloneCount * step;

      // wycentruj bez animacji
      requestAnimationFrame(() => centerToIndex(getCenteredIndex(), "auto"));
    });

    let lock = false;
    let scrollEndT = null;

    const normalizeLoop = () => {
      if (lock) return;

      if (isProgrammatic()) {
        scrollEndT = setTimeout(normalizeLoop, 120);
        return;
      }

      const step = getStep();
      const start = cloneCount * step;
      const end = start + originalsCount * step;

      if (track.scrollLeft < start - step * 0.25) {
        lock = true;
        markProgrammatic(350);
        track.scrollLeft = track.scrollLeft + originalsCount * step;
        requestAnimationFrame(() => (lock = false));
      } else if (track.scrollLeft > end + step * 0.25) {
        lock = true;
        markProgrammatic(350);
        track.scrollLeft = track.scrollLeft - originalsCount * step;
        requestAnimationFrame(() => (lock = false));
      }
    };

    track.addEventListener(
      "scroll",
      () => {
        if (scrollEndT) clearTimeout(scrollEndT);
        scrollEndT = setTimeout(normalizeLoop, 140);
      },
      { passive: true },
    );
  };

  // ========== Autoplay ==========
  // Ustawiasz w HTML: <div class="carousel" data-carousel data-autoplay="5000">
  const autoplayMs = Number(root.getAttribute("data-autoplay") || "5000");
  const enabledAutoplay = Number.isFinite(autoplayMs) && autoplayMs > 0;

  let timer = null;
  let paused = false;
  let programmaticUntil = 0;
  const markProgrammatic = (ms = 250) => {
    programmaticUntil = performance.now() + ms;
  };
  const isProgrammatic = () => performance.now() < programmaticUntil;

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
    markProgrammatic(300);
    track.scrollBy({ left: delta, behavior });
  };

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const next = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() + 1, behavior);
  };

  const prev = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() - 1, behavior);
  };

  // ===== CTA "Chcę ten wzór!" pokazuje się po ~1s od wycentrowania slajdu (wszystkie urządzenia) =====
  let armT = null;
  let armDebounceT = null;

  const clearArmed = () => {
    slidesAll().forEach((el) => el.classList.remove("is-armed"));
  };

  const armCenteredCta = () => {
    clearTimeout(armT);
    clearArmed();

    const slides = slidesAll();
    if (!slides.length) return;

    const centered = slides[getCenteredIndex()];
    if (!centered || centered.dataset.freePattern !== "1") return;

    armT = window.setTimeout(() => {
      // upewnij się, że nadal to ten sam slajd po 1s
      const nowSlides = slidesAll();
      const now = nowSlides[getCenteredIndex()];
      if (now === centered && centered.dataset.freePattern === "1") {
        centered.classList.add("is-armed");
      }
    }, 1000);
  };

  const scheduleArmCenteredCta = () => {
    clearTimeout(armDebounceT);
    clearTimeout(armT);
    clearArmed();
    armDebounceT = window.setTimeout(armCenteredCta, 160);
  };

  track.addEventListener("scroll", scheduleArmCenteredCta, { passive: true });
  // po starcie / pierwszym wycentrowaniu (po initLoop scrollLeft jump)
  window.setTimeout(armCenteredCta, 900);

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
    userHold = window.setTimeout(() => (paused = false), 2000);
  };

  track.addEventListener("pointerdown", pauseOnUser, { passive: true });
  track.addEventListener("touchstart", pauseOnUser, { passive: true });
  track.addEventListener("wheel", pauseOnUser, { passive: true });

  initLoop();
  start();
}

async function renderFeatured() {
  const carouselTrack = qs("#featuredTrack");
  if (!carouselTrack) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);

    const items = Array.isArray(data.items) ? data.items : [];
    const byId = new Map(items.map((x) => [x.id, x]));

    // Zbiór ID należących do grupy „Wolne wzory”
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const freeGroup = groups.find(
      (g) =>
        String(g?.name || "")
          .trim()
          .toLowerCase() === "wolne wzory",
    );
    const freeIdsRaw = freeGroup && (freeGroup.items || freeGroup.ids);
    const freeIds = Array.isArray(freeIdsRaw) ? freeIdsRaw : [];
    const freeSet = new Set(freeIds);

    // Kolejność karuzeli: featuredOrder (jeśli jest) + dopięcie brakujących featured
    const seen = new Set();
    const featuredIds = [];

    const pushIfFeatured = (id) => {
      if (!id || seen.has(id)) return;
      const it = byId.get(id);
      if (!it || !it.featured) return;
      seen.add(id);
      featuredIds.push(id);
    };

    const order = Array.isArray(data.featuredOrder) ? data.featuredOrder : [];
    order.forEach(pushIfFeatured);
    items.forEach((it) => {
      if (it && it.featured) pushIfFeatured(it.id);
    });

    const featured = featuredIds
      .slice(0, 12)
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (featured.length === 0) {
      carouselTrack.innerHTML = "";
      carouselTrack.append(
        "Brak prac do wyświetlenia — dodaj je w data/portfolio.json.",
      );
      return;
    }

    carouselTrack.innerHTML = "";

    for (const item of featured) {
      const src = resolveUrl(item.src, url);

      const img = document.createElement("img");
      img.src = src;
      img.alt = item.alt || "Tatuaż – praca Lexie";
      img.loading = "eager";
      img.decoding = "async";
      img.draggable = false;

      const fig = document.createElement("figure");
      fig.className = "slide";

      // Plakietka + CTA tylko dla: featured + w grupie „Wolne wzory”
      if (freeSet.has(item.id)) {
        fig.dataset.freePattern = "1";

        const badge = document.createElement("div");
        badge.className = "slide__badge";
        badge.textContent = "Wolny wzór!";
        fig.append(badge);

        const ctaWrap = document.createElement("div");
        ctaWrap.className = "slide__ctaWrap";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slide__ctaBtn btn btn--primary";
        btn.textContent = "Chcę ten wzór!";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.__openFreePatternModal?.(src, img.alt);
        });

        ctaWrap.append(btn);
        fig.append(ctaWrap);
      }

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

function setHiddenMessageField(form, msgEl, value) {
  if (!form || !msgEl) return null;

  const origName = msgEl.getAttribute("name") || "";
  if (!origName) return null;

  // ukryte pole z prawdziwą treścią wiadomości (wysyłaną do Google Forms)
  let hidden = form.querySelector('input[type="hidden"][data-hidden-msg="1"]');
  if (!hidden) {
    hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.dataset.hiddenMsg = "1";
    form.append(hidden);
  }

  hidden.name = origName;
  hidden.value = value || "";

  // textarea ma być widoczna dla usera, ale NIE wysyłana (żeby nie wyświetlać URL-i)
  msgEl.dataset.origName = origName;
  msgEl.removeAttribute("name");

  return hidden;
}

function restoreVisibleMessageField(form, msgEl) {
  if (!form || !msgEl) return;

  const origName = msgEl.dataset.origName;
  if (origName) msgEl.setAttribute("name", origName);

  const hidden = form.querySelector(
    'input[type="hidden"][data-hidden-msg="1"]',
  );
  if (hidden) hidden.remove();
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

  const buildMessageForSubmit = () => {
    if (!msgEl) return "";
    const urls = getUploadcareUrls();
    const base = stripImagesBlock(msgEl.value);
    return urls.length ? base + SENTINEL_START + urls.join("\n") : base;
  };

  // Jeżeli na stronie jest dodatkowy skrypt uploadcare dopinający URL-e do textarea,
  // to go neutralizujemy — URL-e mają być niewidoczne.
  window.__lexieSyncUploadUrls = () => {};

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

    // ✅ Zdjęcia i URL-e dopinamy do UKRYTEGO pola tuż przed FormData
    const hiddenMsg = buildMessageForSubmit();
    setHiddenMessageField(form, msgEl, hiddenMsg);

    status.textContent = "Wysyłam…";

    // Nie dopinamy nic do widocznej textarea (URL-e mają być niewidoczne).

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
    } finally {
      restoreVisibleMessageField(form, msgEl);
    }
  });
}

// ================== Free pattern modal (CTA on "Wolny wzór!") ==================
function ensureFreePatternModal() {
  let modal = document.getElementById("freePatternModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "freePatternModal";
  modal.className = "modal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true" aria-label="Chcę ten wzór">
      <button class="modal__close btn" type="button" aria-label="Zamknij" data-close>✕</button>
      <div class="modal__grid">
        <div class="modal__left">
                    <form id="freePatternForm" class="form" novalidate>
            <div class="field">
              <label for="fp_name">Imię i nazwisko</label>
              <input id="fp_name" name="entry.2005620554" autocomplete="name" required pattern="^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*)*$" />
            </div>

            <div class="field">
              <label for="fp_mobile">Telefon</label>
              <input id="fp_mobile" name="entry.1166974658" type="tel" inputmode="tel" autocomplete="tel" required pattern="^(?:(?:\+48|0048)[ -]?)?(?:[5-7]\d{2})[ -]?\d{3}[ -]?\d{3}$" />
            </div>

            <div class="field">
              <label for="fp_msg">Wiadomość</label>
              <textarea id="fp_msg" name="entry.839337160" required></textarea>
            </div>

            <button class="btn btn--primary" type="submit">Wyślij</button>
            <p class="form__status" role="status" aria-live="polite"></p>
          </form>
        </div>

        <div class="modal__right">
          <div class="modal__imgWrap">
            <img id="fp_img" class="modal__img" alt="" />
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.append(modal);

  // Close handlers
  const close = () => closeFreePatternModal();
  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("[data-close]")) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const m = document.getElementById("freePatternModal");
      if (m && m.getAttribute("aria-hidden") === "false") close();
    }
  });

  // Wire submit (Google Forms) + Uploadcare URLs injection
  setupFreePatternForm(modal);

  return modal;
}

function buildFreePatternPrefillVisible() {
  return `• Wybrany wzór: \n\n• Miejsce na ciele: \n• Rozmiar (cm): \n`;
}

function buildFreePatternMessageForSubmit(visibleText, imgUrl) {
  const base = (visibleText || "").trimEnd();

  // Zastąp (lub dodaj) linię z wybranym wzorem URL-em.
  const lines = base.split(/\r?\n/);
  const out = [];
  let injected = false;

  for (const line of lines) {
    if (!injected && /^•\s*Wybrany\s+wzór\s*:/.test(line)) {
      out.push(`• Wybrany wzór: ${imgUrl}`);
      injected = true;
    } else {
      out.push(line);
    }
  }

  if (!injected) out.unshift(`• Wybrany wzór: ${imgUrl}`);

  return out.join("\n").trimEnd() + "\n";
}

function mountModalUploader(slotEl) {
  if (!slotEl) return null;

  // Reset slot (fresh uploader each open)
  slotEl.innerHTML = "";

  // Separate context so it doesn't interfere with main form
  const ctxName = "lexie-upload-modal";

  const cfg = document.createElement("uc-config");
  cfg.setAttribute("ctx-name", ctxName);
  cfg.setAttribute("pubkey", "976a65662ac407428aa5");
  cfg.setAttribute("multiple", "true");
  cfg.setAttribute("multiple-max", "7");
  cfg.setAttribute(
    "accept",
    "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif",
  );
  cfg.setAttribute("max-local-file-size-bytes", "2621440");
  cfg.setAttribute("source-list", "local");

  const ctx = document.createElement("uc-upload-ctx-provider");
  ctx.id = "fpUploadCtx";
  ctx.setAttribute("ctx-name", ctxName);

  const uploader = document.createElement("uc-file-uploader-minimal");
  uploader.id = "fpUploader";
  uploader.setAttribute("ctx-name", ctxName);

  slotEl.append(cfg, ctx, uploader);

  return ctx;
}

function setupFreePatternForm(modal) {
  const form = modal.querySelector("#freePatternForm");
  if (!form) return;

  const status = form.querySelector(".form__status");
  const nameEl = form.querySelector("#fp_name");
  const mobileEl = form.querySelector("#fp_mobile");
  const msgEl = form.querySelector("#fp_msg");

  // ===== Walidacja jak na stronie głównej =====
  const NAME_RE = new RegExp(
    "^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*(?:\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*)*$",
  );

  const PHONE_RE = new RegExp(
    "^(?:(?:\\+48|0048)[ -]?)?(?:[5-7]\\d{2})[ -]?\\d{3}[ -]?\\d{3}$",
  );

  const setStatus = (msg) => {
    if (status) status.textContent = msg || "";
  };

  const setFieldError = (el, message) => {
    if (!el) return;
    el.setCustomValidity(message || "");
    if (message) el.reportValidity();
  };

  const normalizeSpaces = (s) => (s || "").replace(/\s+/g, " ").trim();

  const validateName = () => {
    const v = normalizeSpaces(nameEl?.value);
    if (nameEl) nameEl.value = v;

    if (!v) return (setFieldError(nameEl, "Podaj imię i nazwisko."), false);
    if (!NAME_RE.test(v)) {
      return (
        setFieldError(
          nameEl,
          "Wpisz imię i nazwisko (min. 2 człony), każdy zaczynający się wielką literą.",
        ),
        false
      );
    }
    setFieldError(nameEl, "");
    return true;
  };

  const validatePhone = () => {
    const v = (mobileEl?.value || "").trim();
    if (mobileEl) mobileEl.value = v;

    if (!v) return (setFieldError(mobileEl, "Podaj numer telefonu."), false);
    if (!PHONE_RE.test(v)) {
      return (
        setFieldError(
          mobileEl,
          "Podaj poprawny numer (np. 512 345 678, +48 512 345 678, 0048 512 345 678).",
        ),
        false
      );
    }
    setFieldError(mobileEl, "");
    return true;
  };

  const validateMsg = () => {
    const v = (msgEl?.value || "").trim();
    if (!v) return (setFieldError(msgEl, "Wpisz wiadomość."), false);
    setFieldError(msgEl, "");
    return true;
  };

  nameEl?.addEventListener("blur", validateName);
  mobileEl?.addEventListener("blur", validatePhone);
  msgEl?.addEventListener("blur", validateMsg);

  nameEl?.addEventListener("input", () => nameEl.setCustomValidity(""));
  mobileEl?.addEventListener("input", () => mobileEl.setCustomValidity(""));
  msgEl?.addEventListener("input", () => msgEl.setCustomValidity(""));

  // google forms action: reuse from the main form on the page
  const mainForm = document.getElementById("contactForm");
  const action = mainForm?.dataset?.gformAction || "";

  const SENTINEL_START = "\n\n---\nZdjęcia:\n";
  const SENTINEL_RE = /\n\n---\nZdjęcia:\n[\s\S]*$/;
  const stripImagesBlock = (s) => (s || "").replace(SENTINEL_RE, "");

  // We'll (re)mount uploader on each open; keep current ctx ref here
  let ctxEl = null;

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

  const buildMessageForSubmit = (imgUrl) => {
    if (!msgEl) return "";
    const urls = getUploadcareUrls();
    const visible = stripImagesBlock(msgEl.value);
    const withPattern = buildFreePatternMessageForSubmit(visible, imgUrl);
    return urls.length
      ? withPattern + SENTINEL_START + urls.join("\n")
      : withPattern;
  };

  // Expose hooks for open()
  form.__fpSetCtx = (newCtx) => (ctxEl = newCtx);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");

    if (!action || action.includes("FORM_ID")) {
      setStatus(
        "Formularz nie jest jeszcze podłączony (brak data-gform-action).",
      );
      return;
    }

    const ok = [validateName(), validatePhone(), validateMsg()].every(Boolean);
    if (!ok) {
      setStatus("Popraw błędy w formularzu.");
      return;
    }

    // Dopnij niewidoczne URL-e (wybrany wzór + zdjęcia) do ukrytego pola przed FormData
    const imgUrl =
      modal.dataset.fpImgUrl || modal.querySelector("#fp_img")?.src || "";
    const hiddenMsg = buildMessageForSubmit(imgUrl);
    setHiddenMessageField(form, msgEl, hiddenMsg);

    status.textContent = "Wysyłanie…";
    const fd = new FormData(form);

    try {
      await fetch(action, { method: "POST", body: fd, mode: "no-cors" });
      status.textContent = "Dzięki! Wiadomość została wysłana.";
      form.reset();
      closeFreePatternModal();
    } catch (err) {
      console.error(err);
      status.textContent =
        "Nie udało się wysłać. Najprościej: napisz DM na Instagramie.";
    } finally {
      restoreVisibleMessageField(form, msgEl);
    }
  });
}

function openFreePatternModal(imgUrl, altText) {
  const modal = ensureFreePatternModal();
  const img = modal.querySelector("#fp_img");
  const msg = modal.querySelector("#fp_msg");
  const slot = modal.querySelector("#fp_uploader_slot");
  const form = modal.querySelector("#freePatternForm");
  const status = modal.querySelector(".form__status");

  if (img) {
    img.src = imgUrl;
    img.alt = altText || "Wolny wzór";
  }

  // Reset & prefill message
  if (status) status.textContent = "";
  if (form) {
    // don't wipe message prefill by reset-after-set, so do it in order:
    form.reset();
  }
  if (msg) {
    msg.value = buildFreePatternPrefillVisible();
    modal.dataset.fpImgUrl = imgUrl;
  }

  // (Re)mount uploader each time (fresh selection)
  const ctxEl = mountModalUploader(slot);
  if (form && typeof form.__fpSetCtx === "function") form.__fpSetCtx(ctxEl);

  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeFreePatternModal() {
  const modal = document.getElementById("freePatternModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

// Global hook used by carousel slides
window.__openFreePatternModal = openFreePatternModal;

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
