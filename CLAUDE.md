si haces cambios a la app, al final de tu respuesta dame un summary (maximo 10 palabras) para pegar en github desktop. (EN ESPAÑOL)

Habrá ocasiones en las que será conveniente pedirle al usuario que use la consola de comandos para diagosticar algún problema. Escribe el código y pídele al usuario que lo pegue en la consola de comandos cuando sea oportuno hacerlo.

## Estructura del código JavaScript

El antiguo `app.js` (~15.800 lineas) se dividio en 6 archivos que se cargan EN ORDEN
desde index.html. Son <script> clasicos (no modulos ES) y comparten el mismo ambito
global, asi que el comportamiento es identico a un solo archivo.

- `app-1-core.js`         → Supabase, auth state, config, parser de duracion, helpers de DB, sincronizacion, pantalla de login.
- `app-2-calendario.js`   → Bootstrap de auth, calendario semanal, aislar dia, menu de columna, migraciones, tareas recurrentes, alarmas, formato 24h.
- `app-3-tareas.js`       → Carrusel del horario movil, modal de tarea, completado, edicion de recurrentes, aviso de adyacentes, plantilla de notas.
- `app-4-estadisticas.js` → Estadisticas diarias, edicion y fusion de tareas desde estadisticas.
- `app-5-etiquetas.js`    → Reordenar etiquetas, selector de color, categorizacion automatica, selector de fecha.
- `app-6-herramientas.js` → Cronometro, buscador, feed movil, maletin, listeners globales (DOMContentLoaded, online, etc.), recuperarHoras.

Reglas al editar estos archivos:
- NO declarar una misma variable global con const/let en dos archivos (rompe la carga).
- Codigo que se EJECUTA al cargar (fuera de funciones) solo puede usar cosas declaradas
  en su mismo archivo o en uno anterior. Dentro de funciones/listeners no hay restriccion.
- Si agregas un archivo nuevo, sumalo en index.html (en orden) y en APP_SHELL de sw.js.
- `sw.js` cachea estos archivos; al cambiarlos, sube CACHE_VERSION.
