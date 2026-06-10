# Guía de configuración de Supabase

Sigue estos pasos **una sola vez** antes de abrir la app.

---

## 1. Crear una cuenta y proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Haz clic en **"New project"**.
3. Elige un nombre (p.ej. `minimalist-calendar`), una contraseña para la base de datos y la región más cercana.
4. Espera ~1 minuto a que el proyecto termine de inicializarse.

---

## 2. Ejecutar el SQL de configuración

1. En el dashboard de tu proyecto ve a **SQL Editor** (menú izquierdo).
2. Haz clic en **New query**.
3. Copia y pega todo el contenido del archivo **`supabase_setup.sql`** (está en la misma carpeta que este archivo).
4. Haz clic en **Run**.

Esto crea las tablas `tasks` y `user_data` con las políticas de seguridad necesarias para que cada usuario solo pueda acceder a sus propios datos.

---

## 3. Obtener tus claves de API

1. En el dashboard ve a **Project Settings** (ícono de engranaje) → **API**.
2. Copia los valores:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon / public key** (una cadena larga que empieza con `eyJ...`)

---

## 4. Configurar las claves en el código

Abre el archivo **`supabase.js`** y reemplaza los placeholders:

```js
const SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY';
```

Por ejemplo:

```js
const SUPABASE_URL = 'https://abcdefgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## 5. Abrir la app

Como el proyecto usa ES Modules (`import/export`), el archivo `index.html` **debe abrirse a través de un servidor local**, no directamente como un archivo (`file://`).

Ejecuta en la terminal dentro de la carpeta del proyecto:

```bash
npm run dev
```

Luego abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 6. Crear tu primera cuenta

Cuando abras la app verás una pantalla de autenticación.

- Haz clic en **"Crear cuenta"** e ingresa tu correo y contraseña.
- Supabase enviará un correo de confirmación — **debes confirmarlo** antes de poder iniciar sesión.
- Una vez confirmado, inicia sesión y tus datos quedarán guardados en la nube.

> **Nota:** Puedes desactivar la confirmación de correo en Supabase Dashboard → **Authentication** → **Providers** → **Email** → desactiva "Confirm email" si quieres que el registro sea inmediato durante desarrollo.

---

## Estructura de la base de datos

| Tabla | Descripción |
|-------|-------------|
| `tasks` | Una fila por tarea. La columna `data` guarda el objeto completo de la tarea en JSON. |
| `user_data` | Una fila por usuario. Columnas `tags` (array de etiquetas) y `preferences` (objeto con título y otras preferencias). |

Ambas tablas tienen **Row Level Security (RLS)** activado: Supabase garantiza automáticamente que cada usuario solo pueda leer y escribir sus propios datos.
