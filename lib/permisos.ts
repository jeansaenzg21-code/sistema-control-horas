export interface UsuarioConPermisos {
  id: number
  rol: string
  area_id: number | null
}

export function esAdministrador(usuario: UsuarioConPermisos | null | undefined): boolean {
  const rol = String(usuario?.rol || '').toUpperCase()
  return rol === 'ADMINISTRACION' || rol === 'ADMIN'
}

export function esJefeDeArea(usuario: UsuarioConPermisos | null | undefined): boolean {
  return String(usuario?.rol || '').toUpperCase() === 'JEFE_AREA' && usuario?.area_id != null
}

export function esAprobador(usuario: UsuarioConPermisos | null | undefined): boolean {
  const rol = String(usuario?.rol || '').toUpperCase()
  return rol === 'ADMINISTRACION' || rol === 'SUPERVISOR'
}

export function puedeAdministrarArea(usuario: UsuarioConPermisos | null | undefined, areaId: number): boolean {
  if (!usuario) return false
  return esAdministrador(usuario) || (esJefeDeArea(usuario) && usuario.area_id === areaId)
}

export function areaForzada(usuario: UsuarioConPermisos | null | undefined, areaSolicitada?: number | null): number | null {
  if (!usuario) return null
  if (esJefeDeArea(usuario)) return usuario.area_id
  if (areaSolicitada == null) return null
  return Number.isInteger(areaSolicitada) && areaSolicitada > 0 ? areaSolicitada : null
}
