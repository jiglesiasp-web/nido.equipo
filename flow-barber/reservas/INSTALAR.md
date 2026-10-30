# Activar las reservas propias de Flow Barber

Tiempo: unos 10 minutos. Coste: 0 €. Hace falta una cuenta de Google (Gmail) de la barbería.
Es mucho más cómodo hacerlo **desde un ordenador**.

Cuando termines tendrás:
- Cada reserva de la web guardada en una hoja de Google Sheets.
- Un evento en el Google Calendar de esa cuenta por cada cita.
- Un email a la barbería con cada reserva o cancelación, y otro al cliente (si deja su email) con un enlace para cancelar.

---

## 1. Crea la hoja de reservas

1. Entra en Google con la cuenta de la barbería.
2. Abre **https://sheets.new** (crea una hoja en blanco).
3. Ponle de nombre **Flow Barber — Reservas** (arriba a la izquierda).

## 2. Pega el programa

1. En la hoja, menú **Extensiones → Apps Script**.
2. Se abre un editor con un archivo `Código.gs`. **Borra todo** lo que haya.
3. Abre el archivo [`Code.gs`](./Code.gs) de esta carpeta, copia **todo** su contenido y pégalo en el editor.
4. Busca la línea `adminPassword: "",` y escribe entre las comillas la **contraseña del panel del dueño**
   (larga, que no uses en otro sitio). Ejemplo: `adminPassword: "Tijeras-Doradas-Montgo-26",`
5. Pulsa el icono de **guardar** (disquete).

## 3. Prepara la hoja (una sola vez)

1. Arriba, en el desplegable de funciones, elige **`setup`** y pulsa **▶ Ejecutar**.
2. Google pedirá permisos: **Revisar permisos** → elige la cuenta de la barbería.
3. Saldrá el aviso *"Google no ha verificado esta aplicación"*. Es normal: el programa es tuyo, no de una empresa.
   Pulsa **Configuración avanzada → Ir a (nombre del proyecto) (no seguro) → Permitir**.
   Los permisos son para: guardar en esta hoja, crear eventos en tu calendario y enviar emails de confirmación.
4. Vuelve a la hoja: verás dos pestañas nuevas, **Reservas** y **Bloqueos**.

## 4. Publícalo como aplicación web

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. En el engranaje ⚙ de "Seleccionar tipo", elige **Aplicación web**.
3. Rellena:
   - Descripción: `Reservas web`
   - Ejecutar como: **Yo** (la cuenta de la barbería)
   - Quién tiene acceso: **Cualquier usuario** ← importante, si no la web no puede reservar
4. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

## 5. Conéctalo a la web

Envía esa URL a quien mantiene la web (o a Claude). Se pega en `lib/manifest.js`, en la línea:

```js
bookingApi: "",
```

Desde ese momento la sección de reservas de la web pasa de "Agenda online en activación" a aceptar citas.

---

## Panel del dueño

Abre **https://jiglesiasp-web.github.io/flow-barber/admin.html** (guárdalo en favoritos o en la pantalla de inicio del móvil) y entra con la contraseña de `adminPassword`.

- **Agenda:** las citas del día con nombre, teléfono, servicio y barbero. Botones para llamar o escribir por WhatsApp, y para marcar *Hecha*, *No vino* o *Cancelar* (con aviso por email al cliente si dejó email).
- **Próximas:** todas las citas confirmadas de los próximos 30 días.
- **Nueva cita:** para clientes que llaman o pasan por la barbería. Así esa hora deja de ofrecerse en la web.
- **Cierres:** cerrar un día entero o unas horas, para toda la barbería o para un barbero.

Seguridad: los datos de los clientes solo se envían a quien tenga la contraseña. Tras 10 intentos fallidos el panel se bloquea 10 minutos. Si alguien la descubre, cámbiala en `Code.gs` y publica una nueva versión (ver "Cambiar precios…").

## Uso diario (también desde la hoja)

- **Ver citas:** en el Google Calendar de la cuenta, o en la pestaña **Reservas** de la hoja.
- **Que los barberos vean la agenda:** en Google Calendar → tu calendario → *Configuración y uso compartido* → *Compartir con personas* → añade su email.
- **Cerrar un día o unas horas** (vacaciones, médico, festivo): añade una fila en la pestaña **Bloqueos**:
  | Fecha | Desde | Hasta | Barbero | Motivo |
  |---|---|---|---|---|
  | 2026-12-24 | 14:00 | 20:00 | | Nochebuena: tarde cerrado |
  | 2026-11-12 | | | Gio | Gio de vacaciones |

  Fecha vacía en "Desde/Hasta" = todo el día. Barbero vacío = todos.
- **Cancelar una cita a mano:** en la pestaña **Reservas**, cambia el Estado de `Confirmada` a `Cancelada` (borra tú el evento del calendario).
- **Una cita que entra por teléfono o en persona:** añádela en **Bloqueos** con el barbero y la hora, así la web no ofrece ese hueco.

## Cambiar precios, servicios u horario

Hay que cambiarlos en dos sitios para que coincidan:
1. En `reservas/Code.gs` (bloque `CONFIG`). Después: **Implementar → Gestionar implementaciones → ✏ editar → Versión: Nueva versión → Implementar**. La URL no cambia.
2. En la web: `lib/manifest.js` y la sección de precios de `index.html`.

## Límites (cuenta de Gmail gratuita)

- Unos 100 emails al día (de sobra para una barbería).
- Si algún día falla Google Calendar o el email, la cita **se guarda igual** en la hoja.
- El cliente no necesita cuenta para reservar. Para evitar abusos, un mismo teléfono no puede tener más de 2 citas pendientes.

## Privacidad

Se guardan nombre, teléfono y (opcional) email del cliente, solo para gestionar la cita. La hoja es privada de la cuenta de la barbería. Es recomendable borrar cada cierto tiempo las filas de citas antiguas.
