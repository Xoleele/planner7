# Habit Tracker

Prototipo independiente para experimentar antes de integrarlo en Planner7.

Desde esta carpeta, ejecutar `npm run dev` y abrir http://127.0.0.1:3011.
También se puede abrir `index.html` directamente.

La ventana muestra seis hábitos y los últimos 31 días, comenzando por hoy.
Cada clic o activación con teclado alterna entre verde con tick (completado),
rojo con X (no realizado) y gris (sin registrar). Se guardan en el navegador bajo
la clave `planner7.habit-tracker.experiment.v1`. No usa Supabase ni modifica
los datos de Planner7. Las flechas del teclado permiten recorrer la cuadrícula.

Los estilos y los iconos de reloj, edición, estadísticas y cierre provienen
de Planner7. Los nuevos iconos siguen su mismo trazo SVG. Todos los recursos
se encuentran dentro de esta carpeta, sin dependencias ni compilación.
