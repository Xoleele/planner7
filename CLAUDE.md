si haces cambios a la app, al final de tu respuesta dame un summary (maximo 10 palabras) para pegar en github desktop. (EN ESPAÑOL)

Habrá ocasiones en las que será conveniente pedirle al usuario que use la consola de comandos para diagosticar algún problema. Escribe el código y pídele al usuario que lo pegue en la consola de comandos cuando sea oportuno hacerlo.

## Estructura del código JavaScript

El antiguo `app.js` (~15.800 lineas) se dividio en archivos que se cargan EN ORDEN
desde index.html. Son <script> clasicos (no modulos ES) y comparten el mismo ambito
global, asi que el comportamiento es identico a un solo archivo.

- `app-1-core.js`         → Supabase, auth state, config, parser de duracion, helpers de DB, sincronizacion, pantalla de login.
- `app-2-calendario.js`   → Bootstrap de auth, calendario semanal, aislar dia, menu de columna, migraciones, tareas recurrentes, alarmas, formato 24h.
- `app-3-tareas.js`       → Carrusel del horario movil, modal de tarea, completado, edicion de recurrentes, aviso de adyacentes, plantilla de notas.
- `app-4-estadisticas.js` → Estadisticas diarias, edicion y fusion de tareas desde estadisticas.
- `app-5-etiquetas.js`    → Reordenar etiquetas, selector de color, categorizacion automatica, selector de fecha.
- `app-6-herramientas.js` → Cronometro, buscador, feed movil, maletin, listeners globales (DOMContentLoaded, online, etc.), recuperarHoras.
- `app-7-resultados.js`   → Panel compartido de resultados del buscador y estadísticas: tarjetas, orden, cierre y navegación al editor. Ambos orígenes usan el mismo HTML (`task-results-modal`) y este controlador; los cambios de presentación y acciones comunes se hacen aquí.
- `app-8-habitos.js`      → Habit Tracker integrado en un Shadow DOM, acceso desde el header y sincronización por usuario en `habit_data`. No comparte datos con `tasks` ni `user_data`.

Reglas al editar estos archivos:
- NO declarar una misma variable global con const/let en dos archivos (rompe la carga).
- Codigo que se EJECUTA al cargar (fuera de funciones) solo puede usar cosas declaradas
  en su mismo archivo o en uno anterior. Dentro de funciones/listeners no hay restriccion.
- Si agregas un archivo nuevo, sumalo en index.html (en orden) y en APP_SHELL de sw.js.
- `sw.js` cachea estos archivos; al cambiarlos, sube CACHE_VERSION.

## Datos del usuario y Exportar / Importar datos

Cada vez que un cambio toque cómo se guardan los datos del usuario (tareas, actividades,
preferencias, hábitos o cualquier caché local), revisa que **Exportar datos** e **Importar datos**
(`exportUserData` / `validateImportedUserData` / `importUserDataFromFile` en `app-4-estadisticas.js`)
sigan funcionando:

- Dónde vive cada cosa: tareas → tabla `tasks` (+ caché `tasks_cache_<uid>`); actividades y
  preferencias → `user_data.tags` / `user_data.preferences` (+ caché `prefs_cache_<uid>`);
  hábitos → `habit_data` (+ caché `planner7.habitos.v1:<uid>`).
- Lo nuevo que se guarde en la cuenta debe ir dentro de esas estructuras (p. ej. una clave nueva
  en `preferences`). Así se exporta e importa solo. Si se crea una tabla o un campo fuera de ellas,
  hay que agregarlo al archivo exportado, a la validación y a la importación, y subir
  `PLANNER7_DATA_VERSION` si cambia el formato.
- Los archivos exportados antiguos no traen las claves nuevas: al cargar preferencias usa valores
  por defecto y valida el tipo (p. ej. `Array.isArray`) en vez de suponer que existen.
- Si una preferencia guarda ids de actividades o tareas, tolera ids que ya no existen (actividad
  eliminada) y límpialos al guardar.
- Al guardar una preferencia, fusiona con lo existente (`{ ...actual, ...nuevo }`) en vez de
  reemplazar el objeto completo, para no borrar otras opciones.
