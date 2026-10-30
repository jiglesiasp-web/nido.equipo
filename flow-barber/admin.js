/* FLOW BARBER — panel del dueño (classic script, IIFE). Talks to reservas/Code.gs. */
(function () {
  "use strict";

  var data = window.__BRAND__ || {};
  var API = data.bookingApi;
  var services = data.services || [];
  var barbers = data.barbers || [];
  var TOKEN_KEY = "fb_admin_token";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var main = $("[data-main]");
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ---------- dates (always Europe/Madrid) ---------- */
  function madridToday() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch (e) { var d = new Date(); return d.toISOString().slice(0, 10); }
  }
  function addDays(ds, n) {
    var p = ds.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  var WDL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MOL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function pretty(ds) {
    var p = ds.split("-"), wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    return WDL[wd] + " " + (+p[2]) + " de " + MOL[+p[1] - 1];
  }
  function relDay(ds) {
    var t = madridToday();
    if (ds === t) return "Hoy · " + pretty(ds);
    if (ds === addDays(t, 1)) return "Mañana · " + pretty(ds);
    if (ds === addDays(t, -1)) return "Ayer · " + pretty(ds);
    var t2 = pretty(ds);
    return t2.charAt(0).toUpperCase() + t2.slice(1);
  }

  /* ---------- state ---------- */
  var st = { tab: "agenda", date: madridToday(), barber: "all", cache: {} };
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch (e) { return st.memToken || null; }
  }
  function setToken(t, remember) {
    st.memToken = t;
    try {
      localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
      if (t) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    } catch (e) {}
  }

  /* ---------- API ---------- */
  function call(op, extra) {
    var body = { action: "admin", op: op, token: getToken() };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    // text/plain POST: no CORS preflight (Apps Script can't answer one)
    return fetch(API, { method: "POST", body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.ok && r.code === "auth" && op !== "login") { setToken(null); renderLogin("Tu sesión ha caducado. Vuelve a entrar."); throw new Error("auth"); }
        return r;
      });
  }
  function publicSlots(date, service, barber) {
    var url = API + "?action=slots&date=" + encodeURIComponent(date) + "&service=" + encodeURIComponent(service) + "&barber=" + encodeURIComponent(barber);
    return fetch(url).then(function (r) { return r.json(); });
  }

  /* ---------- toast & dialog ---------- */
  var toastTimer;
  function toast(msg, isErr) {
    var t = $("[data-toast]");
    t.textContent = msg; t.classList.toggle("is-err", !!isErr); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function confirmDialog(html, okLabel, okClass) {
    return new Promise(function (resolve) {
      var dlg = $("[data-dialog]"), form = $("[data-dialog-form]");
      form.innerHTML = html + '<div class="dlg-actions"><button class="btn" value="no">Volver</button><button class="btn ' + (okClass || "btn-gold") + '" value="yes">' + esc(okLabel) + "</button></div>";
      function done() {
        dlg.removeEventListener("close", done);
        var extras = {};
        $$("input[type=checkbox]", form).forEach(function (c) { extras[c.name] = c.checked; });
        resolve(dlg.returnValue === "yes" ? extras : null);
      }
      dlg.addEventListener("close", done);
      if (dlg.showModal) dlg.showModal(); else resolve(window.confirm(form.textContent) ? {} : null);
    });
  }

  /* ---------- shell ---------- */
  function showShell(on) {
    $("[data-tabs]").hidden = !on;
    $("[data-top-actions]").hidden = !on;
  }
  function setTab(tab) {
    st.tab = tab;
    $$("[data-tab]").forEach(function (b) { b.classList.toggle("is-on", b.dataset.tab === tab); });
    window.scrollTo(0, 0);
    if (tab === "agenda") return renderAgenda();
    if (tab === "proximas") return renderUpcoming();
    if (tab === "nueva") return renderNew();
    if (tab === "cierres") return renderBlocks();
  }
  function loading(msg) { main.innerHTML = '<p class="muted">' + esc(msg || "Cargando…") + "</p>"; }

  /* ---------- login ---------- */
  function renderLogin(err) {
    showShell(false);
    main.innerHTML = '<form class="login" data-login>' +
      "<h1>Panel del dueño</h1><p>Gestiona las reservas de la web.</p>" +
      (err ? '<p class="err" role="alert">' + esc(err) + "</p>" : "") +
      '<label class="field"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required></label>' +
      '<label class="check"><input type="checkbox" name="remember" checked> Recordar en este dispositivo (30 días)</label>' +
      '<button class="btn btn-gold btn-block" type="submit">Entrar</button></form>';
    var f = $("[data-login]");
    f.password.focus();
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = "Entrando…";
      call("login", { password: f.password.value, remember: f.remember.checked }).then(function (r) {
        if (!r.ok) return renderLogin(r.error || "No se ha podido entrar");
        setToken(r.token, f.remember.checked);
        showShell(true); setTab("agenda");
      }).catch(function () { renderLogin("Sin conexión con el sistema de reservas."); });
    });
  }

  /* ---------- helpers for cards ---------- */
  function stClass(s) { return "st-" + String(s).toLowerCase().replace(/\s+/g, ""); }
  function waLink(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (d.length === 9) d = "34" + d;
    return "https://wa.me/" + d;
  }
  function bookingCard(b) {
    var actions = "";
    if (b.status === "Confirmada") {
      actions = '<button class="btn btn-sm btn-ok" data-act="Completada" data-id="' + esc(b.id) + '">✓ Hecha</button>' +
                '<button class="btn btn-sm btn-warn" data-act="No vino" data-id="' + esc(b.id) + '">No vino</button>' +
                '<button class="btn btn-sm btn-ko" data-act="Cancelada" data-id="' + esc(b.id) + '">Cancelar</button>';
    } else if (b.status === "Completada" || b.status === "No vino") {
      actions = '<button class="btn btn-sm" data-act="Confirmada" data-id="' + esc(b.id) + '">Deshacer</button>';
    }
    var contact = "";
    if (b.phone) contact += '<a class="btn btn-sm" href="tel:' + esc(b.phone.replace(/\s/g, "")) + '">Llamar</a>' +
                            '<a class="btn btn-sm" href="' + waLink(b.phone) + '" target="_blank" rel="noopener">WhatsApp</a>';
    if (b.email) contact += '<a class="btn btn-sm" href="mailto:' + esc(b.email) + '">Email</a>';
    return '<article class="card ' + stClass(b.status) + '">' +
      '<div class="card-top"><span class="card-time">' + esc(b.time) + " <small>– " + esc(b.end) + "</small></span>" +
      '<span class="badge ' + stClass(b.status) + '">' + esc(b.status) + "</span></div>" +
      '<p class="card-name">' + esc(b.name) + "</p>" +
      '<p class="card-meta" style="margin:0">' + esc(b.service) + " · " + esc(b.barber) + " · " + esc(b.price) + " €" + (b.phone ? " · " + esc(b.phone) : "") + "</p>" +
      (b.notes ? '<p class="card-notes">' + esc(b.notes) + "</p>" : "") +
      (contact && b.status !== "Cancelada" ? '<div class="card-contact">' + contact + "</div>" : "") +
      (actions ? '<div class="card-actions">' + actions + "</div>" : "") +
      "</article>";
  }
  function blockCard(bl) {
    return '<article class="card is-block"><div class="card-top"><span class="card-time">' +
      (bl.from ? esc(bl.from) + " <small>– " + esc(bl.to || "cierre") + "</small>" : "Todo el día") +
      '</span><span class="badge">Cerrado</span></div><p class="card-meta" style="margin:6px 0 0">' +
      esc(bl.barber || "Todos") + (bl.reason ? " · " + esc(bl.reason) : "") + "</p></article>";
  }
  function bindActions(scope, after) {
    $$("[data-act]", scope).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.id, status = btn.dataset.act;
        var bk = (st.lastList || []).filter(function (x) { return x.id === id; })[0] || {};
        var ask = status === "Cancelada"
          ? confirmDialog("<h2>¿Cancelar la cita?</h2><p>" + esc(bk.name) + " · " + esc(bk.time) + " · " + esc(bk.service) + "</p>" +
              (bk.email ? '<label class="check"><input type="checkbox" name="notify" checked> Avisar al cliente por email</label>' : "<p>El cliente no dejó email: avísale tú por teléfono.</p>"),
              "Sí, cancelar", "btn-ko")
          : Promise.resolve({});
        ask.then(function (extra) {
          if (!extra) return;
          btn.disabled = true;
          call("status", { id: id, status: status, notify: !!extra.notify }).then(function (r) {
            if (!r.ok) { toast(r.error || "Error", true); btn.disabled = false; return; }
            toast(status === "Cancelada" ? "Cita cancelada" : status === "Confirmada" ? "Cita reactivada" : "Marcada como «" + status + "»");
            after();
          }).catch(function (e) { if (e.message !== "auth") { toast("Sin conexión", true); btn.disabled = false; } });
        });
      });
    });
  }

  /* ---------- Agenda (day view) ---------- */
  function renderAgenda(silent) {
    var date = st.date;
    if (!silent) loading("Cargando agenda…");
    return call("list", { from: date, to: date }).then(function (r) {
      if (!r.ok) { main.innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
      if (st.tab !== "agenda" || st.date !== date) return;
      st.lastList = r.bookings;
      var list = r.bookings.filter(function (b) { return st.barber === "all" || b.barber.toLowerCase() === st.barber; });
      var blocks = r.blocks.filter(function (b) { return st.barber === "all" || !b.barber || b.barber.toLowerCase() === st.barber; });
      var active = list.filter(function (b) { return b.status !== "Cancelada"; });
      var income = active.filter(function (b) { return b.status !== "No vino"; }).reduce(function (s, b) { return s + b.price; }, 0);
      var done = list.filter(function (b) { return b.status === "Completada"; }).length;
      var items = list.map(function (b) { return { k: b.time, html: bookingCard(b) }; })
        .concat(blocks.map(function (b) { return { k: b.from || "00:00", html: blockCard(b) }; }))
        .sort(function (a, b) { return a.k.localeCompare(b.k); });

      main.innerHTML =
        '<div class="daynav"><button class="icon-btn" data-day="-1" aria-label="Día anterior">‹</button>' +
        '<div class="daynav-title"><b>' + esc(relDay(date)) + '</b><input type="date" value="' + date + '" data-pick aria-label="Elegir fecha"></div>' +
        '<button class="icon-btn" data-day="1" aria-label="Día siguiente">›</button></div>' +
        (date !== madridToday() ? '<p style="text-align:center;margin:-6px 0 12px"><button class="btn btn-sm" data-today>Ir a hoy</button></p>' : "") +
        '<div class="chips">' + [{ id: "all", name: "Todos" }].concat(barbers).map(function (b) {
          return '<button class="chip' + (st.barber === b.id ? " is-on" : "") + '" data-barber="' + esc(b.id) + '">' + esc(b.name) + "</button>";
        }).join("") + "</div>" +
        '<div class="kpis"><div class="kpi"><span>Citas</span><b>' + active.length + '</b></div><div class="kpi"><span>Previsto</span><b>' + income + ' €</b></div><div class="kpi"><span>Hechas</span><b>' + done + "</b></div></div>" +
        (items.length ? '<div class="list">' + items.map(function (i) { return i.html; }).join("") + "</div>"
                      : '<div class="empty">No hay citas este día.<br><br><button class="btn btn-sm" data-goto-new>＋ Apuntar una cita</button></div>');

      $$("[data-day]", main).forEach(function (b) { b.addEventListener("click", function () { st.date = addDays(st.date, +b.dataset.day); renderAgenda(); }); });
      var pick = $("[data-pick]", main); pick.addEventListener("change", function () { if (pick.value) { st.date = pick.value; renderAgenda(); } });
      var today = $("[data-today]", main); if (today) today.addEventListener("click", function () { st.date = madridToday(); renderAgenda(); });
      $$("[data-barber]", main).forEach(function (b) { b.addEventListener("click", function () { st.barber = b.dataset.barber; renderAgenda(true); }); });
      var gn = $("[data-goto-new]", main); if (gn) gn.addEventListener("click", function () { st.newDate = st.date; setTab("nueva"); });
      bindActions(main, function () { renderAgenda(true); });
    }).catch(function (e) { if (e.message !== "auth") main.innerHTML = '<p class="err">Sin conexión con el sistema de reservas.</p><button class="btn" data-retry>Reintentar</button>'; var rb = $("[data-retry]", main); if (rb) rb.addEventListener("click", function () { renderAgenda(); }); });
  }

  /* ---------- Próximas (next 30 days) ---------- */
  function renderUpcoming() {
    loading("Cargando próximas citas…");
    var from = madridToday(), to = addDays(from, 30);
    call("list", { from: from, to: to }).then(function (r) {
      if (!r.ok) { main.innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
      if (st.tab !== "proximas") return;
      var list = r.bookings.filter(function (b) { return b.status === "Confirmada"; });
      st.lastList = list;
      if (!list.length) { main.innerHTML = "<h1>Próximas citas</h1><div class=\"empty\">No hay citas confirmadas en los próximos 30 días.</div>"; return; }
      var html = "<h1>Próximas citas</h1><p class=\"muted\" style=\"margin-top:-8px\">" + list.length + " confirmadas en 30 días</p>", last = "";
      list.forEach(function (b) {
        if (b.date !== last) {
          last = b.date;
          var n = list.filter(function (x) { return x.date === b.date; }).length;
          html += '<div class="day-group"><b>' + esc(relDay(b.date)) + '</b><button class="mono" data-open-day="' + b.date + '">' + n + " cita" + (n > 1 ? "s" : "") + " ›</button></div>";
        }
        html += '<div class="list" style="margin-bottom:8px">' + bookingCard(b) + "</div>";
      });
      main.innerHTML = html;
      $$("[data-open-day]", main).forEach(function (b) { b.addEventListener("click", function () { st.date = b.dataset.openDay; setTab("agenda"); }); });
      bindActions(main, renderUpcoming);
    }).catch(function (e) { if (e.message !== "auth") main.innerHTML = '<p class="err">Sin conexión con el sistema de reservas.</p>'; });
  }

  /* ---------- Nueva cita (phone / walk-in) ---------- */
  function renderNew(err) {
    var v = st.newForm || { service: services[0] && services[0].id, barber: barbers[0] && barbers[0].id, date: st.newDate || madridToday() };
    st.newForm = v;
    main.innerHTML = "<h1>Nueva cita</h1><p class=\"muted\" style=\"margin-top:-8px\">Para clientes que llaman o pasan por la barbería.</p>" +
      (err ? '<p class="err" role="alert">' + esc(err) + "</p>" : "") +
      '<form data-new novalidate>' +
      '<label class="field"><span>Servicio</span><select name="service">' + services.map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (v.service === s.id ? " selected" : "") + ">" + esc(s.name) + " · " + s.min + " min · " + s.price + " €</option>";
      }).join("") + "</select></label>" +
      '<div class="row2"><label class="field"><span>Barbero</span><select name="barber">' + barbers.map(function (b) {
        return '<option value="' + esc(b.id) + '"' + (v.barber === b.id ? " selected" : "") + ">" + esc(b.name) + "</option>";
      }).join("") + "</select></label>" +
      '<label class="field"><span>Día</span><input type="date" name="date" value="' + esc(v.date) + '" min="' + madridToday() + '"></label></div>' +
      '<div class="field"><span>Hora libre</span><div class="slots" data-slots><p class="muted">Cargando…</p></div></div>' +
      '<label class="check"><input type="checkbox" name="force"' + (v.force ? " checked" : "") + "> Otra hora (aunque no salga libre)</label>" +
      '<label class="field" data-force-time' + (v.force ? "" : " hidden") + '><span>Hora</span><input type="time" name="time" step="300" value="' + esc(v.force ? v.time || "" : "") + '"></label>' +
      '<label class="field"><span>Nombre del cliente *</span><input name="name" value="' + esc(v.name || "") + '" maxlength="60" autocomplete="off"></label>' +
      '<div class="row2"><label class="field"><span>Teléfono</span><input name="phone" type="tel" inputmode="tel" value="' + esc(v.phone || "") + '" maxlength="20" autocomplete="off"></label>' +
      '<label class="field"><span>Email (opcional)</span><input name="email" type="email" value="' + esc(v.email || "") + '" maxlength="80" autocomplete="off"></label></div>' +
      '<label class="field"><span>Notas</span><input name="notes" value="' + esc(v.notes || "") + '" maxlength="200"></label>' +
      '<button class="btn btn-gold btn-block" type="submit">Guardar cita</button></form>';

    var f = $("[data-new]", main);
    function sync() {
      v.service = f.service.value; v.barber = f.barber.value; v.date = f.date.value; v.force = f.force.checked;
      v.name = f.name.value; v.phone = f.phone.value; v.email = f.email.value; v.notes = f.notes.value;
      if (v.force) v.time = f.time.value;
    }
    function loadSlots() {
      sync();
      var box = $("[data-slots]", main);
      if (!v.date) { box.innerHTML = '<p class="muted">Elige un día.</p>'; return; }
      box.innerHTML = '<p class="muted">Cargando…</p>';
      var want = v.service + v.barber + v.date;
      publicSlots(v.date, v.service, v.barber).then(function (r) {
        if (want !== v.service + v.barber + v.date) return;
        if (!r.ok) { box.innerHTML = '<p class="muted">' + esc(r.error) + "</p>"; return; }
        if (!r.slots.length) { box.innerHTML = '<p class="muted">Sin huecos libres este día. Marca «Otra hora» si quieres apuntarla igual.</p>'; return; }
        box.innerHTML = r.slots.map(function (t) { return '<button type="button" class="slot' + (!v.force && v.time === t ? " is-on" : "") + '" data-t="' + t + '">' + t + "</button>"; }).join("");
        $$("[data-t]", box).forEach(function (b) {
          b.addEventListener("click", function () {
            v.time = b.dataset.t; v.force = false; f.force.checked = false; $("[data-force-time]", main).hidden = true;
            $$("[data-t]", box).forEach(function (x) { x.classList.toggle("is-on", x === b); });
          });
        });
      }).catch(function () { box.innerHTML = '<p class="muted">Sin conexión.</p>'; });
    }
    ["service", "barber", "date"].forEach(function (k) { f[k].addEventListener("change", function () { v.time = null; loadSlots(); }); });
    f.force.addEventListener("change", function () {
      $("[data-force-time]", main).hidden = !f.force.checked;
      if (f.force.checked) { $$(".slot", main).forEach(function (x) { x.classList.remove("is-on"); }); f.time.focus(); }
    });
    f.addEventListener("input", sync);
    loadSlots();
    f.addEventListener("submit", function (e) {
      e.preventDefault(); sync();
      var time = v.force ? f.time.value : v.time;
      if (!v.name || v.name.trim().length < 2) return renderNew("Escribe el nombre del cliente.");
      if (!time) return renderNew("Elige una hora.");
      var btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = "Guardando…";
      call("create", { service: v.service, barber: v.barber, date: v.date, time: time, name: v.name, phone: v.phone, email: v.email, notes: v.notes, force: v.force })
        .then(function (r) {
          if (!r.ok) return renderNew(r.error || "No se ha podido guardar");
          toast("Cita guardada: " + r.booking.time + " con " + r.booking.barber);
          st.newForm = null; st.newDate = null; st.date = v.date; setTab("agenda");
        }).catch(function (e) { if (e.message !== "auth") renderNew("Sin conexión con el sistema de reservas."); });
    });
  }

  /* ---------- Cierres (blocked days / hours) ---------- */
  function renderBlocks(err) {
    loading("Cargando cierres…");
    var from = madridToday(), to = addDays(from, 120);
    call("list", { from: from, to: to }).then(function (r) {
      if (!r.ok) { main.innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
      if (st.tab !== "cierres") return;
      var blocks = r.blocks.sort(function (a, b) { return (a.date + a.from).localeCompare(b.date + b.from); });
      main.innerHTML = "<h1>Cierres</h1><p class=\"muted\" style=\"margin-top:-8px\">Días u horas en que la web no ofrecerá citas.</p>" +
        (err ? '<p class="err" role="alert">' + esc(err) + "</p>" : "") +
        '<form data-block novalidate class="card" style="border-left-color:var(--gold);margin-bottom:18px">' +
        '<div class="row2"><label class="field"><span>Día</span><input type="date" name="date" min="' + from + '" value="' + from + '"></label>' +
        '<label class="field"><span>Quién</span><select name="barber"><option value="">Toda la barbería</option>' + barbers.map(function (b) {
          return '<option value="' + esc(b.id) + '">' + esc(b.name) + "</option>";
        }).join("") + "</select></label></div>" +
        '<label class="check"><input type="checkbox" name="allday" checked> Todo el día</label>' +
        '<div class="row2" data-hours hidden><label class="field"><span>Desde</span><input type="time" name="from" step="300" value="16:00"></label>' +
        '<label class="field"><span>Hasta</span><input type="time" name="to" step="300" value="20:00"></label></div>' +
        '<label class="field"><span>Motivo (opcional)</span><input name="reason" maxlength="80" placeholder="Vacaciones, médico, festivo…"></label>' +
        '<button class="btn btn-gold btn-block" type="submit">Añadir cierre</button></form>' +
        "<h2>Próximos cierres</h2>" +
        (blocks.length ? '<div class="list">' + blocks.map(function (b) {
          return '<article class="card is-block"><div class="card-top"><span class="card-time" style="font-size:.95rem">' + esc(relDay(b.date)) + "</span>" +
            '<button class="btn btn-sm btn-ko" data-unblock="' + b.row + '" data-date="' + b.date + '">Quitar</button></div>' +
            '<p class="card-meta" style="margin:6px 0 0">' + (b.from ? esc(b.from) + "–" + esc(b.to || "cierre") : "Todo el día") + " · " + esc(b.barber || "Toda la barbería") + (b.reason ? " · " + esc(b.reason) : "") + "</p></article>";
        }).join("") + "</div>" : '<div class="empty">No hay cierres programados.</div>');

      var f = $("[data-block]", main);
      f.allday.addEventListener("change", function () { $("[data-hours]", main).hidden = f.allday.checked; });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var btn = $("button[type=submit]", f); btn.disabled = true;
        call("block", { date: f.date.value, barber: f.barber.value, from: f.allday.checked ? "" : f.from.value, to: f.allday.checked ? "" : f.to.value, reason: f.reason.value })
          .then(function (r) { if (!r.ok) return renderBlocks(r.error); toast("Cierre añadido"); renderBlocks(); })
          .catch(function (e) { if (e.message !== "auth") { toast("Sin conexión", true); btn.disabled = false; } });
      });
      $$("[data-unblock]", main).forEach(function (b) {
        b.addEventListener("click", function () {
          b.disabled = true;
          call("unblock", { row: +b.dataset.unblock, date: b.dataset.date })
            .then(function (r) { if (!r.ok) { toast(r.error, true); return renderBlocks(); } toast("Cierre quitado"); renderBlocks(); })
            .catch(function (e) { if (e.message !== "auth") { toast("Sin conexión", true); b.disabled = false; } });
        });
      });
    }).catch(function (e) { if (e.message !== "auth") main.innerHTML = '<p class="err">Sin conexión con el sistema de reservas.</p>'; });
  }

  /* ---------- boot ---------- */
  function boot() {
    if (!API) {
      main.innerHTML = '<div class="notice"><h1>Panel del dueño</h1><p>El sistema de reservas todavía no está conectado.</p>' +
        '<p>Sigue la guía <a href="https://github.com/jiglesiasp-web/flow-barber/blob/main/reservas/INSTALAR.md" target="_blank" rel="noopener">reservas/INSTALAR.md</a> y pega la URL en <code>bookingApi</code> de <code>lib/manifest.js</code>.</p>' +
        '<p><a href="guia.html">Ver cómo queda el panel y la guía paso a paso →</a></p></div>';
      return;
    }
    $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { setTab(b.dataset.tab); }); });
    $("[data-logout]").addEventListener("click", function () {
      call("logout").catch(function () {}).then(function () { setToken(null); renderLogin(); });
    });
    var rf = $("[data-refresh]");
    rf.addEventListener("click", function () { rf.classList.add("is-spin"); setTimeout(function () { rf.classList.remove("is-spin"); }, 800); setTab(st.tab); });
    // keep the day view fresh while the panel is open
    setInterval(function () { if (!document.hidden && st.tab === "agenda" && getToken() && !$("[data-dialog]").open) renderAgenda(true); }, 60000);
    if (getToken()) { showShell(true); setTab("agenda"); } else renderLogin();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
