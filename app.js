/* ============================================================
   SEOirée — logique applicative
   Aucune dépendance. Stockage : Firebase Realtime Database
   via son API REST, ou localStorage si aucune URL configurée.
   ============================================================ */

(function () {
  "use strict";

  var CFG = window.SEOIREE_CONFIG || {};
  var DB_URL = (CFG.dbUrl || "").replace(/\/+$/, "");
  var EDITION = CFG.edition || "default";
  var LOCAL_KEY = "seoiree:" + EDITION + ":data";
  var ME_KEY = "seoiree:me";
  var POLL_MS = 20000;

  var DOW = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
  var MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
                "août", "septembre", "octobre", "novembre", "décembre"];
  var MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.",
                      "août", "sept.", "oct.", "nov.", "déc."];

  /* ---------- référentiels des questions pratiques ---------- */

  var BUDGETS = [
    { v: "", l: "Je ne sais pas encore" },
    { v: "lt50", l: "Moins de 50 € par personne" },
    { v: "50-100", l: "50 à 100 € par personne" },
    { v: "100-150", l: "100 à 150 € par personne" },
    { v: "150-250", l: "150 à 250 € par personne" },
    { v: "gt250", l: "Plus de 250 € par personne" }
  ];

  var TRANSPORTS = [
    { v: "", l: "Peu importe, je m'adapte" },
    { v: "car-seats", l: "En voiture, je peux emmener du monde" },
    { v: "car-solo", l: "En voiture, sans place libre" },
    { v: "passenger", l: "Je cherche une place en voiture" },
    { v: "public", l: "Train ou transports en commun" }
  ];

  var DIETS = [
    { v: "vegetarien", l: "Végétarien" },
    { v: "vegan", l: "Végan" },
    { v: "sans-gluten", l: "Sans gluten" },
    { v: "sans-lactose", l: "Sans lactose" },
    { v: "sans-porc", l: "Sans porc" },
    { v: "sans-alcool", l: "Sans alcool" }
  ];

  var ACCESS = [
    { v: "", l: "Aucun besoin particulier" },
    { v: "pmr", l: "Accès PMR nécessaire" },
    { v: "short-trip", l: "Je préfère un trajet court" },
    { v: "other", l: "Autre contrainte (voir précisions)" }
  ];

  function labelOf(list, value) {
    for (var i = 0; i < list.length; i++) if (list[i].v === (value || "")) return list[i].l;
    return null;
  }

  /* ---------- utilitaires de dates (tout en UTC pour éviter les DST) ---------- */

  function parseISO(s) {
    var p = s.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function toISO(d) {
    return d.getUTCFullYear() + "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(d.getUTCDate()).padStart(2, "0");
  }
  function addDays(d, n) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
  }
  /* 0 = lundi ... 6 = dimanche */
  function dowMon(d) { return (d.getUTCDay() + 6) % 7; }
  function isWeekend(d) { return dowMon(d) >= 5; }
  function fmtShort(d) {
    return DOW[dowMon(d)] + " " + d.getUTCDate() + " " + MONTHS_SHORT[d.getUTCMonth()];
  }

  var START = parseISO(CFG.rangeStart || "2026-09-01");
  var END = parseISO(CFG.rangeEnd || "2026-10-31");

  /* ---------- modèle calendrier ---------- */

  var weekendDays = [];   // ISO des samedis/dimanches de la période
  var weekends = [];      // { id, days: [ISO], label }

  (function buildModel() {
    var d = START;
    while (d.getTime() <= END.getTime()) {
      if (isWeekend(d)) weekendDays.push(toISO(d));
      d = addDays(d, 1);
    }

    var byId = {};
    weekendDays.forEach(function (iso) {
      var day = parseISO(iso);
      var satIso = dowMon(day) === 6 ? toISO(addDays(day, -1)) : iso;
      // si le samedi est hors période, le dimanche fait week-end tout seul
      if (weekendDays.indexOf(satIso) === -1) satIso = iso;
      if (!byId[satIso]) {
        byId[satIso] = { id: satIso, days: [] };
        weekends.push(byId[satIso]);
      }
      byId[satIso].days.push(iso);
    });

    weekends.forEach(function (w) {
      w.days.sort();
      var first = parseISO(w.days[0]);
      var last = parseISO(w.days[w.days.length - 1]);
      if (w.days.length === 1) {
        w.label = fmtShort(first);
      } else if (first.getUTCMonth() === last.getUTCMonth()) {
        w.label = first.getUTCDate() + " & " + last.getUTCDate() + " " + MONTHS[first.getUTCMonth()];
      } else {
        w.label = first.getUTCDate() + " " + MONTHS_SHORT[first.getUTCMonth()] +
                  " & " + last.getUTCDate() + " " + MONTHS_SHORT[last.getUTCMonth()];
      }
    });
  })();

  /* ---------- état ---------- */

  var me = null;      // { key, firstName, lastName }
  var picked = {};    // { ISO: true } indispos de l'utilisateur courant
  var everyone = {};  // { key: record }

  /* ---------- DOM ---------- */

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    status: $("status"),
    joinBlock: $("joinBlock"),
    btnJoin: $("btnJoin"),
    btnBack: $("btnBack"),
    identityDone: $("identityDone"),
    identityName: $("identityName"),
    changeIdentity: $("changeIdentity"),
    editPrefs: $("editPrefs"),
    myPrefs: $("myPrefs"),
    modal: $("modal"),
    modalTitle: $("modalTitle"),
    modalIntro: $("modalIntro"),
    modalSubmit: $("modalSubmit"),
    modalCancel: $("modalCancel"),
    identityForm: $("identityForm"),
    nameFields: $("nameFields"),
    prefsFields: $("prefsFields"),
    firstName: $("firstName"),
    lastName: $("lastName"),
    budget: $("budget"),
    transport: $("transport"),
    dietChips: $("dietChips"),
    access: $("access"),
    notes: $("notes"),
    identityError: $("identityError"),
    cardCalendar: $("cardCalendar"),
    months: $("months"),
    saveBtn: $("saveBtn"),
    clearBtn: $("clearBtn"),
    savedMsg: $("savedMsg"),
    resultsIntro: $("resultsIntro"),
    ranking: $("ranking"),
    groupRecap: $("groupRecap"),
    recapList: $("recapList"),
    peopleBlock: $("peopleBlock"),
    peopleCount: $("peopleCount"),
    peopleList: $("peopleList")
  };

  function setStatus(msg, tone) {
    el.status.textContent = msg || "";
    if (tone) el.status.setAttribute("data-tone", tone);
    else el.status.removeAttribute("data-tone");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- couche stockage ---------- */

  function endpoint(path) {
    return DB_URL + "/editions/" + encodeURIComponent(EDITION) + path + ".json";
  }

  function loadAll() {
    if (!DB_URL) {
      try {
        return Promise.resolve(JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {});
      } catch (e) { return Promise.resolve({}); }
    }
    return fetch(endpoint("/participants"), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) { return data || {}; });
  }

  function putRecord(record) {
    if (!DB_URL) {
      var all = {};
      try { all = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {}; } catch (e) {}
      all[record.key] = record;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
      return Promise.resolve();
    }
    return fetch(endpoint("/participants/" + encodeURIComponent(record.key)), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
    });
  }

  /* record complet à partir de l'état courant, en préservant l'existant */
  function buildRecord(prefsOverride) {
    var old = everyone[me.key] || {};
    return {
      key: me.key,
      firstName: me.firstName,
      lastName: me.lastName,
      unavailable: Object.keys(picked).filter(function (iso) {
        return weekendDays.indexOf(iso) !== -1;
      }).sort(),
      prefs: prefsOverride || old.prefs || {},
      updatedAt: new Date().toISOString()
    };
  }

  function persist(record) {
    return putRecord(record).then(function () {
      everyone[record.key] = record;
      render();
      renderMyPrefs();
    });
  }

  /* ---------- identité ---------- */

  function slugify(s) {
    return s
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function titleCase(s) {
    return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/(^|[\s'’-])([a-zà-ÿ])/g, function (m, sep, c) {
      return sep + c.toUpperCase();
    });
  }

  function showIdentity() {
    el.joinBlock.hidden = true;
    el.identityDone.hidden = false;
    el.identityName.textContent = me.firstName + " " + me.lastName;
    el.cardCalendar.classList.remove("card--locked");
    el.cardCalendar.removeAttribute("aria-disabled");
    renderMyPrefs();
  }

  function hideIdentity() {
    me = null;
    picked = {};
    syncCalendarUI();
    localStorage.removeItem(ME_KEY);
    el.joinBlock.hidden = false;
    el.identityDone.hidden = true;
    el.cardCalendar.classList.add("card--locked");
    el.cardCalendar.setAttribute("aria-disabled", "true");
    el.savedMsg.hidden = true;
  }

  function renderMyPrefs() {
    if (!me) { el.myPrefs.innerHTML = ""; return; }
    var p = (everyone[me.key] && everyone[me.key].prefs) || {};
    var rows = [
      ["Budget", labelOf(BUDGETS, p.budget)],
      ["Trajet", labelOf(TRANSPORTS, p.transport)],
      ["Régime", (p.diets && p.diets.length)
        ? p.diets.map(function (d) { return labelOf(DIETS, d) || d; }).join(", ")
        : "Aucune restriction"],
      ["Accessibilité", labelOf(ACCESS, p.access)],
      ["Précisions", p.notes || "—"]
    ];
    el.myPrefs.innerHTML = rows.map(function (r) {
      return "<li><span>" + r[0] + "</span><b>" + escapeHtml(r[1] || "—") + "</b></li>";
    }).join("");
  }

  /* ---------- construction des champs de la modale ---------- */

  function fillSelect(node, list) {
    node.innerHTML = list.map(function (o) {
      return '<option value="' + o.v + '">' + escapeHtml(o.l) + "</option>";
    }).join("");
  }

  fillSelect(el.budget, BUDGETS);
  fillSelect(el.transport, TRANSPORTS);
  fillSelect(el.access, ACCESS);

  el.dietChips.innerHTML = DIETS.map(function (d) {
    return '<label class="chip"><input type="checkbox" name="diet" value="' + d.v + '"><span>' +
      escapeHtml(d.l) + "</span></label>";
  }).join("");

  function readPrefs() {
    var diets = Array.prototype.slice
      .call(el.dietChips.querySelectorAll('input[name="diet"]:checked'))
      .map(function (i) { return i.value; });
    return {
      budget: el.budget.value,
      transport: el.transport.value,
      diets: diets,
      access: el.access.value,
      notes: el.notes.value.trim()
    };
  }

  function writePrefs(p) {
    p = p || {};
    el.budget.value = p.budget || "";
    el.transport.value = p.transport || "";
    el.access.value = p.access || "";
    el.notes.value = p.notes || "";
    var set = {};
    (p.diets || []).forEach(function (d) { set[d] = true; });
    Array.prototype.forEach.call(el.dietChips.querySelectorAll('input[name="diet"]'), function (i) {
      i.checked = !!set[i.value];
    });
  }

  /* ---------- modale ---------- */

  var modalMode = "join"; // "join" | "edit" | "prefs"

  var MODAL_TEXT = {
    join: {
      title: "Je souhaite participer",
      intro: "Prénom et nom obligatoires, une seule inscription par personne. Le reste nous aide à organiser, réponds au mieux.",
      cta: "Je m'inscris"
    },
    edit: {
      title: "J'ai déjà répondu",
      intro: "Redonne le prénom et le nom utilisés à l'inscription, on recharge ta réponse.",
      cta: "Retrouver ma réponse"
    },
    prefs: {
      title: "Mes infos pratiques",
      intro: "Mets à jour ce qui a changé.",
      cta: "Enregistrer"
    }
  };

  function openModal(mode) {
    modalMode = mode;
    var t = MODAL_TEXT[mode];
    el.modalTitle.textContent = t.title;
    el.modalIntro.textContent = t.intro;
    el.modalSubmit.textContent = t.cta;
    el.identityError.hidden = true;

    el.nameFields.hidden = (mode === "prefs");
    el.prefsFields.hidden = (mode === "edit");

    if (mode === "prefs") {
      writePrefs((everyone[me.key] || {}).prefs);
    } else {
      el.firstName.value = "";
      el.lastName.value = "";
      if (mode === "join") writePrefs({});
    }

    if (typeof el.modal.showModal === "function") el.modal.showModal();
    else el.modal.setAttribute("open", "");
    setTimeout(function () {
      (mode === "prefs" ? el.budget : el.firstName).focus();
    }, 60);
  }

  function closeModal() {
    if (typeof el.modal.close === "function") el.modal.close();
    else el.modal.removeAttribute("open");
  }

  function fail(msg) {
    el.identityError.innerHTML = msg;
    el.identityError.hidden = false;
  }

  el.btnJoin.addEventListener("click", function () { openModal("join"); });
  el.btnBack.addEventListener("click", function () { openModal("edit"); });
  el.editPrefs.addEventListener("click", function () { if (me) openModal("prefs"); });
  el.modalCancel.addEventListener("click", closeModal);

  el.identityForm.addEventListener("submit", function (ev) {
    ev.preventDefault();

    /* cas simple : mise à jour des seules infos pratiques */
    if (modalMode === "prefs") {
      if (!me) { closeModal(); return; }
      var rec = buildRecord(readPrefs());
      el.modalSubmit.disabled = true;
      el.modalSubmit.textContent = "Enregistrement…";
      persist(rec)
        .then(function () { closeModal(); })
        .catch(function (err) { fail("Échec de l'enregistrement (" + escapeHtml(err.message) + ")."); })
        .then(function () {
          el.modalSubmit.disabled = false;
          el.modalSubmit.textContent = MODAL_TEXT.prefs.cta;
        });
      return;
    }

    var f = titleCase(el.firstName.value);
    var l = titleCase(el.lastName.value);
    if (!f || !l) {
      fail("Prénom et nom sont obligatoires, sinon on ne sait pas qui n'est pas dispo.");
      return;
    }
    var key = slugify(f + " " + l);
    if (!key) {
      fail("Ce prénom et ce nom ne sont pas exploitables, utilise des lettres.");
      return;
    }

    var cta = MODAL_TEXT[modalMode].cta;
    var prefs = modalMode === "join" ? readPrefs() : null;
    el.modalSubmit.disabled = true;
    el.modalSubmit.textContent = "Vérification…";
    el.identityError.hidden = true;

    // on relit la base avant de trancher, pour ne pas valider sur des données périmées
    loadAll()
      .then(function (data) { everyone = data || {}; render(); })
      .catch(function () { /* on tranche sur ce qu'on a déjà en mémoire */ })
      .then(function () {
        var exists = !!everyone[key];

        if (modalMode === "join" && exists) {
          el.modalSubmit.disabled = false;
          el.modalSubmit.textContent = cta;
          fail("<strong>" + escapeHtml(f + " " + l) + "</strong> a déjà participé. " +
               "Si c'est bien toi, ferme cette fenêtre et clique sur « J'ai déjà répondu » pour modifier ta réponse. " +
               "Sinon ajoute une initiale pour te distinguer.");
          return;
        }
        if (modalMode === "edit" && !exists) {
          el.modalSubmit.disabled = false;
          el.modalSubmit.textContent = cta;
          fail("Aucune réponse enregistrée pour <strong>" + escapeHtml(f + " " + l) + "</strong>. " +
               "Vérifie l'orthographe, ou passe par « Je souhaite participer ».");
          return;
        }

        me = { key: key, firstName: f, lastName: l };
        localStorage.setItem(ME_KEY, JSON.stringify(me));

        var done = Promise.resolve();
        if (modalMode === "join") {
          // l'inscription réserve tout de suite le nom, dispos vides pour l'instant
          picked = {};
          done = persist(buildRecord(prefs)).catch(function (err) {
            setStatus("Inscription non synchronisée (" + err.message + ").", "err");
          });
        }

        return done.then(function () {
          el.modalSubmit.disabled = false;
          el.modalSubmit.textContent = cta;
          closeModal();
          showIdentity();
          applyMyAnswer();
          el.cardCalendar.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
  });

  el.changeIdentity.addEventListener("click", function () {
    hideIdentity();
  });

  /* ---------- rendu du calendrier ---------- */

  function renderCalendar() {
    var html = "";
    var cursor = new Date(Date.UTC(START.getUTCFullYear(), START.getUTCMonth(), 1));
    var lastMonth = new Date(Date.UTC(END.getUTCFullYear(), END.getUTCMonth(), 1));

    while (cursor.getTime() <= lastMonth.getTime()) {
      var y = cursor.getUTCFullYear(), m = cursor.getUTCMonth();
      html += '<div class="month"><h3 class="month__name">' + MONTHS[m] + " " + y + "</h3>";
      html += '<div class="dow" aria-hidden="true">' +
        DOW.map(function (d) { return "<span>" + d.slice(0, 2) + "</span>"; }).join("") + "</div>";
      html += '<div class="grid">';

      var pad = dowMon(new Date(Date.UTC(y, m, 1)));
      for (var i = 0; i < pad; i++) html += '<div class="day day--pad"></div>';

      var nbDays = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (var day = 1; day <= nbDays; day++) {
        var d = new Date(Date.UTC(y, m, day));
        var iso = toISO(d);
        var inRange = d.getTime() >= START.getTime() && d.getTime() <= END.getTime();

        if (!inRange) {
          html += '<div class="day day--out" title="Hors période">' + day + "</div>";
        } else if (isWeekend(d)) {
          html += '<button type="button" class="day day--pick" data-iso="' + iso +
            '" aria-pressed="false" aria-label="' + fmtShort(d) + " " + y +
            ' — marquer comme indisponible">' + day + "</button>";
        } else {
          html += '<div class="day day--off" title="Jour de semaine">' + day + "</div>";
        }
      }

      html += "</div></div>";
      cursor = new Date(Date.UTC(y, m + 1, 1));
    }

    el.months.innerHTML = html;

    el.months.addEventListener("click", function (ev) {
      var btn = ev.target.closest && ev.target.closest(".day--pick");
      if (!btn) return;
      var iso = btn.getAttribute("data-iso");
      if (picked[iso]) delete picked[iso]; else picked[iso] = true;
      btn.setAttribute("aria-pressed", picked[iso] ? "true" : "false");
      el.savedMsg.hidden = true;
    });
  }

  function syncCalendarUI() {
    Array.prototype.forEach.call(el.months.querySelectorAll(".day--pick"), function (b) {
      b.setAttribute("aria-pressed", picked[b.getAttribute("data-iso")] ? "true" : "false");
    });
  }

  el.clearBtn.addEventListener("click", function () {
    picked = {};
    syncCalendarUI();
    el.savedMsg.hidden = true;
  });

  el.saveBtn.addEventListener("click", function () {
    if (!me) return;
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = "Enregistrement…";
    persist(buildRecord())
      .then(function () {
        el.savedMsg.hidden = false;
        setStatus(DB_URL ? "Réponses synchronisées." : "Mode local : réponses non partagées.",
                  DB_URL ? null : "warn");
        return refresh(true);
      })
      .catch(function (err) {
        setStatus("Échec de l'enregistrement (" + err.message + "). Vérifie ta connexion ou les règles Firebase.", "err");
      })
      .then(function () {
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = "Enregistrer mes dispos";
      });
  });

  /* ---------- pré-remplissage depuis la réponse existante ---------- */

  function applyMyAnswer() {
    if (!me) return;
    var rec = everyone[me.key];
    picked = {};
    if (rec && Array.isArray(rec.unavailable)) {
      rec.unavailable.forEach(function (iso) { picked[iso] = true; });
      if (rec.unavailable.length) el.savedMsg.hidden = false;
    }
    syncCalendarUI();
  }

  /* ---------- classement et récap ---------- */

  function render() {
    var people = Object.keys(everyone).map(function (k) { return everyone[k]; })
      .filter(function (p) { return p && p.firstName; });
    var total = people.length;

    if (!total) {
      el.resultsIntro.textContent = "Personne n'a encore répondu. Sois le premier.";
      el.ranking.innerHTML = "";
      el.peopleBlock.hidden = true;
      el.groupRecap.hidden = true;
      return;
    }

    var scored = weekends.map(function (w) {
      var busyNames = [];
      var perDay = {};
      w.days.forEach(function (iso) { perDay[iso] = 0; });

      people.forEach(function (p) {
        var un = Array.isArray(p.unavailable) ? p.unavailable : [];
        var blocked = false;
        w.days.forEach(function (iso) {
          if (un.indexOf(iso) === -1) perDay[iso]++;
          else blocked = true;
        });
        if (blocked) busyNames.push(p.firstName + " " + p.lastName.charAt(0) + ".");
      });

      return { w: w, free: total - busyNames.length, busyNames: busyNames, perDay: perDay };
    });

    scored.sort(function (a, b) {
      if (b.free !== a.free) return b.free - a.free;
      return a.w.id < b.w.id ? -1 : 1;
    });

    var best = scored[0].free;
    el.resultsIntro.innerHTML = best === 0
      ? "Aucun week-end ne fait l'unanimité pour l'instant, regarde le détail ci-dessous."
      : "Meilleur créneau actuel : <strong>" + scored[0].w.label + "</strong>, avec <strong>" +
        best + " personne" + (best > 1 ? "s" : "") + " sur " + total + "</strong> disponible" +
        (best > 1 ? "s" : "") + ".";

    el.ranking.innerHTML = scored.map(function (s, i) {
      var isTop = s.free === best && best > 0;
      var dayDetail = s.w.days.map(function (iso) {
        return fmtShort(parseISO(iso)) + " : " + s.perDay[iso];
      }).join(" · ");
      var busy = s.busyNames.length
        ? "Indispos : " + escapeHtml(s.busyNames.slice(0, 6).join(", ")) +
          (s.busyNames.length > 6 ? " +" + (s.busyNames.length - 6) : "")
        : "Tout le monde est là";

      return '<div class="rank' + (isTop ? " rank--top" : "") + '">' +
        '<div class="rank__pos">' + (i + 1) + "</div>" +
        '<div><p class="rank__date">' + s.w.label +
        (i === 0 && best > 0 ? '<span class="badge">Top</span>' : "") + "</p>" +
        '<p class="rank__meta">' + busy + "</p>" +
        '<p class="rank__meta">' + dayDetail + "</p></div>" +
        '<div class="rank__score">' + s.free + "<small>/ " + total + "</small></div>" +
        "</div>";
    }).join("");

    renderRecap(people);

    people.sort(function (a, b) {
      return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, "fr");
    });
    el.peopleCount.textContent = " (" + total + ")";
    el.peopleList.innerHTML = people.map(function (p) {
      var un = Array.isArray(p.unavailable) ? p.unavailable : [];
      var detail = un.length
        ? un.length + " jour" + (un.length > 1 ? "s" : "") + " bloqué" + (un.length > 1 ? "s" : "")
        : "dispo partout";
      return "<li><b>" + escapeHtml(p.firstName + " " + p.lastName) + "</b><em>" + detail + "</em></li>";
    }).join("");
    el.peopleBlock.hidden = false;
  }

  function renderRecap(people) {
    var rows = [];

    /* budget : on retient le plancher du groupe, c'est lui qui contraint */
    var order = BUDGETS.map(function (b) { return b.v; }).filter(Boolean);
    var lowest = null, unsetBudget = 0;
    people.forEach(function (p) {
      var v = (p.prefs || {}).budget;
      if (!v) { unsetBudget++; return; }
      var idx = order.indexOf(v);
      if (idx !== -1 && (lowest === null || idx < lowest)) lowest = idx;
    });
    if (lowest !== null) {
      rows.push(["Budget à ne pas dépasser", labelOf(BUDGETS, order[lowest]) +
        (unsetBudget ? " (" + unsetBudget + " sans réponse)" : "")]);
    }

    /* transport */
    var seats = 0, solo = 0, needSeat = 0, pub = 0;
    people.forEach(function (p) {
      switch ((p.prefs || {}).transport) {
        case "car-seats": seats++; break;
        case "car-solo": solo++; break;
        case "passenger": needSeat++; break;
        case "public": pub++; break;
      }
    });
    var tr = [];
    if (seats) tr.push(seats + " voiture" + (seats > 1 ? "s" : "") + " avec des places");
    if (solo) tr.push(solo + " voiture" + (solo > 1 ? "s" : "") + " complète" + (solo > 1 ? "s" : ""));
    if (needSeat) tr.push(needSeat + " cherche" + (needSeat > 1 ? "nt" : "") + " une place");
    if (pub) tr.push(pub + " en transports en commun");
    if (tr.length) rows.push(["Trajets", tr.join(", ")]);

    /* régimes */
    var counts = {};
    people.forEach(function (p) {
      ((p.prefs || {}).diets || []).forEach(function (d) { counts[d] = (counts[d] || 0) + 1; });
    });
    var diets = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (d) { return (labelOf(DIETS, d) || d) + " ×" + counts[d]; });
    rows.push(["Régimes à prévoir", diets.length ? diets.join(", ") : "aucune restriction déclarée"]);

    /* accessibilité et précisions */
    var acc = people.filter(function (p) { return (p.prefs || {}).access; })
      .map(function (p) {
        return p.firstName + " " + p.lastName.charAt(0) + "." + " : " + labelOf(ACCESS, p.prefs.access);
      });
    if (acc.length) rows.push(["Accessibilité", acc.join(" · ")]);

    var notes = people.filter(function (p) { return (p.prefs || {}).notes; })
      .map(function (p) { return p.firstName + " : " + p.prefs.notes; });
    if (notes.length) rows.push(["Précisions", notes.join(" · ")]);

    el.recapList.innerHTML = rows.map(function (r) {
      return "<li><span>" + escapeHtml(r[0]) + "</span><b>" + escapeHtml(r[1]) + "</b></li>";
    }).join("");
    el.groupRecap.hidden = rows.length === 0;
  }

  /* ---------- boucle de rafraîchissement ---------- */

  function refresh(keepPicks) {
    return loadAll()
      .then(function (data) {
        everyone = data || {};
        render();
        renderMyPrefs();
        if (me && !keepPicks) applyMyAnswer();
        if (!DB_URL) setStatus("Mode local : aucune base configurée, les réponses restent sur cet appareil.", "warn");
        else setStatus("");
      })
      .catch(function (err) {
        setStatus("Impossible de lire les réponses (" + err.message + ").", "err");
      });
  }

  /* ---------- démarrage ---------- */

  renderCalendar();

  try {
    var saved = JSON.parse(localStorage.getItem(ME_KEY) || "null");
    if (saved && saved.firstName && saved.lastName) {
      me = saved;
      showIdentity();
    }
  } catch (e) {}

  setStatus("Chargement des réponses…");
  refresh();
  setInterval(function () { refresh(true); }, POLL_MS);

})();
