import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarRegistrosDia } from '../lib/cumplimiento.ts'

test('las horas cerradas cuentan aunque falte cliente o clasificación', () => {
  const dia = evaluarRegistrosDia([{
    cliente_id: null,
    descripcion: 'Auditoría',
    fin: '2026-11-20T12:00:00',
    facturable: null,
    duracion_segundos: 7200,
    pausa_segundos: 0,
  }])
  assert.deepEqual(dia, { reportado: true, incompleto: true })
})

test('una actividad abierta o sin tiempo efectivo no cubre el día', () => {
  const base = { cliente_id: 1, descripcion: 'Auditoría', facturable: false }
  assert.deepEqual(evaluarRegistrosDia([{ ...base, fin: null, duracion_segundos: 7200, pausa_segundos: 0 }]),
    { reportado: false, incompleto: true })
  assert.deepEqual(evaluarRegistrosDia([{ ...base, fin: '2026-11-20T14:00:00', duracion_segundos: 3600, pausa_segundos: 3600 }]),
    { reportado: false, incompleto: true })
})

test('un día con un registro completo y otro incompleto conserva sus horas', () => {
  const base = { cliente_id: 1, descripcion: 'Auditoría', facturable: false, duracion_segundos: 3600, pausa_segundos: 0 }
  assert.deepEqual(evaluarRegistrosDia([
    { ...base, fin: '2026-11-20T10:00:00' },
    { ...base, fin: null },
  ]), { reportado: true, incompleto: true })
})
