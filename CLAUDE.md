si haces cambios a la app, al final de tu respuesta dame un summary (maximo 10 palabras) para pegar en github desktop. (EN ESPAÑOL)

## Estructura del código JavaScript

El antiguo `app.js` monolitico (~17.700 lineas, ~700 KB) se dividio en 4 archivos
que se cargan EN ORDEN desde index.html. Comparten el mismo ambito global (son
<script> clasicos, no modulos ES), por lo que el comportamiento es identico a un
solo archivo. El ORDEN de carga importa: las variables y funciones se declaran de
arriba a abajo igual que antes.

- `app-1-core.js`      → Supabase, auth state, config, parser de duracion, helpers de DB, sincronizacion, pantalla de login.
- `app-2-objetivos.js` → Toda la seccion Objetivos: render del arbol, modal de objetivo, y el drag & drop jerarquico.
- `app-3-calendario.js`→ Bootstrap de auth, calendario semanal, tareas, migraciones, alarmas, formato 24h, estadisticas diarias, fusion de tareas.
- `app-4-ui.js`        → Reordenar etiquetas, selector de color, categorizacion automatica, cronometro, buscador, feed movil, maletin, autocompletado de titulo.

Reglas al editar estos archivos:
- NO declarar una misma variable/funcion global en dos archivos (con const/let eso rompe).
- Si una funcion nueva se usa desde varios sitios, ponla en el archivo que se carga
  ANTES de quien la llama (o en app-1-core.js si es transversal).
- `sw.js` (service worker) cachea los 4 archivos; al cambiarlos, sube CACHE_VERSION.

## IMPORTANTE: evitar truncado de archivos al editar

Estos archivos son grandes. Si Chrome tiene la app abierta (file://) o GitHub
Desktop esta operando sobre la carpeta MIENTRAS se escribe un archivo, este puede
quedar truncado (cortado a mitad). Para editar con seguridad: cerrar Chrome y no
lanzar commits durante la edicion. Si un archivo aparece cortado, se repara
restaurando la cola desde el ultimo commit valido (git).
