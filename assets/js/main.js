import { fetchJSON, resolveUrl, qs, qsa } from "./util.js";

const DATA_URL = "./data/portfolio.json";

/* ============================================================
   Carousel
   - loop clones
   - click slide (desktop) to center
   - prev/next hit-areas (desktop via CSS)
   - CTA "Chcę ten wzór!" arms after 1s when a FREE slide is centered
   ============================================================ */
function setupCarousel(root) {
  const track = qs("[data-track]", root);
  if (!track) return;

  if (track.dataset.carouselInit === "1") return;
  track.dataset.carouselInit = "1";

  // Anti-save (carousel only)
  track.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });
  track.addEventListener("dragstart", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });

  const slidesAll = () => Array.from(track.querySelectorAll(".slide"));

  const getStep = () => {
    const slides = slidesAll();
    if (slides.length >= 2) return slides[1].offsetLeft - slides[0].offsetLeft;
    const first = slides[0];
    return first ? first.getBoundingClientRect().width : 320;
  };

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // ========== Center-snap helpers ==========
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

  let programmaticUntil = 0;
  const markProgrammatic = (ms = 250) => {
    programmaticUntil = performance.now() + ms;
  };
  const isProgrammatic = () => performance.now() < programmaticUntil;

  const centerToIndex = (idx, behavior = "smooth") => {
    const slides = slidesAll();
    if (!slides.length) return;

    idx = Math.max(0, Math.min(slides.length - 1, idx));
    const el = slides[idx];

    const delta = getSlideCenterX(el) - getTrackCenterX();
    markProgrammatic(300);
    track.scrollBy({ left: delta, behavior });
  };

  const next = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() + 1, behavior);
  };

  const prev = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() - 1, behavior);
  };

  // Desktop: click slide to center
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

  // Desktop: invisible prev/next hit-areas (56px) – inserted once
  if (isDesktopPointer && !root.querySelector(".carousel__nav--prev")) {
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

  // ========== Loop clones ==========
  const initLoop = () => {
    if (track.dataset.loopInit === "1") return;

    const slides = slidesAll();
    if (slides.length < 2) return;

    const originalsCount = slides.length;
    const cloneCount = Math.min(3, originalsCount);

    const headClones = slides
      .slice(0, cloneCount)
      .map((el) => el.cloneNode(true));
    const tailClones = slides
      .slice(-cloneCount)
      .map((el) => el.cloneNode(true));

    headClones.forEach((c) => c.setAttribute("data-clone", "1"));
    tailClones.forEach((c) => c.setAttribute("data-clone", "1"));

    tailClones.reverse().forEach((c) => track.prepend(c));
    headClones.forEach((c) => track.append(c));

    track.dataset.loopInit = "1";

    requestAnimationFrame(() => {
      const step = getStep();
      track.scrollLeft = cloneCount * step;
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
  const autoplayMs = Number(root.getAttribute("data-autoplay") || "5000");
  const enabledAutoplay = Number.isFinite(autoplayMs) && autoplayMs > 0;

  let timer = null;
  let paused = false;

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

  // ========== CTA arming ==========
  let armT = null;
  let armDebounceT = null;

  const clearArmed = () => {
    slidesAll().forEach((el) => el.classList.remove("is-armed"));
  };

  const armCenteredCta = () => {
    window.clearTimeout(armT);
    clearArmed();

    const slides = slidesAll();
    if (!slides.length) return;

    const centered = slides[getCenteredIndex()];
    if (!centered || centered.dataset.freePattern !== "1") return;

    armT = window.setTimeout(() => {
      const nowSlides = slidesAll();
      const now = nowSlides[getCenteredIndex()];
      if (now === centered && centered.dataset.freePattern === "1") {
        centered.classList.add("is-armed");
      }
    }, 1000);
  };

  const scheduleArmCenteredCta = () => {
    window.clearTimeout(armDebounceT);
    window.clearTimeout(armT);
    clearArmed();
    armDebounceT = window.setTimeout(armCenteredCta, 160);
  };

  track.addEventListener("scroll", scheduleArmCenteredCta, { passive: true });

  initLoop();
  start();

  // initial arm after initial loop jump
  window.setTimeout(armCenteredCta, 900);
}

/* ============================================================
   Featured carousel render + "Wolny wzór!" badge + CTA button
   ============================================================ */
async function renderFeatured() {
  const carouselTrack = qs("#featuredTrack");
  if (!carouselTrack) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);

    const items = Array.isArray(data.items) ? data.items : [];
    const byId = new Map(items.map((x) => [x.id, x]));

    // IDs in "Wolne wzory" group
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

    // Order: featuredOrder + append missing featured
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
          openFreePatternModal(src, img.alt);
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

/* ============================================================
   Shared helpers for "hidden message" technique (URLs invisible)
   ============================================================ */
function setHiddenMessageField(form, msgEl, value) {
  if (!form || !msgEl) return null;

  const origName = msgEl.getAttribute("name") || "";
  if (!origName) return null;

  let hidden = form.querySelector('input[type="hidden"][data-hidden-msg="1"]');
  if (!hidden) {
    hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.dataset.hiddenMsg = "1";
    form.append(hidden);
  }

  hidden.name = origName;
  hidden.value = value || "";

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

/* ============================================================
   Uploadcare URL collection (no textarea mutation)
   Uses ctx-provider events like in your index.html script.
   ============================================================ */
function createUploadcareCollector(ctxEl) {
  const urlById = new Map();

  const toUrl = (detail) => {
    if (!detail) return "";
    return (
      detail.cdnUrl ||
      detail.cdnUrlModifiers ||
      detail.url ||
      detail.originalUrl ||
      detail.fileUrl ||
      ""
    );
  };

  const toId = (detail) => {
    if (!detail) return "";
    return (
      detail.internalId ||
      detail.uuid ||
      detail.fileId ||
      detail.file ||
      detail.id ||
      ""
    );
  };

  const snapshot = () => {
    const urls = Array.from(urlById.values()).filter(
      (u) => typeof u === "string" && u.length,
    );
    window.__lexieUploadUrls = urls;
    return urls;
  };

  if (!ctxEl) {
    window.__lexieUploadUrls = [];
    return { getUrls: () => [], snapshot };
  }

  const onSuccess = (e) => {
    const entry = e.detail || {};
    const id = toId(entry);
    const url = toUrl(entry);
    if (id && url) urlById.set(id, url);
    snapshot();
  };

  const onUrlChanged = (e) => {
    const entry = e.detail || {};
    const id = toId(entry);
    const url = toUrl(entry);
    if (id && url) urlById.set(id, url);
    snapshot();
  };

  const onRemoved = (e) => {
    const entry = e.detail || {};
    const id = toId(entry);
    if (id) urlById.delete(id);
    snapshot();
  };

  ctxEl.addEventListener("file-upload-success", onSuccess);
  ctxEl.addEventListener("file-url-changed", onUrlChanged);
  ctxEl.addEventListener("file-removed", onRemoved);

  // expose for debugging
  window.__lexieSyncUploadUrls = snapshot;

  return {
    getUrls: () => snapshot(),
  };
}

/* ============================================================
   Main contact form (homepage)
   - URLs invisible in textarea
   - submit via normal form->iframe (no fetch race)
   ============================================================ */
function setupContactForm() {
  const form = qs("#contactForm");
  if (!form) return;

  const status = qs(".form__status", form);
  const action = form.dataset.gformAction || "";

  const msgEl = form.querySelector('textarea[name="entry.839337160"]');
  if (!msgEl) return;

  const ctxEl = document.getElementById("lexieUploadCtx");
  const collector = createUploadcareCollector(ctxEl);

  const SENTINEL_START = "\n\n---\nZdjęcia:\n";

  const buildMessageForSubmit = () => {
    const base = (msgEl.value || "").trimEnd();
    const urls = collector.getUrls();
    return urls.length ? base + SENTINEL_START + urls.join("\n") : base;
  };

  // ====== iframe success handler (Google Forms) ======
  const iframe = document.getElementById("gformIframe");
  let submitArmed = false;
  let submitAt = 0;

  if (iframe) {
    iframe.addEventListener("load", () => {
      // pierwsze load iframe jest "puste" (inicjalne) — ignorujemy
      if (!submitArmed) return;

      // zabezpieczenie na bardzo szybkie load (cache/initial)
      if (Date.now() - submitAt < 300) return;

      submitArmed = false;

      status.textContent = "Dzięki! Wiadomość została wysłana.";
      form.reset();

      // wyczyść uploady z pamięci (opcjonalnie, ale pomaga UX)
      window.__lexieUploadUrls = [];

      // po chwili zgaś komunikat
      window.setTimeout(() => {
        if (status.textContent === "Dzięki! Wiadomość została wysłana.") {
          status.textContent = "";
        }
      }, 3500);
    });
  }

  if (!action || action.includes("FORM_ID")) {
    status.textContent =
      "Ustaw adres Google Forms w atrybucie data-gform-action (instrukcja w README).";
  }

  // IMPORTANT: let form submit normally (iframe target), just inject hidden msg
  form.addEventListener("submit", (e) => {
    if (!action || action.includes("FORM_ID")) {
      e.preventDefault();
      status.textContent =
        "Formularz nie jest jeszcze podłączony (brak data-gform-action).";
      return;
    }

    form.action = action;

    try {
      window.__lexieSyncUploadUrls?.();
    } catch (_) {}

    const hiddenMsg = buildMessageForSubmit();
    setHiddenMessageField(form, msgEl, hiddenMsg);

    status.textContent = "Wysyłanie…";

    // przywróć name textarea po rozpoczęciu submitu
    window.setTimeout(() => restoreVisibleMessageField(form, msgEl), 0);

    // ✅ niezależnie od iframe — zmień status po chwili na “wysłano”
    window.setTimeout(() => {
      // jeśli w międzyczasie status nie został zmieniony ręcznie
      if (status.textContent === "Wysyłanie…") {
        status.textContent = "Dzięki! Wiadomość została wysłana.";
        form.reset();
        window.__lexieUploadUrls = [];

        window.setTimeout(() => {
          if (status.textContent === "Dzięki! Wiadomość została wysłana.") {
            status.textContent = "";
          }
        }, 3500);
      }
    }, 900);
  });
}

/* ============================================================
   Free pattern modal
   - visible textarea does NOT show "Wybrany wzór"
   - submit injects URL invisibly (hidden message field)
   - validation like main form, but safe reportValidity()
   ============================================================ */
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
        <div class="modal__right">
          <div class="modal__imgWrap">
            <img id="fp_img" class="modal__img" alt="" />
          </div>
        </div>

        <div class="modal__left">
          <form id="freePatternForm" class="form" novalidate>
            <div class="field">
              <label for="fp_name">Imię i nazwisko</label>
              <input id="fp_name" name="entry.2005620554" autocomplete="name" required />
            </div>

            <div class="field">
              <label for="fp_mobile">Telefon</label>
              <input id="fp_mobile" name="entry.1166974658" type="tel" inputmode="tel" autocomplete="tel" required />
            </div>

            <div class="field">
              <label for="fp_msg">Wiadomość</label>
              <textarea id="fp_msg" name="entry.839337160" required></textarea>
            </div>

            <button class="btn btn--primary" type="submit">Wyślij</button>
            <p class="form__status" role="status" aria-live="polite"></p>
          </form>
        </div>
      </div>
    </div>
  `;

  document.body.append(modal);

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

  setupFreePatternForm(modal);
  return modal;
}

function buildFreePatternPrefillVisible() {
  return `✧ Miejsce na ciele: \n✧ Rozmiar (cm): `;
}

function buildFreePatternMessageForSubmit(visibleText, imgUrl) {
  const raw = (visibleText || "").trimEnd();
  const cleaned = raw
    .split(/\r?\n/)
    .filter((line) => !/^•\s*Wybrany\s+wzór\s*:/.test(line))
    .join("\n")
    .trimEnd();

  const header = imgUrl ? `• Wybrany wzór: ${imgUrl}\n` : "";
  return (header + cleaned).trimEnd() + "\n";
}

function isFocusable(el) {
  if (!el) return false;
  if (el.disabled) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (el.offsetParent === null && style.position !== "fixed") return false;
  return true;
}

function safeReportValidity(el) {
  try {
    if (isFocusable(el) && typeof el.reportValidity === "function")
      el.reportValidity();
  } catch (_) {}
}

function setupFreePatternForm(modal) {
  const form = modal.querySelector("#freePatternForm");
  if (!form) return;

  const status = form.querySelector(".form__status");
  const nameEl = form.querySelector("#fp_name");
  const mobileEl = form.querySelector("#fp_mobile");
  const msgEl = form.querySelector("#fp_msg");

  const setStatus = (msg) => {
    if (status) status.textContent = msg || "";
  };

  // patterns exactly as previously used
  const NAME_RE = new RegExp(
    "^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*(?:\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+(?:[-'’][A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ]+)*)*$",
  );
  const PHONE_RE = new RegExp(
    "^(?:(?:\\+48|0048)[ -]?)?(?:[5-7]\\d{2})[ -]?\\d{3}[ -]?\\d{3}$",
  );

  const normalizeSpaces = (s) => (s || "").replace(/\s+/g, " ").trim();

  const setFieldError = (el, message) => {
    if (!el) return;
    el.setCustomValidity(message || "");
    if (message) safeReportValidity(el);
  };

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

  const mainForm = document.getElementById("contactForm");
  const action = mainForm?.dataset?.gformAction || "";

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

    const imgUrl =
      modal.dataset.fpImgUrl || modal.querySelector("#fp_img")?.src || "";
    const visible = msgEl.value || "";
    const hiddenMsg = buildFreePatternMessageForSubmit(visible, imgUrl);

    setHiddenMessageField(form, msgEl, hiddenMsg);

    setStatus("Wysyłanie…");
    const fd = new FormData(form);

    try {
      await fetch(action, { method: "POST", body: fd, mode: "no-cors" });
      setStatus("Dzięki! Wiadomość została wysłana.");
      form.reset();
      closeFreePatternModal();
    } catch (err) {
      console.error(err);
      setStatus("Nie udało się wysłać. Najprościej: napisz DM na Instagramie.");
    } finally {
      restoreVisibleMessageField(form, msgEl);
    }
  });
}

function openFreePatternModal(imgUrl, altText) {
  const modal = ensureFreePatternModal();
  const img = modal.querySelector("#fp_img");
  const form = modal.querySelector("#freePatternForm");
  const msg = modal.querySelector("#fp_msg");
  const status = modal.querySelector(".form__status");

  if (img) {
    img.src = imgUrl;
    img.alt = altText || "Wolny wzór";
  }

  modal.dataset.fpImgUrl = imgUrl;

  if (status) status.textContent = "";
  if (form) form.reset();

  if (msg) msg.value = buildFreePatternPrefillVisible();

  // Trigger CSS transitions reliably (especially on first open)
  document.body.style.overflow = "hidden";
  const doOpen = () => modal.setAttribute("aria-hidden", "false");
  // Force reflow so the browser registers the hidden state before animating
  modal.getBoundingClientRect();
  requestAnimationFrame(doOpen);
}

function closeFreePatternModal() {
  const modal = document.getElementById("freePatternModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  // Wait for fade-out to finish before restoring scroll
  window.setTimeout(() => {
    const m = document.getElementById("freePatternModal");
    if (m && m.getAttribute("aria-hidden") === "true") {
      document.body.style.overflow = "";
    }
  }, 320);
}

/* ============================================================
   Misc
   ============================================================ */
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

async function bootstrap() {
  function waitImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = reject;
      img.src = url;
    });
  }

  await Promise.all([
    waitImage("./assets/img/lexie_fg.png"),
    waitImage("./assets/img/map.png"),
  ]);
  await document.fonts.ready;

  document.documentElement.classList.add("is-ready");
}

bootstrap();
