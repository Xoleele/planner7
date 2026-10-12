# Hábitos dentro de Planner7

El botón de diana del header abre el Habit Tracker. `app-8-habitos.js` conserva
registros, iconos, reordenamiento y estadísticas del prototipo.
Su interfaz usa Shadow DOM para aislar estilos, IDs y eventos del calendario.
Los controles de fecha simulada y datos inventados del prototipo no se muestran.
El selector de iconos incluye búsqueda por nombre y cinco etiquetas internas por
icono, principalmente en español. La búsqueda ignora tildes y mayúsculas; las
etiquetas no aparecen en la interfaz ni se guardan en el historial del usuario.
La cuadrícula del selector muestra cinco iconos por fila.
La creación de identificadores admite HTTPS y HTTP por IP local (por ejemplo,
`http://192.168.1.4:3000`); usa `crypto.getRandomValues` cuando no hay `randomUUID`.

Las cuentas sin historial comienzan con todos los espacios vacíos. Los hábitos
ya guardados de cuentas existentes se conservan.

## Borrado y deshacer

Al borrar un hábito del registro, se elimina junto con sus marcas; no existe una
sección de hábitos retirados. Los campos `retiredHabits` de versiones anteriores
y las marcas que no pertenecen a hábitos activos se descartan al cargar y quedan
fuera del siguiente guardado. Otros registros mantienen sus propios hábitos.

`Ctrl+Z` deshace y `Ctrl+Y` rehace creaciones, ediciones de nombre/icono, borrados,
marcas, limpieza de días, reordenamientos, cambios del filtro de días y creación
o eliminación de registros. Cada operación restaura una copia completa del
historial y se sincroniza mediante el guardado habitual. `Ctrl+Shift+Z` también
rehace. Al escribir en un campo se mantiene el deshacer nativo de texto.

Las pilas de deshacer/rehacer son de la sesión de la cuenta en esta página y se
conservan al cerrar y reabrir el panel. Se vacían al recargar, cambiar de cuenta
o adoptar un historial distinto de la nube. Una nueva edición descarta rehacer.

## Almacenamiento

- Supabase: `public.habit_data`, una fila por usuario. `data` contiene el historial
  `{version: 2, blocks, hideEmptyDays}`; `revision` evita sobrescribir cambios de
  otro dispositivo; `updated_at` registra la última sincronización.
- Copia local: `planner7.habitos.v1:<UUID>`. Incluye el historial, la revisión
  conocida y `pending`, para reintentar los cambios al recuperar conexión.
- Conflictos: el panel permite elegir nube o dispositivo y conserva ambas versiones
  en `planner7.habitos.v1:<UUID>.recovery` antes de resolverlos.
- Las tareas (`tasks`) y las etiquetas/preferencias de Planner7 (`user_data`) no
  se consultan ni se modifican desde este módulo.
- Los datos locales anónimos del prototipo no se importan automáticamente a una
  cuenta. El prototipo original permanece en su carpeta, sin cambios.

## Base de datos

La migración `supabase/migrations/20261012194009_add_habit_data.sql` crea la tabla,
RLS, política por propietario, permisos y trigger de fecha. Aplicarla una sola vez
en instalaciones existentes antes de usar la herramienta. Para instalaciones nuevas,
`supabase_setup.sql` también incluye esta tabla.

Aplicada el 12 de octubre de 2026 al proyecto `oewaoouxbswnoeqvctzr` (Planner App).
Su versión local coincide con la del historial remoto. Se confirmó RLS y el trigger,
con cero filas iniciales de hábitos. Las 1.312 tareas y 7 filas de `user_data`
existentes conservaron sus cantidades; la migración no escribe en esas tablas.

No se usan claves privadas en el frontend: se comparte el cliente Supabase y la
sesión existente de Planner7. Al cambiar o cerrar la sesión se desmonta la interfaz
y se descartan referencias en memoria; las copias locales quedan separadas por UUID.

La primera apertura necesita conexión para comprobar el historial de la cuenta.
Después de cargar el historial o guardar una edición localmente, el panel puede trabajar sin conexión.
Las ediciones se guardan primero en ese navegador y se envían en serie a Supabase.
Un aviso distingue copia local, envío pendiente, sincronización y conflicto.
Si el navegador rechaza el guardado local, se revierte la edición y se muestra un aviso.

## Respaldos

Los respaldos preparados el 12 de octubre antes de esta integración NO contienen
hábitos. Para respaldos futuros agregar `habit_data` y su estructura, además de las
tablas existentes. No convertir hábitos en filas de `tasks` para exportarlos.

## Validación

`node tests/habitos.cjs` con Playwright disponible en `NODE_PATH`: interfaz real
en navegador aislado y Supabase simulado; no accede a cuentas ni modifica producción.
