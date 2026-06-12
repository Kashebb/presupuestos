import { useEffect, useState, useRef } from "react";

const API = "http://127.0.0.1:8000";

const ORDEN_JERARQUIA = ["FASE", "CATEGORIA", "SUBCATEGORIA", "CAPITULO", "SUBCAPITULO", "GRUPO", "RUBRO"];

const COLORES_TIPO = {
  FASE:        { bg: "#1e40af", text: "#fff",    indent: 0  },
  CATEGORIA:   { bg: "#1d4ed8", text: "#fff",    indent: 16 },
  SUBCATEGORIA:{ bg: "#2563eb", text: "#fff",    indent: 32 },
  CAPITULO:    { bg: "#3b82f6", text: "#fff",    indent: 48 },
  SUBCAPITULO: { bg: "#60a5fa", text: "#1e3a8a", indent: 64 },
  GRUPO:       { bg: "#93c5fd", text: "#1e3a8a", indent: 80 },
  RUBRO:       { bg: "#fff",    text: "#111827", indent: 96 },
};

const BADGE_RUBRO = {
  VINCULADO: { bg: "#dcfce7", text: "#166534", label: "Vinculado" },
  PENDIENTE: { bg: "#fef9c3", text: "#854d0e", label: "Pendiente" },
  SIN_APU:   { bg: "#fee2e2", text: "#991b1b", label: "Sin APU"   },
};

// ── Utilidades ────────────────────────────────────────────────
function construirArbol(nodos) {
  const mapa = {};
  nodos.forEach(n => { mapa[n.id] = { ...n, hijos: [] }; });
  const raices = [];
  nodos.forEach(n => {
    if (n.padre_id && mapa[n.padre_id]) {
      mapa[n.padre_id].hijos.push(mapa[n.id]);
    } else {
      raices.push(mapa[n.id]);
    }
  });
  return raices;
}

function aplanarArbol(nodos, nivel = 0, resultado = []) {
  nodos.forEach(n => {
    resultado.push({ ...n, _nivel: nivel });
    if (n.hijos && n.hijos.length > 0) {
      aplanarArbol(n.hijos, nivel + 1, resultado);
    }
  });
  return resultado;
}

function formatoMoneda(val) {
  if (val === null || val === undefined) return "—";
  return "$" + Number(val).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ════════════════════════════════════════════════════════════
// Componente principal
// ════════════════════════════════════════════════════════════
export default function Presupuestos() {
  const [vista, setVista] = useState("lista"); // "lista" | "detalle"
  const [proyectos, setProyectos] = useState([]);
  const [proyectoActual, setProyectoActual] = useState(null);
  const [nodos, setNodos] = useState([]);
  const [nodosPlanos, setNodosPlanos] = useState([]);
  const [colapsados, setColapsados] = useState({});
  const [nodoSidebar, setNodoSidebar] = useState(null); // nodo seleccionado en sidebar

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);
  const [formNuevo, setFormNuevo] = useState({ nombre: "", codigo: "", descripcion: "" });
  const [hojaImport, setHojaImport] = useState("PPTO META");
  const [archivoImport, setArchivoImport] = useState(null);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState("");
  const [msgExito, setMsgExito] = useState("");

  const fileRef = useRef();

  // ── Cargar proyectos ──────────────────────────────────────
  const cargarProyectos = async () => {
    const res = await fetch(`${API}/presupuestos/proyectos/`);
    const data = await res.json();
    setProyectos(data);
  };

  useEffect(() => { cargarProyectos(); }, []);

  // ── Cargar nodos de un proyecto ───────────────────────────
  const cargarNodos = async (proyecto) => {
    const res = await fetch(`${API}/presupuestos/proyectos/${proyecto.id}/nodos`);
    const data = await res.json();
    const arbol = construirArbol(data);
    const planos = aplanarArbol(arbol);
    setNodos(arbol);
    setNodosPlanos(planos);
    setColapsados({});
    setNodoSidebar(null);
    setProyectoActual(proyecto);
    setVista("detalle");
  };

  // ── Crear proyecto ────────────────────────────────────────
  const crearProyecto = async () => {
    if (!formNuevo.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const res = await fetch(`${API}/presupuestos/proyectos/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formNuevo),
    });
    if (res.ok) {
      setModalNuevo(false);
      setFormNuevo({ nombre: "", codigo: "", descripcion: "" });
      setError("");
      cargarProyectos();
    } else {
      const err = await res.json();
      setError(err.detail || "Error al crear el proyecto.");
    }
  };

  // ── Importar Excel ────────────────────────────────────────
  const importarExcel = async () => {
    if (!archivoImport) { setError("Selecciona un archivo Excel."); return; }
    setImportando(true);
    setError("");
    const formData = new FormData();
    formData.append("archivo", archivoImport);
    formData.append("hoja", hojaImport);
    const res = await fetch(
      `${API}/presupuestos/proyectos/${proyectoActual.id}/importar`,
      { method: "POST", body: formData }
    );
    setImportando(false);
    if (res.ok) {
      const data = await res.json();
      setModalImportar(false);
      setArchivoImport(null);
      setMsgExito(`${data.mensaje} (${data.por_tipo?.RUBRO || 0} rubros)`);
      setTimeout(() => setMsgExito(""), 5000);
      cargarNodos(proyectoActual);
    } else {
      const err = await res.json();
      setError(err.detail || "Error al importar.");
    }
  };

  // ── Eliminar proyecto ─────────────────────────────────────
  const eliminarProyecto = async (id) => {
    if (!confirm("¿Eliminar este proyecto y todos sus nodos?")) return;
    await fetch(`${API}/presupuestos/proyectos/${id}`, { method: "DELETE" });
    cargarProyectos();
  };

  // ── Colapsar / expandir nodo ──────────────────────────────
  const toggleColapsar = (id) => {
    setColapsados(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Determinar qué nodos son visibles (respetando colapsados)
  const nodosVisibles = (() => {
    const ocultos = new Set();
    nodosPlanos.forEach(n => {
      if (n.padre_id && (ocultos.has(n.padre_id) || colapsados[n.padre_id])) {
        ocultos.add(n.id);
      }
    });
    return nodosPlanos.filter(n => !ocultos.has(n.id));
  })();

  // ── Estadísticas del proyecto ─────────────────────────────
  const rubros = nodosPlanos.filter(n => n.tipo === "RUBRO");
  const totalRubros = rubros.length;
  const vinculados = rubros.filter(r => r.tipo_rubro === "VINCULADO").length;
  const pendientes = rubros.filter(r => r.tipo_rubro === "PENDIENTE").length;
  const sinApu = rubros.filter(r => r.observaciones === "SIN_APU").length;
  const totalRef = rubros.reduce((sum, r) => sum + ((r.metrado || 0) * (r.precio_unitario_ref || 0)), 0);

  // ════════════════════════════════════════════════════════════
  // VISTA: Lista de proyectos
  // ════════════════════════════════════════════════════════════
  if (vista === "lista") {
    return (
      <div style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1f2937" }}>Presupuestos</h1>
          <button
            onClick={() => { setFormNuevo({ nombre: "", codigo: "", descripcion: "" }); setError(""); setModalNuevo(true); }}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", fontSize: "13px", cursor: "pointer" }}
          >
            + Nuevo Proyecto
          </button>
        </div>

        {proyectos.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px", color: "#9ca3af", fontSize: "14px" }}>
            No hay proyectos. Crea uno nuevo para comenzar.
          </div>
        )}

        <div style={{ display: "grid", gap: "12px" }}>
          {proyectos.map(p => (
            <div key={p.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: "600", fontSize: "15px", color: "#111827" }}>{p.nombre}</div>
                {p.codigo && <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>Código: {p.codigo}</div>}
                {p.descripcion && <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{p.descripcion}</div>}
                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                  {p.estado === "activo"
                    ? <span style={{ color: "#16a34a" }}>● Activo</span>
                    : <span style={{ color: "#9ca3af" }}>● Archivado</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => cargarNodos(p)}
                  style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", cursor: "pointer" }}
                >
                  Abrir
                </button>
                <button
                  onClick={() => eliminarProyecto(p.id)}
                  style={{ background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", cursor: "pointer" }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal nuevo proyecto */}
        {modalNuevo && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
            <div style={{ background: "#fff", borderRadius: "10px", padding: "24px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>
              <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Nuevo Proyecto</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
                <div>
                  <label style={{ color: "#374151", display: "block", marginBottom: "4px" }}>Nombre *</label>
                  <input value={formNuevo.nombre} onChange={e => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
                    style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", width: "100%", boxSizing: "border-box" }}
                    placeholder="Ej: Edificio Residencial Norte" />
                </div>
                <div>
                  <label style={{ color: "#374151", display: "block", marginBottom: "4px" }}>Código</label>
                  <input value={formNuevo.codigo} onChange={e => setFormNuevo({ ...formNuevo, codigo: e.target.value })}
                    style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", width: "100%", boxSizing: "border-box" }}
                    placeholder="Ej: PPTO-2026-001" />
                </div>
                <div>
                  <label style={{ color: "#374151", display: "block", marginBottom: "4px" }}>Descripción</label>
                  <textarea value={formNuevo.descripcion} onChange={e => setFormNuevo({ ...formNuevo, descripcion: e.target.value })}
                    style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", width: "100%", boxSizing: "border-box" }}
                    rows={2} />
                </div>
              </div>
              {error && <p style={{ color: "#dc2626", fontSize: "12px", marginTop: "8px" }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                <button onClick={() => setModalNuevo(false)}
                  style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", cursor: "pointer", background: "#fff" }}>
                  Cancelar
                </button>
                <button onClick={crearProyecto}
                  style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", cursor: "pointer" }}>
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // VISTA: Detalle del proyecto (árbol jerárquico)
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)" }}>

      {/* ── Barra superior ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "10px 20px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <button onClick={() => setVista("lista")}
          style={{ background: "none", border: "none", color: "#2563eb", fontSize: "13px", cursor: "pointer", padding: 0 }}>
          ← Proyectos
        </button>
        <span style={{ color: "#d1d5db" }}>|</span>
        <span style={{ fontWeight: "600", fontSize: "14px", color: "#111827" }}>{proyectoActual?.nombre}</span>
        {proyectoActual?.codigo && <span style={{ fontSize: "12px", color: "#6b7280" }}>({proyectoActual.codigo})</span>}

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          {msgExito && <span style={{ fontSize: "12px", color: "#16a34a", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "4px", padding: "3px 10px" }}>{msgExito}</span>}
          {nodosPlanos.length === 0 && (
            <button onClick={() => { setArchivoImport(null); setError(""); setModalImportar(true); }}
              style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", cursor: "pointer" }}>
              ↑ Importar Excel
            </button>
          )}
        </div>
      </div>

      {/* ── Estadísticas ── */}
      {nodosPlanos.length > 0 && (
        <div style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb", padding: "8px 20px", display: "flex", gap: "20px", fontSize: "12px", color: "#6b7280", flexShrink: 0 }}>
          <span>Total rubros: <strong style={{ color: "#111827" }}>{totalRubros}</strong></span>
          <span style={{ color: "#16a34a" }}>✓ Vinculados: <strong>{vinculados}</strong></span>
          <span style={{ color: "#ca8a04" }}>⏳ Pendientes: <strong>{pendientes}</strong></span>
          <span style={{ color: "#dc2626" }}>✗ Sin APU: <strong>{sinApu}</strong></span>
          <span style={{ marginLeft: "auto", color: "#111827", fontWeight: "600" }}>Total Ref: {formatoMoneda(totalRef)}</span>
        </div>
      )}

      {/* ── Cuerpo: sidebar + tabla ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar árbol */}
        <div style={{ width: "280px", borderRight: "1px solid #e5e7eb", overflowY: "auto", background: "#f9fafb", flexShrink: 0 }}>
          {nodosPlanos.length === 0 ? (
            <div style={{ padding: "24px 16px", color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
              Sin datos.<br />Importa un Excel para comenzar.
            </div>
          ) : (
            nodosPlanos
              .filter(n => n.tipo !== "RUBRO")
              .map(n => {
                const cfg = COLORES_TIPO[n.tipo] || COLORES_TIPO.GRUPO;
                const tieneHijos = nodosPlanos.some(h => h.padre_id === n.id);
                const colapsado = colapsados[n.id];
                const seleccionado = nodoSidebar?.id === n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => setNodoSidebar(seleccionado ? null : n)}
                    style={{
                      paddingLeft: `${cfg.indent + 12}px`,
                      paddingRight: "8px",
                      paddingTop: "5px",
                      paddingBottom: "5px",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      background: seleccionado ? "#dbeafe" : "transparent",
                      borderLeft: seleccionado ? "3px solid #2563eb" : "3px solid transparent",
                      color: "#1f2937",
                    }}
                  >
                    {tieneHijos && (
                      <span
                        onClick={e => { e.stopPropagation(); toggleColapsar(n.id); }}
                        style={{ fontSize: "10px", color: "#6b7280", userSelect: "none", minWidth: "12px" }}
                      >
                        {colapsado ? "▶" : "▼"}
                      </span>
                    )}
                    {!tieneHijos && <span style={{ minWidth: "12px" }} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={n.descripcion}>
                      {n.descripcion}
                    </span>
                  </div>
                );
              })
          )}
        </div>

        {/* Tabla de nodos */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {nodosPlanos.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "#9ca3af" }}>
              <div style={{ fontSize: "40px" }}>📄</div>
              <div style={{ fontSize: "14px" }}>Este proyecto no tiene datos aún.</div>
              <button
                onClick={() => { setArchivoImport(null); setError(""); setModalImportar(true); }}
                style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 20px", fontSize: "13px", cursor: "pointer" }}
              >
                ↑ Importar Excel
              </button>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f3f4f6", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", color: "#374151", fontWeight: "600" }}>Descripción</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#374151", fontWeight: "600", width: "60px" }}>Und.</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #e5e7eb", color: "#374151", fontWeight: "600", width: "90px" }}>Metrado</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #e5e7eb", color: "#374151", fontWeight: "600", width: "90px" }}>P.U. Ref</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #e5e7eb", color: "#374151", fontWeight: "600", width: "100px" }}>P. Total</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#374151", fontWeight: "600", width: "90px" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {nodosVisibles.map(n => {
                  const cfg = COLORES_TIPO[n.tipo] || COLORES_TIPO.RUBRO;
                  const esRubro = n.tipo === "RUBRO";
                  const badge = esRubro ? BADGE_RUBRO[n.tipo_rubro] || BADGE_RUBRO.PENDIENTE : null;
                  const total = esRubro ? (n.metrado || 0) * (n.precio_unitario_ref || 0) : null;
                  const tieneHijos = !esRubro && nodosPlanos.some(h => h.padre_id === n.id);

                  return (
                    <tr
                      key={n.id}
                      style={{
                        background: esRubro ? "#fff" : cfg.bg,
                        borderBottom: "1px solid #e5e7eb",
                        cursor: tieneHijos ? "pointer" : "default",
                      }}
                      onClick={() => tieneHijos && toggleColapsar(n.id)}
                    >
                      <td style={{ padding: "6px 12px", paddingLeft: `${cfg.indent + 12}px` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {tieneHijos && (
                            <span style={{ fontSize: "10px", color: esRubro ? "#6b7280" : cfg.text, opacity: 0.7 }}>
                              {colapsados[n.id] ? "▶" : "▼"}
                            </span>
                          )}
                          <span style={{
                            color: esRubro ? "#111827" : cfg.text,
                            fontWeight: esRubro ? "400" : "600",
                            fontSize: esRubro ? "12px" : "11px",
                          }}>
                            {n.descripcion}
                          </span>
                          {n.observaciones === "SIN_APU" && (
                            <span style={{ fontSize: "10px", background: "#fee2e2", color: "#991b1b", borderRadius: "3px", padding: "1px 5px" }}>SIN APU</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "center", color: esRubro ? "#374151" : cfg.text }}>
                        {n.unidad || ""}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: esRubro ? "#374151" : cfg.text }}>
                        {esRubro && n.metrado !== null ? Number(n.metrado).toLocaleString("es-EC", { maximumFractionDigits: 2 }) : ""}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: esRubro ? "#374151" : cfg.text }}>
                        {esRubro ? formatoMoneda(n.precio_unitario_ref) : ""}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: esRubro ? "#111827" : cfg.text, fontWeight: esRubro ? "500" : "400" }}>
                        {esRubro ? formatoMoneda(total) : ""}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "center" }}>
                        {badge && (
                          <span style={{ background: badge.bg, color: badge.text, borderRadius: "4px", padding: "2px 7px", fontSize: "10px", fontWeight: "600" }}>
                            {badge.label}
                          </span>
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

      {/* ── Modal importar Excel ── */}
      {modalImportar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: "10px", padding: "24px", width: "100%", maxWidth: "400px", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Importar Excel</h2>
            <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "16px" }}>
              Selecciona el archivo <strong>.xlsx</strong> del presupuesto. Se leerá la hoja indicada.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
              <div>
                <label style={{ color: "#374151", display: "block", marginBottom: "4px" }}>Archivo Excel *</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  onChange={e => setArchivoImport(e.target.files[0])}
                  style={{ fontSize: "12px", width: "100%" }}
                />
              </div>
              <div>
                <label style={{ color: "#374151", display: "block", marginBottom: "4px" }}>Hoja a importar</label>
                <select value={hojaImport} onChange={e => setHojaImport(e.target.value)}
                  style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", width: "100%", fontSize: "13px" }}>
                  <option value="PPTO META">PPTO META</option>
                  <option value="PPTO CONTRACTUAL">PPTO CONTRACTUAL</option>
                </select>
              </div>
            </div>
            {error && <p style={{ color: "#dc2626", fontSize: "12px", marginTop: "8px" }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button onClick={() => { setModalImportar(false); setError(""); }}
                style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", cursor: "pointer", background: "#fff" }}>
                Cancelar
              </button>
              <button onClick={importarExcel} disabled={importando}
                style={{ background: importando ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", cursor: importando ? "not-allowed" : "pointer" }}>
                {importando ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}