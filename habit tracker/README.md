# Habit Tracker

Prototipo independiente para experimentar antes de integrarlo en Planner7.

Desde esta carpeta, ejecutar `npm run dev` y abrir http://127.0.0.1:3011.
También se puede abrir `index.html` directamente.

La ventana muestra seis espacios para hábitos y los últimos 31 días, comenzando por hoy.
Cada clic o activación con teclado alterna entre verde con tick (completado),
rojo con X (no realizado) y gris (sin registrar). Se guardan en el navegador bajo
la clave `planner7.habit-tracker.experiment.v1`. No usa Supabase ni modifica
los datos de Planner7. Las flechas del teclado permiten recorrer la cuadrícula.

Al pulsar el icono de un hábito se puede editar su nombre y elegir entre los
seis iconos disponibles. Eliminarlo borra sus registros, desplaza los demás
hábitos hacia la izquierda y deja un espacio vacío al final. El botón + de un
espacio vacío permite crear un hábito nuevo, sin registros heredados.
La configuración se guarda bajo `planner7.habit-tracker.habits.v1`.
Mantener presionado un icono o casilla durante 450 ms permite arrastrar toda
la columna para reordenar los hábitos, conservando sus registros. Los espacios
vacíos permanecen al final. Escape cancela el arrastre.

Los estilos y los iconos de reloj, edición, estadísticas y cierre provienen
de Planner7. Los nuevos iconos siguen su mismo trazo SVG. Todos los recursos
se encuentran dentro de esta carpeta, sin dependencias ni compilación.
