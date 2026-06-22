/* ═══════════════════════════════════════════════════════════════════════
   RESPALDO DE DATOS — planner7  (Supabase: tasks + user_data)
   ───────────────────────────────────────────────────────────────────────
   CÓMO USAR:
   1. Abre tu app en el navegador y ASEGÚRATE DE HABER INICIADO SESIÓN.
   2. Abre la consola del navegador (F12 → pestaña "Console").
   3. Pega TODO este archivo y presiona Enter.

   QUÉ HACE:
   - Lee todas tus tareas (tabla `tasks`) y tus etiquetas/preferencias
     (tabla `user_data`) usando tu sesión autenticada.
   - Descarga 2 archivos:
       a) planner7-respaldo-FECHA.json   → tus datos crudos (por si acaso).
       b) RESTAURAR-planner7-FECHA.js     → un script LISTO para pegar en la
          consola que devuelve tus datos a este momento exacto.
   ═══════════════════════════════════════════════════════════════════════ */
(async () => {
  try {
    if (typeof sb === 'undefined' || !sb?.auth) {
      alert('No encuentro el cliente Supabase (sb). Abre la app planner7 y vuelve a pegar el script.');
      return;
    }

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      alert('No hay sesión iniciada. Inicia sesión en la app y vuelve a pegar el script.');
      return;
    }

    // --- Leer datos ---
    const { data: tasks, error: tErr } = await sb
      .from('tasks').select('*').eq('user_id', user.id);
    if (tErr) throw tErr;

    const { data: userData, error: uErr } = await sb
      .from('user_data').select('*').eq('user_id', user.id).maybeSingle();
    if (uErr) throw uErr;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const backup = {
      meta: {
        app: 'planner7',
        user_id: user.id,
        user_email: user.email,
        exported_at: new Date().toISOString()
      },
      tasks: tasks || [],
      user_data: userData || null
    };

    // --- a) Descargar JSON crudo ---
    const dl = (filename, text, mime) => {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    dl(`planner7-respaldo-${stamp}.json`,
       JSON.stringify(backup, null, 2),
       'application/json');

    // --- b) Generar script de restauración autocontenido ---
    // Reconstruye SOLO las columnas que el cliente puede escribir bajo RLS:
    //   tasks      → id, user_id, data
    //   user_data  → user_id, tags, preferences
    const tasksRows = (tasks || []).map(t => ({
      id: t.id, user_id: t.user_id, data: t.data
    }));

    const ud = userData
      ? { user_id: userData.user_id,
          tags: userData.tags ?? [],
          preferences: userData.preferences ?? {} }
      : null;

    const restorePayload = JSON.stringify({ tasksRows, ud }, null, 2);

    const restoreScript =
`/* ═══════════════════════════════════════════════════════════════════════
   RESTAURAR DATOS — planner7
   Snapshot tomado: ${backup.meta.exported_at}
   Usuario: ${backup.meta.user_email}
   ───────────────────────────────────────────────────────────────────────
   CÓMO USAR:
   1. Abre la app planner7 e INICIA SESIÓN con la MISMA cuenta.
   2. Abre la consola (F12 → Console).
   3. Pega TODO este archivo y presiona Enter. Confirma cuando te pregunte.

   QUÉ HACE:
   - Restaura (upsert) cada tarea y tus etiquetas/preferencias a como
     estaban en el snapshot de arriba.
   - OPCIONAL: borra las tareas creadas DESPUÉS del snapshot (las que no
     existían). Te preguntará antes de borrar nada.
   ═══════════════════════════════════════════════════════════════════════ */
(async () => {
  const SNAPSHOT = ${restorePayload};

  if (typeof sb === 'undefined' || !sb?.auth) {
    alert('No encuentro el cliente Supabase (sb). Abre la app planner7 primero.');
    return;
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { alert('Inicia sesión primero.'); return; }
  if (user.id !== SNAPSHOT.tasksRows?.[0]?.user_id && user.id !== SNAPSHOT.ud?.user_id) {
    const seguir = confirm('⚠️ El usuario actual NO coincide con el del respaldo. ¿Restaurar de todos modos? (los datos se escribirán bajo TU user_id)');
    if (!seguir) return;
  }

  if (!confirm('Esto sobrescribirá tus tareas y preferencias actuales con el respaldo. ¿Continuar?')) return;

  // Reasignar al user_id actual por seguridad (RLS lo exige igual)
  const tasksRows = (SNAPSHOT.tasksRows || []).map(t => ({ id: t.id, user_id: user.id, data: t.data }));

  // 1) Restaurar tareas
  if (tasksRows.length) {
    const { error } = await sb.from('tasks').upsert(tasksRows, { onConflict: 'id' });
    if (error) { console.error(error); alert('Error restaurando tareas: ' + error.message); return; }
  }
  console.log('✓ Tareas restauradas:', tasksRows.length);

  // 2) Restaurar user_data
  if (SNAPSHOT.ud) {
    const { error } = await sb.from('user_data').upsert(
      { user_id: user.id, tags: SNAPSHOT.ud.tags, preferences: SNAPSHOT.ud.preferences },
      { onConflict: 'user_id' });
    if (error) { console.error(error); alert('Error restaurando preferencias: ' + error.message); return; }
    console.log('✓ Etiquetas y preferencias restauradas');
  }

  // 3) (Opcional) borrar tareas creadas después del snapshot
  const idsSnapshot = new Set(tasksRows.map(t => t.id));
  const { data: actuales } = await sb.from('tasks').select('id').eq('user_id', user.id);
  const extras = (actuales || []).map(r => r.id).filter(id => !idsSnapshot.has(id));
  if (extras.length) {
    if (confirm('Hay ' + extras.length + ' tarea(s) creada(s) DESPUÉS del respaldo. ¿Borrarlas para dejar todo exactamente como estaba?')) {
      const { error } = await sb.from('tasks').delete().in('id', extras).eq('user_id', user.id);
      if (error) { console.error(error); alert('Error borrando tareas extra: ' + error.message); return; }
      console.log('✓ Tareas posteriores eliminadas:', extras.length);
    }
  }

  alert('✅ Restauración completada. Recarga la página (F5) para ver tus datos.');
})();
`;

    dl(`RESTAURAR-planner7-${stamp}.js`, restoreScript, 'text/javascript');

    console.log('%c✅ Respaldo completado.', 'color:green;font-weight:bold');
    console.log('Tareas respaldadas:', backup.tasks.length);
    console.log('Se descargaron 2 archivos: el JSON crudo y el script RESTAURAR-*.js');
    alert('✅ Respaldo listo. Se descargaron 2 archivos:\n' +
          '• planner7-respaldo-' + stamp + '.json (tus datos)\n' +
          '• RESTAURAR-planner7-' + stamp + '.js (para revertir cambios)\n\n' +
          'Guárdalos en lugar seguro. Tareas respaldadas: ' + backup.tasks.length);
  } catch (e) {
    console.error(e);
    alert('Error durante el respaldo: ' + (e.message || e));
  }
})();
