import test from 'node:test'
import assert from 'node:assert/strict'
import { cruzaRefrigerio, esHorarioRefrigerio } from '../lib/refrigerio.ts'

test('el refrigerio empieza a las 13:00 y termina a las 14:00', () => {
  assert.equal(esHorarioRefrigerio(new Date('2026-11-20T17:59:59Z')), false)
  assert.equal(esHorarioRefrigerio(new Date('2026-11-20T18:00:00Z')), true)
  assert.equal(esHorarioRefrigerio(new Date('2026-11-20T18:59:59Z')), true)
  assert.equal(esHorarioRefrigerio(new Date('2026-11-20T19:00:00Z')), false)
})

test('los bloques no pueden incluir ni un minuto de refrigerio, incluso si se anotan después', () => {
  const intervalo = (inicio, fin) => cruzaRefrigerio(new Date(inicio), new Date(fin))
  assert.equal(intervalo('2026-11-20T17:00:00Z', '2026-11-20T18:00:00Z'), false)
  assert.equal(intervalo('2026-11-20T17:59:00Z', '2026-11-20T18:01:00Z'), true)
  assert.equal(intervalo('2026-11-20T18:30:00Z', '2026-11-20T18:45:00Z'), true)
  assert.equal(intervalo('2026-11-20T18:59:00Z', '2026-11-20T19:01:00Z'), true)
  assert.equal(intervalo('2026-11-20T19:00:00Z', '2026-11-20T20:00:00Z'), false)
  assert.equal(intervalo('2026-11-20T19:00:00Z', '2026-11-21T17:00:00Z'), false)
  assert.equal(intervalo('2026-11-20T19:00:00Z', '2026-11-21T18:01:00Z'), true)
})
