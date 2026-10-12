const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app-8-habitos.js'), 'utf8');
const start = source.indexOf('  function habitChanges(');
const end = source.indexOf('  function cleanHabitData(', start);
const changes = vm.runInNewContext(source.slice(start, end) + '\nhabitChanges;');
function apply(data, changes) {
  data = structuredClone(data);
  for (const change of changes) {
    let parent = data;
    for (const key of change.path.slice(0, -1)) parent = parent[key];
    const key = change.path.at(-1);
    if (change.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1); else delete parent[key];
    } else if (change.op === 'insert') parent.splice(Number(key), 0, structuredClone(change.value));
    else parent[key] = structuredClone(change.value);
  }
  return data;
}
const block = id => ({ id, startDate: '2026-10-12', endDate: null, habits: [null, null, null, null, null, null, null], records: {} });
const before = { version: 2, blocks: [block('current'), block('older')], hideEmptyDays: false };
for (let day = 0; day < 1000; day++) for (let habit = 0; habit < 7; habit++) before.blocks[1].records[`${day}:habit-${habit}`] = 'completed';
const after = structuredClone(before);
after.blocks[0].records['2026-10-12:habit-1'] = 'completed';
const patch = changes(before, after);
assert.equal(patch.length, 1);
assert.deepEqual(apply(before, patch), after);
const fullBytes = Buffer.byteLength(JSON.stringify(after));
const patchBytes = Buffer.byteLength(JSON.stringify(patch));
assert(patchBytes < fullBytes / 100, 'Una marca no reenvía los años anteriores');
const fresh = { version: 2, blocks: [], hideEmptyDays: false };
assert.deepEqual(apply(fresh, changes(fresh, before)), before);
for (const action of ['insert', 'remove', 'reorder', 'habit', 'preference', 'undo']) {
  const next = structuredClone(before);
  if (action === 'insert') next.blocks.unshift(block('new'));
  if (action === 'remove') next.blocks.shift();
  if (action === 'reorder') next.blocks.reverse();
  if (action === 'habit') next.blocks[0].habits[0] = { id: 'habit', name: 'Leer', icon: 'book.svg' };
  if (action === 'preference') next.hideEmptyDays = true;
  if (action === 'undo') delete next.blocks[1].records['0:habit-0'];
  const patch = changes(before, next);
  assert.deepEqual(apply(before, patch), next, action);
  if (action === 'insert' || action === 'remove') assert(Buffer.byteLength(JSON.stringify(patch)) < 500, 'Los registros antiguos no se reenvían');
}
console.log(`OK: diferencias, registros, hábitos, preferencias y borrados. Marca: ${patchBytes} bytes frente a ${fullBytes} bytes de historial.`);
