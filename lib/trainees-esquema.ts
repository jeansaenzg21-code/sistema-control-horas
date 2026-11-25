import type { RowDataPacket } from 'mysql2/promise'
import pool from './db'

export const CONDICION_TRAINEE = 'AND (u.trainee_vence IS NULL OR u.trainee_vence >= DATE(UTC_TIMESTAMP() - INTERVAL 5 HOUR))'

let esquema: Promise<boolean> | undefined
let revalidarEn = 0

export function tieneColumnasTrainee(): Promise<boolean> {
  if (!esquema || Date.now() >= revalidarEn) {
    revalidarEn = Infinity
    esquema = pool.query<(RowDataPacket & { total: number })[]>(
      "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME IN ('trainee_inicio', 'trainee_vence')",
    ).then(([filas]) => {
      const total = Number(filas[0]?.total)
      if (total === 1) throw new Error('La migración de trainees está incompleta.')
      if (total === 0) revalidarEn = Date.now() + 30_000
      return total === 2
    }).catch((fallo) => {
      esquema = undefined
      throw fallo
    })
  }
  return esquema
}
