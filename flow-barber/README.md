# Flow Barber — web estática

Web de una sola página para Flow Barber (Av. del Montgó 26, Dénia). HTML + CSS + JS sin build.

- **Publicar:** sube el contenido de esta carpeta (incluido `.htaccess`) a Hostinger, Netlify o cualquier hosting estático.
- **Probar en local:** `python3 -m http.server 8765` dentro de la carpeta y abre http://localhost:8765/
- **Reservas:** sistema propio y gratuito (Google Sheets + Calendar + email), en `reservas/`. Para activarlo sigue [`reservas/INSTALAR.md`](reservas/INSTALAR.md) y pega la URL en `bookingApi` de `lib/manifest.js`. Mientras `bookingApi` esté vacío, la sección de reservas muestra "Agenda online en activación". La web no depende de Booksy ni de ninguna plataforma de pago.
- **Editar precios / horario:** precios en `index.html` (sección `#servicios`); horario en `index.html` (`#visita`) y en `lib/manifest.js` (indicador "Abierto/Cerrado").
- **Tras cada cambio:** sube el número `?v=20261030d` en `index.html` para evitar caché.

Fotos: Flow Barber. Valoraciones citadas: 100 reseñas de clientes en Booksy (octubre 2026).
