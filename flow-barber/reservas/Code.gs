/**
 * FLOW BARBER — Sistema de reservas propio (Google Apps Script + Google Calendar)
 * ------------------------------------------------------------------------------
 * Las citas se guardan como eventos en Google Calendar: un calendario por barbero
 * ("Flow Barber · Pool", "· Eliud", "· Gio") y otro para cierres de toda la barbería
 * ("Flow Barber · Cierres"). Cualquier evento en esos calendarios bloquea ese hueco.
 * También manda emails de confirmación. Gratis con una cuenta de Google.
 *
 * Instalación: reservas/INSTALAR.md (unos 10 minutos).
 * Lo único que quizá quieras tocar está en CONFIG, justo debajo.
 */

var CONFIG = {
  shopName: "Flow Barber",
  address: "Avinguda del Montgó, 26, 03700 Dénia",
  siteUrl: "https://jiglesiasp-web.github.io/flow-barber/",
  timezone: "Europe/Madrid",

  // Email que recibe el aviso de cada reserva. Vacío = el de la cuenta que instala el script.
  notifyEmail: "",

  // Contraseña del panel del dueño (admin.html). Pon una larga y que no uses en otro sitio.
  // Vacía = panel desactivado.
  adminPassword: "",

  slotStep: 15,        // minutos entre horas ofrecidas
  minNoticeMin: 60,    // no se puede reservar con menos de X minutos de antelación
  maxDaysAhead: 30,    // se puede reservar hasta X días vista
  maxActivePerPhone: 2,// citas futuras máximas por teléfono (anti-spam)

  // Horario: 0 = domingo, 1 = lunes ... 6 = sábado
  hours: {
    0: [],
    1: [["10:00", "14:00"], ["16:00", "20:00"]],
    2: [["10:00", "14:00"], ["16:00", "20:00"]],
    3: [["10:00", "14:00"], ["16:00", "20:00"]],
    4: [["10:00", "14:00"], ["16:00", "20:00"]],
    5: [["10:00", "14:00"], ["16:00", "20:00"]],
    6: [["10:00", "14:00"], ["16:00", "20:00"]]
  },

  // color: color del calendario de cada barbero en Google Calendar
  barbers: [
    { id: "pool", name: "Pool", color: "#D4AF37" },
    { id: "eliud", name: "Eliud", color: "#4A86E8" },
    { id: "gio", name: "Gio", color: "#16A765" }
  ],
  closuresCalendarColor: "#A79B8E",

  // Deben coincidir con los de la web (lib/manifest.js)
  services: [
    { id: "corte", name: "Corte caballero", min: 30, price: 15 },
    { id: "corte-barba", name: "Corte + barba", min: 40, price: 20 },
    { id: "corte-cejas", name: "Corte + cejas", min: 30, price: 18 },
    { id: "completo", name: "Corte + barba + cejas", min: 40, price: 22 },
    { id: "rapado", name: "Rapado", min: 30, price: 15 },
    { id: "nino", name: "Corte para niño", min: 30, price: 15 },
    { id: "barba", name: "Recorte de barba", min: 20, price: 10 },
    { id: "cejas", name: "Cejas", min: 15, price: 5 },
    { id: "mascarilla", name: "Mascarilla y limpieza", min: 30, price: 15 },
    { id: "lavado", name: "Lavado de cabello", min: 15, price: 5 }
  ]
};

var STATUSES = ["Confirmada", "Completada", "No vino", "Cancelada"];
var STATUS_PREFIX = { "Confirmada": "✂ ", "Completada": "✓ ", "No vino": "✗ " };

/* ================================================================
   1. INSTALACIÓN — ejecuta esta función una vez desde el editor
   ================================================================ */
function setup() {
  var props = PropertiesService.getScriptProperties();
  CONFIG.barbers.forEach(function (b) {
    var cal = ensureCalendar_(CONFIG.shopName + " · " + b.name, b.color);
    props.setProperty("cal_" + b.id, cal.getId());
  });
  props.setProperty("cal__closures", ensureCalendar_(CONFIG.shopName + " · Cierres", CONFIG.closuresCalendarColor).getId());
  MailApp.getRemainingDailyQuota(); // pide el permiso de Gmail ahora
  Logger.log("Listo: calendarios creados. Ahora: Implementar > Nueva implementación > Aplicación web.");
}
function ensureCalendar_(name, color) {
  var found = CalendarApp.getCalendarsByName(name);
  if (found && found.length) return found[0];
  return CalendarApp.createCalendar(name, { color: color, timeZone: CONFIG.timezone });
}
function barberCal_(id) {
  var calId = PropertiesService.getScriptProperties().getProperty("cal_" + id);
  var cal = calId && CalendarApp.getCalendarById(calId);
  if (!cal) throw new Error("Falta ejecutar setup()");
  return cal;
}

/* ================================================================
   2. API
   ================================================================ */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === "slots") return json_(getSlots_(p.date, p.service, p.barber));
    if (p.action === "days") return json_(getDays_(p.service, p.barber));
    if (p.action === "cancel") return json_(cancel_(p.id, p.code));
    if (p.action === "ping") return json_({ ok: true, shop: CONFIG.shopName });
    return json_({ ok: false, error: "Acción no válida" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.action === "book") return json_(book_(body));
    if (body.action === "admin") return json_(admin_(body));
    return json_({ ok: false, error: "Acción no válida" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ================================================================
   3. FECHAS Y DISPONIBILIDAD
   ================================================================ */
function service_(id) {
  for (var i = 0; i < CONFIG.services.length; i++) if (CONFIG.services[i].id === id) return CONFIG.services[i];
  return null;
}
function barber_(id) {
  for (var i = 0; i < CONFIG.barbers.length; i++) if (CONFIG.barbers[i].id === id) return CONFIG.barbers[i];
  return null;
}
function toMin_(hhmm) { var p = String(hhmm).split(":"); return (+p[0]) * 60 + (+p[1]); }
function toHHMM_(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
function fmt_(d, f) { return Utilities.formatDate(d, CONFIG.timezone, f); }
function at_(dateStr, hhmm) { return Utilities.parseDate(dateStr + " " + (hhmm || "00:00"), CONFIG.timezone, "yyyy-MM-dd HH:mm"); }

function now_() {
  var d = new Date();
  return { date: fmt_(d, "yyyy-MM-dd"), min: toMin_(fmt_(d, "HH:mm")) };
}
function weekday_(dateStr) { return (+fmt_(at_(dateStr, "12:00"), "u")) % 7; } // 0 = domingo
function addDays_(dateStr, n) { return fmt_(new Date(at_(dateStr, "12:00").getTime() + n * 86400000), "yyyy-MM-dd"); }
function validDate_(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) return false;
  var today = now_().date;
  return dateStr >= today && dateStr <= addDays_(today, CONFIG.maxDaysAhead);
}

/** Recorre los días que ocupa un evento: fn(fecha, desdeMin, hastaMin) */
function eventDays_(ev, fn) {
  if (ev.isAllDayEvent()) {
    var d = fmt_(ev.getAllDayStartDate(), "yyyy-MM-dd"), end = fmt_(ev.getAllDayEndDate(), "yyyy-MM-dd");
    if (end <= d) end = addDays_(d, 1);
    for (var guard = 0; d < end && guard < 400; guard++, d = addDays_(d, 1)) fn(d, 0, 1440);
    return;
  }
  var s = ev.getStartTime(), e = ev.getEndTime();
  var sd = fmt_(s, "yyyy-MM-dd"), ed = fmt_(e, "yyyy-MM-dd");
  var sm = toMin_(fmt_(s, "HH:mm")), em = toMin_(fmt_(e, "HH:mm"));
  if (sd === ed) { fn(sd, sm, em); return; }
  fn(sd, sm, 1440);
  for (var d2 = addDays_(sd, 1), g = 0; d2 < ed && g < 400; d2 = addDays_(d2, 1), g++) fn(d2, 0, 1440);
  if (em > 0) fn(ed, 0, em);
}

/**
 * Huecos ocupados entre dos fechas (incluidas): { "2026-11-02": { pool: [[600,640], ...], ... } }
 * Cuenta cualquier evento del calendario de cada barbero y del calendario de cierres.
 */
function busyRange_(from, to) {
  var start = at_(from, "00:00"), end = at_(addDays_(to, 1), "00:00");
  var out = {};
  function mark(barberId, d, a, b) {
    if (d < from || d > to) return;
    out[d] = out[d] || {};
    (out[d][barberId] = out[d][barberId] || []).push([a, b]);
  }
  CONFIG.barbers.forEach(function (b) {
    barberCal_(b.id).getEvents(start, end).forEach(function (ev) {
      eventDays_(ev, function (d, a, z) { mark(b.id, d, a, z); });
    });
  });
  var closId = PropertiesService.getScriptProperties().getProperty("cal__closures");
  var clos = closId && CalendarApp.getCalendarById(closId);
  if (clos) clos.getEvents(start, end).forEach(function (ev) {
    eventDays_(ev, function (d, a, z) { CONFIG.barbers.forEach(function (b) { mark(b.id, d, a, z); }); });
  });
  return out;
}
function overlaps_(list, a, b) {
  for (var i = 0; i < (list || []).length; i++) if (a < list[i][1] && b > list[i][0]) return true;
  return false;
}

/** [{ time: "10:15", barbers: ["pool","gio"] }, ...] para un día */
function computeSlots_(dateStr, svc, barberId, ignoreNotice, busyDay) {
  var shifts = CONFIG.hours[weekday_(dateStr)] || [];
  if (!shifts.length) return [];
  busyDay = busyDay || (busyRange_(dateStr, dateStr)[dateStr] || {});
  var now = now_();
  var minStart = dateStr === now.date && !ignoreNotice ? now.min + CONFIG.minNoticeMin : -1;
  var candidates = barberId && barberId !== "any" ? [barberId] : CONFIG.barbers.map(function (b) { return b.id; });
  var slots = [];
  shifts.forEach(function (s) {
    var open = toMin_(s[0]), close = toMin_(s[1]);
    for (var t = open; t + svc.min <= close; t += CONFIG.slotStep) {
      if (t < minStart) continue;
      var free = candidates.filter(function (id) { return !overlaps_(busyDay[id], t, t + svc.min); });
      if (free.length) slots.push({ time: toHHMM_(t), barbers: free });
    }
  });
  return slots;
}

function getSlots_(dateStr, serviceId, barberId) {
  var svc = service_(serviceId);
  if (!svc) return { ok: false, error: "Servicio no válido" };
  if (barberId && barberId !== "any" && !barber_(barberId)) return { ok: false, error: "Barbero no válido" };
  if (!validDate_(dateStr)) return { ok: false, error: "Fecha fuera de rango" };
  return { ok: true, date: dateStr, slots: computeSlots_(dateStr, svc, barberId).map(function (s) { return s.time; }) };
}

/** Qué días de los próximos tienen algún hueco (para pintar el calendario de la web) */
function getDays_(serviceId, barberId) {
  var svc = service_(serviceId);
  if (!svc) return { ok: false, error: "Servicio no válido" };
  var today = now_().date, last = addDays_(today, Math.min(CONFIG.maxDaysAhead, 20));
  var busy = busyRange_(today, last), days = [];
  for (var d = today; d <= last; d = addDays_(d, 1)) {
    days.push({ date: d, free: computeSlots_(d, svc, barberId, false, busy[d] || {}).length });
  }
  return { ok: true, days: days };
}

/* ================================================================
   4. RESERVAR / CANCELAR
   ================================================================ */
function clean_(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max); }

function book_(b) {
  if (b.website) return { ok: false, error: "Solicitud no válida" }; // honeypot anti-bots
  return createBooking_(b, false);
}

/** Índice reserva -> evento (en las propiedades del script) */
function saveIndex_(id, calId, eventId, code, date) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty("bk_" + id, JSON.stringify({ c: calId, e: eventId, k: code, d: date }));
  // limpia citas de hace más de 60 días
  var limit = addDays_(now_().date, -60), all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf("bk_") !== 0) return;
    try { if (JSON.parse(all[k]).d < limit) props.deleteProperty(k); } catch (err) { props.deleteProperty(k); }
  });
}
function findBooking_(id) {
  var raw = PropertiesService.getScriptProperties().getProperty("bk_" + id);
  if (!raw) return null;
  var ix = JSON.parse(raw);
  var cal = CalendarApp.getCalendarById(ix.c);
  var ev = cal && cal.getEventById(ix.e);
  if (ev) return { ix: ix, cal: cal, ev: ev, barber: barberOfCal_(cal) };
  // la cita se pudo arrastrar al calendario de otro barbero en Google Calendar
  for (var i = 0; i < CONFIG.barbers.length; i++) {
    var c2 = barberCal_(CONFIG.barbers[i].id), ev2 = c2.getEventById(ix.e);
    if (ev2 && ev2.getTag("fb_id") === id) return { ix: ix, cal: c2, ev: ev2, barber: CONFIG.barbers[i] };
  }
  return null;
}
function barberOfCal_(cal) {
  var id = cal.getId(), props = PropertiesService.getScriptProperties();
  for (var i = 0; i < CONFIG.barbers.length; i++) if (props.getProperty("cal_" + CONFIG.barbers[i].id) === id) return CONFIG.barbers[i];
  return null;
}
function title_(status, svcName, name) { return (STATUS_PREFIX[status] || "") + svcName + " · " + name; }

/** admin = true: reserva hecha por el dueño (teléfono / en persona) */
function createBooking_(b, admin) {
  var svc = service_(b.service);
  if (!svc) return { ok: false, error: "Servicio no válido" };
  if (!validDate_(b.date)) return { ok: false, error: "Fecha fuera de rango" };
  if (!/^\d{2}:\d{2}$/.test(String(b.time || "")) || toMin_(b.time) >= 24 * 60 || toMin_(b.time) % 5) return { ok: false, error: "Hora no válida" };
  var name = clean_(b.name, 60), phone = clean_(b.phone, 20).replace(/[^\d+ ]/g, ""), email = clean_(b.email, 80), notes = clean_(b.notes, 200);
  if (name.length < 2) return { ok: false, error: "Escribe tu nombre" };
  if ((!admin || phone) && phone.replace(/\D/g, "").length < 9) return { ok: false, error: "Teléfono no válido" };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email no válido" };
  if (!admin && !b.consent) return { ok: false, error: "Falta aceptar el uso de datos" };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: "Mucho tráfico, inténtalo de nuevo" };
  try {
    var today = now_().date;
    var busy = busyRange_(b.date, b.date)[b.date] || {};

    // anti-spam: citas futuras con este teléfono
    if (!admin) {
      var digits = phone.replace(/\D/g, ""), active = 0;
      var start = at_(today, "00:00"), end = at_(addDays_(today, CONFIG.maxDaysAhead + 1), "00:00");
      CONFIG.barbers.forEach(function (bb) {
        barberCal_(bb.id).getEvents(start, end).forEach(function (ev) {
          if (ev.getTag("fb_id") && String(ev.getTag("fb_phone") || "").replace(/\D/g, "") === digits) active++;
        });
      });
      if (active >= CONFIG.maxActivePerPhone) return { ok: false, error: "Ya tienes " + active + " citas pendientes con este teléfono" };
    }

    var slot = computeSlots_(b.date, svc, b.barber, admin, busy).filter(function (s) { return s.time === b.time; })[0];
    if (!slot && admin && b.force && barber_(b.barber)) slot = { time: b.time, barbers: [b.barber] }; // el dueño fuerza la hora
    if (!slot) return { ok: false, error: admin ? "Ese hueco no está libre (o está fuera de horario). Marca «Otra hora» si quieres apuntarla igual." : "Esa hora acaba de ocuparse. Elige otra.", taken: true };

    // "Cualquiera": el barbero libre con menos citas ese día
    var barberId = slot.barbers[0];
    if (!b.barber || b.barber === "any") {
      barberId = slot.barbers.slice().sort(function (x, y) { return (busy[x] || []).length - (busy[y] || []).length; })[0];
    }
    var barber = barber_(barberId);
    var endHHMM = toHHMM_(toMin_(b.time) + svc.min);
    var id = "FB-" + fmt_(new Date(), "yyMMdd") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    var code = Utilities.getUuid().replace(/-/g, "").slice(0, 12);

    var cal = barberCal_(barberId);
    var ev = cal.createEvent(title_("Confirmada", svc.name, name), at_(b.date, b.time), at_(b.date, endHHMM), {
      location: CONFIG.address,
      description: "Cliente: " + name + (phone ? "\nTeléfono: " + phone : "") + (email ? "\nEmail: " + email : "") +
                   "\nServicio: " + svc.name + " (" + svc.min + " min, " + svc.price + " €)" + (notes ? "\nNotas: " + notes : "") +
                   "\n\nReserva " + id + (admin ? " · apuntada desde el panel" : " · reservada en la web")
    });
    var tags = { fb_id: id, fb_status: "Confirmada", fb_service: svc.id, fb_svcname: svc.name, fb_min: String(svc.min), fb_price: String(svc.price),
                 fb_barber: barber.id, fb_name: name, fb_phone: phone, fb_email: email, fb_notes: notes, fb_src: admin ? "panel" : "web" };
    Object.keys(tags).forEach(function (k) { ev.setTag(k, tags[k]); });
    saveIndex_(id, cal.getId(), ev.getId(), code, b.date);

    var booking = { id: id, date: b.date, time: b.time, end: endHHMM, service: svc.name, price: svc.price, minutes: svc.min, barber: barber.name, name: name };
    notify_(booking, phone, email, notes, code, admin);
    return { ok: true, booking: booking };
  } finally {
    lock.releaseLock();
  }
}

/** Cancelación desde el enlace del email del cliente */
function cancel_(id, code) {
  if (!id || !code) return { ok: false, error: "Enlace incompleto" };
  var raw = PropertiesService.getScriptProperties().getProperty("bk_" + id);
  if (!raw) return { ok: false, error: "Reserva no encontrada o ya cancelada" };
  if (JSON.parse(raw).k !== String(code)) return { ok: false, error: "Enlace no válido" };
  var lock = LockService.getScriptLock(); lock.tryLock(15000);
  try {
    var f = findBooking_(id);
    if (!f) { PropertiesService.getScriptProperties().deleteProperty("bk_" + id); return { ok: true, already: true }; }
    var info = eventToBooking_(f.ev, f.barber);
    f.ev.deleteEvent();
    PropertiesService.getScriptProperties().deleteProperty("bk_" + id);
    try {
      MailApp.sendEmail(ownerEmail_(), "Cancelada: " + info.date + " " + info.time + " · " + info.name,
        info.name + " ha cancelado su cita (" + info.service + " con " + info.barber + ", " + prettyDate_(info.date) + " a las " + info.time + ").\nReserva " + id);
    } catch (err) {}
    return { ok: true, booking: { id: id, date: info.date, time: info.time, service: info.service, barber: info.barber } };
  } finally { lock.releaseLock(); }
}

/* ================================================================
   5. EMAILS
   ================================================================ */
function ownerEmail_() { return CONFIG.notifyEmail || Session.getEffectiveUser().getEmail(); }

function prettyDate_(dateStr) {
  var days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var p = dateStr.split("-");
  return days[weekday_(dateStr)] + " " + (+p[2]) + " de " + months[+p[1] - 1];
}

function notify_(bk, phone, email, notes, code, byOwner) {
  var when = prettyDate_(bk.date) + " a las " + bk.time;
  var cancelUrl = CONFIG.siteUrl + "?cancelar=" + encodeURIComponent(bk.id) + "&c=" + code + "#reservar";
  if (!byOwner) try {
    MailApp.sendEmail(ownerEmail_(), "Nueva cita: " + bk.date + " " + bk.time + " · " + bk.name + " (" + bk.barber + ")",
      "Nueva reserva desde la web\n\n" +
      "Cliente: " + bk.name + "\nTeléfono: " + phone + (email ? "\nEmail: " + email : "") +
      "\nServicio: " + bk.service + " (" + bk.minutes + " min, " + bk.price + " €)" +
      "\nBarbero: " + bk.barber + "\nCuándo: " + when + (notes ? "\nNotas: " + notes : "") +
      "\n\nYa está en el calendario de " + bk.barber + ". Reserva " + bk.id);
  } catch (err) {}
  if (!email) return;
  try {
    MailApp.sendEmail({
      to: email,
      name: CONFIG.shopName,
      subject: "Tu cita en " + CONFIG.shopName + ": " + when,
      body: "Hola " + bk.name + ",\n\nTu cita está confirmada.\n\n" +
            bk.service + " con " + bk.barber + "\n" + when + " (" + bk.minutes + " min)\n" + bk.price + " € · pago en el local\n" +
            CONFIG.address + "\n\nSi no puedes venir, cancela aquí:\n" + cancelUrl + "\n\nGracias,\n" + CONFIG.shopName
    });
  } catch (err) {}
}

/* ================================================================
   6. PANEL DEL DUEÑO (admin.html)
   ================================================================ */
function admin_(b) {
  if (!CONFIG.adminPassword) return { ok: false, error: "Panel desactivado: pon una contraseña en CONFIG.adminPassword", code: "disabled" };
  if (b.op === "login") return adminLogin_(b.password, b.remember);
  if (!validToken_(b.token)) return { ok: false, error: "Sesión caducada. Vuelve a entrar.", code: "auth" };
  switch (b.op) {
    case "list": return adminList_(b.from, b.to);
    case "status": return adminStatus_(b.id, b.status, b.notify);
    case "create": return createBooking_(b, true);
    case "block": return adminBlock_(b);
    case "unblock": return adminUnblock_(b.cal, b.event);
    case "logout": PropertiesService.getScriptProperties().deleteProperty("tok_" + b.token); return { ok: true };
  }
  return { ok: false, error: "Operación no válida" };
}

function adminLogin_(password, remember) {
  var cache = CacheService.getScriptCache();
  var fails = +(cache.get("admin_fails") || 0);
  if (fails >= 10) return { ok: false, error: "Demasiados intentos. Espera 10 minutos.", code: "locked" };
  if (!safeEqual_(String(password || ""), String(CONFIG.adminPassword))) {
    cache.put("admin_fails", String(fails + 1), 600);
    Utilities.sleep(800);
    return { ok: false, error: "Contraseña incorrecta", code: "auth" };
  }
  cache.remove("admin_fails");
  var props = PropertiesService.getScriptProperties(), now = Date.now();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf("tok_") === 0 && +all[k] < now) props.deleteProperty(k); });
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  var ttl = (remember ? 30 : 1) * 86400000;
  props.setProperty("tok_" + token, String(now + ttl));
  return { ok: true, token: token, expires: now + ttl };
}
function safeEqual_(a, b) {
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function validToken_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  var exp = PropertiesService.getScriptProperties().getProperty("tok_" + token);
  return !!exp && +exp > Date.now();
}

function eventToBooking_(ev, barber) {
  var s = ev.getStartTime(), e = ev.getEndTime(), b = barber || barber_(ev.getTag("fb_barber"));
  return {
    id: ev.getTag("fb_id"), status: ev.getTag("fb_status") || "Confirmada",
    date: fmt_(s, "yyyy-MM-dd"), time: fmt_(s, "HH:mm"), end: fmt_(e, "HH:mm"),
    service: ev.getTag("fb_svcname") || "", minutes: +ev.getTag("fb_min") || 0, price: +ev.getTag("fb_price") || 0,
    barber: b ? b.name : "", name: ev.getTag("fb_name") || "", phone: ev.getTag("fb_phone") || "",
    email: ev.getTag("fb_email") || "", notes: ev.getTag("fb_notes") || "", source: ev.getTag("fb_src") || ""
  };
}

function adminList_(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to)) || to < from) return { ok: false, error: "Fechas no válidas" };
  if (to > addDays_(from, 190)) return { ok: false, error: "Rango demasiado largo" };
  var start = at_(from, "00:00"), end = at_(addDays_(to, 1), "00:00");
  var bookings = [], blocks = [];
  function asBlock(ev, cal, barberName) {
    var allDay = ev.isAllDayEvent();
    var d = fmt_(allDay ? ev.getAllDayStartDate() : ev.getStartTime(), "yyyy-MM-dd");
    blocks.push({ cal: cal.getId(), event: ev.getId(), date: d < from ? from : d,
      from: allDay ? "" : fmt_(ev.getStartTime(), "HH:mm"), to: allDay ? "" : fmt_(ev.getEndTime(), "HH:mm"),
      barber: barberName, reason: String(ev.getTitle() || "").replace(/^⊘\s*/, ""), own: ev.getTag("fb_block") === "1" });
  }
  CONFIG.barbers.forEach(function (b) {
    var cal = barberCal_(b.id);
    cal.getEvents(start, end).forEach(function (ev) {
      if (ev.getTag("fb_id")) bookings.push(eventToBooking_(ev, b));
      else asBlock(ev, cal, b.name);
    });
  });
  var closId = PropertiesService.getScriptProperties().getProperty("cal__closures");
  var clos = closId && CalendarApp.getCalendarById(closId);
  if (clos) clos.getEvents(start, end).forEach(function (ev) { asBlock(ev, clos, ""); });
  bookings.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  blocks.sort(function (a, b) { return (a.date + a.from).localeCompare(b.date + b.from); });
  return { ok: true, bookings: bookings, blocks: blocks, today: now_().date };
}

function adminStatus_(id, status, notify) {
  if (STATUSES.indexOf(status) < 0) return { ok: false, error: "Estado no válido" };
  var lock = LockService.getScriptLock(); lock.tryLock(15000);
  try {
    var f = findBooking_(id);
    if (!f) return { ok: false, error: "Reserva no encontrada (¿se borró del calendario?)" };
    var info = eventToBooking_(f.ev, f.barber);
    if (status === "Cancelada") {
      f.ev.deleteEvent();
      PropertiesService.getScriptProperties().deleteProperty("bk_" + id);
      if (notify && info.email) {
        try {
          MailApp.sendEmail({ to: info.email, name: CONFIG.shopName, subject: "Tu cita en " + CONFIG.shopName + " ha sido cancelada",
            body: "Hola " + info.name + ",\n\nLa barbería ha tenido que cancelar tu cita del " + prettyDate_(info.date) + " a las " + info.time +
                  " (" + info.service + ").\nPerdona las molestias. Puedes reservar otra hora aquí:\n" + CONFIG.siteUrl + "#reservar\n\n" + CONFIG.shopName });
        } catch (err) {}
      }
      info.status = "Cancelada";
      return { ok: true, booking: info };
    }
    f.ev.setTag("fb_status", status);
    f.ev.setTitle(title_(status, info.service, info.name));
    info.status = status;
    return { ok: true, booking: info };
  } finally { lock.releaseLock(); }
}

function adminBlock_(b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ""))) return { ok: false, error: "Fecha no válida" };
  var from = String(b.from || ""), to = String(b.to || "");
  if (!!from !== !!to) return { ok: false, error: "Indica la hora de inicio y la de fin" };
  if (from && (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to))) return { ok: false, error: "Hora no válida" };
  if (from && toMin_(to) <= toMin_(from)) return { ok: false, error: "La hora final debe ser posterior" };
  if (b.barber && !barber_(b.barber)) return { ok: false, error: "Barbero no válido" };
  var cal = b.barber ? barberCal_(b.barber) : CalendarApp.getCalendarById(PropertiesService.getScriptProperties().getProperty("cal__closures"));
  if (!cal) return { ok: false, error: "Falta ejecutar setup()" };
  var title = "⊘ " + (clean_(b.reason, 80) || "Cerrado");
  var ev = from ? cal.createEvent(title, at_(b.date, from), at_(b.date, to)) : cal.createAllDayEvent(title, at_(b.date, "12:00"));
  ev.setTag("fb_block", "1");
  return { ok: true };
}

function adminUnblock_(calId, eventId) {
  var cal = calId && CalendarApp.getCalendarById(String(calId));
  var ev = cal && cal.getEventById(String(eventId));
  if (!ev) return { ok: false, error: "Cierre no encontrado. Recarga." };
  if (ev.getTag("fb_block") !== "1") return { ok: false, error: "Ese evento no se creó desde el panel: bórralo en Google Calendar." };
  ev.deleteEvent();
  return { ok: true };
}
