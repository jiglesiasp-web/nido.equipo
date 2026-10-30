/* Datos de la barbería: servicios, horario y conexión con el sistema de reservas propio. */
(function () {
  "use strict";
  window.__BRAND__ = {
    name: "Flow Barber",
    instagram: "https://www.instagram.com/flow_barber25/",
    address: "Avinguda del Montgó, 26, 03700 Dénia",
    timezone: "Europe/Madrid",

    // URL de la aplicación web de Google Apps Script (ver reservas/INSTALAR.md).
    // Vacío = la sección de reservas muestra "Agenda online en activación".
    bookingApi: "",

    // Deben coincidir con CONFIG.services / CONFIG.barbers de reservas/Code.gs
    services: [
      { id: "corte", name: "Corte caballero", min: 30, price: 15, drink: true, popular: true },
      { id: "corte-barba", name: "Corte + barba", min: 40, price: 20, drink: true, popular: true },
      { id: "corte-cejas", name: "Corte + cejas", min: 30, price: 18, drink: true, popular: true },
      { id: "completo", name: "Corte + barba + cejas", min: 40, price: 22, drink: true },
      { id: "rapado", name: "Rapado", min: 30, price: 15, drink: true },
      { id: "nino", name: "Corte para niño", min: 30, price: 15, drink: true },
      { id: "barba", name: "Recorte de barba", min: 20, price: 10, drink: true },
      { id: "cejas", name: "Cejas", min: 15, price: 5, drink: true },
      { id: "mascarilla", name: "Mascarilla y limpieza", min: 30, price: 15, drink: true },
      { id: "lavado", name: "Lavado de cabello", min: 15, price: 5, drink: false }
    ],
    barbers: [
      { id: "pool", name: "Pool" },
      { id: "eliud", name: "Eliud" },
      { id: "gio", name: "Gio" }
    ],
    // Lunes (1) a sábado (6), dos turnos. Domingo (0) cerrado.
    hours: {
      1: [["10:00", "14:00"], ["16:00", "20:00"]],
      2: [["10:00", "14:00"], ["16:00", "20:00"]],
      3: [["10:00", "14:00"], ["16:00", "20:00"]],
      4: [["10:00", "14:00"], ["16:00", "20:00"]],
      5: [["10:00", "14:00"], ["16:00", "20:00"]],
      6: [["10:00", "14:00"], ["16:00", "20:00"]],
      0: []
    }
  };
})();
