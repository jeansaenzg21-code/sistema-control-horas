'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDownToLine, ArrowUpFromLine, Check,
  ClipboardList, Clock3, Laptop, MoreVertical, Plus, RotateCcw,
  Search, UserRoundPlus, Users, Wrench, X, CheckCircle2, Save, History,
  AlertTriangle, type LucideIcon
} from 'lucide-react';
import styles from './GestionLaptops.module.css';

type Propiedad = 'Propia' | 'Smart Service' | 'Valrex';
type Estado = 'Asignado' | 'Asignado / Reservado' | 'Disponible' | 'En reparación' | 'BAJA' | 'Vendido' | 'No disponible' | 'Pendiente';
type Equipo = {
  codigo: string; usuario: string; estado: Estado; propiedad: Propiedad;
  area: string; marca: string; modelo: string; procesador: string;
  ram: string; disco: string; serie: string; mantenimiento: string; observacion: string;
};

const VACIO: Equipo = {
  codigo:'', usuario:'', estado:'Disponible', propiedad:'Propia', area:'TI / Reserva',
  marca:'', modelo:'', procesador:'', ram:'8 GB', disco:'', serie:'', mantenimiento:'', observacion:''
};
const ESTADOS: Estado[] = ['Asignado','Asignado / Reservado','Disponible','En reparación','BAJA','Vendido','No disponible','Pendiente'];
const PROPIEDADES: Propiedad[] = ['Propia','Smart Service','Valrex'];

type Tab = 'Información'|'Asignación'|'Mantenimiento'|'Historial';
type Modal = 'nuevo'|'asignar'|'devolver'|null;
type Filters = { estado:string; marca:string; area:string; propiedad:string; responsable:string; texto:string };
const initialFilters:Filters = { estado:'Todos', marca:'Todas', area:'Todas', propiedad:'Todas', responsable:'Todos', texto:'' };

function dateStamp() { return new Date().toLocaleString('es-PE'); }
function badgeClass(estado: Estado) {
  if (estado === 'Asignado') return styles.tagGreen;
  if (estado === 'Disponible') return styles.tagMint;
  if (estado === 'En reparación') return styles.tagGold;
  if (estado === 'Asignado / Reservado') return styles.tagBlue;
  if (estado === 'Pendiente') return styles.tagPurple;
  return styles.tagGray;
}

type Kpi = { label: string; value: number; hint: string; tone: string; Icon: LucideIcon };

export default function GestionLaptops({ showHeading = false }: { showHeading?: boolean } = {}) {
  const [items, setItems] = useState<Equipo[]>([]);
  const [cargando, setCargando] = useState(true);
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
  const active = items.find(e => e.codigo === selected);
  const opts = (field:'marca'|'area'|'usuario') => [...new Set(items.map(e => e[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));

  const cargarEquipos = useCallback(async () => {
    try {
      const res = await fetch('/api/laptops', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(String(data.error || 'No se pudo cargar el inventario.'));
        return;
      }
      setItems(Array.isArray(data.equipos) ? data.equipos as Equipo[] : []);
    } catch {
      setNotice('No se pudo cargar el inventario.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargarEquipos(); }, [cargarEquipos]);

  useEffect(() => {
    if (selected && !items.some((e) => e.codigo === selected)) {
      setSelected('');
      setDraft({ ...VACIO });
    }
  }, [items, selected]);

  useEffect(() => {
    const estado = searchParams.get('estado');
    const marca = searchParams.get('marca');
    const area = searchParams.get('area');
    const propiedad = searchParams.get('propiedad');
    const responsable = searchParams.get('responsable');
    const texto = searchParams.get('texto');
    setFilters((prev) => ({
      estado: estado && ESTADOS.includes(estado as Estado) ? estado : prev.estado,
      marca: marca ?? prev.marca,
      area: area ?? prev.area,
      propiedad: propiedad && PROPIEDADES.includes(propiedad as Propiedad) ? propiedad : prev.propiedad,
      responsable: responsable ?? prev.responsable,
      texto: texto ?? prev.texto,
    }));
  }, [searchParams]);

  const kpis = useMemo<Kpi[]>(() => {
    const total = items.length;
    const porcentaje = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}% del total` : 'Sin datos';
    const asignadas = items.filter((e) => e.estado === 'Asignado' || e.estado === 'Asignado / Reservado').length;
    const disponibles = items.filter((e) => e.estado === 'Disponible').length;
    const reparacion = items.filter((e) => e.estado === 'En reparación').length;
    const pendientes = items.filter((e) => e.estado === 'Pendiente').length;
    return [
      { label:'Total equipos', value: total, hint: total > 0 ? 'Inventario cargado' : 'Sin equipos', tone:'blue', Icon:Laptop },
      { label:'Asignadas / Reservadas', value: asignadas, hint: porcentaje(asignadas), tone:'green', Icon:Users },
      { label:'Disponibles', value: disponibles, hint: porcentaje(disponibles), tone:'mint', Icon:CheckCircle2 },
      { label:'En reparación', value: reparacion, hint: porcentaje(reparacion), tone:'gold', Icon:Wrench },
      { label:'Pendientes de validar', value: pendientes, hint: porcentaje(pendientes), tone:'purple', Icon:Clock3 },
    ];
  }, [items]);

  const filtered = useMemo(() => items.filter(e => {
    const match = (v:string, chosen:string) => chosen === 'Todos' || chosen === 'Todas' || v === chosen;
    const matchMarca = (v:string, chosen:string) => chosen === 'Todas' || v.trim().toLocaleLowerCase('es') === chosen.trim().toLocaleLowerCase('es');
    const q = filters.texto.trim().toLocaleLowerCase('es');
    return match(e.estado,filters.estado) && matchMarca(e.marca,filters.marca) && match(e.area,filters.area)
      && match(e.propiedad,filters.propiedad) && match(e.usuario,filters.responsable)
      && (!q || Object.values(e).some(v=>String(v).toLocaleLowerCase('es').includes(q)));
  }),[items,filters]);
  const setFilter = (key:keyof Filters,value:string) => { setFilters(prev=>({...prev,[key]:value})); };
  const selectEquipo = (e:Equipo) => { setSelected(e.codigo); setDraft({...e}); setTab('Información'); setMenuCode(null); };
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
      await cargarEquipos();
      setNotice(`Importación completada: ${data.creados} creados, ${data.actualizados} actualizados, ${data.omitidos} omitidos.`);
    } catch {
      setNotice('No se pudo conectar con el servidor para importar.');
    } finally {
      setImportando(false);
    }
  }

  function save() {
    if (!active) return;
    if (!draft.codigo.trim() || !draft.serie.trim()) return message('Completa el código y el número de serie.');
    if (draft.codigo !== selected && items.some(i=>i.codigo.toLowerCase()===draft.codigo.trim().toLowerCase())) return message('El código ya está registrado.');
    if (items.some(i=>i.codigo!==selected && i.serie.trim() && i.serie.trim().toLowerCase()===draft.serie.trim().toLowerCase())) return message('Serie repetida: verifica antes de guardar.');
    setItems(prev=>prev.map(e=>e.codigo===selected?{...draft,codigo:draft.codigo.trim()}:e));
    addLog(draft.codigo,'Ficha actualizada');
    if(draft.codigo!==selected) setSelected(draft.codigo);
    message('Cambios guardados localmente (no en base de datos).');
  }
  function openNew(){ setModalDraft({...VACIO});setModal('nuevo'); }
  function saveNew(){
    const e={...modalDraft,codigo:modalDraft.codigo.trim(),serie:modalDraft.serie.trim()};
    if(!e.codigo || !e.serie || !e.marca) return message('Código, serie y marca son obligatorios.');
    if(items.some(i=>i.codigo.toLowerCase()===e.codigo.toLowerCase())) return message('Código duplicado.');
    if(items.some(i=>i.serie.trim().toLowerCase()===e.serie.toLowerCase())) return message('Número de serie duplicado.');
    setItems(prev=>[e,...prev]);setSelected(e.codigo);setDraft({...e});setModal(null);setTab('Información');
    addLog(e.codigo,'Equipo creado');message('Equipo agregado en esta sesión (sin persistencia).');setFilters(initialFilters);
  }
  function openAction(kind:'asignar'|'devolver') {
    if(!active) return message('Primero selecciona un equipo.');
    setModalDraft({...active});setModal(kind);
  }
  function confirmAction(){
    if(!active || !modal) return;
    if(modal==='asignar' && !modalDraft.usuario.trim()) return message('Escribe el usuario responsable.');
    const next:Equipo=modal==='asignar'
      ? {...active,usuario:modalDraft.usuario,area:modalDraft.area,estado:'Asignado'}
      : {...active,usuario:'TI Almacén',area:'TI / Reserva',estado:'Disponible'};
    setItems(prev=>prev.map(e=>e.codigo===active.codigo?next:e));setDraft(next);
    addLog(active.codigo,modal==='asignar'?`Asignado a ${next.usuario}`:'Devolución registrada a TI Almacén');
    setModal(null);message('Movimiento registrado en memoria.');
  }
  function exportCsv(){
    const cols=(['codigo','usuario','estado','propiedad','area','marca','modelo','procesador','ram','disco','serie','mantenimiento','observacion'] as const);
    const escape=(v:string)=>'"'+v.replaceAll('"','""')+'"';
    const csv='\uFEFF'+[cols.join(';'),...filtered.map(e=>cols.map(c=>escape(e[c])).join(';'))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='gestion_laptops_muestra.csv';a.click();URL.revokeObjectURL(url);
  }
  const field = (k:keyof Equipo,label:string) => <label className={styles.field} key={k}><span>{label}</span><input value={draft[k]} onChange={e=>setDraft(p=>({...p,[k]:e.target.value}))}/></label>;
  const modalField = (k:keyof Equipo,label:string) => <label className={styles.field} key={k}><span>{label}</span><input value={modalDraft[k]} onChange={e=>setModalDraft(p=>({...p,[k]:e.target.value}))}/></label>;

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

    <div className={styles.stats}>{kpis.map(k=><div className={`${styles.stat} ${styles[k.tone]}`} key={k.label}><div className={styles.statIcon}><k.Icon size={23}/></div><div className={styles.statText}><span>{k.label}</span><strong>{k.value}</strong><small>{k.hint}</small></div></div>)}</div>

    <div className={styles.filterGrid}>
      {([
        ['estado','Estado',['Todos',...ESTADOS]],['marca','Marca',['Todas',...opts('marca')]],
        ['area','Área',['Todas',...opts('area')]],['propiedad','Propiedad',['Todas',...PROPIEDADES]],
        ['responsable','Responsable',['Todos',...opts('usuario')]]
      ] as [keyof Filters,string,string[]][]).map(([k,label,options])=><label key={k} className={styles.filter}><span>{label}</span><select value={filters[k]} onChange={e=>setFilter(k,e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>)}
      <label className={`${styles.filter} ${styles.searchFilter}`}><span>Buscar equipo</span><div className={styles.search}><Search size={15}/><input value={filters.texto} onChange={e=>setFilter('texto',e.target.value)} placeholder="Código, usuario o serie..."/></div></label>
      <button className={styles.reset} onClick={()=>setFilters(initialFilters)}>Limpiar filtros</button>
    </div>

    {notice && <div className={styles.notice} role="status"><AlertTriangle size={15}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Cerrar aviso"><X size={14}/></button></div>}

    <div className={`${styles.mainGrid} ${active ? '' : styles.single}`}>
      <section className={styles.panel}>
        <div className={styles.tableHeading}><h2>Registro de laptops <span>{filtered.length} de {items.length} en inventario</span></h2><span className={styles.hint}>{cargando?'Cargando...':items.length?'Datos desde la base de datos':'Sin equipos cargados'}</span></div>
        <div className={`${styles.tableScroll} ${active ? styles.withDetail : ''}`}><table><thead><tr><th>Código</th><th>Usuario / Responsable</th><th>Estado</th><th>Propiedad</th><th>Área</th><th>Marca</th><th>Modelo</th><th>RAM</th><th>Serie</th><th>Últ. mantenimiento</th><th>Observación</th><th>Acciones</th></tr></thead>
          <tbody>{filtered.map(e=><tr key={e.codigo} className={selected===e.codigo?styles.selectedRow:''} onClick={()=>selectEquipo(e)}><td><b>{e.codigo}</b></td><td>{e.usuario}</td><td><span className={`${styles.tag} ${badgeClass(e.estado)}`}>{e.estado}</span></td><td><span className={`${styles.tag} ${e.propiedad==='Propia'?styles.propOwn:e.propiedad==='Valrex'?styles.propVal:styles.propSmart}`}>{e.propiedad}</span></td><td>{e.area}</td><td>{e.marca}</td><td>{e.modelo||'—'}</td><td>{e.ram}</td><td>{e.serie}</td><td>{e.mantenimiento||'—'}</td><td title={e.observacion}>{e.observacion||'—'}</td><td className={styles.rowActions}><button title="Editar equipo" onClick={evt=>{evt.stopPropagation();selectEquipo(e);setTab('Información');}}><ClipboardList size={15}/></button><button title="Más acciones" onClick={evt=>{evt.stopPropagation();setMenuCode(menuCode===e.codigo?null:e.codigo);}}><MoreVertical size={15}/></button>{menuCode===e.codigo && <div className={styles.rowMenu}><button onClick={evt=>{evt.stopPropagation();selectEquipo(e);setModalDraft({...e});setModal('asignar');}}>Asignar</button><button onClick={evt=>{evt.stopPropagation();selectEquipo(e);setModalDraft({...e});setModal('devolver');}}>Devolver</button></div>}</td></tr>)}</tbody></table>{filtered.length===0&&<div className={styles.empty}>{cargando?'Cargando inventario...':items.length===0?'No hay equipos cargados. Importa el Excel para comenzar.':'No hay equipos que coincidan con los filtros.'}</div>}</div>
        <div className={styles.tableFooter}><span>{filtered.length} {filtered.length===1?'equipo':'equipos'}</span><span>Desplázate para ver más equipos</span></div>
      </section>

      {active && (
        <aside className={styles.detail}>
          <div className={styles.detailHead}><div className={styles.detailLogo}><Laptop size={22}/></div><div><div className={styles.detailCode}>{active.codigo} <span className={`${styles.tag} ${badgeClass(active.estado)}`}>{active.estado}</span></div><small>{active.marca} {active.modelo}</small></div><button className={styles.closeDetail} title="Deseleccionar" onClick={()=>setSelected('')}><X size={17}/></button></div>
          <div className={styles.tabs}>{(['Información','Asignación','Mantenimiento','Historial'] as Tab[]).map(t=><button key={t} className={tab===t?styles.activeTab:''} onClick={()=>setTab(t)}>{t}</button>)}</div>
          {tab==='Información'&&<>
            <div className={styles.summary}><div className={styles.deviceIcon}><Laptop size={55}/></div><dl><div><dt>Marca</dt><dd>{active.marca}</dd></div><div><dt>Modelo</dt><dd>{active.modelo||'Sin dato'}</dd></div><div><dt>N° de serie</dt><dd>{active.serie}</dd></div><div><dt>Propiedad</dt><dd>{active.propiedad}</dd></div></dl></div>
            <div className={styles.editGrid}>
              {field('codigo','Código')}
              <label className={styles.field}><span>Estado</span><select value={draft.estado} onChange={e=>setDraft(p=>({...p,estado:e.target.value as Estado}))}>{ESTADOS.map(s=><option key={s}>{s}</option>)}</select></label>
              {field('marca','Marca')}{field('area','Área')}{field('modelo','Modelo')}{field('usuario','Usuario asignado')}{field('procesador','Procesador')}{field('serie','N° de serie')}{field('ram','RAM')}{field('mantenimiento','Últ. mantenimiento')}{field('disco','Disco')}
              <label className={styles.field}><span>Propiedad</span><select value={draft.propiedad} onChange={e=>setDraft(p=>({...p,propiedad:e.target.value as Propiedad}))}>{PROPIEDADES.map(s=><option key={s}>{s}</option>)}</select></label>
              <label className={`${styles.field} ${styles.full}`}><span>Observación</span><textarea rows={3} value={draft.observacion} onChange={e=>setDraft(p=>({...p,observacion:e.target.value}))}/></label>
            </div>
            <div className={styles.detailButtons}><button className={styles.primary} onClick={save}><Save size={15}/>Guardar cambios</button><button className={styles.secondary} onClick={()=>openAction('asignar')}><UserRoundPlus size={15}/>Reasignar</button><button className={styles.secondary} onClick={()=>setTab('Historial')}><History size={15}/>Historial</button></div>
          </>}
          {tab==='Asignación'&&<div className={styles.tabBody}><h3>Asignación actual</h3><p><b>Responsable:</b> {active.usuario||'Sin asignar'}</p><p><b>Área:</b> {active.area}</p><p><b>Estado:</b> {active.estado}</p><button className={styles.primary} onClick={()=>openAction('asignar')}><UserRoundPlus size={15}/>Asignar / Reasignar</button><button className={styles.secondary} onClick={()=>openAction('devolver')}><RotateCcw size={15}/>Registrar devolución</button></div>}
          {tab==='Mantenimiento'&&<div className={styles.tabBody}><h3>Soporte y mantenimiento</h3><p><b>Último mantenimiento:</b> {active.mantenimiento||'Sin fecha registrada'}</p><p><b>Observaciones:</b> {active.observacion||'Sin observaciones'}</p><p>Las órdenes de mantenimiento y sus fechas deben conectarse al backend para tener historial persistente.</p><button className={styles.secondary} onClick={()=>setTab('Información')}>Editar datos de mantenimiento</button></div>}
          {tab==='Historial'&&<div className={styles.tabBody}><h3>Historial local</h3>{(logs[active.codigo]??[]).length?(logs[active.codigo]??[]).map((s,i)=><p key={i} className={styles.log}>{s}</p>):<p>Aún no hay movimientos en esta sesión. El historial definitivo requiere base de datos.</p>}</div>}
        </aside>
      )}
    </div>

    <p className={styles.footnote}>Inventario leído desde MySQL. La importación actualiza por código y reporta Hoja1 (ALMACEN P100) sin persistirla en una tabla aparte. Guardar, asignar, devolver y crear aún se aplican solo en memoria y se pierden al recargar.</p>

    {modal&&<div className={styles.overlay} onClick={()=>setModal(null)}><div className={styles.dialog} onClick={e=>e.stopPropagation()}><div className={styles.modalHead}><h2>{modal==='nuevo'?'Registrar nueva laptop':modal==='asignar'?'Asignar laptop':'Registrar devolución'}</h2><button onClick={()=>setModal(null)} aria-label="Cerrar"><X size={18}/></button></div>
      {modal==='nuevo'?<><div className={styles.modalGrid}>{modalField('codigo','Código')}{modalField('serie','Número de serie')}{modalField('marca','Marca')}{modalField('modelo','Modelo')}{modalField('usuario','Responsable')}{modalField('area','Área')}{modalField('procesador','Procesador')}{modalField('ram','RAM')}{modalField('disco','Disco')}<label className={styles.field}><span>Propiedad</span><select value={modalDraft.propiedad} onChange={e=>setModalDraft(p=>({...p,propiedad:e.target.value as Propiedad}))}>{PROPIEDADES.map(p=><option key={p}>{p}</option>)}</select></label><label className={styles.field}><span>Estado</span><select value={modalDraft.estado} onChange={e=>setModalDraft(p=>({...p,estado:e.target.value as Estado}))}>{ESTADOS.map(p=><option key={p}>{p}</option>)}</select></label>{modalField('observacion','Observación')}</div><div className={styles.modalActions}><button className={styles.secondary} onClick={()=>setModal(null)}>Cancelar</button><button className={styles.primary} onClick={saveNew}><Plus size={15}/>Registrar</button></div></>:
      <><p>Equipo: <strong>{active?.codigo}</strong></p>{modal==='asignar'?<div className={styles.modalGrid}>{modalField('usuario','Nuevo responsable')}{modalField('area','Área de destino')}</div>:<p>Se registrará la devolución a <strong>TI Almacén</strong> y el estado pasará a <strong>Disponible</strong>.</p>}<div className={styles.modalActions}><button className={styles.secondary} onClick={()=>setModal(null)}>Cancelar</button><button className={styles.primary} onClick={confirmAction}><Check size={15}/>Confirmar</button></div></>}
    </div></div>}
  </div>;
}
