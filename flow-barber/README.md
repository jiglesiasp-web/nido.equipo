# Flow Barber — web estática

Web de una sola página para Flow Barber (Av. del Montgó 26, Dénia). HTML + CSS + JS sin build.

- **Publicar:** sube el contenido de esta carpeta (incluido `.htaccess`) a Hostinger, Netlify o cualquier hosting estático.
- **Probar en local:** `python3 -m http.server 8765` dentro de la carpeta y abre http://localhost:8765/
- **Editar precios / horario:** precios en `index.html` (sección `#servicios`); horario en `index.html` (`#visita`) y en `lib/manifest.js` (indicador "Abierto/Cerrado").
- **Tras cada cambio:** sube el número `?v=20261030` en `index.html` para evitar caché.

Datos tomados del perfil público de Booksy (octubre 2026). Fotos: Flow Barber (perfil de Booksy).
