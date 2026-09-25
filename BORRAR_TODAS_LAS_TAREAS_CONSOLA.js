/*
  BORRAR TODAS LAS TAREAS DE LA CUENTA ACTUAL EN PLANNER7

  ADVERTENCIA:
  - Borra TODAS las filas de la tabla tasks pertenecientes al usuario conectado.
  - No borra etiquetas, preferencias, objetivos ni notas.
  - Antes de borrar descarga un respaldo JSON completo.
  - Exige dos confirmaciones, incluida la frase exacta BORRAR TODO.

  Uso:
  1. Abre https://planner7.vercel.app e inicia sesión.
  2. Abre las herramientas de desarrollador (F12) y entra en Console.
  3. Copia y pega este archivo completo y presiona Enter.
*/

(async () => {
  'use strict';

  const APP_HOST = 'planner7.vercel.app';
  const CONFIRMATION_PHRASE = 'BORRAR TODO';
  const PAGE_SIZE = 1000;
  const LINE_BREAK = String.fromCharCode(10);
  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    phase: 'initializing',
    authenticated: false,
    userIdSuffix: null,
    tasksFound: null,
    tasksDeleted: null,
    tasksRemaining: null,
    backupFilename: null,
    backupDownloaded: false,
    error: null
  };

  const serializeError = (error) => {
    if (!error) return null;
    return {
      name: error.name || null,
      message: error.message || String(error),
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null,
      status: error.status || error.statusCode || null
    };
  };

  const finishReport = (status, error) => {
    report.status = status;
    report.finishedAt = new Date().toISOString();
    report.error = serializeError(error);
    const snapshot = JSON.parse(JSON.stringify(report));
    globalThis.PLANNER7_DELETE_REPORT = snapshot;
    console.group('Informe · Borrar todas las tareas');
    console.log(snapshot);
    console.log('Puedes escribir PLANNER7_DELETE_REPORT para volver a ver este informe.');
    console.groupEnd();
    try {
      localStorage.setItem('planner7_last_delete_report', JSON.stringify(snapshot));
    } catch (storageError) {
      console.warn('No se pudo guardar el informe local:', storageError);
    }
  };

  const setPhase = (phase) => {
    report.phase = phase;
    console.log('[Planner7]', phase);
  };

  const downloadJson = (filename, value) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const loadAllTaskRows = async (userId) => {
    const rows = [];
    let from = 0;

    while (true) {
      const result = await sb.from('tasks')
        .select('id,user_id,data,created_at,updated_at')
        .eq('user_id', userId)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (result.error) throw result.error;
      const page = result.data || [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return rows;
  };

  try {
    setPhase('checking-host');
    if (location.hostname !== APP_HOST) {
      throw new Error('Ejecuta este script dentro de https://' + APP_HOST + '.');
    }

    setPhase('checking-app-client');
    if (typeof sb === 'undefined' || !sb || !sb.auth) {
      throw new Error('Planner7 todavía no está listo: no se encontró el cliente Supabase.');
    }

    setPhase('reading-session');
    const authResult = await sb.auth.getUser();
    const user = authResult && authResult.data ? authResult.data.user : null;
    if (authResult.error) throw authResult.error;
    if (!user) throw new Error('No hay una sesión iniciada en Planner7.');

    report.authenticated = true;
    report.userIdSuffix = String(user.id).slice(-6);

    setPhase('reading-all-tasks');
    const taskRows = await loadAllTaskRows(user.id);
    report.tasksFound = taskRows.length;

    if (!taskRows.length) {
      report.tasksDeleted = 0;
      report.tasksRemaining = 0;
      finishReport('nothing-to-delete', null);
      alert('La cuenta actual no tiene tareas. No se realizó ningún cambio.');
      return;
    }

    console.table(taskRows.slice(0, 100).map((row) => ({
      fecha: row.data && row.data.date ? row.data.date : 'Sin fecha',
      tarea: row.data && row.data.title ? row.data.title : 'Sin título',
      id: row.id
    })));
    if (taskRows.length > 100) {
      console.log('La vista previa muestra 100 de ' + taskRows.length + ' tareas.');
    }

    const firstConfirmation = confirm(
      'Se encontraron ' + taskRows.length + ' tareas en la cuenta actual.' +
      LINE_BREAK + LINE_BREAK +
      'Se borrarán TODAS, no solamente las del viaje.' +
      LINE_BREAK +
      'Las etiquetas, preferencias, objetivos y notas se conservarán.' +
      LINE_BREAK + LINE_BREAK +
      'Antes se descargará un respaldo JSON.' +
      LINE_BREAK + LINE_BREAK +
      '¿Deseas continuar?'
    );

    if (!firstConfirmation) {
      finishReport('cancelled', null);
      console.info('Operación cancelada. No se borró ninguna tarea.');
      return;
    }

    const typedConfirmation = prompt(
      'Esta acción borrará ' + taskRows.length + ' tareas de la nube.' +
      LINE_BREAK +
      'Escribe exactamente ' + CONFIRMATION_PHRASE + ' para confirmar:'
    );

    if (typedConfirmation !== CONFIRMATION_PHRASE) {
      finishReport('cancelled', null);
      alert('La frase no coincide. No se borró ninguna tarea.');
      return;
    }

    setPhase('creating-backup');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = 'planner7-respaldo-antes-de-borrar-' + stamp + '.json';
    const backup = {
      meta: {
        app: 'Planner7',
        reason: 'Respaldo anterior a borrar todas las tareas',
        exportedAt: new Date().toISOString(),
        taskCount: taskRows.length,
        userIdSuffix: report.userIdSuffix
      },
      tasks: taskRows
    };

    downloadJson(backupFilename, backup);
    report.backupFilename = backupFilename;
    report.backupDownloaded = true;

    try {
      localStorage.setItem(
        'planner7_backup_before_delete_all_' + Date.now(),
        JSON.stringify(backup)
      );
    } catch (backupStorageError) {
      console.warn('El respaldo se descargó, pero no cupo una segunda copia en localStorage.', backupStorageError);
    }

    const backupConfirmation = confirm(
      'Se preparó el respaldo "' + backupFilename + '".' +
      LINE_BREAK + LINE_BREAK +
      'Comprueba que la descarga aparezca en tu navegador.' +
      LINE_BREAK +
      '¿Confirmas ahora el borrado definitivo de ' + taskRows.length + ' tareas?'
    );

    if (!backupConfirmation) {
      finishReport('cancelled-after-backup', null);
      alert('Operación cancelada después del respaldo. No se borró ninguna tarea.');
      return;
    }

    setPhase('deleting-cloud-tasks');
    const deleteResult = await sb.from('tasks')
      .delete()
      .eq('user_id', user.id);
    if (deleteResult.error) throw deleteResult.error;

    setPhase('verifying-cloud-is-empty');
    const verificationResult = await sb.from('tasks')
      .select('id')
      .eq('user_id', user.id);
    if (verificationResult.error) throw verificationResult.error;

    const remainingRows = verificationResult.data || [];
    report.tasksRemaining = remainingRows.length;
    report.tasksDeleted = taskRows.length - remainingRows.length;

    if (remainingRows.length) {
      const verificationError = new Error(
        'El borrado terminó, pero aún quedan ' + remainingRows.length + ' tareas en Supabase.'
      );
      verificationError.code = 'DELETE_VERIFICATION_FAILED';
      throw verificationError;
    }

    setPhase('clearing-local-task-cache');
    try {
      localStorage.setItem('tasks_cache_' + user.id, '[]');
      localStorage.setItem('tasks_pending_sync_' + user.id, 'false');
      localStorage.setItem('tasks_synced_snapshot_' + user.id, '{}');
    } catch (cacheError) {
      console.warn('La nube quedó vacía, pero no se pudo limpiar toda la caché local.', cacheError);
    }

    setPhase('completed');
    finishReport('success', null);
    alert(
      'Borrado completado.' + LINE_BREAK +
      'Tareas eliminadas: ' + report.tasksDeleted + '.' + LINE_BREAK +
      'Tareas restantes en Supabase: 0.' + LINE_BREAK +
      'Planner7 se recargará.'
    );
    location.reload();
  } catch (error) {
    const failedPhase = report.phase;
    report.phase = 'failed';
    finishReport('failed-at-' + failedPhase, error);
    console.error('No se pudo completar el borrado:', error);
    alert(
      'No se pudo completar el borrado.' + LINE_BREAK +
      'Fase: ' + failedPhase + '.' + LINE_BREAK +
      'Detalle: ' + (error && error.message ? error.message : String(error)) +
      LINE_BREAK +
      'Escribe PLANNER7_DELETE_REPORT en la consola para ver el informe.'
    );
  }
})();
