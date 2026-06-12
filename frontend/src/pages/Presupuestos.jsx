import React, { useEffect, useState, useRef } from "react";

const API = "http://127.0.0.1:8000";

const COLORES_TIPO = {
  FASE:        { bg: "#1e40af", text: "#fff", indent: 0  },
  CATEGORIA:   { bg: "#1d4ed8", text: "#fff", indent: 16 },
  SUBCATEGORIA:{ bg: "#2563eb", text: "#fff", indent: 32 },
  CAPITULO:    { bg: "#3b82f6", text: "#fff", indent: 48 },
  SUBCAPITULO: { bg: "#60a5fa", text: "#1e3a8a", indent: 64 },
  GRUPO:       { bg: "#93c5fd", text: "#1e3a8a", indent: 80 },
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

function fmtM(v) { if (v==null) return "—"; return "$"+Number(v).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtN(v) { if (v==null) return "—"; return Number(v).toLocaleString("es-EC",{maximumFractionDigits:2}); }

// ── Estado de vinculación de un nodo padre ────────────────
function estadoNodo(nodoId, planos) {
  const hijos = planos.filter(n => n.tipo === "RUBRO" && esDescendiente(nodoId, n, planos));
  if (!hijos.length) return "sin_rubros";
  const vinc = hijos.filter(r => r.tipo_rubro === "VINCULADO").length;
  if (vinc === hijos.length) return "completo";
  if (vinc === 0) return "ninguno";
  return "parcial";
}

function esDescendiente(ancestroId, nodo, planos) {
  if (!nodo.padre_id) return false;
  if (nodo.padre_id === ancestroId) return true;
  const padre = planos.find(n => n.id === nodo.padre_id);
  return padre ? esDescendiente(ancestroId, padre, planos) : false;
}

const DOT_COLOR = { completo: "#16a34a", parcial: "#ca8a04", ninguno: "#dc2626", sin_rubros: "#d1d5db" };

// ── Cache de costos APU ───────────────────────────────────
const costoCache = {};
async function fetchCostoApu(apuId) {
  if (costoCache[apuId] !== undefined) return costoCache[apuId];
  try {
    const r = await fetch(`${API}/apus/${apuId}/costo`);
    if (!r.ok) { costoCache[apuId] = null; return null; }
    const d = await r.json();
    costoCache[apuId] = d.precio_unitario;
    return d.precio_unitario;
  } catch { costoCache[apuId] = null; return null; }
}

// ════════════════════════════════════════════════════════════
// Subcomponente TablaGrupos
// ════════════════════════════════════════════════════════════
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
              {["Descripción","Und","N","Metrado total","P.U. Ref","Dif ($)","APU"].map((h,i)=>(
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
              const puDisp = puVar?`${Math.min(...pus).toFixed(2)}–${Math.max(...pus).toFixed(2)}`:pus[0]?.toFixed(2)||"—";
              const todoVinc = g.rubros.every(r=>r.tipo_rubro==="VINCULADO");
              const sinApu = g.rubros.every(r=>r.observaciones==="SIN_APU");
              return (
                <React.Fragment key={clave}>
                  <tr style={{ borderTop:`1px solid ${bordeColor}`, background: todoVinc?"#f0fdf4":"#fff", cursor:"pointer" }} onClick={()=>onToggle(clave)}>
                    <td style={{ padding:"7px 8px" }}>
                      <span style={{ fontSize:"10px", marginRight:"4px" }}>{exp?"▼":"▶"}</span>
                      {g.descripcion}
                      {puVar && <span style={{ fontSize:"10px", background:"#fee2e2", color:"#991b1b", borderRadius:"3px", padding:"1px 5px", marginLeft:"6px" }}>P.U. variable</span>}
                      {sinApu && <span style={{ fontSize:"10px", background:"#fee2e2", color:"#991b1b", borderRadius:"3px", padding:"1px 5px", marginLeft:"6px" }}>SIN APU</span>}
                    </td>
                    <td style={{ padding:"7px 4px" }}>{g.unidad}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right", fontWeight:"600", color: esInd?"#854d0e":"#374151" }}>{g.rubros.length}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right" }}>{fmtN(mt)}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right", color: puVar?"#dc2626":"#374151" }}>{puDisp}</td>
                    <td style={{ padding:"7px 4px", textAlign:"right", color:"#6b7280" }}>—</td>
                    <td style={{ padding:"7px 8px", textAlign:"center" }} onClick={e=>e.stopPropagation()}>
                      {todoVinc
                        ? <button onClick={()=>onDesvincularGrupo(g)} style={{ fontSize:"10px", color:"#dc2626", background:"none", border:"none", cursor:"pointer" }}>Desvincular</button>
                        : !sinApu && <button onClick={()=>onVincular(g)} style={{ fontSize:"10px", background:"#2563eb", color:"#fff", border:"none", borderRadius:"4px", padding:"3px 8px", cursor:"pointer" }}>+ Vincular al grupo</button>}
                    </td>
                  </tr>
                  {exp && (
                    <tr key={`${clave}-det`} style={{ background:"#f9fafb" }}>
                      <td colSpan={7} style={{ padding:"8px 12px 10px 28px", borderTop:`1px dashed ${bordeColor}` }}>
                        <div style={{ fontSize:"11px", color:"#6b7280", marginBottom:"6px" }}>{g.rubros.length} ubicación(es):</div>
                        <table style={{ width:"100%", fontSize:"11px", borderCollapse:"collapse" }}>
                          {g.rubros.map(r=>(
                            <tr key={r.id}>
                              <td style={{ padding:"3px 0", color:"#374151" }}>› {r.descripcion}</td>
                              <td style={{ padding:"3px 8px", textAlign:"right", color:"#6b7280", whiteSpace:"nowrap" }}>{fmtN(r.metrado)} {r.unidad}</td>
                              <td style={{ padding:"3px 0", textAlign:"right", color:"#6b7280" }}>${r.precio_unitario_ref?.toFixed(2)||"—"}</td>
                              <td style={{ padding:"3px 0 3px 12px", whiteSpace:"nowrap" }}>
                                {!esInd && onIndividualizar && <button onClick={()=>onIndividualizar(r.id)} style={{ fontSize:"10px", color:"#2563eb", background:"none", border:"none", cursor:"pointer" }}>individualizar</button>}
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

// ════════════════════════════════════════════════════════════
// Componente principal
// ════════════════════════════════════════════════════════════
export default function Presupuestos() {
  const [vista, setVista] = useState("lista");
  const [pestana, setPestana] = useState("jerarquica");
  const [proyectos, setProyectos] = useState([]);
  const [proyectoActual, setProyectoActual] = useState(null);
  const [nodosPlanos, setNodosPlanos] = useState([]);
  const [colapsados, setColapsados] = useState({});
  const [gruposExp, setGruposExp] = useState({});
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null); // filtro sidebar

  // Filtros vista jerárquica
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
  const [apusFiltrados, setApusFiltrados] = useState([]);

  const [error, setError] = useState("");
  const [msgExito, setMsgExito] = useState("");
  const fileRef = useRef();

  // ── Cargar proyectos ──────────────────────────────────────
  const cargarProyectos = async () => { const r = await fetch(`${API}/presupuestos/proyectos/`); setProyectos(await r.json()); };
  useEffect(() => { cargarProyectos(); }, []);

  // ── Cargar nodos ──────────────────────────────────────────
  const cargarNodos = async (proyecto) => {
    const r = await fetch(`${API}/presupuestos/proyectos/${proyecto.id}/nodos`);
    const data = await r.json();
    const planos = aplanar(construirArbol(data));
    setNodosPlanos(planos);
    setColapsados({}); setGruposExp({}); setNodoSeleccionado(null);
    setProyectoActual(proyecto); setVista("detalle");
    // Cargar costos de APUs vinculados
    cargarCostosApu(planos);
  };

  const cargarCostosApu = async (planos) => {
    const apuIds = [...new Set(planos.filter(n=>n.apu_id).map(n=>n.apu_id))];
    const nuevos = {};
    await Promise.all(apuIds.map(async id => { nuevos[id] = await fetchCostoApu(id); }));
    setCostosApu(prev => ({ ...prev, ...nuevos }));
  };

  // ── Filtrar APUs para modal ───────────────────────────────
  useEffect(() => {
    if (!modalVincular) return;
    fetch(`${API}/apus/?limit=500`).then(r=>r.json()).then(setApus);
  }, [modalVincular]);

  useEffect(() => {
    if (!nodoVinculando) return;
    const unidad = (esGrupo ? nodoVinculando.unidad : nodoVinculando.unidad||"").toLowerCase().trim();
    const busq = buscarApu.toLowerCase();
    setApusFiltrados(apus.filter(a => {
      const u = (a.unidad||"").toLowerCase().trim();
      return (!unidad||u===unidad) && (!busq||a.nombre.toLowerCase().includes(busq)||(a.codigo||"").toLowerCase().includes(busq)) && a.estado==="activo";
    }));
  }, [apus, buscarApu, nodoVinculando, esGrupo]);

  // ── CRUD proyectos ────────────────────────────────────────
  const crearProyecto = async () => {
    if (!formNuevo.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const r = await fetch(`${API}/presupuestos/proyectos/`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(formNuevo) });
    if (r.ok) { setModalNuevo(false); setFormNuevo({nombre:"",codigo:"",descripcion:""}); setError(""); cargarProyectos(); }
    else { const e=await r.json(); setError(e.detail||"Error."); }
  };

  const eliminarProyecto = async (id) => {
    if (!confirm("¿Eliminar este proyecto?")) return;
    await fetch(`${API}/presupuestos/proyectos/${id}`, {method:"DELETE"}); cargarProyectos();
  };

  // ── Importar Excel ────────────────────────────────────────
  const importarExcel = async () => {
    if (!archivoImport) { setError("Selecciona un archivo."); return; }
    setImportando(true); setError("");
    const fd = new FormData(); fd.append("archivo", archivoImport); fd.append("hoja", hojaImport);
    const r = await fetch(`${API}/presupuestos/proyectos/${proyectoActual.id}/importar`, {method:"POST", body:fd});
    setImportando(false);
    if (r.ok) { const d=await r.json(); setModalImportar(false); setArchivoImport(null); mostrarExito(d.mensaje); cargarNodos(proyectoActual); }
    else { const e=await r.json(); setError(e.detail||"Error."); }
  };

  // ── Historial para deshacer/rehacer ───────────────────────
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
    } else if (accion.tipo === "individualizar") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/reagrupar`, {method:"PATCH"});
    } else if (accion.tipo === "reagrupar") {
      await fetch(`${API}/presupuestos/nodos/${accion.nodoId}/individualizar`, {method:"PATCH"});
    }
  };

  // ── Vincular APU ──────────────────────────────────────────
  const abrirVincular = (nodo, grupo) => { setNodoVinculando(nodo); setEsGrupo(grupo); setBuscarApu(""); setError(""); setModalVincular(true); };

  const vincularApu = async (apu) => {
    const rubros = esGrupo ? nodoVinculando.rubros : [nodoVinculando];
    const resultados = await Promise.all(rubros.map(r =>
      fetch(`${API}/presupuestos/nodos/${r.id}/vincular-apu`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({apu_id:apu.id}) })
    ));
    const errores = resultados.filter(r=>!r.ok);
    if (errores.length) { setError(`${errores.length} rubro(s) no vinculados (unidad incompatible)`); return; }
    // Registrar en historial
    rubros.forEach(r => registrarAccion({ tipo:"vincular", nodoId:r.id, apuId:apu.id }));
    setModalVincular(false); mostrarExito("APU vinculado"); cargarNodos(proyectoActual);
  };

  const desvincularApu = async (nodo) => {
    registrarAccion({ tipo:"desvincular", nodoId:nodo.id, apuId:nodo.apu_id });
    await fetch(`${API}/presupuestos/nodos/${nodo.id}/desvincular-apu`, {method:"PATCH"});
    cargarNodos(proyectoActual);
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

  const marcarSinApu = async (nodo) => { registrarAccion({tipo:"marcar_sin_apu",nodoId:nodo.id,apuId:nodo.apu_id}); await fetch(`${API}/presupuestos/nodos/${nodo.id}/marcar-sin-apu`,{method:"PATCH"}); cargarNodos(proyectoActual); };
  const desmarcarSinApu = async (nodo) => { registrarAccion({tipo:"desmarcar_sin_apu",nodoId:nodo.id}); await fetch(`${API}/presupuestos/nodos/${nodo.id}/desmarcar-sin-apu`,{method:"PATCH"}); cargarNodos(proyectoActual); };
  const mostrarExito = (msg) => { setMsgExito(msg); setTimeout(()=>setMsgExito(""),4000); };
  const toggleColapsar = (id) => setColapsados(p=>({...p,[id]:!p[id]}));
  const toggleGrupo = (k) => setGruposExp(p=>({...p,[k]:!p[k]}));

  // ── Nodos visibles con filtros ────────────────────────────
  const nodosVisibles = (() => {
    const ocultos = new Set();
    nodosPlanos.forEach(n => { if (n.padre_id && (ocultos.has(n.padre_id)||colapsados[n.padre_id])) ocultos.add(n.id); });
    let visibles = nodosPlanos.filter(n => !ocultos.has(n.id));

    // Filtro por nodo seleccionado en sidebar
    if (nodoSeleccionado) {
      const idsPermitidos = new Set();
      idsPermitidos.add(nodoSeleccionado.id);
      nodosPlanos.forEach(n => { if (esDescendiente(nodoSeleccionado.id, n, nodosPlanos)) idsPermitidos.add(n.id); });
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

    // Filtro por búsqueda
    if (buscarRubro.trim()) {
      const q = buscarRubro.toLowerCase();
      visibles = visibles.filter(n => n.tipo !== "RUBRO" || n.descripcion.toLowerCase().includes(q));
    }

    return visibles;
  })();

  // Nodos sidebar filtrados
  const nodosSidebar = nodosPlanos.filter(n => n.tipo !== "RUBRO").filter(n => {
    if (!buscarSidebar.trim()) return true;
    return n.descripcion.toLowerCase().includes(buscarSidebar.toLowerCase());
  });

  // ── Estadísticas ──────────────────────────────────────────
  const rubros = nodosPlanos.filter(n=>n.tipo==="RUBRO");
  const totalRef = rubros.reduce((s,r)=>s+(r.metrado||0)*(r.precio_unitario_ref||0),0);
  const totalMeta = rubros.reduce((s,r)=>{
    const pu = r.apu_id ? (costosApu[r.apu_id]||0) : 0;
    return s+(r.metrado||0)*pu;
  },0);
  const dif = totalMeta > 0 ? totalMeta - totalRef : null;

  // Stats sección seleccionada
  const rubrosSeccion = nodoSeleccionado
    ? rubros.filter(n=>esDescendiente(nodoSeleccionado.id, n, nodosPlanos))
    : rubros;
  const totalRefSeccion = rubrosSeccion.reduce((s,r)=>s+(r.metrado||0)*(r.precio_unitario_ref||0),0);
  const totalMetaSeccion = rubrosSeccion.reduce((s,r)=>{
    const pu = r.apu_id ? (costosApu[r.apu_id]||0) : 0;
    return s+(r.metrado||0)*pu;
  },0);

  const { grupos, individualizados } = calcularGrupos(nodosPlanos);

  // ── Grupos filtrados ──────────────────────────────────────
  const gruposFiltrados = grupos.filter(g => {
    if (buscarGrupo && !normalizar(g.descripcion).includes(normalizar(buscarGrupo))) return false;
    if (filtroGrupo === "VINCULADO") return g.rubros.every(r=>r.tipo_rubro==="VINCULADO");
    if (filtroGrupo === "PENDIENTE") return g.rubros.some(r=>r.tipo_rubro!=="VINCULADO"&&r.observaciones!=="SIN_APU");
    if (filtroGrupo === "SIN_APU") return g.rubros.every(r=>r.observaciones==="SIN_APU");
    return true;
  });

  // ════════════════════════════════════════════════════════════
  // VISTA: Lista de proyectos
  // ════════════════════════════════════════════════════════════
  if (vista === "lista") return (
    <div style={{ padding:"24px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
        <h1 style={{ fontSize:"22px", fontWeight:"700", color:"#1f2937" }}>Presupuestos</h1>
        <button onClick={()=>{setFormNuevo({nombre:"",codigo:"",descripcion:""});setError("");setModalNuevo(true);}}
          style={{ background:"#2563eb", color:"#fff", border:"none", borderRadius:"6px", padding:"8px 16px", fontSize:"13px", cursor:"pointer" }}>+ Nuevo Proyecto</button>
      </div>
      {proyectos.length===0 && <div style={{ textAlign:"center", padding:"48px", color:"#9ca3af" }}>No hay proyectos.</div>}
      <div style={{ display:"grid", gap:"12px" }}>
        {proyectos.map(p=>(
          <div key={p.id} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:"8px", padding:"16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontWeight:"600", fontSize:"15px" }}>{p.nombre}</div>
              {p.codigo&&<div style={{ fontSize:"12px", color:"#6b7280" }}>Código: {p.codigo}</div>}
            </div>
            <div style={{ display:"flex", gap:"8px" }}>
              <button onClick={()=>cargarNodos(p)} style={{ background:"#2563eb", color:"#fff", border:"none", borderRadius:"6px", padding:"6px 14px", fontSize:"12px", cursor:"pointer" }}>Abrir</button>
              <button onClick={()=>eliminarProyecto(p.id)} style={{ background:"#fff", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:"6px", padding:"6px 14px", fontSize:"12px", cursor:"pointer" }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
      {modalNuevo&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div style={{ background:"#fff", borderRadius:"10px", padding:"24px", width:"100%", maxWidth:"420px" }}>
            <h2 style={{ fontSize:"16px", fontWeight:"700", marginBottom:"16px" }}>Nuevo Proyecto</h2>
            {[["Nombre *","nombre","Ej: Edificio Norte"],["Código","codigo","Ej: PPTO-2026-001"]].map(([label,key,ph])=>(
              <div key={key} style={{ marginBottom:"10px" }}>
                <label style={{ display:"block", fontSize:"13px", color:"#374151", marginBottom:"4px" }}>{label}</label>
                <input value={formNuevo[key]} onChange={e=>setFormNuevo({...formNuevo,[key]:e.target.value})}
                  style={{ border:"1px solid #d1d5db", borderRadius:"6px", padding:"6px 10px", width:"100%", boxSizing:"border-box", fontSize:"13px" }} placeholder={ph}/>
              </div>
            ))}
            <div style={{ marginBottom:"10px" }}>
              <label style={{ display:"block", fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Descripción</label>
              <textarea value={formNuevo.descripcion} onChange={e=>setFormNuevo({...formNuevo,descripcion:e.target.value})}
                style={{ border:"1px solid #d1d5db", borderRadius:"6px", padding:"6px 10px", width:"100%", boxSizing:"border-box", fontSize:"13px" }} rows={2}/>
            </div>
            {error&&<p style={{ color:"#dc2626", fontSize:"12px" }}>{error}</p>}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:"8px", marginTop:"12px" }}>
              <button onClick={()=>setModalNuevo(false)} style={{ border:"1px solid #d1d5db", borderRadius:"6px", padding:"6px 14px", fontSize:"13px", cursor:"pointer" }}>Cancelar</button>
              <button onClick={crearProyecto} style={{ background:"#2563eb", color:"#fff", border:"none", borderRadius:"6px", padding:"6px 14px", fontSize:"13px", cursor:"pointer" }}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // VISTA: Detalle del proyecto
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 52px)" }}>

      {/* Barra superior */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"8px 20px", display:"flex", alignItems:"center", gap:"10px", flexShrink:0, flexWrap:"wrap" }}>
        <button onClick={()=>setVista("lista")} style={{ background:"none", border:"none", color:"#2563eb", fontSize:"13px", cursor:"pointer", padding:0 }}>← Proyectos</button>
        <span style={{ color:"#d1d5db" }}>|</span>
        <span style={{ fontWeight:"600", fontSize:"14px" }}>{proyectoActual?.nombre}</span>
        {proyectoActual?.codigo&&<span style={{ fontSize:"12px", color:"#6b7280" }}>({proyectoActual.codigo})</span>}
        <div style={{ display:"flex", gap:"4px", marginLeft:"12px" }}>
          {[["jerarquica","Jerárquica"],["grupos","Por grupos"]].map(([k,label])=>(
            <button key={k} onClick={()=>setPestana(k)}
              style={{ fontSize:"12px", padding:"4px 12px", border:"1px solid", borderRadius:"6px", cursor:"pointer", borderColor:pestana===k?"#2563eb":"#d1d5db", background:pestana===k?"#2563eb":"#fff", color:pestana===k?"#fff":"#374151" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:"6px", alignItems:"center" }}>
          {msgExito&&<span style={{ fontSize:"12px", color:"#16a34a", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:"4px", padding:"3px 10px" }}>{msgExito}</span>}
          <button onClick={deshacer} disabled={!historial.length} title="Deshacer"
            style={{ fontSize:"12px", padding:"4px 10px", cursor:historial.length?"pointer":"not-allowed", opacity:historial.length?1:0.4, border:"1px solid #d1d5db", borderRadius:"6px", background:"#fff" }}>
            ↩ Deshacer
          </button>
          <button onClick={rehacer} disabled={!futuro.length} title="Rehacer"
            style={{ fontSize:"12px", padding:"4px 10px", cursor:futuro.length?"pointer":"not-allowed", opacity:futuro.length?1:0.4, border:"1px solid #d1d5db", borderRadius:"6px", background:"#fff" }}>
            ↪ Rehacer
          </button>
          {nodosPlanos.length===0&&(
            <button onClick={()=>{setArchivoImport(null);setError("");setModalImportar(true);}}
              style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:"6px", padding:"6px 14px", fontSize:"12px", cursor:"pointer" }}>↑ Importar Excel</button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {nodosPlanos.length>0&&(
        <div style={{ background:"#f8fafc", borderBottom:"1px solid #e5e7eb", padding:"6px 20px", display:"flex", gap:"16px", fontSize:"11px", color:"#6b7280", flexShrink:0, flexWrap:"wrap" }}>
          <span>Rubros: <strong style={{ color:"#111827" }}>{rubros.length}</strong></span>
          <span style={{ color:"#16a34a" }}>✓ {rubros.filter(r=>r.tipo_rubro==="VINCULADO").length} vinculados</span>
          <span style={{ color:"#ca8a04" }}>⏳ {rubros.filter(r=>r.tipo_rubro==="PENDIENTE"&&r.observaciones!=="SIN_APU").length} pendientes</span>
          <span style={{ color:"#dc2626" }}>✗ {rubros.filter(r=>r.observaciones==="SIN_APU").length} sin APU</span>
          <span style={{ marginLeft:"auto", fontWeight:"600", color:"#111827" }}>
            Ref: {fmtM(totalRef)}
            {totalMeta>0&&<> · Meta: <span style={{ color:"#166534" }}>{fmtM(totalMeta)}</span> · Dif: <span style={{ color:dif<0?"#16a34a":"#dc2626" }}>{dif<0?"-":"++"}{fmtM(Math.abs(dif))}</span></>}
          </span>
        </div>
      )}

      <div style={{ flex:1, overflow:"hidden", display:"flex" }}>

        {/* ═══ PESTAÑA JERÁRQUICA ═══ */}
        {pestana==="jerarquica"&&(
          <>
            {/* Sidebar */}
            <div style={{ width:"260px", borderRight:"1px solid #e5e7eb", display:"flex", flexDirection:"column", background:"#f9fafb", flexShrink:0 }}>
              <div style={{ padding:"8px" }}>
                <input type="text" placeholder="Buscar sección..." value={buscarSidebar} onChange={e=>setBuscarSidebar(e.target.value)}
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
                    style={{ fontSize:"10px", color:"#2563eb", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:"4px", padding:"2px 8px", cursor:"pointer", width:"100%" }}>
                    ✕ Mostrar todo el presupuesto
                  </button>
                </div>
              )}
              {/* Árbol */}
              <div style={{ overflowY:"auto", flex:1 }}>
                {nodosSidebar.map(n=>{
                  const cfg = COLORES_TIPO[n.tipo]||COLORES_TIPO.GRUPO;
                  const tieneHijos = nodosPlanos.some(h=>h.padre_id===n.id);
                  const seleccionado = nodoSeleccionado?.id===n.id;
                  const est = estadoNodo(n.id, nodosPlanos);
                  return (
                    <div key={n.id} onClick={()=>setNodoSeleccionado(seleccionado?null:n)}
                      style={{ paddingLeft:`${cfg.indent+10}px`, paddingRight:"8px", paddingTop:"4px", paddingBottom:"4px",
                        fontSize:"11px", cursor:"pointer", display:"flex", alignItems:"center", gap:"4px", color:"#1f2937",
                        background:seleccionado?"#dbeafe":"transparent", borderLeft:seleccionado?"3px solid #2563eb":"3px solid transparent" }}>
                      {tieneHijos
                        ? <span onClick={e=>{e.stopPropagation();toggleColapsar(n.id);}} style={{ fontSize:"9px", color:"#6b7280", userSelect:"none", minWidth:"10px" }}>{colapsados[n.id]?"▶":"▼"}</span>
                        : <span style={{ minWidth:"10px" }}/>}
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }} title={n.descripcion}>{n.descripcion}</span>
                      <span style={{ width:"7px", height:"7px", borderRadius:"50%", background:DOT_COLOR[est], flexShrink:0 }}/>
                    </div>
                  );
                })}
              </div>
              {/* Totales sección */}
              {nodoSeleccionado&&(
                <div style={{ borderTop:"1px solid #e5e7eb", padding:"8px", fontSize:"10px", color:"#6b7280", lineHeight:"1.7" }}>
                  <div style={{ fontWeight:"600", color:"#111827", marginBottom:"2px" }}>{nodoSeleccionado.descripcion}</div>
                  <div>{rubrosSeccion.length} rubros · {rubrosSeccion.filter(r=>r.tipo_rubro==="VINCULADO").length} vinculados</div>
                  <div>Ref: <strong>{fmtM(totalRefSeccion)}</strong></div>
                  {totalMetaSeccion>0&&<div>Meta: <strong style={{ color:"#166534" }}>{fmtM(totalMetaSeccion)}</strong> · <span style={{ color: totalMetaSeccion<totalRefSeccion?"#16a34a":"#dc2626" }}>{fmtM(totalMetaSeccion-totalRefSeccion)}</span></div>}
                </div>
              )}
            </div>

            {/* Tabla */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              {/* Barra filtros tabla */}
              <div style={{ padding:"6px 10px", borderBottom:"1px solid #e5e7eb", display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap", background:"#fff", flexShrink:0 }}>
                {nodoSeleccionado
                  ? <><span style={{ fontSize:"11px", color:"#6b7280" }}>Mostrando:</span><span style={{ fontSize:"11px", fontWeight:"500" }}>{nodoSeleccionado.descripcion}</span><span style={{ fontSize:"10px", color:"#9ca3af" }}>({rubrosSeccion.length} rubros)</span></>
                  : <span style={{ fontSize:"11px", color:"#6b7280" }}>Presupuesto completo</span>}
                <div style={{ marginLeft:"auto", display:"flex", gap:"4px", alignItems:"center" }}>
                  <input type="text" placeholder="Buscar rubro..." value={buscarRubro} onChange={e=>setBuscarRubro(e.target.value)}
                    style={{ fontSize:"11px", padding:"3px 8px", border:"1px solid #d1d5db", borderRadius:"6px", width:"130px" }}/>
                </div>
              </div>

              <div style={{ overflowY:"auto", flex:1 }}>
                {nodosPlanos.length===0?(
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:"12px", color:"#9ca3af" }}>
                    <div style={{ fontSize:"40px" }}>📄</div>
                    <button onClick={()=>{setArchivoImport(null);setError("");setModalImportar(true);}}
                      style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:"6px", padding:"8px 20px", fontSize:"13px", cursor:"pointer" }}>↑ Importar Excel</button>
                  </div>
                ):(
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"11px" }}>
                    <thead>
                      <tr style={{ background:"#f3f4f6", position:"sticky", top:0, zIndex:1 }}>
                        {[["Descripción","left","28%"],["Und","center","5%"],["Metrado","right","8%"],["P.U. Ref","right","8%"],["P.U. Meta","right","8%"],["Dif ($)","right","8%"],["P. Total Ref","right","9%"],["Estado","center","8%"],["APU","center","18%"]].map(([h,align,w])=>(
                          <th key={h} style={{ padding:"7px 8px", textAlign:align, borderBottom:"1px solid #e5e7eb", color:"#374151", fontWeight:"600", width:w, whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nodosVisibles.map(n=>{
                        const cfg = COLORES_TIPO[n.tipo]||COLORES_TIPO.RUBRO;
                        const esR = n.tipo==="RUBRO";
                        const sinApu = n.observaciones==="SIN_APU";
                        const badge = esR?(sinApu?BADGE.SIN_APU:BADGE[n.tipo_rubro]||BADGE.PENDIENTE):null;
                        const tieneHijos = !esR&&nodosPlanos.some(h=>h.padre_id===n.id);
                        const puMeta = esR&&n.apu_id ? (costosApu[n.apu_id]||null) : null;
                        const difVal = esR&&puMeta!=null ? (puMeta-(n.precio_unitario_ref||0))*(n.metrado||0) : null;
                        return (
                          <tr key={n.id} style={{ background:esR?"#fff":cfg.bg, borderBottom:"1px solid #e5e7eb", cursor:tieneHijos?"pointer":"default" }}
                            onClick={()=>tieneHijos&&toggleColapsar(n.id)}>
                            <td style={{ padding:"5px 8px", paddingLeft:`${cfg.indent+8}px` }}>
                              <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                                {tieneHijos&&<span style={{ fontSize:"9px", opacity:0.7 }}>{colapsados[n.id]?"▶":"▼"}</span>}
                                <span style={{ color:esR?"#111827":cfg.text, fontWeight:esR?"400":"600", fontSize:esR?"11px":"11px" }}>{n.descripcion}</span>
                                {sinApu&&<span style={{ fontSize:"9px", background:"#fee2e2", color:"#991b1b", borderRadius:"3px", padding:"1px 4px" }}>SIN APU</span>}
                              </div>
                            </td>
                            <td style={{ padding:"5px 4px", textAlign:"center", color:esR?"#374151":cfg.text }}>{n.unidad||""}</td>
                            <td style={{ padding:"5px 4px", textAlign:"right", color:esR?"#374151":cfg.text }}>{esR&&n.metrado!=null?fmtN(n.metrado):""}</td>
                            <td style={{ padding:"5px 4px", textAlign:"right", color:esR?"#374151":cfg.text }}>{esR?fmtM(n.precio_unitario_ref):""}</td>
                            <td style={{ padding:"5px 4px", textAlign:"right", color:"#166534" }}>{esR&&puMeta!=null?fmtM(puMeta):esR?"—":""}</td>
                            <td style={{ padding:"5px 4px", textAlign:"right", fontWeight:"500", color:difVal!=null?(difVal<0?"#16a34a":"#dc2626"):"#6b7280" }}>{esR&&difVal!=null?`${difVal<0?"-":"+"}${fmtM(Math.abs(difVal))}`:esR?"—":""}</td>
                            <td style={{ padding:"5px 4px", textAlign:"right" }}>{esR?fmtM((n.metrado||0)*(n.precio_unitario_ref||0)):""}</td>
                            <td style={{ padding:"5px 4px", textAlign:"center" }}>{badge&&<span style={{ background:badge.bg, color:badge.text, borderRadius:"4px", padding:"2px 6px", fontSize:"9px", fontWeight:"600" }}>{badge.label}</span>}</td>
                            <td style={{ padding:"5px 8px", textAlign:"center" }}>
                              {esR&&(
                                n.tipo_rubro==="VINCULADO"
                                  ? <button onClick={()=>desvincularApu(n)} style={{ fontSize:"10px", color:"#dc2626", background:"none", border:"none", cursor:"pointer" }}>Desvincular</button>
                                  : sinApu
                                    ? <button onClick={()=>desmarcarSinApu(n)} style={{ fontSize:"10px", color:"#16a34a", background:"none", border:"1px solid #86efac", borderRadius:"4px", padding:"2px 6px", cursor:"pointer" }}>✓ Tiene APU</button>
                                    : <div style={{ display:"flex", gap:"3px", justifyContent:"center" }}>
                                        <button onClick={()=>abrirVincular(n,false)} style={{ fontSize:"10px", background:"#2563eb", color:"#fff", border:"none", borderRadius:"4px", padding:"2px 6px", cursor:"pointer" }}>Vincular APU</button>
                                        <button onClick={()=>marcarSinApu(n)} style={{ fontSize:"10px", color:"#6b7280", background:"none", border:"1px solid #d1d5db", borderRadius:"4px", padding:"2px 6px", cursor:"pointer" }}>Sin APU</button>
                                      </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══ PESTAÑA POR GRUPOS ═══ */}
        {pestana==="grupos"&&(
          <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
            {nodosPlanos.length===0?(
              <div style={{ textAlign:"center", paddingTop:"60px", color:"#9ca3af" }}>Sin datos. Importa un Excel primero.</div>
            ):(
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"8px", marginBottom:"12px" }}>
                  {[["Grupos",grupos.length,"#f8fafc","#374151"],["Con APU",grupos.filter(g=>g.rubros.every(r=>r.tipo_rubro==="VINCULADO")).length,"#f0fdf4","#166534"],["Pendientes",grupos.filter(g=>g.rubros.some(r=>r.tipo_rubro!=="VINCULADO"&&r.observaciones!=="SIN_APU")).length,"#fefce8","#854d0e"],["Individualizados",individualizados.reduce((s,g)=>s+g.rubros.length,0),"#fef9c3","#854d0e"]].map(([label,val,bg,color])=>(
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
                        borderColor:filtroGrupo===val?"#2563eb":"#d1d5db", background:filtroGrupo===val?"#2563eb":"#fff", color:filtroGrupo===val?"#fff":"#374151" }}>
                      {label}
                    </button>
                  ))}
                </div>

                <TablaGrupos
                  titulo={`Grupos automáticos · ${gruposFiltrados.length}`}
                  grupos={gruposFiltrados} expandidos={gruposExp} onToggle={toggleGrupo}
                  onVincular={g=>abrirVincular(g,true)}
                  onDesvincularGrupo={async g=>{g.rubros.forEach(r=>registrarAccion({tipo:"desvincular",nodoId:r.id,apuId:r.apu_id}));await Promise.all(g.rubros.map(r=>fetch(`${API}/presupuestos/nodos/${r.id}/desvincular-apu`,{method:"PATCH"})));mostrarExito("APU desvinculado del grupo");cargarNodos(proyectoActual);}}
                  onIndividualizar={individualizar} esInd={false} bordeColor="#e5e7eb" headerBg="#f3f4f6"
                />

                {individualizados.length>0&&(
                  <div style={{ marginTop:"24px" }}>
                    <TablaGrupos
                      titulo={`Rubros individualizados · ${individualizados.reduce((s,g)=>s+g.rubros.length,0)}`}
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

      {/* Modal Importar */}
      {modalImportar&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div style={{ background:"#fff", borderRadius:"10px", padding:"24px", width:"100%", maxWidth:"400px" }}>
            <h2 style={{ fontSize:"16px", fontWeight:"700", marginBottom:"12px" }}>Importar Excel</h2>
            <div style={{ marginBottom:"10px" }}>
              <label style={{ display:"block", fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Archivo Excel *</label>
              <input ref={fileRef} type="file" accept=".xlsx" onChange={e=>setArchivoImport(e.target.files[0])} style={{ fontSize:"12px", width:"100%" }}/>
            </div>
            <div style={{ marginBottom:"10px" }}>
              <label style={{ display:"block", fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Hoja</label>
              <select value={hojaImport} onChange={e=>setHojaImport(e.target.value)}
                style={{ border:"1px solid #d1d5db", borderRadius:"6px", padding:"6px 10px", width:"100%", fontSize:"13px" }}>
                <option value="PPTO META">PPTO META</option>
                <option value="PPTO CONTRACTUAL">PPTO CONTRACTUAL</option>
              </select>
            </div>
            {error&&<p style={{ color:"#dc2626", fontSize:"12px" }}>{error}</p>}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:"8px", marginTop:"12px" }}>
              <button onClick={()=>{setModalImportar(false);setError("");}} style={{ border:"1px solid #d1d5db", borderRadius:"6px", padding:"6px 14px", fontSize:"13px", cursor:"pointer" }}>Cancelar</button>
              <button onClick={importarExcel} disabled={importando} style={{ background:importando?"#9ca3af":"#16a34a", color:"#fff", border:"none", borderRadius:"6px", padding:"6px 14px", fontSize:"13px", cursor:importando?"not-allowed":"pointer" }}>
                {importando?"Importando...":"Importar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular APU */}
      {modalVincular&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div style={{ background:"#fff", borderRadius:"10px", padding:"24px", width:"100%", maxWidth:"500px", maxHeight:"80vh", display:"flex", flexDirection:"column" }}>
            <div style={{ marginBottom:"12px" }}>
              <h2 style={{ fontSize:"15px", fontWeight:"700", margin:0 }}>Vincular APU</h2>
              <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"4px" }}>
                {esGrupo?`Grupo: "${nodoVinculando?.descripcion}" (${nodoVinculando?.rubros?.length} rubros)`:`Rubro: "${nodoVinculando?.descripcion}"`}
                {nodoVinculando?.unidad&&<span style={{ marginLeft:"6px", background:"#f3f4f6", padding:"1px 6px", borderRadius:"4px" }}>{nodoVinculando.unidad}</span>}
              </div>
            </div>
            <input type="text" placeholder="Buscar APU..." value={buscarApu} onChange={e=>setBuscarApu(e.target.value)}
              style={{ border:"1px solid #d1d5db", borderRadius:"6px", padding:"7px 10px", fontSize:"13px", marginBottom:"8px" }}/>
            <div style={{ fontSize:"11px", color:"#6b7280", marginBottom:"6px" }}>{apusFiltrados.length} APU(s) activos con esa unidad</div>
            <div style={{ overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:"4px" }}>
              {apusFiltrados.length===0&&<div style={{ textAlign:"center", padding:"24px", color:"#9ca3af", fontSize:"13px" }}>No hay APUs activos con esa unidad.</div>}
              {apusFiltrados.map(a=>(
                <div key={a.id} style={{ border:"1px solid #e5e7eb", borderRadius:"6px", padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:"12px" }}>
                  <div>
                    <div style={{ fontWeight:"500" }}>{a.nombre}</div>
                    <div style={{ color:"#6b7280", fontSize:"11px" }}>{a.codigo||"—"} · {a.unidad}</div>
                  </div>
                  <button onClick={()=>vincularApu(a)} style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:"4px", padding:"4px 12px", fontSize:"11px", cursor:"pointer" }}>Seleccionar</button>
                </div>
              ))}
            </div>
            {error&&<p style={{ color:"#dc2626", fontSize:"12px", marginTop:"8px" }}>{error}</p>}
            <button onClick={()=>{setModalVincular(false);setError("");}} style={{ marginTop:"12px", border:"1px solid #d1d5db", borderRadius:"6px", padding:"6px", fontSize:"13px", cursor:"pointer" }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
