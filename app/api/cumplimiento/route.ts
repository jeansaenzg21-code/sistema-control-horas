import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getEmpresaContext, getUserFromRequest } from '@/lib/auth'
import { esAdmin } from '@/lib/excepciones'
import { esJefeDeArea, esSocio } from '@/lib/permisos'
import { diasEnMes, formatoFecha } from '@/lib/fechas'
import { datosFaltantesActividad, textoDatosFaltantes } from '@/lib/cumplimiento'
import type {
  CumplimientoReporte,
  DiaCumplimiento,
  DiaMolde,
  EstadoCumplimiento,
  EstadoDia,
} from '@/lib/cumplimiento'

const pad = (n: number) => String(n).padStart(2, '0')

interface RegistroMes {
  id: number
  usuario_id: number
  cliente_id: number | null
  descripcion: string | null
  facturable: unknown
  estado: string
  fin: Date | null
  fecha: string
  cliente_nombre: string | null
  duracion_segundos: number
  pausa_segundos: number
}

interface ValorDia {
  stato: EstadoDia
  etiqueta: string
}

function fechaStr(anio: number, mes: number, dia: number): string {
  return `${anio}-${pad(mes)}-${pad(dia)}`
}

function estadoEtiqueta(stato: EstadoDia): string {
  const mapa: Record<EstadoDia, string> = {
    reportado: '✓',
    pendiente: '·',
    incompleto: '!',
    feriado: 'F',
    vacacion: 'V',
    no_exigible: '—',
  }
  return mapa[stato]
}

function calcularEstado(exigibles: number, cobertura: number, incompletos: number, semanasPendientes: number, reportados: number): EstadoCumplimiento {
  if (exigibles === 0) return 'CUMPLE'
  if (cobertura >= 100 && incompletos === 0 && semanasPendientes === 0) return 'CUMPLE'
  if (reportados > 0) return 'CUMPLE_PARCIAL'
  return 'NO_CUMPLE'
}

function construirObservacion(reportados: number, pendientesDias: number, incompletos: number, semanasPendientes: number): string {
  const partes: string[] = []
  if (reportados === 0) {
    partes.push('No registró horas en el período.')
  } else if (pendientesDias > 0) {
    partes.push(`Faltan ${pendientesDias} día(s) por reportar`)
  }
  if (incompletos > 0) partes.push(`${incompletos} registro(s) incompleto(s)`)
  if (semanasPendientes > 0) partes.push(`No reportó ${semanasPendientes} semana(s)`)
  return partes.join(' · ') || 'Sin observaciones'
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || (!esAdmin(user) && !esJefeDeArea(user) && !esSocio(user))) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
    }
    const context = await getEmpresaContext(user)
    if (!context.activa) {
      return NextResponse.json({ error: 'No hay una empresa activa.' }, { status: 409 })
    }

    const { searchParams } = new URL(request.url)
    const anio = Number(searchParams.get('anio'))
    const mes = Number(searchParams.get('mes'))
    const usuarioIdParam = searchParams.get('usuario_id')
    const clienteIdParam = searchParams.get('cliente_id')
    const desdeParam = searchParams.get('desde')
    const hastaParam = searchParams.get('hasta')

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return NextResponse.json({ error: 'El parámetro anio no es válido.' }, { status: 400 })
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ error: 'El parámetro mes debe estar entre 1 y 12.' }, { status: 400 })
    }
    const prefijoMes = `${anio}-${pad(mes)}-`
    if (desdeParam !== null && !new RegExp(`^${prefijoMes}\\d{2}$`).test(desdeParam)) {
      return NextResponse.json({ error: 'La fecha desde no pertenece al mes consultado.' }, { status: 400 })
    }
    if (hastaParam !== null && !new RegExp(`^${prefijoMes}\\d{2}$`).test(hastaParam)) {
      return NextResponse.json({ error: 'La fecha hasta no pertenece al mes consultado.' }, { status: 400 })
    }

    let usuarioId: number | null = null
    if (usuarioIdParam) {
      usuarioId = Number(usuarioIdParam)
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return NextResponse.json({ error: 'El parámetro usuario_id no es válido.' }, { status: 400 })
      }
    }

    let clienteId: number | null = null
    if (clienteIdParam) {
      clienteId = Number(clienteIdParam)
      if (!Number.isInteger(clienteId) || clienteId <= 0) {
        return NextResponse.json({ error: 'El parámetro cliente_id no es válido.' }, { status: 400 })
      }
    }

    const areaIdParam = searchParams.get('area_id')
    let areaId: number | null = null
    if (areaIdParam) {
      areaId = Number(areaIdParam)
      if (!Number.isInteger(areaId) || areaId <= 0) {
        return NextResponse.json({ error: 'El parámetro de división no es válido.' }, { status: 400 })
      }
    }
    if (esJefeDeArea(user)) {
      if (areaId != null && areaId !== user.area_id) {
        return NextResponse.json({ error: 'Sólo puedes consultar el cumplimiento de tu área.' }, { status: 403 })
      }
      areaId = user.area_id
    }

    // ---- 1. Periodo (mes natural completo, o rango dentro del mes) ----
    const diasDelMes = diasEnMes(anio, mes)
    const diaInicio = desdeParam ? Number(desdeParam.slice(8)) : 1
    const diaFin = hastaParam ? Number(hastaParam.slice(8)) : diasDelMes
    if (!Number.isInteger(diaInicio) || diaInicio < 1 || diaInicio > diasDelMes) {
      return NextResponse.json({ error: 'El día desde no es válido.' }, { status: 400 })
    }
    if (!Number.isInteger(diaFin) || diaFin < 1 || diaFin > diasDelMes) {
      return NextResponse.json({ error: 'El día hasta no es válido.' }, { status: 400 })
    }
    if (diaFin < diaInicio) {
      return NextResponse.json({ error: 'El rango de cumplimiento es inválido.' }, { status: 400 })
    }

    const desde = fechaStr(anio, mes, diaInicio)
    const hasta = fechaStr(anio, mes, diaFin)

    const dias: DiaMolde[] = []
    const semanaPorFechaIso = new Map<string, string>()
    const startsSemana: string[] = []
    for (let dia = diaInicio; dia <= diaFin; dia++) {
      const fecha = fechaStr(anio, mes, dia)
      const dd = new Date(Date.UTC(anio, mes - 1, dia))
      const diaSemana = dd.getUTCDay()
      const inicioSemana = fechaStr(anio, mes, dia - ((diaSemana + 6) % 7))
      semanaPorFechaIso.set(fecha, inicioSemana)
      if (!startsSemana.includes(inicioSemana)) startsSemana.push(inicioSemana)
      dias.push({
        dia,
        fecha,
        dia_semana: diaSemana,
        fin_semana: diaSemana === 0 || diaSemana === 6,
        semana_index: startsSemana.indexOf(inicioSemana),
      })
    }
    const semanas = startsSemana.map((inicio) => {
      const [a, m, d] = inicio.split('-').map(Number)
      const fin = fechaStr(a, m, d + 6)
      return { inicio, fin }
    })

    // ---- 2. Colaboradores (rol PERSONAL, activos) ----
    let queryColab = `SELECT u.id, u.nombre, u.cargo,
        COALESCE(ar.nombre, '') AS area_nombre
       FROM usuarios u
       LEFT JOIN areas ar ON ar.id = u.area_id
       WHERE u.rol = 'PERSONAL' AND u.activo = TRUE AND ar.empresa_id = ?`
    const paramsColab: (string | number)[] = [context.activa.id]

    if (usuarioId) {
      queryColab += ' AND u.id = ?'
      paramsColab.push(usuarioId)
    }
    if (areaId) {
      queryColab += ' AND u.area_id = ?'
      paramsColab.push(areaId)
    }
    queryColab += ' ORDER BY u.nombre'
    const [colabRows] = await pool.query(queryColab, paramsColab)
    const colaboradoresRaw = colabRows as Array<{
      id: number
      nombre: string
      cargo: string | null
      area_nombre: string
    }>

    // ---- 3. Excepciones del periodo ----
    const [excRows] = await pool.query(
      `SELECT e.fecha, e.tipo, e.usuario_id
       FROM excepciones e
       LEFT JOIN usuarios eu ON eu.id = e.usuario_id
       LEFT JOIN areas ea ON ea.id = eu.area_id
       WHERE e.fecha BETWEEN ? AND ? AND (e.usuario_id IS NULL OR ea.empresa_id = ?)`,
      [desde, hasta, context.activa.id]
    )
    const excepciones = excRows as Array<{
      fecha: Date | string
      tipo: 'FERIADO' | 'VACACIONES'
      usuario_id: number | null
    }>
    const feriadosGlobales = new Set<string>()
    const feriadosPorUsuario = new Map<number, Set<string>>()
    const vacacionesPorUsuario = new Map<number, Set<string>>()
    for (const e of excepciones) {
      const f = formatoFecha(e.fecha)
      if (e.tipo === 'FERIADO') {
        if (e.usuario_id == null) {
          feriadosGlobales.add(f)
        } else {
          if (!feriadosPorUsuario.has(e.usuario_id)) feriadosPorUsuario.set(e.usuario_id, new Set())
          feriadosPorUsuario.get(e.usuario_id)!.add(f)
        }
      } else {
        if (e.usuario_id != null) {
          if (!vacacionesPorUsuario.has(e.usuario_id)) vacacionesPorUsuario.set(e.usuario_id, new Set())
          vacacionesPorUsuario.get(e.usuario_id)!.add(f)
        }
      }
    }

    // ---- 4. Registros del periodo ----
    let registrosQuery = `SELECT a.id, a.usuario_id, a.cliente_id, a.descripcion, a.facturable,
        a.estado, a.fin,
        DATE_FORMAT(a.inicio, '%Y-%m-%d') AS fecha,
        c.nombre AS cliente_nombre,
        TIMESTAMPDIFF(SECOND, a.inicio, COALESCE(a.fin, NOW())) AS duracion_segundos,
        COALESCE((SELECT SUM(TIMESTAMPDIFF(SECOND, p.inicio, COALESCE(p.fin, a.fin)))
                  FROM pausas p WHERE p.actividad_id = a.id), 0) AS pausa_segundos
       FROM actividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       INNER JOIN areas ar ON ar.id = u.area_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE ar.empresa_id = ? AND DATE_FORMAT(a.inicio, '%Y-%m-%d') BETWEEN ? AND ? AND u.rol = 'PERSONAL' AND u.activo = TRUE`
    const paramsRegistros: (string | number)[] = [context.activa.id, desde, hasta]
    if (areaId) {
      registrosQuery += ' AND u.area_id = ?'
      paramsRegistros.push(areaId)
    }
    const regQuery = registrosQuery + ' ORDER BY a.inicio ASC'
    const [regRows] = await pool.query(regQuery, paramsRegistros)
    const registros = regRows as RegistroMes[]

    const registrosPorUsuarioYFecha = new Map<string, RegistroMes[]>()
    for (const r of registros) {
      const clave = `${r.usuario_id}|${r.fecha}`
      if (!registrosPorUsuarioYFecha.has(clave)) registrosPorUsuarioYFecha.set(clave, [])
      registrosPorUsuarioYFecha.get(clave)!.push(r)
    }

    // ---- 5. Computo por colaborador ----
    const colaboradores: CumplimientoReporte['colaboradores'] = []
    const pendientes: CumplimientoReporte['pendientes'] = []

    for (const colab of colaboradoresRaw) {
      const registrosDelUsuario = registros.filter((r) => r.usuario_id === colab.id)

      let exigibles = 0
      let reportados = 0
      let pendientesDias = 0
      let incompletosDias = 0
      let incompletosRegistros = 0
      let horasTotales = 0

      const celdas: DiaCumplimiento[] = []
      const reportesPorSemana = new Map<number, { exigibles: number; reportados: number }>()

      for (const d of dias) {
        let stato: EstadoDia
        if (feriadosGlobales.has(d.fecha) || feriadosPorUsuario.get(colab.id)?.has(d.fecha)) {
          stato = 'feriado'
        } else if (vacacionesPorUsuario.get(colab.id)?.has(d.fecha)) {
          stato = 'vacacion'
        } else if (d.fin_semana) {
          stato = 'no_exigible'
        } else {
          const regsDia = registrosPorUsuarioYFecha.get(`${colab.id}|${d.fecha}`) ?? []
          const completos = regsDia.filter((r) => datosFaltantesActividad(r).length === 0)
          if (completos.length > 0) stato = 'reportado'
          else if (regsDia.length > 0) stato = 'incompleto'
          else stato = 'pendiente'
        }

        const cuentaExigible = stato === 'reportado' || stato === 'pendiente' || stato === 'incompleto'
        if (cuentaExigible) {
          exigibles++
          const sem = reportesPorSemana.get(d.semana_index) ?? { exigibles: 0, reportados: 0 }
          sem.exigibles++
          reportesPorSemana.set(d.semana_index, sem)
        }
        if (stato === 'reportado') {
          reportados++
          const sem = reportesPorSemana.get(d.semana_index) ?? { exigibles: 0, reportados: 0 }
          sem.reportados++
          reportesPorSemana.set(d.semana_index, sem)
        } else if (stato === 'pendiente') {
          pendientesDias++
        } else if (stato === 'incompleto') {
          incompletosDias++
        }

        celdas.push({ dia: d.dia, fecha: d.fecha, estado: stato, etiqueta: estadoEtiqueta(stato) })
      }

      // Registros "por revisar": solo los que siguen pendientes de aprobación.
      // Son exactamente los que el administrador revisa en el módulo Aprobaciones.
      for (const r of registrosDelUsuario) {
        const horas = r.fin != null
          ? Math.max(0, r.duracion_segundos - r.pausa_segundos) / 3600
          : 0
        horasTotales += horas
        const faltantes = datosFaltantesActividad(r)
        if (faltantes.length === 0) continue
        incompletosRegistros++
        if (r.estado !== 'PENDIENTE_APROBACION') continue
        if (clienteId == null || r.cliente_id === clienteId) {
          pendientes.push({
            id: r.id,
            usuario_id: colab.id,
            usuario_nombre: colab.nombre,
            fecha: r.fecha,
            cliente_id: r.cliente_id,
            cliente_nombre: r.cliente_nombre,
            actividad: r.descripcion,
            horas_definidas: r.fin != null,
            horas: horas,
            dato_faltante: textoDatosFaltantes(faltantes),
            estado: r.estado,
          })
        }
      }

      // Semanas reportadas
      let semanasExigidas = 0
      let semanasReportadas = 0
      for (const [, v] of reportesPorSemana) {
        if (v.exigibles > 0) {
          semanasExigidas++
          if (v.reportados > 0) semanasReportadas++
        }
      }
      const semanasPendientes = semanasExigidas - semanasReportadas

      const cobertura = exigibles === 0 ? 100 : redondear1((reportados / exigibles) * 100)
      const estado = calcularEstado(exigibles, cobertura, incompletosRegistros, semanasPendientes, reportados)
      const observacion = construirObservacion(reportados, pendientesDias, incompletosRegistros, semanasPendientes)

      colaboradores.push({
        id: colab.id,
        nombre: colab.nombre,
        area_nombre: colab.area_nombre,
        cargo: colab.cargo,
        registros: registrosDelUsuario.length,
        horas_totales: redondear1(horasTotales),
        exigibles,
        reportados,
        pendientes: pendientesDias,
        incompletos: incompletosDias,
        cobertura,
        semanas_exigidas: semanasExigidas,
        semanas_reportadas: semanasReportadas,
        semanas_pendientes: semanasPendientes,
        estado,
        observacion,
        dias: celdas,
      })
    }

    pendientes.sort((a, b) =>
      a.fecha === b.fecha ? a.usuario_nombre.localeCompare(b.usuario_nombre) : a.fecha.localeCompare(b.fecha)
    )

    // ---- 6. Resumen (informe gerencial) ----
    let diasExigibles = 0
    let diasReportados = 0
    let cumplen = 0
    let cumplenParcial = 0
    let noCumplen = 0
    for (const c of colaboradores) {
      diasExigibles += c.exigibles
      diasReportados += c.reportados
      if (c.estado === 'CUMPLE') cumplen++
      else if (c.estado === 'CUMPLE_PARCIAL') cumplenParcial++
      else noCumplen++
    }

    const reporte: CumplimientoReporte = {
      periodo: {
        anio,
        mes,
        desde,
        hasta,
        dias_mes: dias.length,
        dias,
        semanas,
      },
      resumen: {
        colaboradores: colaboradores.length,
        dias_exigibles: diasExigibles,
        dias_reportados: diasReportados,
        cobertura: diasExigibles === 0 ? 100 : redondear1((diasReportados / diasExigibles) * 100),
        cumplen,
        cumplen_parcial: cumplenParcial,
        no_cumplen: noCumplen,
        registros_por_revisar: pendientes.length,
      },
      colaboradores,
      pendientes,
    }

    return NextResponse.json(reporte)
  } catch (error) {
    console.error('Error al obtener cumplimiento:', error)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}