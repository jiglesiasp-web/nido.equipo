/**
 * FLOW BARBER — Sistema de reservas propio (Google Apps Script)
 * ------------------------------------------------------------------
 * Guarda las citas en esta hoja de cálculo, las añade a Google Calendar
 * y manda emails de confirmación. Gratis con una cuenta de Google.
 *
 * Instalación: sigue reservas/INSTALAR.md (unos 10 minutos).
 * Lo único que quizá quieras tocar está en CONFIG, justo debajo.
 */

var CONFIG = {
  shopName: "Flow Barber",
  address: "Avinguda del Montgó, 26, 03700 Dénia",
  siteUrl: "https://jiglesiasp-web.github.io/flow-barber/",
  timezone: "Europe/Madrid",

  // Email que recibe el aviso de cada reserva. Vacío = el de la cuenta que instala el script.
  notifyEmail: "",

  // Crear un evento en Google Calendar por cada cita (true / false)
  useCalendar: true,

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

  barbers: [
    { id: "pool", name: "Pool" },
    { id: "eliud", name: "Eliud" },
    { id: "gio", name: "Gio" }
  ],

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

var SHEET_BOOKINGS = "Reservas";
var SHEET_BLOCKS = "Bloqueos";
var HEADERS = ["ID", "Creada", "Estado", "Fecha", "Hora", "Fin", "Servicio", "Minutos", "Precio €",
               "Barbero", "Nombre", "Teléfono", "Email", "Notas", "Código", "Evento"];
var COL = {}; HEADERS.forEach(function (h, i) { COL[h] = i; });

/* ================================================================
   1. INSTALACIÓN — ejecuta esta función una vez desde el editor
   ================================================================ */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_BOOKINGS) || ss.insertSheet(SHEET_BOOKINGS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#d4af37");
  }
  // Fecha, hora y teléfono como texto para que Sheets no los transforme
  sh.getRange("D:F").setNumberFormat("@");
  sh.getRange("L:L").setNumberFormat("@");

  var bl = ss.getSheetByName(SHEET_BLOCKS) || ss.insertSheet(SHEET_BLOCKS);
  if (bl.getLastRow() === 0) {
    bl.appendRow(["Fecha (AAAA-MM-DD)", "Desde (HH:MM, vacío = todo el día)", "Hasta (HH:MM)", "Barbero (vacío = todos)", "Motivo"]);
    bl.setFrozenRows(1);
    bl.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e9cf7a");
    bl.getRange("A:C").setNumberFormat("@");
    bl.appendRow(["2026-12-25", "", "", "", "Ejemplo: Navidad cerrado (borra esta fila si no la quieres)"]);
  }
  if (CONFIG.useCalendar) CalendarApp.getDefaultCalendar(); // pide el permiso de Calendar ahora
  MailApp.getRemainingDailyQuota();                          // pide el permiso de Gmail ahora
  Logger.log("Listo. Ahora: Implementar > Nueva implementación > Aplicación web.");
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
    return json_({ ok: false, error: "Acción no válida" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ================================================================
   3. DISPONIBILIDAD
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

function now_() {
  var d = new Date();
  return {
    date: Utilities.formatDate(d, CONFIG.timezone, "yyyy-MM-dd"),
    min: toMin_(Utilities.formatDate(d, CONFIG.timezone, "HH:mm"))
  };
}
function weekday_(dateStr) {
  // 'u' = 1 (lunes) ... 7 (domingo) -> 0..6 con 0 = domingo
  var u = +Utilities.formatDate(Utilities.parseDate(dateStr + " 12:00", CONFIG.timezone, "yyyy-MM-dd HH:mm"), CONFIG.timezone, "u");
  return u % 7;
}
function addDays_(dateStr, n) {
  var d = Utilities.parseDate(dateStr + " 12:00", CONFIG.timezone, "yyyy-MM-dd HH:mm");
  return Utilities.formatDate(new Date(d.getTime() + n * 86400000), CONFIG.timezone, "yyyy-MM-dd");
}
function cellText_(v, fmt) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.timezone, fmt);
  return String(v == null ? "" : v).trim();
}
function validDate_(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) return false;
  var today = now_().date;
  return dateStr >= today && dateStr <= addDays_(today, CONFIG.maxDaysAhead);
}

/** Intervalos ocupados de ese día: { barberId: [[ini, fin], ...] } */
function busy_(dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {};
  CONFIG.barbers.forEach(function (b) { out[b.id] = []; });

  var sh = ss.getSheetByName(SHEET_BOOKINGS);
  if (sh && sh.getLastRow() > 1) {
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
    rows.forEach(function (r) {
      if (cellText_(r[COL["Estado"]], "") !== "Confirmada") return;
      if (cellText_(r[COL["Fecha"]], "yyyy-MM-dd") !== dateStr) return;
      var b = barber_(cellText_(r[COL["Barbero"]], "").toLowerCase()) || barberByName_(cellText_(r[COL["Barbero"]], ""));
      if (!b) return;
      out[b.id].push([toMin_(cellText_(r[COL["Hora"]], "HH:mm")), toMin_(cellText_(r[COL["Fin"]], "HH:mm"))]);
    });
  }

  var bl = ss.getSheetByName(SHEET_BLOCKS);
  if (bl && bl.getLastRow() > 1) {
    bl.getRange(2, 1, bl.getLastRow() - 1, 4).getValues().forEach(function (r) {
      if (cellText_(r[0], "yyyy-MM-dd") !== dateStr) return;
      var from = cellText_(r[1], "HH:mm"), to = cellText_(r[2], "HH:mm");
      var iv = [from ? toMin_(from) : 0, to ? toMin_(to) : 24 * 60];
      var who = cellText_(r[3], "").toLowerCase();
      CONFIG.barbers.forEach(function (b) {
        if (!who || who === "todos" || who === b.id || who === b.name.toLowerCase()) out[b.id].push(iv);
      });
    });
  }
  return out;
}
function barberByName_(name) {
  name = String(name || "").toLowerCase();
  for (var i = 0; i < CONFIG.barbers.length; i++) if (CONFIG.barbers[i].name.toLowerCase() === name) return CONFIG.barbers[i];
  return null;
}
function overlaps_(list, a, b) {
  for (var i = 0; i < list.length; i++) if (a < list[i][1] && b > list[i][0]) return true;
  return false;
}

/** Devuelve [{ time: "10:15", barbers: ["pool","gio"] }, ...] */
function computeSlots_(dateStr, svc, barberId) {
  var shifts = CONFIG.hours[weekday_(dateStr)] || [];
  if (!shifts.length) return [];
  var busy = busy_(dateStr);
  var now = now_();
  var minStart = dateStr === now.date ? now.min + CONFIG.minNoticeMin : -1;
  var candidates = barberId && barberId !== "any" ? [barberId] : CONFIG.barbers.map(function (b) { return b.id; });
  var slots = [];
  shifts.forEach(function (s) {
    var open = toMin_(s[0]), close = toMin_(s[1]);
    for (var t = open; t + svc.min <= close; t += CONFIG.slotStep) {
      if (t < minStart) continue;
      var free = candidates.filter(function (id) { return !overlaps_(busy[id] || [], t, t + svc.min); });
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

/** Qué días de los próximos N tienen algún hueco (para pintar el calendario) */
function getDays_(serviceId, barberId) {
  var svc = service_(serviceId);
  if (!svc) return { ok: false, error: "Servicio no válido" };
  var today = now_().date, days = [];
  for (var i = 0; i <= Math.min(CONFIG.maxDaysAhead, 20); i++) {
    var d = addDays_(today, i);
    days.push({ date: d, free: computeSlots_(d, svc, barberId).length });
  }
  return { ok: true, days: days };
}

/* ================================================================
   4. RESERVAR / CANCELAR
   ================================================================ */
function clean_(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max); }

function book_(b) {
  if (b.website) return { ok: false, error: "Solicitud no válida" }; // honeypot anti-bots
  var svc = service_(b.service);
  if (!svc) return { ok: false, error: "Servicio no válido" };
  if (!validDate_(b.date)) return { ok: false, error: "Fecha fuera de rango" };
  if (!/^\d{2}:\d{2}$/.test(String(b.time || ""))) return { ok: false, error: "Hora no válida" };
  var name = clean_(b.name, 60), phone = clean_(b.phone, 20).replace(/[^\d+ ]/g, ""), email = clean_(b.email, 80), notes = clean_(b.notes, 200);
  if (name.length < 2) return { ok: false, error: "Escribe tu nombre" };
  if (phone.replace(/\D/g, "").length < 9) return { ok: false, error: "Teléfono no válido" };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email no válido" };
  if (!b.consent) return { ok: false, error: "Falta aceptar el uso de datos" };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: "Mucho tráfico, inténtalo de nuevo" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_BOOKINGS);
    if (!sh) return { ok: false, error: "Falta ejecutar setup()" };

    // anti-spam: citas futuras con este teléfono
    var today = now_().date, digits = phone.replace(/\D/g, "");
    if (sh.getLastRow() > 1) {
      var active = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues().filter(function (r) {
        return cellText_(r[COL["Estado"]], "") === "Confirmada" &&
               cellText_(r[COL["Fecha"]], "yyyy-MM-dd") >= today &&
               cellText_(r[COL["Teléfono"]], "").replace(/\D/g, "") === digits;
      }).length;
      if (active >= CONFIG.maxActivePerPhone) return { ok: false, error: "Ya tienes " + active + " citas pendientes con este teléfono" };
    }

    var slot = computeSlots_(b.date, svc, b.barber).filter(function (s) { return s.time === b.time; })[0];
    if (!slot) return { ok: false, error: "Esa hora acaba de ocuparse. Elige otra.", taken: true };

    // "Cualquiera": el barbero libre con menos citas ese día
    var barberId = slot.barbers[0];
    if (!b.barber || b.barber === "any") {
      var busy = busy_(b.date);
      barberId = slot.barbers.slice().sort(function (x, y) { return busy[x].length - busy[y].length; })[0];
    }
    var barber = barber_(barberId);
    var start = toMin_(b.time), endHHMM = toHHMM_(start + svc.min);
    var id = "FB-" + Utilities.formatDate(new Date(), CONFIG.timezone, "yyMMdd") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    var code = Utilities.getUuid().replace(/-/g, "").slice(0, 12);

    var eventId = "";
    if (CONFIG.useCalendar) {
      try {
        var ev = CalendarApp.getDefaultCalendar().createEvent(
          "✂ " + svc.name + " · " + name + " (" + barber.name + ")",
          Utilities.parseDate(b.date + " " + b.time, CONFIG.timezone, "yyyy-MM-dd HH:mm"),
          Utilities.parseDate(b.date + " " + endHHMM, CONFIG.timezone, "yyyy-MM-dd HH:mm"),
          { description: "Reserva " + id + "\nTeléfono: " + phone + (email ? "\nEmail: " + email : "") + (notes ? "\nNotas: " + notes : ""), location: CONFIG.address }
        );
        eventId = ev.getId();
      } catch (err) { /* la cita se guarda igual aunque falle Calendar */ }
    }

    var row = [];
    row[COL["ID"]] = id;
    row[COL["Creada"]] = Utilities.formatDate(new Date(), CONFIG.timezone, "yyyy-MM-dd HH:mm");
    row[COL["Estado"]] = "Confirmada";
    row[COL["Fecha"]] = b.date;
    row[COL["Hora"]] = b.time;
    row[COL["Fin"]] = endHHMM;
    row[COL["Servicio"]] = svc.name;
    row[COL["Minutos"]] = svc.min;
    row[COL["Precio €"]] = svc.price;
    row[COL["Barbero"]] = barber.name;
    row[COL["Nombre"]] = name;
    row[COL["Teléfono"]] = phone;
    row[COL["Email"]] = email;
    row[COL["Notas"]] = notes;
    row[COL["Código"]] = code;
    row[COL["Evento"]] = eventId;
    sh.appendRow(row);
    SpreadsheetApp.flush();

    var booking = { id: id, date: b.date, time: b.time, end: endHHMM, service: svc.name, price: svc.price, minutes: svc.min, barber: barber.name, name: name };
    notify_(booking, phone, email, notes, code);
    return { ok: true, booking: booking };
  } finally {
    lock.releaseLock();
  }
}

function cancel_(id, code) {
  if (!id || !code) return { ok: false, error: "Enlace incompleto" };
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOKINGS);
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: "Reserva no encontrada" };
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r[COL["ID"]]) !== String(id)) continue;
      if (String(r[COL["Código"]]) !== String(code)) return { ok: false, error: "Enlace no válido" };
      var info = { id: id, date: cellText_(r[COL["Fecha"]], "yyyy-MM-dd"), time: cellText_(r[COL["Hora"]], "HH:mm"), service: String(r[COL["Servicio"]]), barber: String(r[COL["Barbero"]]) };
      if (r[COL["Estado"]] === "Cancelada") return { ok: true, already: true, booking: info };
      sh.getRange(i + 2, COL["Estado"] + 1).setValue("Cancelada");
      if (r[COL["Evento"]]) {
        try { CalendarApp.getDefaultCalendar().getEventById(String(r[COL["Evento"]])).deleteEvent(); } catch (err) {}
      }
      try {
        MailApp.sendEmail(ownerEmail_(), "Cancelada: " + info.date + " " + info.time + " · " + r[COL["Nombre"]],
          r[COL["Nombre"]] + " ha cancelado su cita (" + info.service + " con " + info.barber + ", " + prettyDate_(info.date) + " a las " + info.time + ").\nReserva " + id);
      } catch (err) {}
      return { ok: true, booking: info };
    }
    return { ok: false, error: "Reserva no encontrada" };
  } finally {
    lock.releaseLock();
  }
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

function notify_(bk, phone, email, notes, code) {
  var when = prettyDate_(bk.date) + " a las " + bk.time;
  var cancelUrl = CONFIG.siteUrl + "?cancelar=" + encodeURIComponent(bk.id) + "&c=" + code + "#reservar";
  try {
    MailApp.sendEmail(ownerEmail_(), "Nueva cita: " + bk.date + " " + bk.time + " · " + bk.name + " (" + bk.barber + ")",
      "Nueva reserva desde la web\n\n" +
      "Cliente: " + bk.name + "\nTeléfono: " + phone + (email ? "\nEmail: " + email : "") +
      "\nServicio: " + bk.service + " (" + bk.minutes + " min, " + bk.price + " €)" +
      "\nBarbero: " + bk.barber + "\nCuándo: " + when + (notes ? "\nNotas: " + notes : "") +
      "\n\nReserva " + bk.id);
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
