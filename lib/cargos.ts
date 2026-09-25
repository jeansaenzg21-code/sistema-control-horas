export type TipoCargo = 'JEFE' | 'GERENTE' | 'SUPERVISOR' | 'PERSONAL'
export type RolPorCargo = 'JEFE_AREA' | 'SUPERVISOR' | 'PERSONAL'

export function normalizarCargo(valor: unknown): string {
  return String(valor ?? '')
    .replace(/\uFFFD/g, 'I')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .toUpperCase()
}

export function tipoCargo(valor: unknown): TipoCargo {
  const cargo = normalizarCargo(valor)
  if (!cargo) return 'PERSONAL'
  if (/\bASISTENTE\b/.test(cargo)) return 'PERSONAL'
  if (/\bJEFES?\b|\bJEFATURA\b/.test(cargo)) return 'JEFE'
  if (/\bGERENTE\b/.test(cargo)) return 'GERENTE'
  if (/\bSUPERVISOR\w*\b|\bLIDER\b|\bDIRECTOR\w*\b|\bCEO\b/.test(cargo)) return 'SUPERVISOR'
  return 'PERSONAL'
}

export function esJefePorCargo(valor: unknown): boolean {
  return tipoCargo(valor) === 'JEFE'
}

export function esGerentePorCargo(valor: unknown): boolean {
  return tipoCargo(valor) === 'GERENTE'
}

export function clasificarRolPorCargo(
  valor: unknown,
  opciones: { areaYaTieneJefe?: boolean; areaTieneJefeEnImportacion?: boolean } = {},
): RolPorCargo {
  const tipo = tipoCargo(valor)
  if (tipo === 'JEFE') return opciones.areaYaTieneJefe || opciones.areaTieneJefeEnImportacion ? 'SUPERVISOR' : 'JEFE_AREA'
  if (tipo === 'GERENTE' && !opciones.areaYaTieneJefe && !opciones.areaTieneJefeEnImportacion) return 'JEFE_AREA'
  if (tipo === 'SUPERVISOR' || tipo === 'GERENTE') return 'SUPERVISOR'
  return 'PERSONAL'
}
