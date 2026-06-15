import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { ActionButton, ModalShell, PageHeader, fieldClass, labelClass } from "../components/ui";
import ApuDetalle from "./ApuDetalle";

const API = "http://127.0.0.1:8000";
const PERF_DEBUG = false;

const COLORES_TIPO = {
  FASE:        { bg: "#14532d", text: "#fff", indent: 0  },
  CATEGORIA:   { bg: "#166534", text: "#fff", indent: 16 },
  SUBCATEGORIA:{ bg: "#166534", text: "#fff", indent: 32 },
  CAPITULO:    { bg: "#15803d", text: "#fff", indent: 48 },
  SUBCAPITULO: { bg: "#86efac", text: "#1e3a8a", indent: 64 },
  GRUPO:       { bg: "#bbf7d0", text: "#1e3a8a", indent: 80 },
  RUBRO:       { bg: "#fff",    text: "#111827", indent: 96 },
};

const BADGE = {
  VINCULADO: { bg: "#dcfce7", text: "#166534", label: "Vinculado" },
  PENDIENTE: { bg: "#fef9c3", text: "#854d0e", label: "Pendiente" },
  SIN_APU:   { bg: "#fee2e2", text: "#991b1b", label: "Sin APU"   },
};

function normalizar(t) {
  if (!t) return "";
  return t.replace(/^RN[\s-]+/i,"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
}

function textoVista(t) {
  if (t == null) return "";
  return String(t).replace(/\u00c2(?=\u00b0)/g, "").replace(/\u00c2/g, "");
}

function construirArbol(nodos) {
  const m = {}; nodos.forEach(n => { m[n.id] = { ...n, hijos: [] }; });
  const r = [];
  nodos.forEach(n => { n.padre_id && m[n.padre_id] ? m[n.padre_id].hijos.push(m[n.id]) : r.push(m[n.id]); });
  return r;
}

function aplanar(nodos, nv = 0, res = []) {
  nodos.forEach(n => { res.push({ ...n, _nivel: nv }); if (n.hijos?.length) aplanar(n.hijos, nv+1, res); });
  return res;
}

function calcularGrupos(planos) {
  const norm = {}, ind = {};
  planos.filter(n => n.tipo === "RUBRO").forEach(n => {
    const k = normalizar(n.descripcion) + "|||" + (n.unidad||"").toLowerCase().trim();
    const dest = n.individualizado ? ind : norm;
    if (!dest[k]) dest[k] = { descripcion: n.descripcion, unidad: n.unidad, rubros: [] };
    dest[k].rubros.push(n);
  });
  const ord = o => Object.values(o).sort((a,b) => b.rubros.length - a.rubros.length);
  return { grupos: ord(norm), individualizados: ord(ind) };
}

function fmtM(v) { if (v==null) return "-"; return "$"+Number(v).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtN(v) { if (v==null) return "-"; return Number(v).toLocaleString("es-EC",{maximumFractionDigits:2}); }
function fmtPct(v) { if (v==null) return "-"; return Number(v).toLocaleString("es-EC",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2}); }
function colorDif(v) { if (v == null) return "#6b7280"; if (v > 0) return "#dc2626"; if (v < 0) return "#16a34a"; return "#6b7280"; }
function fmtDifM(v) { if (v == null) return "-"; return `${v > 0 ? "+" : ""}${fmtM(v)}`; }
function startPerf() {
  if (!PERF_DEBUG) return null;
  return performance.now();
}
function debugPerf(label, startedAt, extra = {}) {
  if (!PERF_DEBUG || startedAt == null) return;
  console.debug(`[Presupuestos perf] ${label}`, { ms: Math.round((performance.now() - startedAt) * 100) / 100, ...extra });
}

const DOT_COLOR = { completo: "#16a34a", parcial: "#ca8a04", ninguno: "#dc2626", sin_rubros: "#d1d5db" };

const VISTAS_COLUMNAS = {
  presupuesto: ["descripcion", "unidad", "metrado", "pu_ref", "total_ref", "estado"],
  meta: ["descripcion", "unidad", "metrado", "pu_meta", "total_meta", "estado"],
  unitarios: ["descripcion", "unidad", "pu_ref", "pu_meta", "dif_pu", "dif_pu_pct", "estado"],
  totales: ["descripcion", "unidad", "metrado", "total_ref", "total_meta", "dif_total", "dif_total_pct", "estado"],
  diferencias: ["descripcion", "unidad", "metrado", "total_ref_comparable", "total_meta_comparable", "dif_comparable", "dif_comparable_pct", "estado"],
  desglose: ["descripcion", "unidad", "metrado", "material", "mano_de_obra", "equipo", "transporte", "otros", "pu_meta"],
};

const COLUMNAS = {
  descripcion: { label: "Descripcion", align: "left", width: "28%" },
  unidad: { label: "Und", align: "center", width: "5%" },
  metrado: { label: "Metrado", align: "right", width: "8%" },
  pu_ref: { label: "P.U. Ref", align: "right", width: "8%" },
  pu_meta: { label: "P.U. Meta", align: "right", width: "8%" },
  dif_pu: { label: "Dif P.U. $", align: "right", width: "8%" },
  dif_pu_pct: { label: "Dif P.U. %", align: "right", width: "8%" },
  total_ref: { label: "P. Total Ref", align: "right", width: "9%" },
  total_meta: { label: "P. Total Meta", align: "right", width: "9%" },
  dif_total: { label: "Dif Total $", align: "right", width: "9%" },
  dif_total_pct: { label: "Dif Total %", align: "right", width: "8%" },
  total_ref_comparable: { label: "P. Total Ref comparable", align: "right", width: "11%" },
  total_meta_comparable: { label: "P. Total Meta comparable", align: "right", width: "11%" },
  dif_comparable: { label: "Dif $", align: "right", width: "9%" },
  dif_comparable_pct: { label: "Dif %", align: "right", width: "8%" },
  material: { label: "P.U. Materiales", align: "right", width: "9%" },
  mano_de_obra: { label: "P.U. Mano de Obra", align: "right", width: "9%" },
  equipo: { label: "P.U. Equipos", align: "right", width: "9%" },
  transporte: { label: "P.U. Transporte", align: "right", width: "9%" },
  otros: { label: "P.U. Otros", align: "right", width: "8%" },
  estado: { label: "Estado", align: "center", width: "8%" },
};

// Cache de costos APU
const costoCache = {};
async function fetchCostoApu(apuId, force = false) {
  if (!force && costoCache[apuId] !== undefined) return costoCache[apuId];
  try {
    const r = await fetch(`${API}/apus/${apuId}/costo`);
    if (!r.ok) { costoCache[apuId] = null; return null; }
    const d = await r.json();
    costoCache[apuId] = d;
    return d;
  } catch { costoCache[apuId] = null; return null; }
}

// Subcomponente TablaGrupos
function TablaGrupos({ titulo, grupos, expandidos, onToggle, onVincular, onDesvincularGrupo, onIndividualizar, onReagrupar, esInd, bordeColor, headerBg }) {
  return (
    <>
      <div style={{ fontSize:"12px", fontWeight:"500", color:"#6b7280", marginBottom:"6px" }}>
        <span style={{ background: esInd?"#fef9c3":"#f3f4f6", color: esInd?"#854d0e":"#374151", borderRadius:"6px", padding:"2px 10px" }}>{titulo}</span>
      </div>
      <div style={{ border:`1px solid ${bordeColor}`, borderRadius:"8px", overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px", tableLayout:"fixed" }}>
          <colgroup><col style={{width:"36%"}}/><col style={{width:"6%"}}/><col style={{width:"5%"}}/><col style={{width:"12%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/><col style={{width:"21%"}}/></colgroup>
          <thead>
            <tr style={{ background: headerBg }}>
              {["Descripcion","Und","N","Metrado total","P.U. Ref","Dif ($)","APU"].map((h,i)=>(
                <th key={h} style={{ padding:"7px 8px", textAlign: i>=2&&i<=5?"right":i===6?"center":"left", fontWeight:"500", fontSize:"11px", color: esInd?"#854d0e":"#6b7280", borderBottom:`1px solid ${bordeColor}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g, idx) => {
              const clave = `${esInd?"ind":"grp"}-${idx}`;
              const exp = expandidos[clave];
              const mt = g.rubros.reduce((s,r)=>s+(r.metrado||0),0);
              const pus = [...new Set(g.rubros.map(r=>r.precio_unitario_ref).filter(v=>v!=null))];
              const puVar = pus.length>1;
              const puDisp = puVar?`${Math.min(...pus).toFixed(2)}-${Math.max(...pus).toFixed(2)}`:pus[0]?.toFixed(2)||"-";
              const todoVinc = g.rubros.every(r=>r.tipo_rubro==="VINCULADO");
              const sinApu = g.rubros.every(r=>r.observaciones==="SIN_APU");
              return (
                <React.Fragment key={clave}>
                  <tr style={{ borderTop:`1px solid ${bordeColor}`, background: todoVinc?"#f0fdf4":"#fff", cursor:"pointer" }} onClick={()=>onToggle(clave)}>
                    <td style={{ padding:"7px 8px" }}>
                      <span style={{ fontSize:"10px", marginRight:"4px" }}>{exp?"v":">"}</span>
                      {textoVista(g.descripcion)}
                      {puVar && <span style={{ fontSize:"10px", background:"#fee2e2", color:"#991b1b", borderRadius:"3px", padding:"1px 5px", marginLeft:"6px" }}>P.U. variable</span>}
                      {sinApu && <span style={{ fontSize:"10px", background:"#fee2e2", color:"#991b1b", borderRadius:"3px", padding:"1px 5px", marginLeft:"6px" }}>SIN APU</span>}
                    </td>
                    <td style={{ padding:"7px 4px" }}>{g.unidad}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right", fontWeight:"600", color: esInd?"#854d0e":"#374151" }}>{g.rubros.length}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right" }}>{fmtN(mt)}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right", color: puVar?"#dc2626":"#374151" }}>{puDisp}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right", color:"#6b7280" }}>-</td>
                    <td style={{ padding:"7px 8px", textAlign:"center" }} onClick={e=>e.stopPropagation()}>
                      {todoVinc
                        ? <button onClick={()=>onDesvincularGrupo(g)} style={{ fontSize:"10px", color:"#dc2626", background:"none", border:"none", cursor:"pointer" }}>Desvincular</button>
                        : !sinApu && <button onClick={()=>onVincular(g)} style={{ fontSize:"10px", background:"#166534", color:"#fff", border:"none", borderRadius:"4px", padding:"3px 8px", cursor:"pointer" }}>+ Vincular al grupo</button>}
                    </td>
                  </tr>
                  {exp && (
                    <tr key={`${clave}-det`} style={{ background:"#f9fafb" }}>
                      <td colSpan={7} style={{ padding:"8px 12px 10px 28px", borderTop:`1px dashed ${bordeColor}` }}>
                        <div style={{ fontSize:"11px", color:"#6b7280", marginBottom:"6px" }}>{g.rubros.length} ubicacion(es):</div>
                        <table style={{ width:"100%", fontSize:"11px", borderCollapse:"collapse" }}>
                          {g.rubros.map(r=>(
                            <tr key={r.id}>
                              <td style={{ padding:"3px 0", color:"#374151" }}>&gt; {textoVista(r.descripcion)}</td>
                              <td style={{ padding:"3px 8px", textAlign:"right", color:"#6b7280", whiteSpace:"nowrap" }}>{fmtN(r.metrado)} {r.unidad}</td>
                              <td style={{ padding:"3px 0", textAlign:"right", color:"#6b7280" }}>${r.precio_unitario_ref?.toFixed(2)||"-"}</td>
                              <td style={{ padding:"3px 0 3px 12px", whiteSpace:"nowrap" }}>
                                {!esInd && onIndividualizar && <button onClick={()=>onIndividualizar(r.id)} style={{ fontSize:"10px", color:"#166534", background:"none", border:"none", cursor:"pointer" }}>individualizar</button>}
                                {esInd && onReagrupar && <button onClick={()=>onReagrupar(r.id)} style={{ fontSize:"10px", color:"#16a34a", background:"none", border:"none", cursor:"pointer" }}>reagrupar</button>}
                              </td>
                            </tr>
                          ))}
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Componente principal
export default function Presupuestos({ initialFilter = "todos" }) {
  const [vista, setVista] = useState("lista");
  const [pestana, setPestana] = useState("jerarquica");
  const [proyectos, setProyectos] = useState([]);
  const [proyectoActual, setProyectoActual] = useState(null);
  const [nodosPlanos, setNodosPlanos] = useState([]);
  const [colapsados, setColapsados] = useState({});
  const [gruposExp, setGruposExp] = useState({});
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null); // filtro sidebar

  // Filtros vista jerarquica
  const [filtroEstado, setFiltroEstado] = useState("todos"); // todos|VINCULADO|PENDIENTE|SIN_APU
  const [buscarRubro, setBuscarRubro] = useState("");
  const [buscarSidebar, setBuscarSidebar] = useState("");

  // Filtros vista grupos
  const [buscarGrupo, setBuscarGrupo] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");

  // Costos APU cacheados { nodoId: precio }
  const [costosApu, setCostosApu] = useState({});

  // Historial deshacer/rehacer
  const [historial, setHistorial] = useState([]); // [{tipo, nodoId, apuId, valorAnterior}]
  const [futuro, setFuturo] = useState([]);

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [formNuevo, setFormNuevo] = useState({ nombre:"", codigo:"", descripcion:"" });
  const [modalImportar, setModalImportar] = useState(false);
  const [hojaImport, setHojaImport] = useState("PPTO META");
  const [archivoImport, setArchivoImport] = useState(null);
  const [importando, setImportando] = useState(false);
  const [modalVincular, setModalVincular] = useState(false);
  const [nodoVinculando, setNodoVinculando] = useState(null);
  const [esGrupo, setEsGrupo] = useState(false);
  const [apus, setApus] = useState([]);
  const [buscarApu, setBuscarApu] = useState("");
  const [costosModalApu, setCostosModalApu] = useState({});
  const [apuResumenRubroId, setApuResumenRubroId] = useState(null);
  const [apuResumen, setApuResumen] = useState(null);
  const [cargandoApuResumen, setCargandoApuResumen] = useState(false);
  const [apuEditandoPresupuesto, setApuEditandoPresupuesto] = useState(null);
  const [vistaColumnas, setVistaColumnas] = useState("presupuesto");
  const [rubrosSeleccionados, setRubrosSeleccionados] = useState([]);

  const [error, setError] = useState("");
  const [msgExito, setMsgExito] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    setFiltroEstado(initialFilter || "todos");
    setPestana("jerarquica");
  }, [initialFilter]);

  // Cargar proyectos
  const cargarProyectos = async () => { const r = await fetch(`${API}/presupuestos/proyectos/`); setProyectos(await r.json()); };
  useEffect(() => { cargarProyectos(); }, []);

  // Cargar nodos
  const cargarCostosApu = useCallback(async (planos, opciones = {}) => {
    const apuIds = [...new Set(planos.filter(n=>n.apu_id).map(n=>n.apu_id))];
    const forceIds = new Set(opciones.forceIds || []);
    const nuevos = {};
    await Promise.all(apuIds.map(async id => { nuevos[id] = await fetchCostoApu(id, forceIds.has(id)); }));
    setCostosApu(prev => ({ ...prev, ...nuevos }));
  }, []);

  const cargarNodos = useCallback(async (proyecto, opciones = {}) => {
    const r = await fetch(`${API}/presupuestos/proyectos/${proyecto.id}/nodos`);
    const data = await r.json();
    const planos = aplanar(construirArbol(data));
    setNodosPlanos(planos);
    setColapsados({}); setGruposExp({}); setNodoSeleccionado(null);
    setProyectoActual(proyecto); setVista("detalle");
    if (opciones.limpiarSeleccion || proyectoActual?.id !== proyecto.id) setRubrosSeleccionados([]);
    // Cargar costos de APUs vinculados
    cargarCostosApu(planos);
  }, [cargarCostosApu, proyectoActual?.id]);

  useEffect(() => {
    if (initialFilter !== "todos" && vista === "lista" && proyectos.length === 1) {
      cargarNodos(proyectos[0]);
    }
  }, [cargarNodos, initialFilter, proyectos, vista]);

  // Filtrar APUs para modal
  useEffect(() => {
    if (!modalVincular) return;
    Promise.all([
      fetch(`${API}/apus/?limit=500`).then(r=>r.json()),
      fetch(`${API}/apus/costos/resumen?limit=500`).then(r=>r.json()),
    ]).then(([lista, costos]) => {
      setApus(lista);
      setCostosModalApu(Object.fromEntries(costos.map(c => [c.apu_id, c])));
    });
  }, [modalVincular]);

  const apusFiltrados = useMemo(() => {
    if (!nodoVinculando) return [];
    const busq = buscarApu.toLowerCase().trim();
    if (!busq) return [];
    return apus.filter(a => {
      const nombre = (a.nombre || "").toLowerCase();
      const codigo = (a.codigo || "").toLowerCase();
      const categoria = (a.categoria || "").toLowerCase();
      return a.estado !== "inactivo" && (nombre.includes(busq) || codigo.includes(busq) || categoria.includes(busq));
    });
  }, [apus, buscarApu, nodoVinculando]);

  // CRUD proyectos
  const crearProyecto = async () => {
    if (!formNuevo.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const r = await fetch(`${API}/presupuestos/proyectos/`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(formNuevo) });
    if (r.ok) { setModalNuevo(false); setFormNuevo({nombre:"",codigo:"",descripcion:""}); setError(""); cargarProyectos(); }
    else { const e=await r.json(); setError(e.detail||"Error."); }
  };

  const eliminarProyecto = async (id) => {
    if (!confirm("Eliminar este proyecto?")) return;
    await fetch(`${API}/presupuestos/proyectos/${id}`, {method:"DELETE"}); cargarProyectos();
  };

  // Importar Excel
  const importarExcel = async () => {
    if (!archivoImport) { setError("Selecciona un archivo."); return; }
    setImportando(true); setError("");
    const fd = new FormData(); fd.append("archivo", archivoImport); fd.append("hoja", hojaImport);
    const r = await fetch(`${API}/presupuestos/proyectos/${proyectoActual.id}/importar`, {method:"POST", body:fd});
    setImportando(false);
    if (r.ok) { const d=await r.json(); setModalImportar(false); setArchivoImport(null); mostrarExito(d.mensaje); cargarNodos(proyectoActual); }
    else { const e=await r.json(); setError(e.detail||"Error."); }
  };

  // Historial para deshacer/rehacer
  const registrarAccion = (accion) => {
    setHistorial(prev => [...prev, accion]);
    setFuturo([]);
  };

  const deshacer = async () => {
    if (!historial.length) return;
    const accion = historial[historial.length - 1];
    setHistorial(prev => prev.slice(0,-1));
    setFuturo(prev => [accion, ...prev]);
    await ejecutarInverso(accion);
    cargarNodos(proyectoActual);
  };

  const rehacer = async () => {
    if (!futuro.length) return;
    const accion = futuro[0];
    setFuturo(prev => prev.slice(1));
    setHistorial(prev => [...prev, accion]);
    await ejecutarAccion(accion);
    cargarNodos(proyectoActual);
  };

  const ejecutarAccion = async (accion) => {
    if (accion.tipo === "vincular") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/vincular-apu`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({apu_id: accion.apuId}) });
    } else if (accion.tipo === "desvincular") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/desvincular-apu`, {method:"PATCH"});
    } else if (accion.tipo === "marcar_sin_apu") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/marcar-sin-apu`, {method:"PATCH"});
    } else if (accion.tipo === "desmarcar_sin_apu") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/desmarcar-sin-apu`, {method:"PATCH"});
    } else if (accion.tipo === "individualizar") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/individualizar`, {method:"PATCH"});
    } else if (accion.tipo === "reagrupar") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/reagrupar`, {method:"PATCH"});
    }
  };

  const ejecutarInverso = async (accion) => {
    if (accion.tipo === "vincular") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/desvincular-apu`, {method:"PATCH"});
    } else if (accion.tipo === "desvincular") {
      if (accion.apuId) await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/vincular-apu`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({apu_id: accion.apuId}) });
    } else if (accion.tipo === "marcar_sin_apu") {
      if (accion.apuId) await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/vincular-apu`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({apu_id: accion.apuId}) });
      else await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/desmarcar-sin-apu`, {method:"PATCH"});
    } else if (accion.tipo === "desmarcar_sin_apu") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/marcar-sin-apu`, {method:"PATCH"});
    } else if (accion.tipo === "individualizar") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/reagrupar`, {method:"PATCH"});
    } else if (accion.tipo === "reagrupar") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/individualizar`, {method:"PATCH"});
    }
  };

  // Vincular APU
  const abrirVincular = (nodo, grupo) => { setNodoVinculando(nodo); setEsGrupo(grupo); setBuscarApu(""); setError(""); setModalVincular(true); };

  const vincularApu = async (apu) => {
    const rubros = esGrupo ? nodoVinculando.rubros : [nodoVinculando];
    const resultados = await Promise.all(rubros.map(r =>
      fetch(`${API}/presupuestos/nodos/${r.id}/vincular-apu`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({apu_id:apu.id}) })
    ));
    const errores = resultados.filter(r=>!r.ok);
    if (errores.length) { setError(`${errores.length} rubro(s) no vinculados. Revisa el detalle del servidor.`); return; }
    // Registrar en historial
    rubros.forEach(r => registrarAccion({ tipo:"vincular", nodoId:r.id, apuId:apu.id }));
    if (!esGrupo && rubros[0]) {
      setRubrosSeleccionados([rubros[0].id]);
      setApuResumenRubroId(rubros[0].id);
      setApuResumen(apu);
    }
    setModalVincular(false); mostrarExito("APU vinculado"); cargarNodos(proyectoActual);
  };

  const crearApuDesdeRubro = async (nodo) => {
    setError("");
    const res = await fetch(`${API}/presupuestos/nodos/${nodo.id}/crear-apu`, { method:"POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.detail || "No se pudo crear y vincular el APU.");
      return;
    }
    const creado = await res.json();
    setModalVincular(false);
    mostrarExito("APU creado y vinculado");
    setRubrosSeleccionados([]);
    setApuResumenRubroId(nodo.id);
    await cargarNodos(proyectoActual);
    setApuEditandoPresupuesto({
      id: creado.apu_id,
      codigo: creado.codigo,
      nombre: creado.nombre,
      unidad: creado.unidad,
      estado: creado.estado,
      rendimiento: 1.0,
      items: [],
    });
  };

  const individualizar = async (id) => {
    registrarAccion({ tipo:"individualizar", nodoId:id });
    await fetch(`${API}/presupuestos/nodos/${id}/individualizar`, {method:"PATCH"});
    cargarNodos(proyectoActual);
  };

  const reagrupar = async (id) => {
    registrarAccion({ tipo:"reagrupar", nodoId:id });
    await fetch(`${API}/presupuestos/nodos/${id}/reagrupar`, {method:"PATCH"});
    cargarNodos(proyectoActual);
  };

  const mostrarExito = (msg) => { setMsgExito(msg); setTimeout(()=>setMsgExito(""),4000); };
  const toggleColapsar = (id) => setColapsados(p=>({...p,[id]:!p[id]}));
  const toggleGrupo = (k) => setGruposExp(p=>({...p,[k]:!p[k]}));

  const {
    nodoPorId,
    hijosPorPadre,
    rubros,
    rubrosPorContenedor,
    estadoNodoPorId,
  } = useMemo(() => {
    const t0 = startPerf();
    const nodoPorIdLocal = new Map();
    const hijosPorPadreLocal = new Map();
    const rubrosLocal = [];

    nodosPlanos.forEach(n => {
      nodoPorIdLocal.set(n.id, n);
      if (n.tipo === "RUBRO") rubrosLocal.push(n);
      const padreKey = n.padre_id ?? null;
      if (!hijosPorPadreLocal.has(padreKey)) hijosPorPadreLocal.set(padreKey, []);
      hijosPorPadreLocal.get(padreKey).push(n);
    });

    const rubrosPorContenedorLocal = new Map();
    rubrosLocal.forEach(rubro => {
      let padreId = rubro.padre_id;
      while (padreId) {
        if (!rubrosPorContenedorLocal.has(padreId)) rubrosPorContenedorLocal.set(padreId, []);
        rubrosPorContenedorLocal.get(padreId).push(rubro);
        padreId = nodoPorIdLocal.get(padreId)?.padre_id;
      }
    });

    const estadoNodoPorIdLocal = new Map();
    nodosPlanos.forEach(nodo => {
      if (nodo.tipo === "RUBRO") return;
      const hijos = rubrosPorContenedorLocal.get(nodo.id) || [];
      if (!hijos.length) {
        estadoNodoPorIdLocal.set(nodo.id, "sin_rubros");
        return;
      }
      const vinc = hijos.filter(r => r.tipo_rubro === "VINCULADO").length;
      if (vinc === hijos.length) estadoNodoPorIdLocal.set(nodo.id, "completo");
      else if (vinc === 0) estadoNodoPorIdLocal.set(nodo.id, "ninguno");
      else estadoNodoPorIdLocal.set(nodo.id, "parcial");
    });

    debugPerf("indices", t0, { nodos: nodosPlanos.length, rubros: rubrosLocal.length });
    return {
      nodoPorId: nodoPorIdLocal,
      hijosPorPadre: hijosPorPadreLocal,
      rubros: rubrosLocal,
      rubrosPorContenedor: rubrosPorContenedorLocal,
      estadoNodoPorId: estadoNodoPorIdLocal,
    };
  }, [nodosPlanos]);

  const rubrosPorId = useMemo(() => new Map(rubros.map(r => [r.id, r])), [rubros]);

  const columnasActivas = useMemo(
    () => VISTAS_COLUMNAS[vistaColumnas] || VISTAS_COLUMNAS.presupuesto,
    [vistaColumnas]
  );
  const anchoColumnaSeleccion = 24;
  const anchoOtrasColumnas = useMemo(() => columnasActivas
    .filter((key) => key !== "descripcion")
    .reduce((s, key) => s + (Number.parseFloat(COLUMNAS[key].width) || 0), 0), [columnasActivas]);
  const anchoDescripcion = `calc(100% - ${anchoColumnaSeleccion}px - ${anchoOtrasColumnas}%)`;

  const metricasRubroPorId = useMemo(() => {
    const t0 = startPerf();
    const mapa = new Map();
    rubros.forEach(r => {
      const puRef = r.precio_unitario_ref ?? null;
      const metrado = r.metrado ?? null;
      const costo = r?.apu_id ? costosApu[r.apu_id] : null;
      const puMeta = costo?.precio_unitario ?? null;
      const totalRefR = puRef != null && metrado != null ? puRef * metrado : null;
      const totalMetaR = puMeta != null && metrado != null ? puMeta * metrado : null;
      const comparable = Number.isFinite(totalRefR) && totalRefR > 0 && Number.isFinite(totalMetaR);
      const refComparable = comparable ? totalRefR : null;
      const metaComparable = comparable ? totalMetaR : null;
      const difPu = comparable && puRef > 0 ? puMeta - puRef : null;
      const difTotal = comparable ? metaComparable - refComparable : null;
      mapa.set(r.id, {
        puRef,
        puMeta,
        totalRef: totalRefR,
        totalMeta: totalMetaR,
        comparable,
        refComparable,
        metaComparable,
        difPu,
        difPuPct: difPu != null && puRef ? difPu / puRef : null,
        difTotal,
        difTotalPct: difTotal != null && refComparable ? difTotal / refComparable : null,
        subtotales: costo?.subtotales || {},
      });
    });
    debugPerf("metricas rubros", t0, { rubros: rubros.length });
    return mapa;
  }, [rubros, costosApu]);

  const metricasContenedorPorId = useMemo(() => {
    const t0 = startPerf();
    const mapa = new Map();
    nodosPlanos.forEach(nodo => {
      if (nodo.tipo === "RUBRO") return;
      const hijos = rubrosPorContenedor.get(nodo.id) || [];
      const metricas = hijos.map(r => metricasRubroPorId.get(r.id)).filter(Boolean);
      const totalRefC = metricas.reduce((s,m)=>s+(m.totalRef||0),0);
      const metas = metricas.map(m=>m.totalMeta).filter(v=>Number.isFinite(v));
      const totalMetaC = metas.length ? metas.reduce((s,v)=>s+v,0) : null;
      const comparables = metricas.filter(m=>m.comparable);
      const refComparableC = comparables.length ? comparables.reduce((s,m)=>s+(m.refComparable||0),0) : null;
      const metaComparableC = comparables.length ? comparables.reduce((s,m)=>s+(m.metaComparable||0),0) : null;
      const difComparableC = refComparableC ? metaComparableC - refComparableC : null;
      mapa.set(nodo.id, {
        totalRef: totalRefC,
        totalMeta: totalMetaC,
        refComparable: refComparableC,
        metaComparable: metaComparableC,
        difTotal: difComparableC,
        difTotalPct: difComparableC != null && refComparableC ? difComparableC / refComparableC : null,
      });
    });
    debugPerf("metricas contenedores", t0, { contenedores: mapa.size });
    return mapa;
  }, [nodosPlanos, rubrosPorContenedor, metricasRubroPorId]);

  const rubroMetricas = useCallback((r) => metricasRubroPorId.get(r.id) || {
    puRef: null,
    puMeta: null,
    totalRef: null,
    totalMeta: null,
    comparable: false,
    refComparable: null,
    metaComparable: null,
    difPu: null,
    difPuPct: null,
    difTotal: null,
    difTotalPct: null,
    subtotales: {},
  }, [metricasRubroPorId]);

  const metricasContenedor = useCallback((nodo) => metricasContenedorPorId.get(nodo.id) || {
    totalRef: 0,
    totalMeta: null,
    refComparable: null,
    metaComparable: null,
    difTotal: null,
    difTotalPct: null,
  }, [metricasContenedorPorId]);

  // Nodos visibles con filtros
  const nodosVisibles = useMemo(() => {
    const t0 = startPerf();
    const ocultos = new Set();
    nodosPlanos.forEach(n => { if (n.padre_id && (ocultos.has(n.padre_id)||colapsados[n.padre_id])) ocultos.add(n.id); });
    let visibles = nodosPlanos.filter(n => !ocultos.has(n.id));

    // Filtro por nodo seleccionado en sidebar
    if (nodoSeleccionado && nodoPorId.has(nodoSeleccionado.id)) {
      const idsPermitidos = new Set();
      idsPermitidos.add(nodoSeleccionado.id);
      const pendientes = [...(hijosPorPadre.get(nodoSeleccionado.id) || [])];
      while (pendientes.length) {
        const actual = pendientes.pop();
        idsPermitidos.add(actual.id);
        pendientes.push(...(hijosPorPadre.get(actual.id) || []));
      }
      visibles = visibles.filter(n => idsPermitidos.has(n.id));
    }

    // Filtro por estado rubro
    if (filtroEstado !== "todos") {
      visibles = visibles.filter(n => {
        if (n.tipo !== "RUBRO") return true; // siempre mostrar nodos padre
        if (filtroEstado === "SIN_APU") return n.observaciones === "SIN_APU";
        return n.tipo_rubro === filtroEstado && n.observaciones !== "SIN_APU";
      });
    }

    if (buscarRubro.trim()) {
      const q = buscarRubro.toLowerCase();
      visibles = visibles.filter(n => n.tipo !== "RUBRO" || n.descripcion.toLowerCase().includes(q));
    }

    debugPerf("nodos visibles", t0, { visibles: visibles.length });
    return visibles;
  }, [nodosPlanos, colapsados, nodoSeleccionado, nodoPorId, hijosPorPadre, filtroEstado, buscarRubro]);

  // Nodos sidebar filtrados
  const nodosSidebar = useMemo(() => nodosPlanos.filter(n => n.tipo !== "RUBRO").filter(n => {
    if (!buscarSidebar.trim()) return true;
    return n.descripcion.toLowerCase().includes(buscarSidebar.toLowerCase());
  }), [nodosPlanos, buscarSidebar]);

  useEffect(() => {
    if (!rubrosSeleccionados.length) return;
    const idsExistentes = new Set(rubros.map(r => r.id));
    const seleccionVigente = rubrosSeleccionados.filter(id => idsExistentes.has(id));
    if (seleccionVigente.length !== rubrosSeleccionados.length) setRubrosSeleccionados(seleccionVigente);
  }, [rubros, rubrosSeleccionados]);

  const {
    totalRef,
    metricasConMeta,
    totalMeta,
    refComparable,
    metaComparable,
    difComparable,
    difComparablePct,
  } = useMemo(() => {
    const metricas = rubros.map(r => metricasRubroPorId.get(r.id)).filter(Boolean);
    const totalRefGlobal = metricas.reduce((s,m)=>s+(m.totalRef||0),0);
    const conMeta = metricas.filter(m=>Number.isFinite(m.totalMeta));
    const totalMetaGlobal = conMeta.reduce((s,m)=>s+(m.totalMeta||0),0);
    const comparables = metricas.filter(m=>m.comparable);
    const refComparableGlobal = comparables.length ? comparables.reduce((s,m)=>s+(m.refComparable||0),0) : null;
    const metaComparableGlobal = comparables.length ? comparables.reduce((s,m)=>s+(m.metaComparable||0),0) : null;
    const difComparableGlobal = refComparableGlobal ? metaComparableGlobal - refComparableGlobal : null;
    return {
      totalRef: totalRefGlobal,
      metricasConMeta: conMeta,
      totalMeta: totalMetaGlobal,
      refComparable: refComparableGlobal,
      metaComparable: metaComparableGlobal,
      difComparable: difComparableGlobal,
      difComparablePct: difComparableGlobal != null && refComparableGlobal ? difComparableGlobal / refComparableGlobal : null,
    };
  }, [rubros, metricasRubroPorId]);

  const resumenEstados = useMemo(() => ({
    vinculados: rubros.filter(r=>r.tipo_rubro==="VINCULADO").length,
    pendientes: rubros.filter(r=>r.tipo_rubro==="PENDIENTE"&&r.observaciones!=="SIN_APU").length,
    sinApu: rubros.filter(r=>r.observaciones==="SIN_APU").length,
  }), [rubros]);

  // Stats seccion seleccionada
  const {
    rubrosSeccion,
    rubrosVinculadosSeccion,
    totalRefSeccion,
    totalMetaSeccion,
    refComparableSeccion,
    metaComparableSeccion,
    difComparableSeccion,
    difComparablePctSeccion,
  } = useMemo(() => {
    const rubrosActuales = nodoSeleccionado
      ? rubrosPorContenedor.get(nodoSeleccionado.id) || []
      : rubros;
    const metricas = rubrosActuales.map(r => metricasRubroPorId.get(r.id)).filter(Boolean);
    const totalRefActual = metricas.reduce((s,m)=>s+(m.totalRef||0),0);
    const metricasMeta = metricas.filter(m=>Number.isFinite(m.totalMeta));
    const totalMetaActual = metricasMeta.length ? metricasMeta.reduce((s,m)=>s+(m.totalMeta||0),0) : null;
    const comparables = metricas.filter(m=>m.comparable);
    const refComparableActual = comparables.length ? comparables.reduce((s,m)=>s+(m.refComparable||0),0) : null;
    const metaComparableActual = comparables.length ? comparables.reduce((s,m)=>s+(m.metaComparable||0),0) : null;
    const difComparableActual = refComparableActual ? metaComparableActual - refComparableActual : null;
    return {
      rubrosSeccion: rubrosActuales,
      rubrosVinculadosSeccion: rubrosActuales.filter(r=>r.tipo_rubro==="VINCULADO").length,
      totalRefSeccion: totalRefActual,
      totalMetaSeccion: totalMetaActual,
      refComparableSeccion: refComparableActual,
      metaComparableSeccion: metaComparableActual,
      difComparableSeccion: difComparableActual,
      difComparablePctSeccion: difComparableActual != null && refComparableActual ? difComparableActual / refComparableActual : null,
    };
  }, [nodoSeleccionado, rubros, rubrosPorContenedor, metricasRubroPorId]);

  const { grupos, individualizados } = useMemo(() => calcularGrupos(nodosPlanos), [nodosPlanos]);

  // Grupos filtrados
  const gruposFiltrados = useMemo(() => grupos.filter(g => {
    if (buscarGrupo && !normalizar(g.descripcion).includes(normalizar(buscarGrupo))) return false;
    if (filtroGrupo === "VINCULADO") return g.rubros.every(r=>r.tipo_rubro==="VINCULADO");
    if (filtroGrupo === "PENDIENTE") return g.rubros.some(r=>r.tipo_rubro!=="VINCULADO"&&r.observaciones!=="SIN_APU");
    if (filtroGrupo === "SIN_APU") return g.rubros.every(r=>r.observaciones==="SIN_APU");
    return true;
  }), [grupos, buscarGrupo, filtroGrupo]);

  const resumenGrupos = useMemo(() => ({
    vinculados: grupos.filter(g=>g.rubros.every(r=>r.tipo_rubro==="VINCULADO")).length,
    pendientes: grupos.filter(g=>g.rubros.some(r=>r.tipo_rubro!=="VINCULADO"&&r.observaciones!=="SIN_APU")).length,
    individualizadosTotal: individualizados.reduce((s,g)=>s+g.rubros.length,0),
  }), [grupos, individualizados]);

  const idsSeleccionados = useMemo(() => new Set(rubrosSeleccionados), [rubrosSeleccionados]);
  const rubrosSeleccionadosDatos = useMemo(
    () => rubrosSeleccionados.map(id => rubrosPorId.get(id)).filter(Boolean),
    [rubrosSeleccionados, rubrosPorId]
  );
  const rubrosSeleccionadosVisibles = useMemo(
    () => nodosVisibles.filter(n => n.tipo === "RUBRO" && idsSeleccionados.has(n.id)).length,
    [nodosVisibles, idsSeleccionados]
  );
  const unicoRubroSeleccionado = rubrosSeleccionadosDatos.length === 1 ? rubrosSeleccionadosDatos[0] : null;
  const rubroResumenApu = useMemo(() => {
    if (unicoRubroSeleccionado?.apu_id) return unicoRubroSeleccionado;
    if (rubrosSeleccionadosDatos.length || !apuResumenRubroId) return null;
    const rubro = rubrosPorId.get(apuResumenRubroId);
    return rubro?.apu_id ? rubro : null;
  }, [unicoRubroSeleccionado, rubrosSeleccionadosDatos.length, apuResumenRubroId, rubrosPorId]);
  const metricasResumenApu = rubroResumenApu ? rubroMetricas(rubroResumenApu) : null;
  const puedeVincularSeleccion = Boolean(unicoRubroSeleccionado);
  const puedeCrearApuSeleccion = Boolean(unicoRubroSeleccionado);
  const puedeVerApuSeleccion = Boolean(unicoRubroSeleccionado?.apu_id);
  const puedeDesvincularSeleccion = rubrosSeleccionadosDatos.some(r => r.apu_id);
  const puedeMarcarSinApuSeleccion = rubrosSeleccionadosDatos.length > 0;
  const textoSeleccion = rubrosSeleccionadosDatos.length === 1
    ? "1 rubro seleccionado"
    : `${rubrosSeleccionadosDatos.length} rubros seleccionados`;

  const toggleRubroSeleccionado = (id) => {
    setRubrosSeleccionados(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return [...siguiente];
    });
  };

  const limpiarSeleccion = () => {
    setRubrosSeleccionados([]);
    setApuResumenRubroId(null);
  };

  useEffect(() => {
    const apuId = rubroResumenApu?.apu_id;
    if (!apuId) {
      setApuResumen(null);
      setCargandoApuResumen(false);
      return;
    }
    let cancelado = false;
    setCargandoApuResumen(true);
    fetch(`${API}/apus/${apuId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelado) setApuResumen(data);
      })
      .catch(() => {
        if (!cancelado) setApuResumen(null);
      })
      .finally(() => {
        if (!cancelado) setCargandoApuResumen(false);
      });
    return () => { cancelado = true; };
  }, [rubroResumenApu?.apu_id]);

  const editarApuResumen = () => {
    if (!rubroResumenApu?.apu_id) return;
    setApuEditandoPresupuesto({
      id: rubroResumenApu.apu_id,
      codigo: apuResumen?.codigo,
      nombre: apuResumen?.nombre || rubroResumenApu.descripcion,
      unidad: apuResumen?.unidad || rubroResumenApu.unidad || "",
      estado: apuResumen?.estado || "en_revision",
      rendimiento: apuResumen?.rendimiento || 1.0,
      items: apuResumen?.items || [],
    });
  };

  const cerrarEditorApuPresupuesto = async () => {
    const apuId = apuEditandoPresupuesto?.id;
    setApuEditandoPresupuesto(null);
    if (!apuId) return;
    const [costoActualizado, apuActualizado] = await Promise.all([
      fetchCostoApu(apuId, true),
      fetch(`${API}/apus/${apuId}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setCostosApu(prev => ({ ...prev, [apuId]: costoActualizado }));
    if (apuActualizado) setApuResumen(apuActualizado);
  };

  const vincularSeleccion = () => {
    if (!unicoRubroSeleccionado) return;
    abrirVincular(unicoRubroSeleccionado, false);
  };

  const crearApuSeleccion = () => {
    if (!unicoRubroSeleccionado) return;
    crearApuDesdeRubro(unicoRubroSeleccionado);
  };

  const verApuSeleccion = () => {
    if (!unicoRubroSeleccionado?.apu_id) return;
    setApuResumenRubroId(unicoRubroSeleccionado.id);
  };

  const desvincularSeleccion = async () => {
    const conApu = rubrosSeleccionadosDatos.filter(r => r.apu_id);
    if (!conApu.length) {
      mostrarExito("No hay APUs vinculados en la seleccion");
      return;
    }
    if (rubrosSeleccionadosDatos.length > 1 && !confirm(`Desvincular APU de ${conApu.length} rubro(s) seleccionado(s)?`)) return;
    conApu.forEach(r => registrarAccion({ tipo:"desvincular", nodoId:r.id, apuId:r.apu_id }));
    const resultados = await Promise.all(conApu.map(r => fetch(`${API}/presupuestos/nodos/${r.id}/desvincular-apu`, { method:"PATCH" })));
    const errores = resultados.filter(r => !r.ok);
    if (errores.length) {
      setError(`${errores.length} rubro(s) no se pudieron desvincular.`);
      return;
    }
    mostrarExito(`APU desvinculado de ${conApu.length} rubro(s)`);
    cargarNodos(proyectoActual);
  };

  const marcarSinApuSeleccion = async () => {
    if (!rubrosSeleccionadosDatos.length) return;
    const conApu = rubrosSeleccionadosDatos.filter(r => r.apu_id);
    if (conApu.length && !confirm(`Marcar como Sin APU quitará el vínculo de ${conApu.length} rubro(s). Continuar?`)) return;
    rubrosSeleccionadosDatos.forEach(r => registrarAccion({ tipo:"marcar_sin_apu", nodoId:r.id, apuId:r.apu_id }));
    const resultados = await Promise.all(rubrosSeleccionadosDatos.map(r => fetch(`${API}/presupuestos/nodos/${r.id}/marcar-sin-apu`, { method:"PATCH" })));
    const errores = resultados.filter(r => !r.ok);
    if (errores.length) {
      setError(`${errores.length} rubro(s) no se pudieron marcar como Sin APU.`);
      return;
    }
    mostrarExito(`${rubrosSeleccionadosDatos.length} rubro(s) marcados como Sin APU`);
    cargarNodos(proyectoActual);
  };

  const valorCelda = (n, col, esR, m, mc) => {
    if (!esR && ["unidad","metrado","pu_ref","pu_meta","dif_pu","dif_pu_pct","material","mano_de_obra","equipo","transporte","otros","estado"].includes(col)) return "";
    if (col === "unidad") return n.unidad || "";
    if (col === "metrado") return esR && n.metrado != null ? fmtN(n.metrado) : "";
    if (col === "pu_ref") return esR ? fmtM(m.puRef) : "";
    if (col === "pu_meta") return esR ? fmtM(m.puMeta) : "";
    if (col === "dif_pu") return esR ? fmtDifM(m.difPu) : "";
    if (col === "dif_pu_pct") return esR ? fmtPct(m.difPuPct) : "";
    if (col === "total_ref") return fmtM(esR ? m.totalRef : mc.totalRef);
    if (col === "total_meta") return fmtM(esR ? m.totalMeta : mc.totalMeta);
    if (col === "dif_total") return fmtDifM(esR ? m.difTotal : mc.difTotal);
    if (col === "dif_total_pct") return fmtPct(esR ? m.difTotalPct : mc.difTotalPct);
    if (col === "total_ref_comparable") return fmtM(esR ? m.refComparable : mc.refComparable);
    if (col === "total_meta_comparable") return fmtM(esR ? m.metaComparable : mc.metaComparable);
    if (col === "dif_comparable") return fmtDifM(esR ? m.difTotal : mc.difTotal);
    if (col === "dif_comparable_pct") return fmtPct(esR ? m.difTotalPct : mc.difTotalPct);
    if (col === "material") return esR ? fmtM(m.subtotales.material ?? null) : "";
    if (col === "mano_de_obra") return esR ? fmtM(m.subtotales.mano_de_obra ?? null) : "";
    if (col === "equipo") return esR ? fmtM(m.subtotales.equipo ?? null) : "";
    if (col === "transporte") return esR ? fmtM(m.subtotales.transporte ?? null) : "";
    if (col === "otros") return esR ? fmtM(m.subtotales.otros ?? null) : "";
    return "";
  };

  // VISTA: Lista de proyectos
  if (vista === "lista") return (
    <div className="page-wrap">
      <PageHeader
        title="Presupuestos"
        subtitle="Proyectos cargados para vincular rubros, APUs y costos referenciales."
        actions={
          <ActionButton variant="primary" onClick={()=>{setFormNuevo({nombre:"",codigo:"",descripcion:""});setError("");setModalNuevo(true);}}>
            Nuevo proyecto
          </ActionButton>
        }
      />
      {proyectos.length===0 && <div className="panel" style={{ textAlign:"center", padding:"48px", color:"#9ca3af" }}>No hay proyectos.</div>}
      <div style={{ display:"grid", gap:"12px" }}>
        {proyectos.map(p=>(
          <div key={p.id} className="panel" style={{ padding:"16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:"16px", flexWrap:"wrap" }}>
            <div>
              <div style={{ fontWeight:"600", fontSize:"15px" }}>{textoVista(p.nombre)}</div>
              {p.codigo&&<div style={{ fontSize:"12px", color:"#6b7280" }}>Codigo: {p.codigo}</div>}
            </div>
            <div style={{ display:"flex", gap:"8px" }}>
              <ActionButton variant="primary" compact onClick={()=>cargarNodos(p)}>Abrir</ActionButton>
              <ActionButton variant="danger" compact onClick={()=>eliminarProyecto(p.id)}>Eliminar</ActionButton>
            </div>
          </div>
        ))}
      </div>
      {modalNuevo&&(
        <ModalShell
          title="Nuevo proyecto"
          footer={
            <>
              <ActionButton onClick={()=>setModalNuevo(false)}>Cancelar</ActionButton>
              <ActionButton variant="primary" onClick={crearProyecto}>Crear</ActionButton>
            </>
          }
        >
            {[["Nombre *","nombre","Ej: Edificio Norte"],["Codigo","codigo","Ej: PPTO-2026-001"]].map(([label,key,ph])=>(
              <div key={key} style={{ marginBottom:"10px" }}>
                <label className={labelClass}>{label}</label>
                <input value={formNuevo[key]} onChange={e=>setFormNuevo({...formNuevo,[key]:e.target.value})}
                  className={fieldClass} placeholder={ph}/>
              </div>
            ))}
            <div style={{ marginBottom:"10px" }}>
              <label className={labelClass}>Descripcion</label>
              <textarea value={formNuevo.descripcion} onChange={e=>setFormNuevo({...formNuevo,descripcion:e.target.value})}
                className={fieldClass} rows={2}/>
            </div>
            {error&&<p style={{ color:"#dc2626", fontSize:"12px" }}>{error}</p>}
        </ModalShell>
      )}
    </div>
  );

  // VISTA: Detalle del proyecto
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 52px)" }}>

      {/* Barra superior */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"8px 20px", display:"flex", alignItems:"center", gap:"10px", flexShrink:0, flexWrap:"wrap" }}>
        <button onClick={()=>setVista("lista")} style={{ background:"none", border:"none", color:"#166534", fontSize:"13px", cursor:"pointer", padding:0 }}>Volver a proyectos</button>
        <span style={{ color:"#d1d5db" }}>|</span>
        <span style={{ fontWeight:"600", fontSize:"14px" }}>{textoVista(proyectoActual?.nombre)}</span>
        {proyectoActual?.codigo&&<span style={{ fontSize:"12px", color:"#6b7280" }}>({proyectoActual.codigo})</span>}
        <div style={{ display:"flex", gap:"4px", marginLeft:"12px" }}>
          {[["jerarquica","Jerarquica"],["grupos","Por grupos"]].map(([k,label])=>(
            <button key={k} onClick={()=>setPestana(k)}
              style={{ fontSize:"12px", padding:"4px 12px", border:"1px solid", borderRadius:"6px", cursor:"pointer", borderColor:pestana===k?"#166534":"#d1d5db", background:pestana===k?"#166534":"#fff", color:pestana===k?"#fff":"#374151" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:"6px", alignItems:"center" }}>
          {msgExito&&<span style={{ fontSize:"12px", color:"#16a34a", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:"4px", padding:"3px 10px" }}>{msgExito}</span>}
          <button onClick={deshacer} disabled={!historial.length} title="Deshacer"
            style={{ fontSize:"12px", padding:"4px 10px", cursor:historial.length?"pointer":"not-allowed", opacity:historial.length?1:0.4, border:"1px solid #d1d5db", borderRadius:"6px", background:"#fff" }}>
            Deshacer
          </button>
          <button onClick={rehacer} disabled={!futuro.length} title="Rehacer"
            style={{ fontSize:"12px", padding:"4px 10px", cursor:futuro.length?"pointer":"not-allowed", opacity:futuro.length?1:0.4, border:"1px solid #d1d5db", borderRadius:"6px", background:"#fff" }}>
            Rehacer
          </button>
          {nodosPlanos.length===0&&(
            <button onClick={()=>{setArchivoImport(null);setError("");setModalImportar(true);}}
              style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:"6px", padding:"6px 14px", fontSize:"12px", cursor:"pointer" }}>Importar Excel</button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {nodosPlanos.length>0&&(
        <div style={{ background:"#f8fafc", borderBottom:"1px solid #e5e7eb", padding:"6px 20px", display:"flex", gap:"16px", fontSize:"11px", color:"#6b7280", flexShrink:0, flexWrap:"wrap" }}>
          <span>Rubros: <strong style={{ color:"#111827" }}>{rubros.length}</strong></span>
          <span style={{ color:"#16a34a" }}>OK {resumenEstados.vinculados} vinculados</span>
          <span style={{ color:"#ca8a04" }}>Pend. {resumenEstados.pendientes} pendientes</span>
          <span style={{ color:"#dc2626" }}>X {resumenEstados.sinApu} sin APU</span>
          <span style={{ marginLeft:"auto", fontWeight:"600", color:"#111827" }}>
            Ref total: {fmtM(totalRef)}
            {" | "}Meta parcial: <span style={{ color:"#166534" }}>{metricasConMeta.length ? fmtM(totalMeta) : "-"}</span>
            {" | "}Ref comparable: <span>{fmtM(refComparable)}</span>
            {" | "}Meta comparable: <span style={{ color:"#166534" }}>{fmtM(metaComparable)}</span>
            {" | "}Dif comparable: <span style={{ color:colorDif(difComparable) }}>{fmtDifM(difComparable)}</span>
            {" | "}Dif %: <span style={{ color:colorDif(difComparable) }}>{fmtPct(difComparablePct)}</span>
          </span>
        </div>
      )}

      {apuEditandoPresupuesto ? (
        <div style={{ flex:1, overflowY:"auto", background:"#f8fafc" }}>
          <ApuDetalle
            apu={apuEditandoPresupuesto}
            onVolver={cerrarEditorApuPresupuesto}
            volverLabel="Guardar y volver al presupuesto"
          />
        </div>
      ) : (
      <div style={{ flex:1, overflow:"hidden", display:"flex" }}>

        {/* Pestana jerarquica */}
        {pestana==="jerarquica"&&(
          <>
            {/* Sidebar */}
            <div style={{ width:"260px", borderRight:"1px solid #e5e7eb", display:"flex", flexDirection:"column", background:"#f9fafb", flexShrink:0 }}>
              <div style={{ padding:"8px" }}>
                <input type="text" placeholder="Buscar seccion..." value={buscarSidebar} onChange={e=>setBuscarSidebar(e.target.value)}
                  style={{ width:"100%", fontSize:"11px", padding:"5px 8px", border:"1px solid #d1d5db", borderRadius:"6px", boxSizing:"border-box" }}/>
              </div>
              {/* Filtro pills */}
              <div style={{ padding:"0 8px 6px", display:"flex", gap:"3px", flexWrap:"wrap" }}>
                {[["todos","Todos","#f3f4f6","#374151"],["VINCULADO","Vinculados","#dcfce7","#166534"],["PENDIENTE","Pendientes","#fef9c3","#854d0e"],["SIN_APU","Sin APU","#fee2e2","#991b1b"]].map(([val,label,bg,color])=>(
                  <button key={val} onClick={()=>setFiltroEstado(val)}
                    style={{ fontSize:"10px", padding:"2px 7px", borderRadius:"20px", cursor:"pointer", border:"1px solid", borderColor:filtroEstado===val?color:"transparent", background:filtroEstado===val?bg:"transparent", color:filtroEstado===val?color:"#6b7280", fontWeight:filtroEstado===val?"600":"400" }}>
                    {label}
                  </button>
                ))}
              </div>
              {nodoSeleccionado&&(
                <div style={{ padding:"0 8px 6px" }}>
                  <button onClick={()=>setNodoSeleccionado(null)}
                    style={{ fontSize:"10px", color:"#166534", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"4px", padding:"2px 8px", cursor:"pointer", width:"100%" }}>
                    Mostrar todo el presupuesto
                  </button>
                </div>
              )}
              {/* Arbol */}
              <div style={{ overflowY:"auto", flex:1 }}>
                {nodosSidebar.map(n=>{
                  const cfg = COLORES_TIPO[n.tipo]||COLORES_TIPO.GRUPO;
                  const tieneHijos = Boolean(hijosPorPadre.get(n.id)?.length);
                  const seleccionado = nodoSeleccionado?.id===n.id;
                  const est = estadoNodoPorId.get(n.id) || "sin_rubros";
                  return (
                    <div key={n.id} onClick={()=>setNodoSeleccionado(seleccionado?null:n)}
                      style={{ paddingLeft:`${cfg.indent+10}px`, paddingRight:"8px", paddingTop:"4px", paddingBottom:"4px",
                        fontSize:"11px", cursor:"pointer", display:"flex", alignItems:"center", gap:"4px", color:"#1f2937",
                        background:seleccionado?"#dcfce7":"transparent", borderLeft:seleccionado?"3px solid #166534":"3px solid transparent" }}>
                      {tieneHijos
                        ? <span onClick={e=>{e.stopPropagation();toggleColapsar(n.id);}} style={{ fontSize:"9px", color:"#6b7280", userSelect:"none", minWidth:"10px" }}>{colapsados[n.id]?">":"v"}</span>
                        : <span style={{ minWidth:"10px" }}/>}
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }} title={textoVista(n.descripcion)}>{textoVista(n.descripcion)}</span>
                      <span style={{ width:"7px", height:"7px", borderRadius:"50%", background:DOT_COLOR[est], flexShrink:0 }}/>
                    </div>
                  );
                })}
              </div>
              {/* Totales seccion */}
              {nodoSeleccionado&&(
                <div style={{ borderTop:"1px solid #e5e7eb", padding:"8px", fontSize:"10px", color:"#6b7280", lineHeight:"1.7" }}>
                  <div style={{ fontWeight:"600", color:"#111827", marginBottom:"2px" }}>{textoVista(nodoSeleccionado.descripcion)}</div>
                  <div>{rubrosSeccion.length} rubros | {rubrosVinculadosSeccion} vinculados</div>
                  <div>Ref: <strong>{fmtM(totalRefSeccion)}</strong></div>
                  <div>Meta parcial: <strong style={{ color:"#166534" }}>{fmtM(totalMetaSeccion)}</strong></div>
                  <div>Comparable: <strong>{fmtM(refComparableSeccion)}</strong> - <strong style={{ color:"#166534" }}>{fmtM(metaComparableSeccion)}</strong></div>
                  <div>Dif comparable: <span style={{ color:colorDif(difComparableSeccion) }}>{fmtDifM(difComparableSeccion)}</span> | <span style={{ color:colorDif(difComparableSeccion) }}>{fmtPct(difComparablePctSeccion)}</span></div>
                </div>
              )}
            </div>

            {/* Tabla */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              {/* Barra filtros tabla */}
              <div style={{ padding:"6px 10px", borderBottom:"1px solid #e5e7eb", display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap", background:"#fff", flexShrink:0 }}>
                {nodoSeleccionado
                  ? <><span style={{ fontSize:"11px", color:"#6b7280" }}>Mostrando:</span><span style={{ fontSize:"11px", fontWeight:"500" }}>{textoVista(nodoSeleccionado.descripcion)}</span><span style={{ fontSize:"10px", color:"#9ca3af" }}>({rubrosSeccion.length} rubros)</span></>
                  : <span style={{ fontSize:"11px", color:"#6b7280" }}>Presupuesto completo</span>}
                <div style={{ display:"flex", gap:"3px", flexWrap:"wrap" }}>
                  {[
                    ["presupuesto","Presupuesto"],
                    ["meta","Meta"],
                    ["unitarios","Unitarios"],
                    ["totales","Totales"],
                    ["diferencias","Diferencias"],
                    ["desglose","Desglose"],
                  ].map(([key,label])=>(
                    <button key={key} onClick={()=>setVistaColumnas(key)}
                      style={{ fontSize:"10px", padding:"2px 7px", border:"1px solid", borderColor:vistaColumnas===key?"#166534":"#d1d5db", borderRadius:"999px", background:vistaColumnas===key?"#166534":"#fff", color:vistaColumnas===key?"#fff":"#374151", cursor:"pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex", gap:"4px", alignItems:"center", flexWrap:"wrap", marginLeft:"8px" }}>
                  <span style={{ fontSize:"10px", color:rubrosSeleccionadosDatos.length?"#166534":"#6b7280", background:rubrosSeleccionadosDatos.length?"#f0fdf4":"#f8fafc", border:"1px solid #e5e7eb", borderRadius:"999px", padding:"2px 8px", whiteSpace:"nowrap" }}>
                    {rubrosSeleccionadosDatos.length ? textoSeleccion : "Selecciona un rubro"}
                    {rubrosSeleccionadosDatos.length > 0 && rubrosSeleccionadosVisibles !== rubrosSeleccionadosDatos.length ? `, ${rubrosSeleccionadosVisibles} visible(s)` : ""}
                  </span>
                  <button onClick={vincularSeleccion} disabled={!puedeVincularSeleccion} title="Vincular un APU al rubro seleccionado"
                    style={{ fontSize:"10px", padding:"3px 8px", border:"1px solid #166534", borderRadius:"5px", background:puedeVincularSeleccion?"#166534":"#f3f4f6", color:puedeVincularSeleccion?"#fff":"#9ca3af", cursor:puedeVincularSeleccion?"pointer":"not-allowed" }}>
                    Vincular
                  </button>
                  <button onClick={verApuSeleccion} disabled={!puedeVerApuSeleccion} title="Mostrar resumen del APU vinculado"
                    style={{ fontSize:"10px", padding:"3px 8px", border:"1px solid #bbf7d0", borderRadius:"5px", background:puedeVerApuSeleccion?"#f0fdf4":"#f3f4f6", color:puedeVerApuSeleccion?"#166534":"#9ca3af", cursor:puedeVerApuSeleccion?"pointer":"not-allowed" }}>
                    Ver APU
                  </button>
                  <button onClick={crearApuSeleccion} disabled={!puedeCrearApuSeleccion} title="Crear un nuevo APU desde el rubro seleccionado"
                    style={{ fontSize:"10px", padding:"3px 8px", border:"1px solid #86efac", borderRadius:"5px", background:puedeCrearApuSeleccion?"#f0fdf4":"#f3f4f6", color:puedeCrearApuSeleccion?"#166534":"#9ca3af", cursor:puedeCrearApuSeleccion?"pointer":"not-allowed" }}>
                    Crear APU
                  </button>
                  <button onClick={desvincularSeleccion} disabled={!puedeDesvincularSeleccion} title="Quitar el APU vinculado de los rubros seleccionados"
                    style={{ fontSize:"10px", padding:"3px 8px", border:"1px solid #fecaca", borderRadius:"5px", background:puedeDesvincularSeleccion?"#fff":"#f3f4f6", color:puedeDesvincularSeleccion?"#dc2626":"#9ca3af", cursor:puedeDesvincularSeleccion?"pointer":"not-allowed" }}>
                    Desvincular
                  </button>
                  <button onClick={marcarSinApuSeleccion} disabled={!puedeMarcarSinApuSeleccion} title="Marcar los rubros seleccionados como Sin APU"
                    style={{ fontSize:"10px", padding:"3px 8px", border:"1px solid #d1d5db", borderRadius:"5px", background:puedeMarcarSinApuSeleccion?"#fff":"#f3f4f6", color:puedeMarcarSinApuSeleccion?"#374151":"#9ca3af", cursor:puedeMarcarSinApuSeleccion?"pointer":"not-allowed" }}>
                    Sin APU
                  </button>
                  <button onClick={limpiarSeleccion} disabled={!rubrosSeleccionadosDatos.length} title="Limpiar seleccion actual"
                    style={{ fontSize:"10px", padding:"3px 8px", border:"1px solid #d1d5db", borderRadius:"5px", background:"#fff", color:rubrosSeleccionadosDatos.length?"#374151":"#9ca3af", cursor:rubrosSeleccionadosDatos.length?"pointer":"not-allowed" }}>
                    Limpiar
                  </button>
                </div>
                <div style={{ marginLeft:"auto", display:"flex", gap:"4px", alignItems:"center" }}>
                  <input type="text" placeholder="Buscar rubro..." value={buscarRubro} onChange={e=>setBuscarRubro(e.target.value)}
                    style={{ fontSize:"11px", padding:"3px 8px", border:"1px solid #d1d5db", borderRadius:"6px", width:"130px" }}/>
                </div>
              </div>

              <div style={{ overflowY:"auto", flex:1 }}>
                {nodosPlanos.length===0?(
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:"12px", color:"#9ca3af" }}>
                    <div style={{ fontSize:"40px" }}>Archivo</div>
                    <button onClick={()=>{setArchivoImport(null);setError("");setModalImportar(true);}}
                      style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:"6px", padding:"8px 20px", fontSize:"13px", cursor:"pointer" }}>Importar Excel</button>
                  </div>
                ):(
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"11px", tableLayout:"fixed" }}>
                    <colgroup>
                      <col style={{ width:`${anchoColumnaSeleccion}px` }} />
                      {columnasActivas.map((key) => (
                        <col key={key} style={{ width:key === "descripcion" ? anchoDescripcion : COLUMNAS[key].width }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr style={{ background:"#f3f4f6", position:"sticky", top:0, zIndex:1 }}>
                        <th style={{ padding:"7px 3px", textAlign:"center", borderBottom:"1px solid #e5e7eb", color:"#374151", fontWeight:"600", width:"24px", minWidth:"24px", maxWidth:"24px", whiteSpace:"nowrap" }} title="Seleccion manual por rubro">
                          Sel.
                        </th>
                        {columnasActivas.map((key)=>{
                          const c = COLUMNAS[key];
                          return <th key={key} style={{ padding:"7px 8px", textAlign:c.align, borderBottom:"1px solid #e5e7eb", color:"#374151", fontWeight:"600", width:key === "descripcion" ? anchoDescripcion : c.width, whiteSpace:"nowrap" }}>{c.label}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {nodosVisibles.map(n=>{
                        const cfg = COLORES_TIPO[n.tipo]||COLORES_TIPO.RUBRO;
                        const esR = n.tipo==="RUBRO";
                        const sinApu = n.observaciones==="SIN_APU";
                        const badge = esR?(sinApu?BADGE.SIN_APU:BADGE[n.tipo_rubro]||BADGE.PENDIENTE):null;
                        const tieneHijos = !esR&&Boolean(hijosPorPadre.get(n.id)?.length);
                        const m = esR ? rubroMetricas(n) : {};
                        const mc = !esR ? metricasContenedor(n) : {};
                        const estaSeleccionado = esR && idsSeleccionados.has(n.id);
                        return (
                          <tr key={n.id} style={{ background:estaSeleccionado?"#ecfdf5":(esR?"#fff":cfg.bg), borderBottom:estaSeleccionado?"1px solid #bbf7d0":"1px solid #e5e7eb", cursor:tieneHijos?"pointer":"default" }}
                            onClick={()=>tieneHijos&&toggleColapsar(n.id)}>
                            <td style={{ padding:"5px 3px", textAlign:"center", width:"24px", minWidth:"24px", maxWidth:"24px", borderLeft:estaSeleccionado?"3px solid #16a34a":"3px solid transparent" }} onClick={e=>e.stopPropagation()}>
                              {esR&&(
                                <input
                                  type="checkbox"
                                  checked={estaSeleccionado}
                                  onChange={()=>toggleRubroSeleccionado(n.id)}
                                  title="Seleccionar rubro"
                                  style={{ width:"13px", height:"13px", cursor:"pointer", accentColor:"#166534" }}
                                />
                              )}
                            </td>
                            {columnasActivas.map((col) => {
                              const c = COLUMNAS[col];
                              const diffValue = col.includes("dif") ? (col.includes("pu") ? m.difPu : (esR ? m.difTotal : mc.difTotal)) : null;
                              if (col === "descripcion") {
                                return (
                                  <td key={col} style={{ padding:"5px 8px", paddingLeft:`${cfg.indent+8}px` }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                                      {tieneHijos&&<span style={{ fontSize:"9px", opacity:0.7 }}>{colapsados[n.id]?">":"v"}</span>}
                                      <span style={{ color:esR?"#111827":cfg.text, fontWeight:esR?"400":"600", fontSize:"11px" }}>{textoVista(n.descripcion)}</span>
                                      {!esR&&mc.totalRef!=null&&<span style={{ fontSize:"9px", opacity:0.8 }}>total real</span>}
                                      {sinApu&&<span style={{ fontSize:"9px", background:"#fee2e2", color:"#991b1b", borderRadius:"3px", padding:"1px 4px" }}>SIN APU</span>}
                                    </div>
                                  </td>
                                );
                              }
                              if (col === "estado") {
                                return <td key={col} style={{ padding:"5px 4px", textAlign:"center" }}>{badge&&<span style={{ background:badge.bg, color:badge.text, borderRadius:"4px", padding:"2px 6px", fontSize:"9px", fontWeight:"600" }}>{badge.label}</span>}</td>;
                              }
                              return <td key={col} style={{ padding:"5px 4px", textAlign:c.align, color:col.includes("dif")?colorDif(diffValue):(esR?"#374151":cfg.text), fontWeight:col.includes("dif")?"500":"400" }}>{valorCelda(n, col, esR, m, mc)}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            {rubroResumenApu&&(
              <aside style={{ width:"300px", borderLeft:"1px solid #e5e7eb", background:"#f8fafc", display:"flex", flexDirection:"column", flexShrink:0 }}>
                <div style={{ padding:"10px 12px", borderBottom:"1px solid #e5e7eb", background:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px" }}>
                  <div>
                    <div style={{ fontSize:"11px", color:"#166534", fontWeight:"700", textTransform:"uppercase" }}>Ver APU</div>
                    <div style={{ fontSize:"10px", color:"#6b7280" }}>Resumen del vinculo seleccionado</div>
                  </div>
                  <button onClick={limpiarSeleccion}
                    style={{ border:"1px solid #d1d5db", background:"#fff", color:"#374151", borderRadius:"5px", fontSize:"10px", padding:"3px 7px", cursor:"pointer" }}>
                    Ocultar
                  </button>
                </div>
                <div style={{ padding:"12px", overflowY:"auto", flex:1 }}>
                  <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:"8px", padding:"10px", marginBottom:"10px" }}>
                    <div style={{ fontSize:"13px", fontWeight:"700", color:"#111827", lineHeight:1.3, marginBottom:"4px" }}>
                      {textoVista(apuResumen?.nombre || rubroResumenApu.descripcion)}
                    </div>
                    <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", fontSize:"10px", color:"#6b7280" }}>
                      <span style={{ background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:"4px", padding:"2px 6px" }}>{apuResumen?.codigo || `APU #${rubroResumenApu.apu_id}`}</span>
                      <span style={{ background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:"4px", padding:"2px 6px" }}>{apuResumen?.unidad || rubroResumenApu.unidad || "-"}</span>
                      <span style={{ background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:"4px", padding:"2px 6px" }}>{apuResumen?.estado || "cargando"}</span>
                    </div>
                  </div>

                  <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:"8px", padding:"10px", marginBottom:"10px" }}>
                    <div style={{ fontSize:"10px", color:"#6b7280", fontWeight:"700", textTransform:"uppercase", marginBottom:"6px" }}>Rubro vinculado</div>
                    <div style={{ fontSize:"12px", color:"#111827", lineHeight:1.35 }}>{textoVista(rubroResumenApu.descripcion)}</div>
                    <div style={{ marginTop:"6px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px", fontSize:"11px", color:"#6b7280" }}>
                      <div>Und: <strong style={{ color:"#111827" }}>{rubroResumenApu.unidad || "-"}</strong></div>
                      <div>Metrado: <strong style={{ color:"#111827" }}>{fmtN(rubroResumenApu.metrado)}</strong></div>
                      <div>P.U. Ref: <strong style={{ color:"#111827" }}>{fmtM(metricasResumenApu?.puRef)}</strong></div>
                      <div>P.U. Meta: <strong style={{ color:"#166534" }}>{fmtM(metricasResumenApu?.puMeta)}</strong></div>
                    </div>
                  </div>

                  <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:"8px", padding:"10px", marginBottom:"10px" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", fontSize:"11px" }}>
                      <div>
                        <div style={{ color:"#6b7280" }}>Dif P.U.</div>
                        <div style={{ color:colorDif(metricasResumenApu?.difPu), fontWeight:"700" }}>{fmtDifM(metricasResumenApu?.difPu)}</div>
                      </div>
                      <div>
                        <div style={{ color:"#6b7280" }}>Dif %</div>
                        <div style={{ color:colorDif(metricasResumenApu?.difPu), fontWeight:"700" }}>{fmtPct(metricasResumenApu?.difPuPct)}</div>
                      </div>
                      <div>
                        <div style={{ color:"#6b7280" }}>Total ref</div>
                        <div style={{ color:"#111827", fontWeight:"700" }}>{fmtM(metricasResumenApu?.totalRef)}</div>
                      </div>
                      <div>
                        <div style={{ color:"#6b7280" }}>Total meta</div>
                        <div style={{ color:"#166534", fontWeight:"700" }}>{fmtM(metricasResumenApu?.totalMeta)}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:"8px", padding:"10px", marginBottom:"10px" }}>
                    <div style={{ fontSize:"10px", color:"#6b7280", fontWeight:"700", textTransform:"uppercase", marginBottom:"6px" }}>Desglose P.U.</div>
                    {[
                      ["Materiales", metricasResumenApu?.subtotales?.material],
                      ["Mano de obra", metricasResumenApu?.subtotales?.mano_de_obra],
                      ["Equipos", metricasResumenApu?.subtotales?.equipo],
                      ["Transporte", metricasResumenApu?.subtotales?.transporte],
                    ].map(([label, valor])=>(
                      <div key={label} style={{ display:"flex", justifyContent:"space-between", gap:"8px", padding:"3px 0", borderBottom:"1px solid #f1f5f9", fontSize:"11px" }}>
                        <span style={{ color:"#6b7280" }}>{label}</span>
                        <strong style={{ color:"#111827", fontVariantNumeric:"tabular-nums" }}>{fmtM(valor || 0)}</strong>
                      </div>
                    ))}
                  </div>

                  <button onClick={editarApuResumen} disabled={cargandoApuResumen}
                    style={{ width:"100%", background:cargandoApuResumen?"#f3f4f6":"#166534", color:cargandoApuResumen?"#9ca3af":"#fff", border:"none", borderRadius:"6px", padding:"8px 10px", fontSize:"12px", fontWeight:"700", cursor:cargandoApuResumen?"wait":"pointer" }}>
                    {cargandoApuResumen ? "Cargando APU..." : "Editar APU"}
                  </button>
                </div>
              </aside>
            )}
          </>
        )}

        {/* Pestana por grupos */}
        {pestana==="grupos"&&(
          <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
            {nodosPlanos.length===0?(
              <div style={{ textAlign:"center", paddingTop:"60px", color:"#9ca3af" }}>Sin datos. Importa un Excel primero.</div>
            ):(
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"8px", marginBottom:"12px" }}>
                  {[["Grupos",grupos.length,"#f8fafc","#374151"],["Con APU",resumenGrupos.vinculados,"#f0fdf4","#166534"],["Pendientes",resumenGrupos.pendientes,"#fefce8","#854d0e"],["Individualizados",resumenGrupos.individualizadosTotal,"#fef9c3","#854d0e"]].map(([label,val,bg,color])=>(
                    <div key={label} style={{ background:bg, border:"1px solid #e5e7eb", borderRadius:"8px", padding:"8px 12px" }}>
                      <div style={{ fontSize:"10px", color }}>{label}</div>
                      <div style={{ fontSize:"16px", fontWeight:"600", color }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Filtros grupos */}
                <div style={{ display:"flex", gap:"6px", marginBottom:"12px", alignItems:"center", flexWrap:"wrap" }}>
                  <input type="text" placeholder="Buscar grupo..." value={buscarGrupo} onChange={e=>setBuscarGrupo(e.target.value)}
                    style={{ fontSize:"12px", padding:"5px 10px", border:"1px solid #d1d5db", borderRadius:"6px", flex:1, minWidth:"160px" }}/>
                  {[["todos","Todos"],["VINCULADO","Vinculados"],["PENDIENTE","Pendientes"],["SIN_APU","Sin APU"]].map(([val,label])=>(
                    <button key={val} onClick={()=>setFiltroGrupo(val)}
                      style={{ fontSize:"11px", padding:"4px 10px", borderRadius:"20px", cursor:"pointer", border:"1px solid",
                        borderColor:filtroGrupo===val?"#166534":"#d1d5db", background:filtroGrupo===val?"#166534":"#fff", color:filtroGrupo===val?"#fff":"#374151" }}>
                      {label}
                    </button>
                  ))}
                </div>

                <TablaGrupos
                  titulo={`Grupos automaticos | ${gruposFiltrados.length}`}
                  grupos={gruposFiltrados} expandidos={gruposExp} onToggle={toggleGrupo}
                  onVincular={g=>abrirVincular(g,true)}
                  onDesvincularGrupo={async g=>{g.rubros.forEach(r=>registrarAccion({tipo:"desvincular",nodoId:r.id,apuId:r.apu_id}));await Promise.all(g.rubros.map(r=>fetch(`${API}/presupuestos/nodos/${r.id}/desvincular-apu`,{method:"PATCH"})));mostrarExito("APU desvinculado del grupo");cargarNodos(proyectoActual);}}
                  onIndividualizar={individualizar} esInd={false} bordeColor="#e5e7eb" headerBg="#f3f4f6"
                />

                {individualizados.length>0&&(
                  <div style={{ marginTop:"24px" }}>
                    <TablaGrupos
                      titulo={`Rubros individualizados | ${resumenGrupos.individualizadosTotal}`}
                      grupos={individualizados} expandidos={gruposExp} onToggle={toggleGrupo}
                      onVincular={g=>abrirVincular(g,true)}
                      onDesvincularGrupo={async g=>{g.rubros.forEach(r=>registrarAccion({tipo:"desvincular",nodoId:r.id,apuId:r.apu_id}));await Promise.all(g.rubros.map(r=>fetch(`${API}/presupuestos/nodos/${r.id}/desvincular-apu`,{method:"PATCH"})));mostrarExito("APU desvinculado");cargarNodos(proyectoActual);}}
                      onReagrupar={reagrupar} esInd={true} bordeColor="#fde68a" headerBg="#fefce8"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* Modal Importar */}
      {modalImportar&&(
        <div className="modal-overlay">
          <div className="modal-shell" style={{ maxWidth:"400px" }}>
            <h2 className="modal-title">Importar Excel</h2>
            <div style={{ marginBottom:"10px" }}>
              <label className={labelClass}>Archivo Excel *</label>
              <input ref={fileRef} type="file" accept=".xlsx" onChange={e=>setArchivoImport(e.target.files[0])} className={fieldClass}/>
            </div>
            <div style={{ marginBottom:"10px" }}>
              <label className={labelClass}>Hoja</label>
              <select value={hojaImport} onChange={e=>setHojaImport(e.target.value)}
                className={fieldClass}>
                <option value="PPTO META">PPTO META</option>
                <option value="PPTO CONTRACTUAL">PPTO CONTRACTUAL</option>
              </select>
            </div>
            {error&&<p style={{ color:"#dc2626", fontSize:"12px" }}>{error}</p>}
            <div className="modal-footer">
              <ActionButton onClick={()=>{setModalImportar(false);setError("");}}>Cancelar</ActionButton>
              <ActionButton variant="primary" onClick={importarExcel} disabled={importando}>
                {importando?"Importando...":"Importar"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Panel fijo Vincular APU */}
      {modalVincular&&(
        <div style={{ position:"fixed", left:0, right:0, bottom:0, background:"#fff", borderTop:"1px solid #cbd5e1", boxShadow:"0 -8px 24px rgba(15,23,42,0.14)", zIndex:60, padding:"12px 20px" }}>
          <div style={{ background:"#fff", width:"100%", maxWidth:"1100px", maxHeight:"42vh", margin:"0 auto", display:"flex", flexDirection:"column" }}>
            <div style={{ marginBottom:"12px", display:"flex", justifyContent:"space-between", gap:"12px", alignItems:"flex-start" }}>
              <div>
              <h2 style={{ fontSize:"15px", fontWeight:"700", margin:0 }}>Vincular APU</h2>
              <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"4px" }}>
                {esGrupo?`Grupo: "${textoVista(nodoVinculando?.descripcion)}" (${nodoVinculando?.rubros?.length} rubros)`:`Rubro: "${textoVista(nodoVinculando?.descripcion)}"`}
                {nodoVinculando?.unidad&&<span style={{ marginLeft:"6px", background:"#f3f4f6", padding:"1px 6px", borderRadius:"4px" }}>{nodoVinculando.unidad}</span>}
                <span style={{ marginLeft:"8px" }}>Unidad solo referencial; no filtra resultados.</span>
              </div>
              </div>
              {!esGrupo&&(
                <button onClick={()=>crearApuDesdeRubro(nodoVinculando)}
                  style={{ background:"#f0fdf4", color:"#166534", border:"1px solid #86efac", borderRadius:"6px", padding:"6px 12px", fontSize:"12px", fontWeight:"600", cursor:"pointer", whiteSpace:"nowrap" }}>
                  Crear Nuevo
                </button>
              )}
            </div>
            <input type="text" placeholder="Buscar APU por nombre, codigo o categoria..." value={buscarApu} onChange={e=>setBuscarApu(e.target.value)}
              style={{ border:"1px solid #d1d5db", borderRadius:"6px", padding:"7px 10px", fontSize:"13px", marginBottom:"8px" }}/>
            <div style={{ fontSize:"11px", color:"#6b7280", marginBottom:"6px" }}>{buscarApu.trim()?`${apusFiltrados.length} coincidencia(s) no inactivas`:"Escribe para buscar APUs"}</div>
            <div style={{ overflowY:"auto", flex:1 }}>
              {buscarApu.trim()&&apusFiltrados.length===0&&<div style={{ textAlign:"center", padding:"24px", color:"#9ca3af", fontSize:"13px" }}>No hay APUs coincidentes no inactivos.</div>}
              {apusFiltrados.length>0&&(
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                  <thead>
                    <tr style={{ background:"#f8fafc" }}>
                      {["APU","Unidad","P.U. Calc.","Estado","Accion"].map((h,i)=>(
                        <th key={h} style={{ padding:"6px 8px", textAlign:i===2?"right":i===4?"center":"left", color:"#6b7280", borderBottom:"1px solid #e5e7eb", fontSize:"11px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apusFiltrados.map(a=>(
                      <tr key={a.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                        <td style={{ padding:"7px 8px" }}>
                          <div style={{ fontWeight:"500" }}>{textoVista(a.nombre)}</div>
                          <div style={{ color:"#6b7280", fontSize:"11px" }}>{a.codigo||"-"}</div>
                        </td>
                        <td style={{ padding:"7px 8px", color:"#374151" }}>{a.unidad||"-"}</td>
                        <td style={{ padding:"7px 8px", textAlign:"right", fontVariantNumeric:"tabular-nums", color:"#166534", fontWeight:"600" }}>{fmtM(costosModalApu[a.id]?.precio_unitario ?? null)}</td>
                        <td style={{ padding:"7px 8px", color:"#374151" }}>{a.estado}</td>
                        <td style={{ padding:"7px 8px", textAlign:"center" }}>
                          <button onClick={()=>vincularApu(a)} style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:"4px", padding:"4px 12px", fontSize:"11px", cursor:"pointer" }}>Vincular</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {error&&<p style={{ color:"#dc2626", fontSize:"12px", marginTop:"8px" }}>{error}</p>}
            <button onClick={()=>{setModalVincular(false);setError("");}} style={{ marginTop:"12px", border:"1px solid #d1d5db", borderRadius:"6px", padding:"6px", fontSize:"13px", cursor:"pointer" }}>Cerrar panel</button>
          </div>
        </div>
      )}
    </div>
  );
}
