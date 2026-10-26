'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDownToLine, ArrowUpFromLine, Check, Copy,
  ClipboardList, Clock3, Laptop, MoreVertical, Plus, RotateCcw,
  Search, UserRoundPlus, Users, Wrench, X, CheckCircle2, Save, History,
  AlertTriangle, type LucideIcon
} from 'lucide-react';
import { invalidarLaptops, useLaptops, type Equipo, type Estado, type Propiedad } from '@/lib/laptops/cliente';
import styles from './GestionLaptops.module.css';

const VACIO: Equipo = {
  id: null, codigo:'', tipoActivo:'Laptop', usuario:'', estado:'Disponible', propiedad:'Propia',
  area:'TI / Reserva', areaDestino:'', marca:'', modelo:'', procesador:'', ram:'8 GB',
  disco:'', serie:'', proveedor:'', mantenimiento:'', observacion:'', origenHoja:'',
  origenSeccion:'', origenFila:null, duplicado:false, duplicadoSerie:false
};
const ESTADOS: Estado[] = ['Asignado / Reservado','Disponible','En reparación','BAJA','Vendido','No disponible','Pendiente'];
const PROPIEDADES: Propiedad[] = ['Propia','Smart Service','Valrex'];

type Tab = 'Información'|'Asignación'|'Mantenimiento'|'Historial';
type Modal = 'nuevo'|'asignar'|'devolver'|null;
type Filters = { estado:string; marca:string; area:string; propiedad:string; responsable:string; duplicado:string; texto:string };
const initialFilters:Filters = { estado:'Todos', marca:'Todas', area:'Todas', propiedad:'Todas', responsable:'Todos', duplicado:'Todos', texto:'' };

function claveFila(e: Equipo) { return e.id != null ? `id:${e.id}` : `cod:${e.codigo}`; }
function esDuplicado(e: Equipo) { return e.duplicado || e.duplicadoSerie; }
function motivoDuplicado(e: Equipo) {
  const motivos = [];
  if (e.duplicado) motivos.push('código repetido');
  if (e.duplicadoSerie) motivos.push('serie repetida');
  return motivos.join(' y ') || 'Sin duplicado';
}
function dateStamp() { return new Date().toLocaleString('es-PE'); }

// Un único filtro agrupa estados históricos y el estado unificado actual.
function esAsignadoReservado(estado: string): boolean {
  const valor = estado.trim().toLocaleLowerCase('es').replace(/\s*\/\s*/g, ' / ');
  return valor === 'asignado' || valor === 'reservado' || valor === 'asignado / reservado';
}

function badgeClass(estado: Estado) {
  if (esAsignadoReservado(estado)) return styles.tagBlue;
  if (estado === 'Disponible') return styles.tagMint;
  if (estado === 'En reparación') return styles.tagGold;
  if (estado === 'Pendiente') return styles.tagPurple;
  return styles.tagGray;
}

type Kpi = { label: string; value: number; hint: string; tone: string; Icon: LucideIcon };

export default function GestionLaptops({ showHeading = false }: { showHeading?: boolean } = {}) {
  const { equipos: equiposRemotos, duplicados, cargando, error: errorCarga, recargar } = useLaptops();
  const [items, setItems] = useState<Equipo[]>(equiposRemotos);
  const [importando, setImportando] = useState(false);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<Equipo>({...VACIO});
  const [tab, setTab] = useState<Tab>('Información');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [modal, setModal] = useState<Modal>(null);
  const [modalDraft, setModalDraft] = useState<Equipo>({...VACIO});
  const [logs, setLogs] = useState<Record<string,string[]>>({});
  const [notice, setNotice] = useState('');
  const [menuCode, setMenuCode] = useState<string|null>(null);
  const searchParams = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const active = items.find(e => claveFila(e) === selected);
  const opts = (field:'marca'|'area'|'usuario') => [...new Set(items.map(e => e[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));

  useEffect(() => { setItems(equiposRemotos); }, [equiposRemotos]);

  useEffect(() => {
    if (selected && !items.some((e) => claveFila(e) === selected)) {
      setSelected('');
      setDraft({ ...VACIO });
    }
  }, [items, selected]);

  useEffect(() => {
    const estado = searchParams.get('estado');
    const estadoFiltro = estado && esAsignadoReservado(estado) ? 'Asignado / Reservado' : estado;
    const marca = searchParams.get('marca');
    const area = searchParams.get('area');
    const propiedad = searchParams.get('propiedad');
    const responsable = searchParams.get('responsable');
    const duplicado = searchParams.get('duplicado');
    const texto = searchParams.get('texto');
    setFilters((prev) => ({
      estado: estadoFiltro && ESTADOS.includes(estadoFiltro as Estado) ? estadoFiltro : prev.estado,
      marca: marca ?? prev.marca,
      area: area ?? prev.area,
      propiedad: propiedad && PROPIEDADES.includes(propiedad as Propiedad) ? propiedad : prev.propiedad,
      responsable: responsable ?? prev.responsable,
      duplicado: duplicado === '1' || duplicado === 'si' ? 'Solo duplicados' : prev.duplicado,
      texto: texto ?? prev.texto,
    }));
  }, [searchParams]);

  const kpis = useMemo<Kpi[]>(() => {
    const total = items.length;
    const porcentaje = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}% del total` : 'Sin datos';
    const asignadas = items.filter((e) => esAsignadoReservado(e.estado)).length;
    const disponibles = items.filter((e) => e.estado === 'Disponible').length;
    const reparacion = items.filter((e) => e.estado === 'En reparación').length;
    const pendientes = items.filter((e) => e.estado === 'Pendiente').length;
    return [
      { label:'Total equipos', value: total, hint: total > 0 ? 'Inventario cargado' : 'Sin equipos', tone:'blue', Icon:Laptop },
      { label:'Asignadas / Reservadas', value: asignadas, hint: porcentaje(asignadas), tone:'green', Icon:Users },
      { label:'Disponibles', value: disponibles, hint: porcentaje(disponibles), tone:'mint', Icon:CheckCircle2 },
      { label:'En reparación', value: reparacion, hint: porcentaje(reparacion), tone:'gold', Icon:Wrench },
      { label:'Pendientes de validar', value: pendientes, hint: porcentaje(pendientes), tone:'purple', Icon:Clock3 },
      {
        label:'Duplicados',
        value: duplicados.equipos,
        hint: duplicados.equipos > 0
          ? `${duplicados.codigos} códigos · ${duplicados.series} series`
          : 'Sin duplicados',
        tone:'gold',
        Icon:Copy,
      },
    ];
  }, [items, duplicados]);

  const activarFiltroKpi = (label: string) => {
    if (label === 'Total equipos') {
      setFilters(initialFilters);
      return;
    }
    if (label === 'Asignadas / Reservadas') {
      setFilters(filters.estado === 'Asignado / Reservado'
        ? initialFilters
        : { ...initialFilters, estado: 'Asignado / Reservado' });
    } else if (label === 'Disponibles' || label === 'En reparación' || label === 'Pendientes de validar') {
      const estado = label === 'Pendientes de validar' ? 'Pendiente' : label === 'Disponibles' ? 'Disponible' : 'En reparación';
      setFilters(filters.estado === estado
        ? initialFilters
        : { ...initialFilters, estado });
    } else if (label === 'Duplicados') {
      setFilters(filters.duplicado === 'Solo duplicados'
        ? initialFilters
        : { ...initialFilters, duplicado: 'Solo duplicados' });
    }
  };

  const kpiActivo = (label: string) => label === 'Total equipos'
    ? Object.entries(filters).every(([key, value]) => value === initialFilters[key as keyof Filters])
    : label === 'Duplicados'
      ? filters.duplicado === 'Solo duplicados'
      : filters.estado === (label === 'Asignadas / Reservadas' ? 'Asignado / Reservado' : label === 'Disponibles' ? 'Disponible' : label === 'En reparación' ? 'En reparación' : label === 'Pendientes de validar' ? 'Pendiente' : '');

  const filtered = useMemo(() => items.filter(e => {
    const match = (v:string, chosen:string) => chosen === 'Todos' || chosen === 'Todas' || v === chosen;
    const matchMarca = (v:string, chosen:string) => chosen === 'Todas' || v.trim().toLocaleLowerCase('es') === chosen.trim().toLocaleLowerCase('es');
    const matchDuplicado = filters.duplicado === 'Todos'
      || (filters.duplicado === 'Solo duplicados' ? esDuplicado(e) : !esDuplicado(e));
    const matchEstado = filters.estado === 'Todos'
      || (filters.estado === 'Asignado / Reservado'
        ? esAsignadoReservado(e.estado)
        : e.estado === filters.estado);
    const q = filters.texto.trim().toLocaleLowerCase('es');
    return matchEstado && matchMarca(e.marca,filters.marca) && match(e.area,filters.area)
      && match(e.propiedad,filters.propiedad) && match(e.usuario,filters.responsable)
      && matchDuplicado
      && (!q || Object.values(e).some(v=>String(v).toLocaleLowerCase('es').includes(q)));
  }),[items,filters]);
  const setFilter = (key:keyof Filters,value:string) => { setFilters(prev=>({...prev,[key]:value})); };
  const selectEquipo = (e:Equipo) => { setSelected(claveFila(e)); setDraft({...e}); setTab('Información'); setMenuCode(null); };
  const message = (s:string) => { setNotice(s); };
  const addLog = (code:string,note:string) => setLogs(prev=>({...prev,[code]:[`${dateStamp()} · ${note}`,...(prev[code]??[])]}));

  async function importarArchivo(file: File) {
    if (importando) return;
    setImportando(true);
    setNotice('Importando inventario...');
    try {
      const form = new FormData();
      form.append('archivo', file);
      const res = await fetch('/api/laptops/importar', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(String(data.error || 'No se pudo importar el archivo.'));
        return;
      }
      invalidarLaptops();
      await recargar(true);
      const dup = data.duplicados as { codigos?: number; series?: number; equipos?: number } | undefined;
      const detalleDup = dup && (dup.codigos || dup.series)
        ? ` Duplicados detectados: ${dup.codigos ?? 0} códigos y ${dup.series ?? 0} series (${dup.equipos ?? 0} equipos).`
        : ' Sin duplicados.';
      setNotice(`Importación completada: ${data.creados} registros guardados, ${data.eliminados ?? 0} reemplazados.${detalleDup}`);
    } catch {
      setNotice('No se pudo conectar con el servidor para importar.');
    } finally {
      setImportando(false);
    }
  }

  async function save() {
    if (!active) return;
    if (!draft.codigo.trim() || !draft.serie.trim()) return message('Completa el código y el número de serie.');
    if (active.id == null) return message('No se puede actualizar un equipo sin identificador de base de datos.');
    const response = await fetch('/api/laptops', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, id: active.id }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return message(String(result.error || 'No se pudieron guardar los cambios.'));
    const nuevaClave = `id:${active.id}`;
    setItems(prev=>prev.map(e=>claveFila(e)===selected?{...draft,id:active.id,codigo:draft.codigo.trim()}:e));
    addLog(nuevaClave,'Ficha actualizada');
    setSelected(nuevaClave);
    invalidarLaptops(); await recargar(true);
    message('Cambios guardados en la base de datos.');
  }
  function openNew(){ setModalDraft({...VACIO});setModal('nuevo'); }
  async function saveNew(){
    const e={...modalDraft,codigo:modalDraft.codigo.trim(),serie:modalDraft.serie.trim()};
    if(!e.codigo || !e.serie || !e.marca) return message('Código, serie y marca son obligatorios.');
    const response = await fetch('/api/laptops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return message(String(result.error || 'No se pudo crear el equipo.'));
    const creado={...e,id:Number(result.id)};
    setModal(null);setTab('Información');setFilters(initialFilters);
    invalidarLaptops(); const data = await recargar(true);
    const equipo = data?.equipos.find(item => item.id === creado.id) ?? creado;
    setSelected(claveFila(equipo));setDraft({...equipo});
    addLog(claveFila(equipo),'Equipo creado');message('Equipo guardado en la base de datos.');
  }
  function openAction(kind:'asignar'|'devolver') {
    if(!active) return message('Primero selecciona un equipo.');
    setModalDraft({...active});setModal(kind);
  }
  async function confirmAction(){
    if(!active || !modal) return;
    if(modal==='asignar' && !modalDraft.usuario.trim()) return message('Escribe el usuario responsable.');
    const next:Equipo=modal==='asignar'
      ? {...active,usuario:modalDraft.usuario,area:modalDraft.area,estado:'Asignado / Reservado'}
      : {...active,usuario:'TI Almacén',area:'TI / Reserva',estado:'Disponible'};
    if (active.id == null) return message('El equipo no tiene un identificador de base de datos.');
    const response = await fetch('/api/laptops', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...next, id: active.id }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return message(String(result.error || 'No se pudo registrar el movimiento.'));
    setItems(prev=>prev.map(e=>claveFila(e)===selected?next:e));setDraft(next);
    addLog(selected,modal==='asignar'?`Asignado a ${next.usuario}`:'Devolución registrada a TI Almacén');
    setModal(null);invalidarLaptops();await recargar(true);message('Movimiento guardado en la base de datos.');
  }
  function exportCsv(){
    const cols=(['codigo','tipoActivo','usuario','estado','propiedad','area','areaDestino','procesador','marca','modelo','ram','disco','serie','proveedor','mantenimiento','observacion','origenHoja','origenFila','duplicado','duplicadoSerie'] as const);
    const escape=(v:string)=>'"'+v.replaceAll('"','""')+'"';
    const csv='\uFEFF'+[cols.join(';'),...filtered.map(e=>cols.map(c=>escape(String(e[c] ?? ''))).join(';'))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='gestion_laptops_muestra.csv';a.click();URL.revokeObjectURL(url);
  }
  const field = (k:keyof Equipo,label:string) => <label className={styles.field} key={k}><span>{label}</span><input value={String(draft[k] ?? '')} onChange={e=>setDraft(p=>({...p,[k]:e.target.value}))}/></label>;
  const modalField = (k:keyof Equipo,label:string) => <label className={styles.field} key={k}><span>{label}</span><input value={String(modalDraft[k] ?? '')} onChange={e=>setModalDraft(p=>({...p,[k]:e.target.value}))}/></label>;

  return <div className={styles.root}>
    <div className={styles.topline}>
      {showHeading && <div className={styles.heading}><Laptop size={27}/><div><h1>Gestión de Laptops</h1><p>Registra, asigna y administra todos los equipos</p></div></div>}
      <div className={styles.actions}>
        <button onClick={()=>fileInput.current?.click()} className={styles.secondary} disabled={importando}><ArrowUpFromLine size={16}/>{importando?'Importando...':'Importar Excel'}</button>
        <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={e=>{ const file=e.target.files?.[0]; if(file) void importarArchivo(file); e.currentTarget.value=''; }} />
        <button onClick={openNew} className={styles.primary}><Plus size={17}/>Nuevo equipo</button>
        <button onClick={()=>openAction('asignar')} className={styles.secondary}><UserRoundPlus size={16}/>Asignar equipo</button>
        <button onClick={()=>openAction('devolver')} className={styles.secondary}><RotateCcw size={16}/>Registrar devolución</button>
        <button onClick={exportCsv} className={styles.secondary}><ArrowDownToLine size={16}/>Exportar</button>
      </div>
    </div>

    <div className={styles.stats}>{kpis.map(k=><button type="button" className={`${styles.stat} ${styles[k.tone]} ${styles.statButton} ${kpiActivo(k.label)?styles.statActive:''}`} key={k.label} onClick={()=>activarFiltroKpi(k.label)} aria-pressed={kpiActivo(k.label)} title={`Filtrar por ${k.label}`}><div className={styles.statIcon}><k.Icon size={23}/></div><div className={styles.statText}><span>{k.label}</span><strong>{k.value}</strong><small>{k.hint}</small></div></button>)}</div>

    <div className={styles.filterGrid}>
      {([
        ['estado','Estado',['Todos',...ESTADOS]],['marca','Marca',['Todas',...opts('marca')]],
        ['area','Área',['Todas',...opts('area')]],['propiedad','Propiedad',['Todas',...PROPIEDADES]],
        ['responsable','Responsable',['Todos',...opts('usuario')]],
        ['duplicado','Duplicados',['Todos','Solo duplicados','Sin duplicados']]
      ] as [keyof Filters,string,string[]][]).map(([k,label,options])=><label key={k} className={styles.filter}><span>{label}</span><select value={filters[k]} onChange={e=>setFilter(k,e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>)}
      <label className={`${styles.filter} ${styles.searchFilter}`}><span>Buscar equipo</span><div className={styles.search}><Search size={15}/><input value={filters.texto} onChange={e=>setFilter('texto',e.target.value)} placeholder="Código, usuario o serie..."/></div></label>
      <button className={styles.reset} onClick={()=>setFilters(initialFilters)}>Limpiar filtros</button>
    </div>

    {notice && <div className={styles.notice} role="status"><AlertTriangle size={15}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Cerrar aviso"><X size={14}/></button></div>}

    <div className={`${styles.mainGrid} ${active ? '' : styles.single}`}>
      <section className={styles.panel}>
        <div className={styles.tableHeading}><h2>Registro de laptops <span>{filtered.length} de {items.length} en inventario</span></h2><span className={styles.hint}>{errorCarga || (cargando?'Cargando...':items.length?'Datos desde la base de datos':'Sin equipos cargados')}</span></div>
        <div className={`${styles.tableScroll} ${active ? styles.withDetail : ''}`}>
          <table>
            <thead><tr>
              <th>Código</th><th>Tipo</th><th>Usuario / Responsable</th><th>Estado</th><th>Propiedad</th>
              <th>Área</th><th>Área destino</th><th>Procesador</th><th>Marca</th><th>Modelo</th>
              <th>RAM</th><th>Disco</th><th>Serie</th><th>Proveedor</th><th>Últ. mantenimiento</th>
              <th>Observación</th><th>Origen</th><th>Acciones</th>
            </tr></thead>
            <tbody>{filtered.map(e=>{
              const key = claveFila(e);
              const dup = esDuplicado(e);
              return <tr key={key} className={`${selected===key?styles.selectedRow:''} ${dup?styles.dupRow:''}`} onClick={()=>selectEquipo(e)}>
                <td><b>{e.codigo}</b>{dup && <span className={styles.dupBadge} title={motivoDuplicado(e)}>Duplicado</span>}</td>
                <td>{e.tipoActivo||'—'}</td>
                <td>{e.usuario||'—'}</td>
                <td><span className={`${styles.tag} ${badgeClass(e.estado)}`}>{e.estado}</span></td>
                <td><span className={`${styles.tag} ${e.propiedad==='Propia'?styles.propOwn:e.propiedad==='Valrex'?styles.propVal:styles.propSmart}`}>{e.propiedad}</span></td>
                <td>{e.area||'—'}</td>
                <td>{e.areaDestino||'—'}</td>
                <td>{e.procesador||'—'}</td>
                <td>{e.marca||'—'}</td>
                <td>{e.modelo||'—'}</td>
                <td>{e.ram||'—'}</td>
                <td>{e.disco||'—'}</td>
                <td>{e.serie||'—'}</td>
                <td>{e.proveedor||'—'}</td>
                <td>{e.mantenimiento||'—'}</td>
                <td title={e.observacion}>{e.observacion||'—'}</td>
                <td title={e.origenHoja}>{e.origenHoja?`${e.origenHoja}${e.origenFila?` #${e.origenFila}`:''}`:'—'}</td>
                <td className={styles.rowActions}>
                  <button title="Editar equipo" onClick={evt=>{evt.stopPropagation();selectEquipo(e);setTab('Información');}}><ClipboardList size={15}/></button>
                  <button title="Más acciones" onClick={evt=>{evt.stopPropagation();setMenuCode(menuCode===key?null:key);}}><MoreVertical size={15}/></button>
                  {menuCode===key && <div className={styles.rowMenu}><button onClick={evt=>{evt.stopPropagation();selectEquipo(e);setModalDraft({...e});setModal('asignar');}}>Asignar</button><button onClick={evt=>{evt.stopPropagation();selectEquipo(e);setModalDraft({...e});setModal('devolver');}}>Devolver</button></div>}
                </td>
              </tr>;
            })}</tbody>
          </table>
          {filtered.length===0&&<div className={styles.empty}>{cargando?'Cargando inventario...':items.length===0?'No hay equipos cargados. Importa el Excel para comenzar.':'No hay equipos que coincidan con los filtros.'}</div>}
        </div>
        <div className={styles.tableFooter}><span>{filtered.length} {filtered.length===1?'equipo':'equipos'}</span><span>Desplázate para ver más equipos y columnas</span></div>
      </section>

      {active && (
        <aside className={styles.detail}>
          <div className={styles.detailHead}><div className={styles.detailLogo}><Laptop size={22}/></div><div><div className={styles.detailCode}>{active.codigo} <span className={`${styles.tag} ${badgeClass(active.estado)}`}>{active.estado}</span>{esDuplicado(active) && <span className={styles.dupBadge} title={motivoDuplicado(active)}>Duplicado</span>}</div><small>{active.marca} {active.modelo}</small></div><button className={styles.closeDetail} title="Deseleccionar" onClick={()=>setSelected('')}><X size={17}/></button></div>
          <div className={styles.tabs}>{(['Información','Asignación','Mantenimiento','Historial'] as Tab[]).map(t=><button key={t} className={tab===t?styles.activeTab:''} onClick={()=>setTab(t)}>{t}</button>)}</div>
          {tab==='Información'&&<>
            <div className={styles.summary}><div className={styles.deviceIcon}><Laptop size={55}/></div><dl><div><dt>Marca</dt><dd>{active.marca}</dd></div><div><dt>Modelo</dt><dd>{active.modelo||'Sin dato'}</dd></div><div><dt>N° de serie</dt><dd>{active.serie}</dd></div><div><dt>Propiedad</dt><dd>{active.propiedad}</dd></div><div><dt>Origen</dt><dd>{active.origenHoja||'Sin dato'}{active.origenFila?` #${active.origenFila}`:''}</dd></div></dl></div>
            <div className={styles.editGrid}>
              {field('codigo','Código')}{field('tipoActivo','Tipo')}
              <label className={styles.field}><span>Estado</span><select value={esAsignadoReservado(draft.estado) ? 'Asignado / Reservado' : draft.estado} onChange={e=>setDraft(p=>({...p,estado:e.target.value as Estado}))}>{ESTADOS.map(s=><option key={s}>{s}</option>)}</select></label>
              {field('marca','Marca')}{field('area','Área')}{field('areaDestino','Área destino')}{field('modelo','Modelo')}{field('usuario','Usuario asignado')}{field('procesador','Procesador')}{field('serie','N° de serie')}{field('ram','RAM')}{field('disco','Disco')}{field('proveedor','Proveedor')}{field('mantenimiento','Últ. mantenimiento')}
              <label className={styles.field}><span>Propiedad</span><select value={draft.propiedad} onChange={e=>setDraft(p=>({...p,propiedad:e.target.value as Propiedad}))}>{PROPIEDADES.map(s=><option key={s}>{s}</option>)}</select></label>
              <label className={`${styles.field} ${styles.full}`}><span>Observación</span><textarea rows={3} value={draft.observacion} onChange={e=>setDraft(p=>({...p,observacion:e.target.value}))}/></label>
            </div>
            <div className={styles.detailButtons}><button className={styles.primary} onClick={save}><Save size={15}/>Guardar cambios</button><button className={styles.secondary} onClick={()=>openAction('asignar')}><UserRoundPlus size={15}/>Reasignar</button><button className={styles.secondary} onClick={()=>setTab('Historial')}><History size={15}/>Historial</button></div>
          </>}
          {tab==='Asignación'&&<div className={styles.tabBody}><h3>Asignación actual</h3><p><b>Responsable:</b> {active.usuario||'Sin asignar'}</p><p><b>Área:</b> {active.area}</p><p><b>Estado:</b> {active.estado}</p><button className={styles.primary} onClick={()=>openAction('asignar')}><UserRoundPlus size={15}/>Asignar / Reasignar</button><button className={styles.secondary} onClick={()=>openAction('devolver')}><RotateCcw size={15}/>Registrar devolución</button></div>}
          {tab==='Mantenimiento'&&<div className={styles.tabBody}><h3>Soporte y mantenimiento</h3><p><b>Último mantenimiento:</b> {active.mantenimiento||'Sin fecha registrada'}</p><p><b>Observaciones:</b> {active.observacion||'Sin observaciones'}</p><p>Las órdenes de mantenimiento y sus fechas deben conectarse al backend para tener historial persistente.</p><button className={styles.secondary} onClick={()=>setTab('Información')}>Editar datos de mantenimiento</button></div>}
          {tab==='Historial'&&<div className={styles.tabBody}><h3>Historial local</h3>{(logs[selected]??[]).length?(logs[selected]??[]).map((s,i)=><p key={i} className={styles.log}>{s}</p>):<p>Aún no hay movimientos en esta sesión. El historial definitivo requiere base de datos.</p>}</div>}
        </aside>
      )}
    </div>

    <p className={styles.footnote}>Las altas, ediciones, asignaciones y devoluciones se guardan en MySQL. La importación reemplaza las hojas del Excel y conserva las filas duplicadas.</p>

    {modal&&<div className={styles.overlay} onClick={()=>setModal(null)}><div className={styles.dialog} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><h2>{modal==='nuevo'?'Registrar nueva laptop':modal==='asignar'?'Asignar laptop':'Registrar devolución'}</h2><button onClick={()=>setModal(null)} aria-label="Cerrar"><X size={18}/></button></div>
      {modal==='nuevo'?<><div className={styles.modalGrid}>{modalField('codigo','Código')}{modalField('tipoActivo','Tipo')}{modalField('serie','Número de serie')}{modalField('marca','Marca')}{modalField('modelo','Modelo')}{modalField('usuario','Responsable')}{modalField('area','Área')}{modalField('areaDestino','Área destino')}{modalField('procesador','Procesador')}{modalField('ram','RAM')}{modalField('disco','Disco')}{modalField('proveedor','Proveedor')}{modalField('mantenimiento','Últ. mantenimiento')}<label className={styles.field}><span>Propiedad</span><select value={modalDraft.propiedad} onChange={e=>setModalDraft(p=>({...p,propiedad:e.target.value as Propiedad}))}>{PROPIEDADES.map(p=><option key={p}>{p}</option>)}</select></label><label className={styles.field}><span>Estado</span><select value={esAsignadoReservado(modalDraft.estado) ? 'Asignado / Reservado' : modalDraft.estado} onChange={e=>setModalDraft(p=>({...p,estado:e.target.value as Estado}))}>{ESTADOS.map(p=><option key={p}>{p}</option>)}</select></label>{modalField('observacion','Observación')}</div><div className={styles.modalActions}><button className={styles.secondary} onClick={()=>setModal(null)}>Cancelar</button><button className={styles.primary} onClick={saveNew}><Plus size={15}/>Registrar</button></div></>:
      <><p>Equipo: <strong>{active?.codigo}</strong></p>{modal==='asignar'?<div className={styles.modalGrid}>{modalField('usuario','Nuevo responsable')}{modalField('area','Área de destino')}</div>:<p>Se registrará la devolución a <strong>TI Almacén</strong> y el estado pasará a <strong>Disponible</strong>.</p>}<div className={styles.modalActions}><button className={styles.secondary} onClick={()=>setModal(null)}>Cancelar</button><button className={styles.primary} onClick={confirmAction}><Check size={15}/>Confirmar</button></div></>}
    </div></div>}
  </div>;
}
