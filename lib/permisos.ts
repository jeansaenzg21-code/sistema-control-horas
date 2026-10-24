export interface UsuarioConPermisos {
  id: number
  rol: string
  area_id: number | null
  correo?: string | null
  usuario?: string | null
}

export function esAdministrador(usuario: UsuarioConPermisos | null | undefined): boolean {
  const rol = String(usuario?.rol || '').toUpperCase()
  return rol === 'ADMINISTRACION' || rol === 'ADMIN'
}

export function esJefeDeArea(usuario: UsuarioConPermisos | null | undefined): boolean {
  return String(usuario?.rol || '').toUpperCase() === 'JEFE_AREA' && usuario?.area_id != null
}

/**
 * SOCIO: el perfil "fantasma". Ve todo lo de la empresa igual que el
 * administrador, pero no modifica nada.
 *
 * Deliberadamente NO entra en `esAdministrador`: si lo hiciera heredaría también
 * la escritura, que es justo lo que este rol no tiene que poder hacer. Por eso
 * toda decisión de escritura tiene que pasar por `puedeEscribir`.
 */
export function esSocio(usuario: UsuarioConPermisos | null | undefined): boolean {
  return String(usuario?.rol || '').toUpperCase() === 'SOCIO'
}

export function esSupervisor(usuario: UsuarioConPermisos | null | undefined): boolean {
  return String(usuario?.rol || '').toUpperCase() === 'SUPERVISOR'
}

export function esPersonal(usuario: UsuarioConPermisos | null | undefined): boolean {
  return String(usuario?.rol || '').toUpperCase() === 'PERSONAL'
}

export const ROLES = {
  ADMINISTRACION: 'ADMINISTRACION',
  SOCIO: 'SOCIO',
  SUPERVISOR: 'SUPERVISOR',
  JEFE_AREA: 'JEFE_AREA',
  PERSONAL: 'PERSONAL',
} as const

/**
 * Perfiles que consultan la actividad de toda la empresa, no solo la propia.
 *
 * Existe para que la lista no se escriba a mano en cuatro sitios distintos: antes
 * estaba repetida en `lib/actividad-context.tsx` y se le habia olvidado el SOCIO.
 * El socio entraba entonces por `soloPropias` y se encontraba con el historial
 * vacio en /reportes, pese a que la pagina le deja entrar precisamente para ver
 * las horas de la empresa. Un perfil entra por el hecho de SER quien es, no por
 * lo que puede escribir: el SOCIO lee igual que el admin.
 */
export function veActividadDeTodaLaEmpresa(usuario: UsuarioConPermisos | null | undefined): boolean {
  if (!usuario) return false
  const rol = String(usuario.rol).toUpperCase()
  return rol === 'ADMINISTRACION' || rol === 'ADMIN' || rol === 'SUPERVISOR' || esJefeDeArea(usuario) || esSocio(usuario)
}

/**
 * Si el usuario puede modificar datos o no.
 *
 * Es la única fuente de verdad para escritura. Un SOCIO devuelve `false` aunque
 * sea el único usuario activo de la empresa: un sistema sin nadie que lo administre
 * es preferible a uno donde el "fantasma" pueda tocar los datos que fiscaliza.
 */
export function puedeEscribir(usuario: UsuarioConPermisos | null | undefined): boolean {
  return Boolean(usuario) && !esSocio(usuario)
}

/**
 * Si el usuario puede VER de toda la empresa, no solo de su área.
 *
 * El socio entra por aquí junto con el administrador: el requisito es que pueda
 * revisar los datos de todos los clientes, no solo los de un área.
 */
export function veTodaLaEmpresa(usuario: UsuarioConPermisos | null | undefined): boolean {
  return esAdministrador(usuario) || esSocio(usuario)
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

/**
 * Acceso al módulo demostrativo de Inventario de Laptops.
 *
 * Es una excepción puntual y deliberada: el módulo es para Fran Laureano y para
 * nadie más, ni siquiera el administrador. Mientras no exista un rol de TI, se
 * identifica por correo y usuario (no por nombre, que puede repetirse). El día
 * que TI sea un rol real, esta comprobación se sustituye por `esTI(usuario)`.
 */
export function puedeVerInventarioLaptops(usuario: UsuarioConPermisos | null | undefined): boolean {
  if (!usuario) return false
  const correo = String(usuario.correo || '').trim().toLowerCase()
  const nombreUsuario = String(usuario.usuario || '').trim().toLowerCase()
  return correo === 'sistemas@paredescano.com' || nombreUsuario === '47116038'
}

/**
 * Acceso al módulo de Gestión de Laptops.
 *
 * Comparte exactamente el mismo perfil que Inventario: Fran Laureano y nadie
 * más. Se mantiene una función propia para que la ruta y el menú TI no dependan
 * del nombre de otro módulo cuando el backend se conecte.
 */
export function puedeVerGestionLaptops(usuario: UsuarioConPermisos | null | undefined): boolean {
  return puedeVerInventarioLaptops(usuario)
}
