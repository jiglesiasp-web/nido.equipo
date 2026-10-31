# Activar las reservas propias de Flow Barber

Tiempo: unos 10 minutos. Coste: 0 €. Hace falta una cuenta de Google (Gmail) de la barbería.
Es mucho más cómodo hacerlo **desde un ordenador**.

Cuando termines tendrás:
- **Un calendario de Google por barbero** (Flow Barber · Pool, · Eliud, · Gio), cada uno de un color, y otro **Flow Barber · Cierres** para toda la barbería.
- Cada reserva de la web aparece sola como evento en el calendario de su barbero, con nombre, teléfono y servicio.
- **Cualquier evento** que pongáis en esos calendarios (médico, gestiones, vacaciones) bloquea esa hora en la web.
- Un email a la barbería con cada reserva o cancelación, y otro al cliente (si deja su email) con un enlace para cancelar.

---

## 1. Crea el proyecto

1. Entra en Google con la cuenta de la barbería.
2. Abre **https://script.google.com** y pulsa **Nuevo proyecto**.
3. Ponle de nombre **Flow Barber — Reservas** (arriba a la izquierda, donde pone "Proyecto sin título").

## 2. Pega el programa

1. En el editor verás un archivo `Código.gs`. **Borra todo** lo que haya.
2. Abre el archivo [`Code.gs`](./Code.gs) de esta carpeta, copia **todo** su contenido y pégalo en el editor.
3. Busca la línea `adminPassword: "",` y escribe entre las comillas la **contraseña del panel del dueño**
   (larga, que no uses en otro sitio). Ejemplo: `adminPassword: "Tijeras-Doradas-Montgo-26",`
4. Pulsa el icono de **guardar** (disquete).

## 3. Crea los calendarios (una sola vez)

1. Arriba, en el desplegable de funciones, elige **`setup`** y pulsa **▶ Ejecutar**.
2. Google pedirá permisos: **Revisar permisos** → elige la cuenta de la barbería.
3. Saldrá el aviso *"Google no ha verificado esta aplicación"*. Es normal: el programa es tuyo, no de una empresa.
   Pulsa **Configuración avanzada → Ir a (nombre del proyecto) (no seguro) → Permitir**.
   Los permisos son para: crear y leer eventos en tus calendarios y enviar emails de confirmación.
4. Abre **Google Calendar**: en "Mis calendarios" verás los 4 calendarios nuevos.

## 4. Publícalo como aplicación web

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. En el engranaje ⚙ de "Seleccionar tipo", elige **Aplicación web**.
3. Rellena:
   - Descripción: `Reservas web`
   - Ejecutar como: **Yo** (la cuenta de la barbería)
   - Quién tiene acceso: **Cualquier usuario** ← importante, si no la web no puede reservar
4. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

## 5. Conéctalo a la web

Envía esa URL a quien mantiene la web. Se pega en `lib/manifest.js`, en la línea:

```js
bookingApi: "",
```

Desde ese momento la sección de reservas de la web pasa de "Agenda online en activación" a aceptar citas.

## 6. Comparte cada calendario con su barbero (opcional, recomendado)

En Google Calendar → junto a "Flow Barber · Pool" pulsa ⋮ → **Configuración y uso compartido** → **Compartir con personas concretas** → añade el email de Pool con permiso **"Hacer cambios en eventos"**. Igual con Eliud y Gio.

Así cada barbero ve su agenda en la app de Google Calendar del móvil, con avisos, y puede apuntar ahí sus bloqueos.

---

## Panel del dueño

Abre **https://jiglesiasp-web.github.io/flow-barber/admin.html** (guárdalo en favoritos o en la pantalla de inicio del móvil) y entra con la contraseña de `adminPassword`.

- **Agenda:** las citas del día con nombre, teléfono, servicio y barbero. Botones para llamar o escribir por WhatsApp, y para marcar *Hecha* (✓), *No vino* (✗) o *Cancelar* (con aviso por email al cliente si dejó email). El cambio se ve también en el título del evento en Google Calendar.
- **Próximas:** todas las citas de los próximos 30 días.
- **Nueva cita:** para clientes que llaman o pasan por la barbería.
- **Cierres:** cerrar un día entero o unas horas, para toda la barbería o para un barbero. También muestra los eventos que hayáis puesto directamente en Google Calendar (esos se borran desde Calendar).

Seguridad: los datos de los clientes solo se envían a quien tenga la contraseña. Tras 10 intentos fallidos el panel se bloquea 10 minutos. Si alguien la descubre, cámbiala en `Code.gs` y publica una nueva versión (ver más abajo).

## Uso diario desde Google Calendar

- **Bloquear un rato a un barbero:** crea un evento en su calendario ("Médico", "Gestiones"…). La web deja de ofrecer esa hora.
- **Cerrar la barbería un día:** crea un evento de **todo el día** en "Flow Barber · Cierres".
- **Vacaciones de un barbero:** evento de todo el día (o de varios días) en su calendario.
- **Mover una cita:** arrastra el evento en Calendar a otra hora o al calendario de otro barbero. Ojo: el cliente no recibe aviso automático de ese cambio; avísale tú.
- **Cancelar una cita:** mejor desde el panel (avisa al cliente). Si borras el evento en Calendar, el hueco queda libre pero el cliente no recibe aviso.

## Cambiar precios, servicios u horario

Hay que cambiarlos en dos sitios para que coincidan:
1. En `Code.gs` (bloque `CONFIG`). Después: **Implementar → Gestionar implementaciones → ✏ editar → Versión: Nueva versión → Implementar**. La URL no cambia.
2. En la web: `lib/manifest.js` y la sección de precios de `index.html`.

Si añades un barbero nuevo en `CONFIG.barbers`, vuelve a ejecutar `setup` para que se cree su calendario.

## Límites (cuenta de Gmail gratuita)

- Unos 100 emails al día (de sobra para una barbería).
- El cliente no necesita cuenta para reservar. Para evitar abusos, un mismo teléfono no puede tener más de 2 citas pendientes.
- No borres ni cambies de nombre los calendarios "Flow Barber · …": el sistema los usa.

## Privacidad

Se guardan nombre, teléfono y (opcional) email del cliente en los eventos del calendario, solo para gestionar la cita. Los calendarios son privados de la cuenta de la barbería (y de los barberos con quien los compartas).
