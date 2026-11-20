import test from 'node:test'
import assert from 'node:assert/strict'
import { esHorarioRefrigerio } from '../lib/refrigerio.ts'

test('el refrigerio empieza a las 13:00 y termina a las 14:00', () => {
  assert.equal(esHorarioRefrigerio(new Date(2026, 10, 20, 12, 59, 59)), false)
  assert.equal(esHorarioRefrigerio(new Date(2026, 10, 20, 13, 0, 0)), true)
  assert.equal(esHorarioRefrigerio(new Date(2026, 10, 20, 13, 59, 59)), true)
  assert.equal(esHorarioRefrigerio(new Date(2026, 10, 20, 14, 0, 0)), false)
})
