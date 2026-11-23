'use client'

import { useState, type FormEvent } from 'react'
import { BriefcaseBusiness, Building2, Check, Eye, EyeOff, Mail, Pencil } from 'lucide-react'
import { useAuth, type Rol } from '@/lib/auth-context'
import { opcionesApi } from '@/lib/api-cliente'
import styles from '@/app/configuracion/configuracion.module.css'

const roles: Record<Rol, string> = {
  admin: 'Administrador', jefe_area: 'Jefe de área', personal: 'Colaborador', supervisor: 'Supervisor', socio: 'Socio',
}

export function SettingsProfile() {
  const { usuario, empresaActiva, cargarUsuarios, recargarContextoEmpresa } = useAuth()
  const [guardado, setGuardado] = useState({ nombre: usuario?.nombre ?? '', correo: usuario?.correo ?? '' })
  const [nombre, setNombre] = useState(guardado.nombre)
  const [correo, setCorreo] = useState(guardado.correo)
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  if (!usuario) return null

  const limpiarPassword = () => { setPassword(''); setConfirmacion('') }
  const cancelar = () => {
    setNombre(guardado.nombre)
    setCorreo(guardado.correo)
    limpiarPassword()
    setMensaje(null)
  }

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (guardando) return
    setMensaje(null)
    const datos = { nombre: nombre.trim(), correo: correo.trim() }
    if (!datos.nombre || password !== confirmacion) {
      setMensaje({ error: true, texto: !datos.nombre ? 'El nombre es obligatorio.' : 'Las contraseñas deben coincidir.' })
      return
    }
    setGuardando(true)
    try {
      const body = { ...datos, ...(password ? { password } : {}) }
      const respuesta = await fetch('/api/usuarios/' + usuario.id, opcionesApi({ method: 'PUT', body }))
      const resultado = await respuesta.json()
      if (!respuesta.ok) {
        setMensaje({ error: true, texto: resultado.error || 'No se pudieron guardar los cambios.' })
        return
      }
      setGuardado(datos)
      setNombre(datos.nombre)
      setCorreo(datos.correo)
      limpiarPassword()
      setMensaje({ error: false, texto: 'Perfil actualizado correctamente.' })
      await Promise.all([cargarUsuarios(), recargarContextoEmpresa()])
    } catch {
      setMensaje({ error: true, texto: 'No se pudo conectar al servidor.' })
    } finally {
      setGuardando(false)
    }
  }

  const iniciales = guardado.nombre.trim().split(/\s+/).slice(0, 2).map((parte) => parte.charAt(0)).join('').toUpperCase()
  return (
    <div className={styles.profileGrid}>
      <aside className={styles.account} aria-label="Resumen de la cuenta">
        <div className={styles.avatar} aria-hidden="true">{iniciales}</div>
        <h2>{guardado.nombre}</h2>
        <p className={styles.email}><Mail size={18} aria-hidden="true" />{guardado.correo || 'Sin correo registrado'}</p>
        <dl className={styles.accountDetails}>
          <div><BriefcaseBusiness size={19} aria-hidden="true" /><div><dt>Cargo / Rol</dt><dd>{usuario.cargo || roles[usuario.rol]}</dd></div></div>
          {empresaActiva && <div><Building2 size={19} aria-hidden="true" /><div><dt>Empresa</dt><dd>{empresaActiva.nombre}</dd></div></div>}
        </dl>
      </aside>

      <form onSubmit={guardar} className={styles.editProfile}>
        <div className={styles.panelHeading}>
          <span className={styles.tile}><Pencil size={21} aria-hidden="true" /></span>
          <div><h2>Editar información</h2><p>Actualiza tus datos personales y credenciales.</p></div>
        </div>
        <label>Nombre completo
          <input type="text" autoComplete="name" required value={nombre} onChange={(evento) => setNombre(evento.target.value)} />
        </label>
        <label>Correo electrónico
          <input type="email" autoComplete="email" value={correo} onChange={(evento) => setCorreo(evento.target.value)} />
        </label>
        <CampoPassword id="perfil-password" etiqueta="Contraseña" valor={password} cambiar={setPassword} ayuda="Déjala vacía para conservar la actual." />
        <CampoPassword id="perfil-confirmacion" etiqueta="Confirmar contraseña" valor={confirmacion} cambiar={setConfirmacion} />
        {mensaje && <p role={mensaje.error ? 'alert' : 'status'} className={mensaje.error ? 'text-sm text-rose-300' : 'text-sm text-emerald-300'}>{mensaje.texto}</p>}
        <footer>
          <button type="button" onClick={cancelar} disabled={guardando}>Cancelar</button>
          <button type="submit" disabled={guardando}><Check size={17} aria-hidden="true" />{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </footer>
      </form>
    </div>
  )
}

function CampoPassword({ id, etiqueta, valor, cambiar, ayuda }: {
  id: string; etiqueta: string; valor: string; cambiar: (valor: string) => void; ayuda?: string
}) {
  const [visible, setVisible] = useState(false)
  const Icono = visible ? EyeOff : Eye
  return (
    <div className={styles.passwordField}>
      <label htmlFor={id}>{etiqueta}{ayuda && <span id={id + '-ayuda'}> · {ayuda}</span>}</label>
      <div>
        <input id={id} autoComplete="new-password" type={visible ? 'text' : 'password'} value={valor} aria-describedby={ayuda ? id + '-ayuda' : undefined} onChange={(evento) => cambiar(evento.target.value)} />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={(visible ? 'Ocultar ' : 'Mostrar ') + etiqueta.toLowerCase()}><Icono size={17} aria-hidden="true" /></button>
      </div>
    </div>
  )
}
