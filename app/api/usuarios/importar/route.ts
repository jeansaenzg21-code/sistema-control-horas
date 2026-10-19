import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { NOMBRES_DIAS } from '@/lib/dias'
import { horarioValido } from '@/lib/horarios'
import { clasificarRolPorCargo, tipoCargo } from '@/lib/cargos'
import { hashearPassword, validarPassword } from '@/lib/validacion-password'

interface FilaImportacion {
  nombre: string
  correo?: string
  usuario: string
  contrasena: string
  cargo?: string
  especialidad?: string
  area_id?: number
  area_nombre?: string
  horario?: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }>
  fila_archivo?: number
}

function normalizarArea(valor: string): string {
  const normalizada = valor
    .replace(/\uFFFD/g, 'I')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
  return normalizada === 'IMPUESTOSYLEGAL' ? 'LEGAL' : normalizada
}

function cargoDeFila(fila: FilaImportacion): string {
  return String(fila.cargo ?? fila.especialidad ?? '').trim()
}

async function tieneColumnaCargo(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'cargo'`
  )
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0
}

async function tieneColumnaEspecialidad(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'especialidad'`
  )
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0
}

async function tieneColumnaJefeArea(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'areas' AND COLUMN_NAME = 'jefe_id'`
  )
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0
}

async function soportaRolJefeArea(): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'rol' LIMIT 1`
  )
  const fila = (rows as Array<Record<string, unknown>>)[0]
  const tipo = String(fila?.COLUMN_TYPE ?? fila?.column_type ?? '')
  return !tipo || !tipo.toUpperCase().startsWith('ENUM(') || tipo.toUpperCase().includes('JEFE_AREA')
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || !esAdmin(user)) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    const context = await getEmpresaContext(user)
    if (!context.activa) return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const areaIdCrudo = body.area_id
    const areaId = areaIdCrudo === undefined || areaIdCrudo === null || areaIdCrudo === '' ? null : Number(areaIdCrudo)
    if (areaId !== null && (!Number.isInteger(areaId) || areaId <= 0)) {
      return NextResponse.json({ error: 'La división de destino no es válida.' }, { status: 400 })
    }

    const filas = Array.isArray(body.filas) ? body.filas as FilaImportacion[] : []
    if (filas.length === 0) return NextResponse.json({ error: 'El archivo no contiene filas para importar.' }, { status: 400 })
    if (filas.length > 500) return NextResponse.json({ error: 'El archivo supera el máximo de 500 filas por importación.' }, { status: 400 })

    const [areaRows] = await pool.query(
      'SELECT id, nombre FROM areas WHERE empresa_id = ? AND activo = TRUE',
      [context.activa.id]
    )
    const areasBase = areaRows as Array<{ id: number; nombre: string }>
    if (areasBase.length === 0) return NextResponse.json({ error: 'No hay divisiones activas para asignar al personal.' }, { status: 400 })
    const jefeColumn = await tieneColumnaJefeArea()
    let areasConJefe: Array<{ id: number; jefe_id: number | null }> = []
    if (jefeColumn) {
      const [rowsJefe] = await pool.query('SELECT id, jefe_id FROM areas WHERE empresa_id = ? AND activo = TRUE', [context.activa.id])
      areasConJefe = rowsJefe as Array<{ id: number; jefe_id: number | null }>
    }
    const jefesPorId = new Map(areasConJefe.map((area) => [area.id, area.jefe_id]))
    const areas = areasBase.map((area) => ({ ...area, jefe_id: jefesPorId.get(area.id) ?? null }))
    const areasPorNombre = new Map(areas.map((area) => [normalizarArea(area.nombre), area.id]))
    const areasPorId = new Map(areas.map((area) => [area.id, area]))
    if (areaId !== null && !areasPorId.has(areaId)) return NextResponse.json({ error: 'La división de destino no existe o está inactiva.' }, { status: 400 })
    if (areaId === null && !filas.some((fila) => fila.area_nombre?.trim())) return NextResponse.json({ error: 'Debes indicar la división de destino o incluir la columna División.' }, { status: 400 })

    const [cargoColumn, especialidadColumn, rolJefe] = await Promise.all([
      tieneColumnaCargo(),
      tieneColumnaEspecialidad(),
      soportaRolJefeArea(),
    ])
    if (!cargoColumn && !especialidadColumn) {
      return NextResponse.json({ error: 'Falta preparar la base de datos. Ejecuta sql/cargos.sql.' }, { status: 503 })
    }

    const areaIdDeFila = (fila: FilaImportacion): number | null => {
      if (areaId !== null) return areaId
      if (fila.area_nombre) return areasPorNombre.get(normalizarArea(String(fila.area_nombre))) ?? null
      if (fila.area_id !== undefined && fila.area_id !== null) return Number(fila.area_id)
      return null
    }

    const jefesPorArea = new Map(areas.map((area) => [area.id, area.jefe_id != null]))
    const tiposPorArea = new Map<number, { jefe: boolean; gerente: boolean }>()
    for (const fila of filas) {
      const filaAreaId = areaIdDeFila(fila)
      if (filaAreaId == null || !areasPorId.has(filaAreaId)) continue
      const info = tiposPorArea.get(filaAreaId) || { jefe: false, gerente: false }
      const tipo = tipoCargo(cargoDeFila(fila))
      if (tipo === 'JEFE') info.jefe = true
      if (tipo === 'GERENTE') info.gerente = true
      tiposPorArea.set(filaAreaId, info)
    }

    const diaValido = new Set(NOMBRES_DIAS.map((dia) => dia.dia_semana))
    const usuariosVistos = new Set<string>()
    const creados: number[] = []
    const errores: Array<{ fila: number; error: string }> = []
    let omitidos = 0
    let actualizados = 0
    let jefesAsignados = 0
    let supervisoresAsignados = 0

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]
      const numeroFila = Number(f.fila_archivo)
      const numFila = Number.isInteger(numeroFila) && numeroFila > 0 ? numeroFila : i + 1
      try {
        const nombre = String(f.nombre ?? '').trim()
        const usuario = String(f.usuario ?? '').trim()
        const contrasena = String(f.contrasena ?? '')
        const correo = String(f.correo ?? '').trim()
        const cargo = cargoDeFila(f)

        if (!nombre || !usuario) { errores.push({ fila: numFila, error: 'Falta el nombre o el usuario.' }); continue }
        const validacion = validarPassword(contrasena)
        if (!validacion.ok) { errores.push({ fila: numFila, error: validacion.error || 'La contraseña no cumple la política.' }); continue }

        const clave = usuario.toLowerCase()
        if (usuariosVistos.has(clave)) { omitidos++; continue }
        usuariosVistos.add(clave)
        const areaIdFila = areaIdDeFila(f)
        if (areaIdFila == null || !areasPorId.has(areaIdFila)) { errores.push({ fila: numFila, error: 'No se pudo determinar una división válida.' }); continue }
        const tipo = tipoCargo(cargo)
        const infoArea = tiposPorArea.get(areaIdFila) || { jefe: false, gerente: false }
        const areaYaTieneJefe = jefesPorArea.get(areaIdFila) === true
        const areaTieneJefeEnImportacion = tipo !== 'JEFE' && infoArea.jefe
        const rol = clasificarRolPorCargo(cargo, { areaYaTieneJefe, areaTieneJefeEnImportacion })
        if (rol === 'JEFE_AREA' && (!jefeColumn || !rolJefe)) { errores.push({ fila: numFila, error: 'Aplica las migraciones de jefe de área antes de importar cargos de jefe.' }); continue }

        const [existentes] = await pool.query(
          'SELECT id, rol, area_id FROM usuarios WHERE usuario = ? OR (? <> \'\' AND correo = ?) LIMIT 1',
          [usuario, correo, correo]
        )
        const existente = (existentes as Array<{ id: number; rol: string; area_id: number | null }>)[0]
        if (existente) {
          try {
            const rolActual = String(existente.rol)
            const puedeActualizarRol = rolActual !== 'ADMINISTRACION'
            const nuevoRol = puedeActualizarRol && rol === 'JEFE_AREA' ? 'JEFE_AREA' : puedeActualizarRol && rol === 'SUPERVISOR' && rolActual === 'PERSONAL' ? 'SUPERVISOR' : rolActual
            const columnasActualizacion = [cargoColumn ? 'cargo' : 'especialidad', 'area_id']
            const valoresActualizacion: Array<string | number | null> = [cargo || null, areaIdFila]
            if (nuevoRol !== rolActual) { columnasActualizacion.push('rol'); valoresActualizacion.push(nuevoRol) }
            const conn = await pool.getConnection()
            try {
              await conn.beginTransaction()
              await conn.query(`UPDATE usuarios SET ${columnasActualizacion.map((columna) => `${columna} = ?`).join(', ')} WHERE id = ?`, [...valoresActualizacion, existente.id])
              if (nuevoRol === 'JEFE_AREA' && jefeColumn) await conn.query('UPDATE areas SET jefe_id = ? WHERE id = ? AND empresa_id = ?', [existente.id, areaIdFila, context.activa.id])
              await conn.commit()
            } catch (error) {
              await conn.rollback()
              throw error
            } finally { conn.release() }
            actualizados++
            if (nuevoRol === 'JEFE_AREA') { jefesAsignados++; jefesPorArea.set(areaIdFila, true) } else if (nuevoRol === 'SUPERVISOR') supervisoresAsignados++
          } catch {
            errores.push({ fila: numFila, error: 'El usuario existe, pero no se pudo actualizar su cargo.' })
          }
          continue
        }

        const horario: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }> = []
        let horarioOk = true
        if (Array.isArray(f.horario)) {
          const vistosDias = new Set<number>()
          for (const h of f.horario) {
            const diaSemana = Number(h.dia_semana)
            const horaInicio = String(h.hora_inicio ?? '')
            const horaFin = String(h.hora_fin ?? '')
            if (!diaValido.has(diaSemana)) { errores.push({ fila: numFila, error: `Día de la semana inválido (${diaSemana}).` }); horarioOk = false; break }
            if (vistosDias.has(diaSemana)) { errores.push({ fila: numFila, error: `Día de la semana repetido (${diaSemana}).` }); horarioOk = false; break }
            vistosDias.add(diaSemana)
            if (!horarioValido(horaInicio, horaFin)) { errores.push({ fila: numFila, error: 'Horario inválido: usa HH:MM y que la salida sea mayor a la entrada.' }); horarioOk = false; break }
            horario.push({ dia_semana: diaSemana, hora_inicio: horaInicio, hora_fin: horaFin })
          }
        }
        if (!horarioOk) continue

        const hash = await hashearPassword(contrasena)
        const conn = await pool.getConnection()
        try {
          await conn.beginTransaction()
          const columnas = ['nombre', 'correo', 'usuario', 'password_hash', 'rol', 'area_id', cargoColumn ? 'cargo' : 'especialidad']
          const valores: Array<string | number | null> = [nombre, correo, usuario, hash, rol, areaIdFila, cargo || null]
          if (especialidadColumn && cargoColumn) { columnas.push('especialidad'); valores.push(null) }
          const placeholders = columnas.map(() => '?').join(', ')
          const [result] = await conn.query(
            `INSERT INTO usuarios (${columnas.join(', ')}) VALUES (${placeholders})`,
            valores
          )
          const id = Number((result as { insertId: number }).insertId)
          if (rol === 'JEFE_AREA' && jefeColumn) await conn.query('UPDATE areas SET jefe_id = ? WHERE id = ? AND empresa_id = ?', [id, areaIdFila, context.activa.id])
          for (const h of horario) await conn.query('INSERT INTO horarios (usuario_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)', [id, h.dia_semana, h.hora_inicio, h.hora_fin])
          await conn.commit()
          creados.push(id)
          if (rol === 'JEFE_AREA') { jefesAsignados++; jefesPorArea.set(areaIdFila, true) } else if (rol === 'SUPERVISOR') supervisoresAsignados++
        } catch (error) {
          await conn.rollback()
          const code = (error as { code?: string }).code
          if (code === 'ER_DUP_ENTRY') omitidos++
          else errores.push({ fila: numFila, error: 'No se pudo insertar el usuario.' })
        } finally { conn.release() }
      } catch { errores.push({ fila: numFila, error: 'Error inesperado al procesar la fila.' }) }
    }

    return NextResponse.json({ ok: true, creados: creados.length, actualizados, omitidos, jefes: jefesAsignados, supervisores: supervisoresAsignados, errores })
  } catch (error) {
    console.error('Error en importación de usuarios:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
