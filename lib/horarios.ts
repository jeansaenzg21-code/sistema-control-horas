import pool from '@/lib/db'
import { NOMBRES_DIAS } from '@/lib/dias'

export function diaSemanaDeFecha(fecha: Date): number {
  const wd = fecha.getDay() // 0=Dom ... 6=Sáb
  return wd === 0 ? 7 : wd
}

export function esHoraValida(valor: string): boolean {
  if (!/^\d{1,2}:\d{2}$/.test(valor)) return false
  const [h, m] = valor.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

export function enRangoHorario(horaInicio: string, horaFin: string, ahora: Date): boolean {
  const minutos = ahora.getHours() * 60 + ahora.getMinutes()
  return minutos >= aMinutos(horaInicio) && minutos <= aMinutos(horaFin)
}

export interface RangoHorario {
  hora_inicio: string
  hora_fin: string
}

// Horario configurado para el usuario el día de hoy, o null si ese día es libre
// o el usuario no tiene horario configurado (sin restricción).
export async function horarioDeHoy(usuarioId: number, fecha?: Date): Promise<RangoHorario | null> {
  const diaSemana = diaSemanaDeFecha(fecha ?? new Date())
  const [rows] = await pool.query(
    `SELECT CAST(hora_inicio AS CHAR) AS hora_inicio, CAST(hora_fin AS CHAR) AS hora_fin
     FROM horarios
     WHERE usuario_id = ? AND dia_semana = ?`,
    [usuarioId, diaSemana]
  )
  const horarios = rows as RangoHorario[]
  if (horarios.length === 0) return null
  return { hora_inicio: horarios[0].hora_inicio, hora_fin: horarios[0].hora_fin }
}

// Minutos efectivos ya registrados por el usuario hoy (tiempo trabajado real,
// descontando pausas). Solo considera actividades finalizadas y en curso.
export async function minutosAcumuladosHoy(usuarioId: number): Promise<number> {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(
         TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(a.fin, NOW()))
         - COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
                     FROM pausas p WHERE p.actividad_id = a.id), 0)
       ), 0) AS total_segundos
     FROM actividades a
     WHERE a.usuario_id = ? AND DATE(a.inicio) = CURDATE()`,
    [usuarioId]
  )
  const fila = (rows as Array<{ total_segundos: number }>)[0]
  return Math.max(0, Math.round((fila?.total_segundos ?? 0) / 60))
}

// Los rangos de hora deben tener fin > inicio.
export function horarioValido(horaInicio: string, horaFin: string): boolean {
  if (!esHoraValida(horaInicio) || !esHoraValida(horaFin)) return false
  return aMinutos(horaFin) > aMinutos(horaInicio)
}