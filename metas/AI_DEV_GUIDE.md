# Guía para desarrollar la app "Metas" (futura fusión con Planner7)

> Documento para una IA que empezará a construir, en esta subcarpeta (`/metas`), una app de **metas personales**: panel izquierdo con una **estructura jerárquica** (árbol de metas → submetas → tareas) y panel derecho con una **carta Gantt generada automáticamente**.
>
> **Objetivo arquitectónico clave:** la app debe seguir las mismas convenciones que Planner7 para poder **fusionarse sin fricción** más adelante (compartir auth, base de datos, estilos y patrones de código).

---

## 1. Cómo está construido Planner7 (lo que debes imitar)

Planner7 es una **app web vanilla, sin framework ni build step**. No hay React, no hay bundler, no hay TypeScript. Se sirve como archivos estáticos.

| Aspecto | Cómo lo hace Planner7 |
|---|---|
| **Stack** | HTML + CSS + JavaScript puro (ES) cargado con `<script src>` clásico, **no** ES modules. |
| **Estructura de archivos** | Todo en la raíz: un único `index.html`, un único `app.js` (~15k líneas), un único `style.css`. Sin carpeta `src/`, sin componentes separados. |
| **Carga** | `index.html` carga `supabase-js` por CDN, luego `app.js`. El arranque es `window.addEventListener('DOMContentLoaded', initApp)`. |
| **Backend** | Supabase (auth + Postgres). El cliente se crea con `window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`. Las claves están **hardcodeadas** al inicio de `app.js`. |
| **Estado** | Variables globales a nivel de módulo (`let tasks = []`, `let tags = []`, `let currentUser = null`, etc.). No hay store ni state management. |
| **Render** | Funciones imperativas `renderWeeklyCalendar()`, `renderCronograma()`, etc., que reconstruyen el DOM y se vuelven a llamar tras cada cambio de estado. No hay binding reactivo. |
| **Persistencia** | Funciones `async loadX()` / `saveX()` que hablan con Supabase. Cada acción del usuario muta el estado global y luego llama a `saveTasksIncremental(tasks)` + un `render`. |
| **PWA** | `manifest.json` + `sw.js` (service worker). App instalable, pensada para móvil y escritorio. |
| **Idioma** | Todo el código (comentarios, UI, mensajes) está **en español**. Mantén esto. |

### Patrón de datos en Supabase (¡muy importante para la fusión!)

Planner7 NO crea una columna por campo. Guarda el **objeto completo como JSONB**:

- Tabla `tasks`: `id TEXT PK`, `user_id UUID`, `data JSONB` (el objeto entero de la tarea), `created_at`, `updated_at`. Una fila = una tarea.
- Tabla `user_data`: `user_id UUID PK`, `tags JSONB`, `preferences JSONB`. Una fila por usuario.
- **Row Level Security (RLS)** activado en ambas: `auth.uid() = user_id`. Cada usuario solo ve lo suyo.
- Hay una RPC `delete_user()` (`SECURITY DEFINER`) para borrar la cuenta.

El patrón "id + user_id + data JSONB + RLS por user_id" es el contrato que debes reproducir para que la fusión sea trivial.

### Patrón de sincronización (replícalo)

Planner7 usa **sync incremental por diff** (`saveTasksIncremental`):
1. Mantiene un snapshot del último estado subido (`lastSyncedById`, persistido en `localStorage`).
2. Calcula qué cambió/se borró (`computeTaskDiff`) y solo sube eso (`upsert` con `onConflict`) y borra solo lo eliminado (un único `.delete().in(...)`).
3. **Salvaguarda crítica:** nunca ejecuta borrado masivo si la lista local está vacía (un array vacío casi siempre significa "aún no cargó", no "borra todo"). Copia esta salvaguarda.

---

## 2. Reglas para construir la app "Metas"

### 2.1 Estructura de archivos
Crea dentro de `/metas` la misma forma que la raíz, para que luego se pueda mover/fusionar:

```
/metas
  index.html       (carga supabase-js por CDN + metas.js, igual que Planner7)
  metas.js         (toda la lógica; puede crecer, está bien)
  metas.css        (estilos; reutiliza variables/tokens de style.css de Planner7)
```

No introduzcas frameworks, bundlers ni ES modules. Mantén `<script src>` clásico y variables globales. **La consistencia con Planner7 vale más que cualquier mejora arquitectónica.**

### 2.2 Auth y Supabase — comparte el mismo proyecto
- Usa el **mismo proyecto de Supabase** y las **mismas claves** que Planner7 (mismas `SUPABASE_URL` y `SUPABASE_ANON_KEY`, al inicio de `metas.js`). Así el usuario inicia sesión una vez y, al fusionar, comparten sesión automáticamente.
- Reutiliza la sesión existente: `await sb.auth.getSession()` en el arranque, y `sb.auth.onAuthStateChange(...)`. Copia el flujo de `initAuth()` de Planner7 (incluido el detalle de **no reinicializar** la app cuando llega un `SIGNED_IN` repetido con el mismo `currentUser.id`).

### 2.3 Tablas nuevas (sin tocar las de Planner7)
Crea tablas separadas con el **mismo contrato** que `tasks`, para no colisionar y poder fusionar:

```sql
-- Nodos del árbol de metas (meta, submeta o tarea: el tipo va dentro de data)
CREATE TABLE IF NOT EXISTS public.goals (
  id         TEXT        PRIMARY KEY,            -- p.ej. "goal-1719500000-7"
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',  -- objeto completo del nodo
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_user_id_idx ON public.goals(user_id);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals: user owns row" ON public.goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

Reutiliza el trigger `set_updated_at()` que ya existe en el proyecto. Documenta este SQL en un `metas/SUPABASE_SETUP_METAS.md` siguiendo el estilo del `SUPABASE_SETUP.md` existente.

### 2.4 Modelo de datos sugerido para la jerarquía
Guarda cada nodo como un objeto plano dentro de `data`, con referencia al padre (no anides arrays profundos: facilita el diff incremental y el Gantt):

```js
{
  id: "goal-1719500000-7",
  type: "meta" | "submeta" | "tarea",
  parentId: null | "goal-...",   // null = raíz
  title: "Aprender alemán",
  order: 0,                       // orden entre hermanos
  startDate: "2026-07-01",        // para el Gantt (ISO)
  endDate:   "2026-09-30",        // para el Gantt (ISO)
  progress: 0,                    // 0–100, para barra del Gantt
  collapsed: false,               // estado del árbol
  tagId: null,                    // si reutilizas las etiquetas de Planner7
  // ...campos extra libres dentro de data
}
```

El árbol se reconstruye en memoria desde la lista plana (`parentId` + `order`). Las **fechas del Gantt** se derivan automáticamente: una meta puede heredar/calcular su rango a partir del min(start)–max(end) de sus hijos. Documenta claramente la regla de derivación que elijas.

### 2.5 Layout: árbol a la izquierda, Gantt a la derecha
- Contenedor flex de dos paneles. Izquierda = árbol jerárquico (con expandir/colapsar, indentación, drag&drop opcional). Derecha = carta Gantt que se **regenera automáticamente** al cambiar el árbol.
- El Gantt puede dibujarse con **SVG o divs posicionados** (Planner7 dibuja su cronograma con divs/SVG a mano, sin librerías — sigue esa línea para mantener cero dependencias). Si necesitas una librería, justifícalo, pero la preferencia es vanilla.
- Sincroniza scroll/selección entre ambos paneles (seleccionar una fila del árbol resalta su barra en el Gantt).

### 2.6 Patrón de render y guardado (cópialo de Planner7)
- Estado global: `let goals = []`, `let currentUser = null`, etc.
- Tras cada mutación: actualizar el array en memoria → `await saveGoalsIncremental(goals)` → `renderTree()` + `renderGantt()`.
- Implementa `saveGoalsIncremental` clonando `saveTasksIncremental` (diff por snapshot en `localStorage`, upsert de cambios, delete con `.in()`, **salvaguarda de lista vacía**).
- Considera `undo/redo` por pila como hace Planner7 (`undoStack` / `redoStack`) si el tiempo lo permite.

### 2.7 Estilos
- Importa o copia las **variables CSS / tokens de color** de `style.css` de Planner7 (paleta oscura `#111`, fuente **Inter**, mismas etiquetas de color). Reutiliza `DEFAULT_COLORS` / la lógica de tags si conectas etiquetas.
- Diseño responsive y mobile-first como Planner7 (tiene comportamientos específicos para móvil; en Gantt, prevé scroll horizontal en pantallas pequeñas).

---

## 3. Pensando en la fusión (decisiones que la facilitan)

1. **Mismo proyecto Supabase + mismas claves** → sesión compartida desde el día 1.
2. **Tablas nuevas con el mismo contrato** (`id/user_id/data JSONB/RLS`) → no colisionan con `tasks`/`user_data` y son fáciles de integrar.
3. **Sin frameworks ni build** → el código se puede mover a la raíz y cargar como un `<script>` más.
4. **Prefija nombres globales** (`goals`, `renderTree`, `saveGoalsIncremental`, IDs `goal-...`) para evitar choques con los globales de `app.js` al unir los archivos.
5. **Reutiliza, no dupliques**, helpers genéricos cuando sea posible (parser de fechas, tags, paleta de colores). Si copias, deja un comentario `// copiado de planner7 app.js: <función>` para luego deduplicar.
6. **Guarda preferencias de la vista de metas** en la tabla `user_data.preferences` existente (bajo una clave propia, p.ej. `preferences.metas = {...}`) o en una columna nueva, para no romper Planner7.

---

## 4. Cosas que NO hacer
- ❌ No migrar a React/Vue/TS/bundler "porque es mejor". Rompe la fusión.
- ❌ No crear un segundo cliente Supabase con otro proyecto/claves.
- ❌ No usar una columna por campo en la DB; usa `data JSONB`.
- ❌ No olvidar la salvaguarda de "no borrar si la lista local está vacía".
- ❌ No dejar la UI en inglés; todo en español.
- ❌ No introducir ES modules (`import/export`) en los archivos que vayan a fusionarse con `app.js`.

---

## 5. Checklist de arranque
- [ ] Crear `/metas/index.html`, `/metas/metas.js`, `/metas/metas.css` (estilo Planner7).
- [ ] Pegar `SUPABASE_URL` / `SUPABASE_ANON_KEY` de Planner7 al inicio de `metas.js`.
- [ ] Crear tabla `goals` con RLS (`metas/SUPABASE_SETUP_METAS.md`).
- [ ] Implementar arranque con sesión compartida (`getSession` + `onAuthStateChange`).
- [ ] Estado global `goals[]` + `renderTree()` + `renderGantt()`.
- [ ] `saveGoalsIncremental()` con diff + salvaguarda de lista vacía.
- [ ] Layout dos paneles; Gantt derivado automáticamente del árbol.
- [ ] Reutilizar tokens de color/fuente de `style.css`.
- [ ] Probar en una segunda cuenta que RLS aísla los datos.
