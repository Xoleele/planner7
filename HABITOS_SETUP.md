# Hábitos dentro de Planner7

La opción «Hábitos» del menú de usuario, encima de «Herramientas», abre el Habit
Tracker. `app-8-habitos.js` conserva
registros, iconos, reordenamiento y estadísticas del prototipo.
En escritorio, `H` abre/cierra Hábitos y `T` vuelve a la fecha actual con el botón
«Hoy». No se activan al escribir ni por encima de otras ventanas abiertas.
Su interfaz usa Shadow DOM para aislar estilos, IDs y eventos del calendario.
Los controles de fecha simulada y datos inventados del prototipo no se muestran.
El selector de iconos incluye búsqueda por nombre y cinco etiquetas internas por
icono, principalmente en español. La búsqueda ignora tildes y mayúsculas; las
etiquetas no aparecen en la interfaz ni se guardan en el historial del usuario.
La cuadrícula del selector muestra cinco iconos por fila.
Los nombres de los iconos están en español; las variantes que comparten nombre
se numeran («Libro 1», «Libro 2»…). Estos nombres se usan también en la búsqueda
y en las etiquetas accesibles, sin cambiar los nombres de hábitos del usuario.
La creación de identificadores admite HTTPS y HTTP por IP local (por ejemplo,
`http://192.168.1.4:3000`); usa `crypto.getRandomValues` cuando no hay `randomUUID`.

Las cuentas sin historial comienzan con todos los espacios vacíos y solo el día
actual. Crear el primer hábito actualiza ese registro sin preguntar por un nuevo
registro. Los hábitos ya guardados de cuentas existentes se conservan. Cuando un
cambio requiere confirmación, «Actualizar registro actual» es la opción destacada.
El selector lleva el título secundario «Registro» y ordena los períodos como
«N°1», «N°2»… y «Actual», todos con su rango de fechas. El estado normal de
guardado usa el mismo aviso flotante de Planner7. Los errores y conflictos se
muestran con sus acciones en un aviso flotante, sin desplazar los controles.

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
  conocida, `synced` (última versión confirmada por Supabase) y `pending`, para
  reintentar los cambios al recuperar conexión.
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
La sincronización compara el historial con `synced` y envía únicamente operaciones
de insertar, actualizar o eliminar los campos que cambiaron. Una marca diaria
envía solo su fecha/hábito y estado. Crear o borrar un registro no reenvía los
registros restantes. Los cambios rápidos se agrupan durante 350 ms.

La función `public.sync_habit_changes` aplica cada lote en una transacción bajo
RLS y verifica la revisión antes de escribir. Usa la identidad autenticada, sin
aceptar un ID de usuario del cliente. Devuelve solamente la revisión confirmada.
La migración `supabase/migrations/20261012214215_sync_habit_changes.sql` fue
aplicada al mismo proyecto y se incluye también en `supabase_setup.sql`.
Los datos existentes conservan su formato y la tabla `habit_data`; no se borran.
El respaldo debe incluir esta función y sus permisos, además de la tabla.

Este cambio reduce el tráfico de guardado; la carga inicial todavía obtiene el
historial completo. PostgreSQL sigue actualizando el documento JSONB de la fila.
Las copias locales y las pilas de deshacer siguen guardando historiales completos;
esta mejora se limita a la sincronización incremental.
Un aviso distingue copia local, envío pendiente, sincronización y conflicto.
Si el navegador rechaza el guardado local, se revierte la edición y se muestra un aviso.

## Respaldos

Los respaldos preparados el 12 de octubre antes de esta integración NO contienen
hábitos. Para respaldos futuros agregar `habit_data` y su estructura, además de las
tablas existentes. No convertir hábitos en filas de `tasks` para exportarlos.

## Validación

`node tests/habitos.cjs` con Playwright disponible en `NODE_PATH`: interfaz real
en navegador aislado y Supabase simulado; no accede a cuentas ni modifica producción.

`node tests/habitos-sync.cjs` verifica las diferencias de marcas, preferencias,
hábitos y registros; una marca en el historial sintético de 7.000 entradas envía
87 bytes de diferencias frente a 181.537 bytes de historial completo.
Se comprobó la función real en Supabase bajo el rol `authenticated`, incluyendo
primer guardado, conflicto de revisión, aislamiento de usuario y rollback de un
lote inválido. Todas las escrituras de prueba se revirtieron con `ROLLBACK`.

La revisión de seguridad no señaló la nueva función. Detectó avisos previos,
ajenos al módulo: `set_updated_at` con [search_path mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
`rls_auto_enable` con ejecución para [anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
y [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
y [protección contra contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
