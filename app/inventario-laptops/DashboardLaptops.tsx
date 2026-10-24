'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, Building2, CheckCircle2, ChevronRight, Home, Info,
  Laptop, Lightbulb, Trash2, Users, Wrench, X, type LucideIcon,
} from 'lucide-react';
import styles from './DashboardLaptops.module.css';

type Equipo = {
  codigo: string;
  usuario: string;
  propiedad: 'Propia' | 'Smart Service' | 'Valrex';
  estado: string;
  area: string;
  marca: string;
  ram: string;
  serie: string;
};

type Kpi = { label: string; value: number; hint: string; color: string; Icon: LucideIcon };
type Segmento = { label: string; value: number; color: string };
type Marca = { label: string; raw: string; value: number; color: string };

const PALETA = ['#8b45fc', '#3c8efd', '#19b777', '#bd64f9', '#f2a93b'];

function formatoMarca(valor: string): string {
  const marca = valor.trim();
  if (!marca) return 'Sin marca';
  const clave = marca.toLowerCase();
  if (clave === 'hp') return 'HP';
  if (clave === 'asus') return 'ASUS';
  return marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase();
}

function plural(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

function EstadoTag({ estado }: { estado: string }) {
  const color = estado === 'Disponible' || estado === 'Asignado'
    ? 'ok'
    : estado === 'En reparación'
      ? 'warning'
      : estado === 'Asignado / Reservado'
        ? 'info'
        : 'muted';
  return <span className={`${styles.tag} ${styles[color]}`}>{estado}</span>;
}

export default function DashboardLaptops() {
  const router = useRouter();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let activo = true;

    async function cargar() {
      try {
        const res = await fetch('/api/laptops', { cache: 'no-store', signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(data.error || 'No se pudo cargar el inventario.'));
        if (activo) setEquipos(Array.isArray(data.equipos) ? data.equipos as Equipo[] : []);
      } catch (e) {
        if (!activo || (e as Error).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'No se pudo cargar el inventario.');
      } finally {
        if (activo) setCargando(false);
      }
    }

    void cargar();
    return () => {
      activo = false;
      controller.abort();
    };
  }, []);

  const total = equipos.length;
  const porcentaje = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}% del total` : 'Sin datos';

  const asignados = equipos.filter((e) => e.estado === 'Asignado' || e.estado === 'Asignado / Reservado').length;
  const disponibles = equipos.filter((e) => e.estado === 'Disponible').length;
  const propias = equipos.filter((e) => e.propiedad === 'Propia').length;
  const alquiladas = equipos.filter((e) => e.propiedad !== 'Propia').length;
  const reparacion = equipos.filter((e) => e.estado === 'En reparación').length;
  const kpis: Kpi[] = [
    { label: 'Total equipos', value: total, hint: total > 0 ? 'Inventario cargado' : 'Sin equipos', color: 'blue', Icon: Laptop },
    { label: 'Asignados / Reservados', value: asignados, hint: porcentaje(asignados), color: 'green', Icon: Users },
    { label: 'Disponibles', value: disponibles, hint: porcentaje(disponibles), color: 'teal', Icon: CheckCircle2 },
    { label: 'En reparación', value: reparacion, hint: porcentaje(reparacion), color: 'amber', Icon: Wrench },
    { label: 'Propias', value: propias, hint: porcentaje(propias), color: 'blue', Icon: Home },
    { label: 'Alquiladas', value: alquiladas, hint: porcentaje(alquiladas), color: 'purple', Icon: Building2 },
  ];

  const marcas = useMemo<Marca[]>(() => {
    const conteo = new Map<string, { label: string; raw: string; value: number }>();
    for (const equipo of equipos) {
      const original = equipo.marca.trim();
      const clave = original.toLowerCase();
      const actual = conteo.get(clave);
      if (actual) {
        actual.value += 1;
      } else {
        conteo.set(clave, { label: formatoMarca(clave), raw: original || 'Sin marca', value: 1 });
      }
    }
    return [...conteo.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((marca, indice) => ({ ...marca, color: PALETA[indice % PALETA.length] }));
  }, [equipos]);

  const maxMarca = Math.max(...marcas.map((m) => m.value), 1);
  const marcaTicks = [1, 0.75, 0.5, 0.25, 0].map((factor) => Math.round(maxMarca * factor));

  const areas = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const equipo of equipos) {
      const clave = equipo.area.trim() || 'Sin área';
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    return [...conteo.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [equipos]);

  const maxArea = Math.max(...areas.map((a) => a.value), 1);

  const propiedad = useMemo(() => {
    const propias = equipos.filter((e) => e.propiedad === 'Propia').length;
    const smart = equipos.filter((e) => e.propiedad === 'Smart Service').length;
    const valrex = equipos.filter((e) => e.propiedad === 'Valrex').length;
    const otras = Math.max(0, total - propias - smart - valrex);
    const segmentos: Segmento[] = [
      { label: 'Propias', value: propias, color: '#8643f8' },
      { label: 'Smart Service', value: smart, color: '#2287f4' },
      { label: 'Valrex', value: valrex, color: '#18b1b5' },
    ];
    if (otras > 0) segmentos.push({ label: 'Otras', value: otras, color: '#6b7280' });

    let acumulado = 0;
    const partes = segmentos.map((segmento) => {
      const desde = total > 0 ? (acumulado / total) * 100 : 0;
      acumulado += segmento.value;
      const hasta = total > 0 ? (acumulado / total) * 100 : 0;
      return `${segmento.color} ${desde}% ${hasta}%`;
    });

    return {
      segmentos,
      gradient: total > 0 ? `conic-gradient(${partes.join(', ')})` : 'conic-gradient(#252532 0% 100%)',
    };
  }, [equipos, total]);

  const bajas = equipos.filter((e) => e.estado === 'BAJA').length;
  const vendidos = equipos.filter((e) => e.estado === 'Vendido').length;
  const noDisponibles = equipos.filter((e) => e.estado === 'No disponible').length;
  const pendientes = equipos.filter((e) => e.estado === 'Pendiente').length;
  const totalNoDisponibles = bajas + vendidos + noDisponibles + pendientes;
  const pctNoDisponibles = total > 0 ? ((totalNoDisponibles / total) * 100).toFixed(1) : '0.0';

  const topMarca = marcas[0];
  const topArea = areas[0];

  return <div className={styles.app}>
    <div className={styles.page}>
      <section className={styles.kpiGrid}>{kpis.map((k) => <div key={k.label} className={`${styles.kpi} ${styles[k.color + 'Card']}`}><div className={styles.kpiIcon}><k.Icon size={27} /></div><div><span>{k.label}</span><strong>{k.value}</strong><small>{k.hint}</small></div></div>)}</section>

      <section className={styles.charts}>
        <article className={`${styles.panel} ${styles.ownership}`}>
          <h2>Equipos por propiedad</h2>
          <div className={styles.donutBody}>
            <div className={styles.donut} style={{ background: propiedad.gradient }} role="img" aria-label={propiedad.segmentos.map((s) => `${s.label} ${s.value}`).join(', ')}>
              <div className={styles.donutCenter}><strong>{total}</strong><span>Equipos</span></div>
            </div>
            <div className={styles.legend}>{propiedad.segmentos.map((segmento) => <div key={segmento.label}><i style={{ background: segmento.color }} />{segmento.label} <b>{segmento.value}</b></div>)}</div>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.brandChart}`}>
          <h2>Equipos por marca</h2>
          <div className={styles.barPlot}>
            <div className={styles.yAxis}>{marcaTicks.map((tick, indice) => <span key={`${tick}-${indice}`}>{tick}</span>)}</div>
            <div className={styles.barGrid}>{marcas.map((marca) => <div className={styles.barCol} key={marca.label}><strong>{marca.value}</strong><div className={styles.bar} style={{ height: `${Math.max(2, (marca.value / maxMarca) * 100)}%`, background: marca.color }} /><span>{marca.label}</span></div>)}</div>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.areaChart}`}>
          <h2>Principales áreas de destino</h2>
          <div className={styles.areaBars}>{areas.map((area) => <div className={styles.areaRow} key={area.label}><span title={area.label}>{area.label}</span><div><div style={{ width: `${(area.value / maxArea) * 100}%` }} /></div><b>{area.value}</b></div>)}</div>
        </article>

        <article className={`${styles.panel} ${styles.statusChart}`}>
          <h2>Equipos dados de baja / no disponibles</h2>
          <div className={styles.statusRow}><span className={styles.red}><X size={15} /></span>BAJA <b>{bajas}</b></div>
          <div className={styles.statusRow}><span className={styles.red}><Trash2 size={15} /></span>Vendido <b>{vendidos}</b></div>
          <div className={styles.statusRow}><span className={styles.gray}><X size={15} /></span>No disponible <b>{noDisponibles}</b></div>
          <div className={styles.statusRow}><span className={styles.yellow}><AlertTriangle size={15} /></span>Pendiente de validar <b>{pendientes}</b></div>
          <div className={styles.statusSummary}>Total de equipos no disponibles: <b>{totalNoDisponibles}</b><small>({pctNoDisponibles}% del total)</small></div>
        </article>
      </section>

      <section className={styles.bottomGrid}>
        <article className={`${styles.panel} ${styles.tablePanel}`}>
          <div className={styles.tableTitle}>
            <div><h2>Listado de equipos</h2><span>{cargando ? 'Cargando...' : `${plural(total, 'registro', 'registros')}`}</span></div>
            {total > 0 && <button onClick={() => router.push('/gestion-laptops')}>Ver todos <ChevronRight size={14} /></button>}
          </div>
          <div className={styles.tableScroll}>
            <table>
              <thead><tr><th>Código</th><th>Usuario / Responsable</th><th>Propiedad</th><th>Estado</th><th>Área</th><th>Marca</th><th>RAM</th><th>N° de serie</th></tr></thead>
              <tbody>{equipos.slice(0, 7).map((e) => <tr key={e.codigo}><td><b>{e.codigo}</b></td><td>{e.usuario || '—'}</td><td><span className={`${styles.tag} ${e.propiedad === 'Propia' ? styles.own : e.propiedad === 'Valrex' ? styles.valrex : styles.smart}`}>{e.propiedad}</span></td><td><EstadoTag estado={e.estado} /></td><td>{e.area || '—'}</td><td>{e.marca || '—'}</td><td>{e.ram || '—'}</td><td>{e.serie || '—'}</td></tr>)}</tbody>
            </table>
            {cargando && <p className={styles.noResults}>Cargando inventario...</p>}
            {!cargando && error && <p className={styles.noResults}>{error}</p>}
            {!cargando && !error && total === 0 && <p className={styles.noResults}>No hay equipos cargados. Importa el Excel desde Gestión de Laptops.</p>}
          </div>
        </article>

        <article className={`${styles.panel} ${styles.insights}`}>
          <h2><Lightbulb size={19} /> Hallazgos y alertas</h2>
          <button type="button" className={styles.insight} onClick={() => topMarca && router.push(`/gestion-laptops?marca=${encodeURIComponent(topMarca.raw)}`)} disabled={!topMarca} aria-label="Ver en Gestión de Laptops los equipos de la marca principal">
            <div className={styles.insightIcon}><Activity size={21} /></div>
            <div><b>{topMarca ? `${topMarca.label} domina el inventario` : 'Sin datos de marcas'}</b><p>{topMarca ? `${plural(topMarca.value, 'equipo', 'equipos')} (${porcentaje(topMarca.value)})` : 'Importa el inventario para ver hallazgos'}</p></div>
            <ChevronRight size={16} />
          </button>
          <button type="button" className={styles.insight} onClick={() => topArea && router.push(`/gestion-laptops?area=${encodeURIComponent(topArea.label)}`)} disabled={!topArea} aria-label="Ver en Gestión de Laptops los equipos del área principal">
            <div className={styles.insightIcon}><Users size={21} /></div>
            <div><b>{topArea ? `${topArea.label} concentra la mayor cantidad de equipos` : 'Sin datos de áreas'}</b><p>{topArea ? `${plural(topArea.value, 'equipo', 'equipos')} (${porcentaje(topArea.value)})` : 'Importa el inventario para ver hallazgos'}</p></div>
            <ChevronRight size={16} />
          </button>
          <button type="button" className={styles.insight} onClick={() => router.push('/gestion-laptops?estado=Pendiente')} disabled={pendientes === 0} aria-label="Ver en Gestión de Laptops los equipos pendientes de validar">
            <div className={styles.insightIcon}><AlertTriangle size={21} /></div>
            <div><b>{pendientes === 0 ? 'Sin equipos pendientes de validar' : `${plural(pendientes, 'equipo pendiente', 'equipos pendientes')} de validar`}</b><p>{pendientes === 0 ? 'No hay equipos con estado Pendiente' : 'Estado "Pendiente" en el inventario'}</p></div>
            <ChevronRight size={16} />
          </button>
          <button type="button" className={styles.insight} onClick={() => router.push(`/gestion-laptops?estado=${encodeURIComponent('En reparación')}`)} disabled={reparacion === 0} aria-label="Ver en Gestión de Laptops los equipos en reparación">
            <div className={styles.insightIcon}><Wrench size={21} /></div>
            <div><b>{reparacion === 0 ? 'Sin equipos en reparación' : `${plural(reparacion, 'equipo', 'equipos')} en reparación`}</b><p>{reparacion === 0 ? 'No hay equipos en reparación' : `Representa el ${porcentaje(reparacion)}`}</p></div>
            <ChevronRight size={16} />
          </button>
        </article>
      </section>

      <p className={styles.footerNote}><Info size={14} /> Indicadores calculados en tiempo real desde el inventario de Gestión de Laptops.</p>
    </div>
  </div>;
}
