'use client'

import { useState, type ComponentType } from 'react'
import { Building2, Eye, Globe, ListChecks, ShieldCheck, User, UserRound, Users } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { SettingsAreas } from '@/components/settings-areas'
import { SettingsActividades } from '@/components/settings-actividades'
import { SettingsCompany } from '@/components/settings-company'
import { SettingsAdmins } from '@/components/settings-admins'
import { SettingsJefes } from '@/components/settings-jefes'
import { SettingsSocios } from '@/components/settings-socios'
import { SettingsUsuariosArea } from '@/components/settings-usuarios-area'
import { SettingsProfile } from '@/components/settings-profile'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAuth } from '@/lib/auth-context'
import styles from './configuracion.module.css'

type Seccion = { id: string; etiqueta: string; Icono: typeof User; Contenido: ComponentType }

const empresa: Seccion[] = [
  { id: 'areas', etiqueta: 'Divisiones', Icono: Building2, Contenido: SettingsAreas },
  { id: 'actividades', etiqueta: 'Actividades', Icono: ListChecks, Contenido: SettingsActividades },
  { id: 'empresa', etiqueta: 'Empresa', Icono: Globe, Contenido: SettingsCompany },
  { id: 'admins', etiqueta: 'Administradores', Icono: ShieldCheck, Contenido: SettingsAdmins },
  { id: 'jefes', etiqueta: 'Jefes de área', Icono: UserRound, Contenido: SettingsJefes },
  { id: 'socios', etiqueta: 'Socios', Icono: Eye, Contenido: SettingsSocios },
]
const perfil: Seccion = { id: 'perfil', etiqueta: 'Mi perfil', Icono: User, Contenido: SettingsProfile }
const equipo: Seccion = { id: 'mi_area', etiqueta: 'Usuarios de mi área', Icono: Users, Contenido: SettingsUsuariosArea }

export default function Configuracion() {
  const { usuario, cargando } = useAuth()
  const [pestana, setPestana] = useState<string | null>(null)
  const esAdmin = usuario?.rol === 'admin'
  const esJefeArea = usuario?.rol === 'jefe_area'
  const esSocio = usuario?.rol === 'socio'
  const secciones = esAdmin || esSocio ? [perfil, ...empresa] : esJefeArea ? [equipo, perfil] : [perfil]
  const actual = secciones.find(({ id }) => id === pestana) ?? secciones[0]
  const Contenido = actual.Contenido
  const subtitulo = esAdmin ? 'Administra las divisiones, la empresa y los usuarios'
    : esJefeArea ? 'Administra tu equipo y tus preferencias'
      : esSocio ? 'Consulta la configuración de la empresa' : 'Administra tu perfil y tus preferencias'

  return (
    <MainLayout title="Configuración" subtitle={subtitulo} ancho="ancho">
      {!cargando && usuario && <div className={styles.layout}>
        <ThemeToggle />
        <nav className={styles.navigation} aria-label="Secciones de configuración">
          {secciones.map(({ id, etiqueta, Icono }) => (
            <button key={id} type="button" aria-current={actual.id === id ? true : undefined} aria-controls="contenido-configuracion" onClick={() => setPestana(id)}>
              <Icono size={18} aria-hidden="true" />
              {etiqueta}
            </button>
          ))}
        </nav>

        {esSocio && (
          <p className={styles.readonly}><Eye size={16} aria-hidden="true" /> Configuración de la empresa en modo de solo lectura.</p>
        )}

        <section id="contenido-configuracion" className={styles.content} aria-label={actual.etiqueta}>
            <fieldset className={styles.fields} disabled={esSocio}>
              <Contenido key={actual.id} />
            </fieldset>
        </section>
      </div>}
    </MainLayout>
  )
}
