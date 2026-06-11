import { useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

const SECCIONES = [
  { key: "equipo",       label: "Equipos",      usaRendimiento: true,  labelB: "Tarifa", tooltipB: "B: tarifa o costo horario del equipo" },
  { key: "mano_de_obra", label: "Mano de Obra", usaRendimiento: true,  labelB: "Tarifa", tooltipB: "B: salario por hora" },
  { key: "material",     label: "Materiales",   usaRendimiento: false, labelB: "P.U.",   tooltipB: "B: precio unitario del material" },
  { key: "transporte",   label: "Transporte",   usaRendimiento: false, labelB: "P.U.",   tooltipB: "B: tarifa de transporte" },
];

const estadoBadge = (estado) => {
  const estilos = {
    activo:      { background: "#dcfce7", color: "#166534" },
    en_revision: { background: "#fef9c3", color: "#854d0e" },
    inactivo:    { background: "#f3f4f6", color: "#6b7280" },
  };
  const s = estilos[estado] || estilos.inactivo;
  return (
    <span style={{ ...s, padding: "2px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600 }}>
      {estado}
    </span>
  );
};

// Ícono con tooltip al pasar el cursor por encima
const InfoIcon = ({ tooltip }) => (
  <span
    title={tooltip}
    style={{
      display: "inline-block",
      marginLeft: "4px",
      color: "#9ca3af",
      fontSize: "0.75rem",
      cursor: "help",
      verticalAlign: "1px",
    }}
  >
    ⓘ
  </span>
);

export default function ApuDetalle({ apu: apuInicial, onVolver }) {
  const [apu, setApu]                       = useState(apuInicial);
  const [rendimientoEdit, setRendimientoEdit] = useState(apuInicial.rendimiento);
  const [items, setItems]                   = useState([]);
  const [recursos, setRecursos]             = useState([]);
  const [agregando, setAgregando]           = useState(null);
  const [formItem, setFormItem]             = useState({ recurso_id: "", cantidad: 1.0 });
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [cantidadEdit, setCantidadEdit]     = useState("");
  const [error, setError]                   = useState("");
  const [cargando, setCargando]             = useState(true);
  const [seccionesContraidas, setSeccionesContraidas] = useState(new Set());

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      const [resApu, resRec] = await Promise.all([
        fetch(`${API}/apus/${apu.id}`),
        fetch(`${API}/recursos/?limit=500&estado=activo`)
      ]);
      const dataApu = await resApu.json();
      const dataRec = await resRec.json();
      setItems(dataApu.items || []);
      setRecursos(dataRec);
      setCargando(false);
    };
    cargar();
  }, [apu.id]);

  // ── Cálculos ──────────────────────────────────────────────────────────────

  const costoItem = (item, r) => {
    const recurso = recursos.find(rc => rc.id === item.recurso_id);
    if (!recurso) return 0;
    const C = item.cantidad * recurso.precio_unitario;
    const usaR = item.categoria === "equipo" || item.categoria === "mano_de_obra";
    return usaR ? C * r : C;
  };

  const R                   = apu.rendimiento;
  const subtotalMO          = items.filter(i => i.categoria === "mano_de_obra").reduce((a, i) => a + costoItem(i, R), 0);
  const herramientasMenores = subtotalMO * 0.05;
  const subtotalEquipos     = items.filter(i => i.categoria === "equipo").reduce((a, i) => a + costoItem(i, R), 0) + herramientasMenores;
  const subtotalMateriales  = items.filter(i => i.categoria === "material").reduce((a, i) => a + costoItem(i, R), 0);
  const subtotalTransporte  = items.filter(i => i.categoria === "transporte").reduce((a, i) => a + costoItem(i, R), 0);
  const totalCostoDirecto   = subtotalEquipos + subtotalMO + subtotalMateriales + subtotalTransporte;

  const subtotalDe = (key) => ({
    equipo: subtotalEquipos,
    mano_de_obra: subtotalMO,
    material: subtotalMateriales,
    transporte: subtotalTransporte
  })[key] || 0;

  // ── Persistencia ──────────────────────────────────────────────────────────

  const guardarItems = async (nuevosItems, rendimientoActual) => {
    const r = rendimientoActual ?? apu.rendimiento;
    await fetch(`${API}/apus/${apu.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: apu.nombre, unidad: apu.unidad, rendimiento: r, estado: apu.estado,
        items: nuevosItems.map((i, idx) => ({
          recurso_id: i.recurso_id, categoria: i.categoria,
          cantidad: i.cantidad, orden: idx, es_herramienta_menor: false,
        }))
      })
    });
  };

  const guardarRendimiento = async () => {
    const nuevoR = parseFloat(rendimientoEdit);
    const valido = !isNaN(nuevoR) && nuevoR > 0;
    const valorFinal = valido ? nuevoR : apu.rendimiento;
    const apuActualizado = { ...apu, rendimiento: valorFinal };
    setApu(apuActualizado);
    setRendimientoEdit(valorFinal);
    await guardarItems(items, valorFinal);
  };

  // ── Agregar ítem ──────────────────────────────────────────────────────────

  const confirmarAgregar = async () => {
    if (!formItem.recurso_id) { setError("Selecciona un recurso."); return; }
    const nuevo = {
      recurso_id: parseInt(formItem.recurso_id),
      cantidad:   parseFloat(formItem.cantidad) || 1.0,
      categoria:  agregando,
      es_herramienta_menor: false,
    };
    const nuevosItems = [...items, nuevo];
    setItems(nuevosItems);
    await guardarItems(nuevosItems);
    setAgregando(null);
    setFormItem({ recurso_id: "", cantidad: 1.0 });
    setError("");
  };

  // ── Editar cantidad inline ────────────────────────────────────────────────

  const iniciarEditCantidad = (globalIdx, cantidadActual) => {
    setEditandoCantidad(globalIdx);
    setCantidadEdit(cantidadActual);
  };

  const confirmarEditCantidad = async (globalIdx) => {
    const nueva = parseFloat(cantidadEdit);
    if (!nueva || nueva <= 0) { setEditandoCantidad(null); return; }
    const nuevosItems = items.map((i, idx) =>
      idx === globalIdx ? { ...i, cantidad: nueva } : i
    );
    setItems(nuevosItems);
    setEditandoCantidad(null);
    await guardarItems(nuevosItems);
  };

  // ── Eliminar ítem ─────────────────────────────────────────────────────────

  const eliminarItem = async (globalIdx) => {
    if (!confirm("¿Eliminar este ítem?")) return;
    const nuevosItems = items.filter((_, i) => i !== globalIdx);
    setItems(nuevosItems);
    await guardarItems(nuevosItems);
  };

  // ── Contraer / expandir sección ───────────────────────────────────────────

  const toggleSeccion = (key) => {
    setSeccionesContraidas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmt  = (n) => (n || 0).toFixed(4);
  const fmt2 = (n) => (n || 0).toFixed(2);
  const recursosDe = (key) => recursos.filter(r => r.categoria === key);

  if (cargando) return (
    <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>
      Cargando...
    </div>
  );

  // ── Estilos ───────────────────────────────────────────────────────────────

  const card   = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
  const thBase = { padding: "8px 10px", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" };
  const thL    = { ...thBase, textAlign: "left" };
  const thR    = { ...thBase, textAlign: "right" };
  const tdBase = { padding: "9px 10px", fontSize: "0.85rem", borderBottom: "1px solid #f3f4f6", color: "#374151" };
  const tdL    = { ...tdBase, textAlign: "left" };
  const tdR    = { ...tdBase, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ padding: "24px 32px", maxWidth: "1100px", margin: "0 auto" }}>

      <button onClick={onVolver}
        style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: "0.875rem", padding: 0, marginBottom: "16px" }}>
        ← Volver a APUs
      </button>

      {/* Cabecera del APU */}
      <div style={{ ...card, padding: "20px 28px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827", margin: 0 }}>{apu.nombre}</h1>
          {estadoBadge(apu.estado)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "40px" }}>
          {[["Código", apu.codigo || "—"], ["Unidad", apu.unidad], ["Categoría", apu.categoria || "—"]].map(([lbl, val]) => (
            <div key={lbl}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "4px" }}>{lbl}</div>
              <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "0.95rem" }}>{val}</div>
            </div>
          ))}
          <div>
            <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "4px" }}>Rendimiento</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input type="number" step="0.01" min="0"
                value={rendimientoEdit}
                onChange={e => setRendimientoEdit(e.target.value)}
                onBlur={guardarRendimiento}
                style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "3px 8px", width: "80px", fontSize: "0.95rem", fontWeight: 600, color: "#1f2937", outline: "none" }}
              />
              <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>h/{apu.unidad}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Secciones */}
      {SECCIONES.map(({ key, label, usaRendimiento, labelB, tooltipB }) => {
        const itemsSeccion = items.filter(i => i.categoria === key);
        const contraida = seccionesContraidas.has(key);

        return (
          <div key={key} style={{ ...card, marginBottom: "16px", overflow: "hidden" }}>

            {/* Header sección — clickeable para contraer/expandir */}
            <div
              onClick={() => toggleSeccion(key)}
              style={{
                background: "#eff6ff",
                borderLeft: "4px solid #3b82f6",
                padding: "10px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
              }}>
              <h2 style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.7rem", display: "inline-block", width: "12px" }}>
                  {contraida ? "▶" : "▼"}
                </span>
                {label}
              </h2>
              <span style={{ fontSize: "0.85rem", color: "#1e40af" }}>
                Subtotal: <strong>${fmt2(subtotalDe(key))}</strong>
              </span>
            </div>

            {/* Tabla (oculta si está contraída) */}
            {!contraida && (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "36%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "7%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thL}>Descripción</th>
                    <th style={{ ...thR, cursor: "help" }} title="A: cantidad">Cant.<InfoIcon tooltip="A: cantidad" /></th>
                    <th style={{ ...thR, cursor: "help" }} title={tooltipB}>{labelB}<InfoIcon tooltip={tooltipB} /></th>
                    {usaRendimiento ? (
                      <>
                        <th style={{ ...thR, cursor: "help" }} title="C = A × B (costo unitario)">Costo<InfoIcon tooltip="C = A × B" /></th>
                        <th style={{ ...thR, cursor: "help" }} title="R: rendimiento (h por unidad)">Rend.<InfoIcon tooltip="R: rendimiento" /></th>
                        <th style={{ ...thR, cursor: "help" }} title="D = C × R (total del ítem)">Total<InfoIcon tooltip="D = C × R" /></th>
                      </>
                    ) : (
                      <>
                        <th style={{ ...thBase, textAlign: "center", color: "#d1d5db" }}>—</th>
                        <th style={{ ...thBase, textAlign: "center", color: "#d1d5db" }}>—</th>
                        <th style={{ ...thR, cursor: "help" }} title="Total = A × B">Total<InfoIcon tooltip="Total = A × B" /></th>
                      </>
                    )}
                    <th style={thBase}></th>
                  </tr>
                </thead>
                <tbody>

                  {/* Herramientas Menores — fila fija primera en Equipos, no editable */}
                  {key === "equipo" && (
                    <tr style={{ background: "#fffbeb" }}>
                      <td style={{ ...tdL, fontStyle: "italic", color: "#92400e", fontSize: "0.82rem" }}>Herramientas Menores 5% MO</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, fontWeight: 600, color: "#92400e" }}>{fmt(herramientasMenores)}</td>
                      <td></td>
                    </tr>
                  )}

                  {/* Sin ítems */}
                  {itemsSeccion.length === 0 && key !== "equipo" && (
                    <tr>
                      <td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#d1d5db", fontSize: "0.85rem" }}>
                        Sin ítems
                      </td>
                    </tr>
                  )}

                  {/* Ítems de la sección */}
                  {itemsSeccion.map((item) => {
                    const recurso   = recursos.find(r => r.id === item.recurso_id);
                    const globalIdx = items.indexOf(item);
                    const C = recurso ? item.cantidad * recurso.precio_unitario : 0;
                    const D = usaRendimiento ? C * apu.rendimiento : C;
                    return (
                      <tr key={globalIdx}
                        onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>

                        {/* Descripción + unidad entre paréntesis */}
                        <td style={{ ...tdL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {recurso?.descripcion || "—"}
                          {recurso?.unidad && <span style={{ color: "#9ca3af", marginLeft: "4px" }}>({recurso.unidad})</span>}
                        </td>

                        {/* Cantidad — editable inline */}
                        <td style={tdR}>
                          {editandoCantidad === globalIdx ? (
                            <input
                              type="number" step="0.01" min="0"
                              value={cantidadEdit}
                              autoFocus
                              onChange={e => setCantidadEdit(e.target.value)}
                              onBlur={() => confirmarEditCantidad(globalIdx)}
                              onKeyDown={e => { if (e.key === "Enter") confirmarEditCantidad(globalIdx); if (e.key === "Escape") setEditandoCantidad(null); }}
                              style={{ border: "1px solid #93c5fd", borderRadius: "4px", padding: "2px 6px", width: "70px", textAlign: "right", fontSize: "0.85rem", outline: "none" }}
                            />
                          ) : (
                            <span
                              onClick={() => iniciarEditCantidad(globalIdx, item.cantidad)}
                              style={{ cursor: "pointer", borderBottom: "1px dashed #93c5fd", paddingBottom: "1px" }}
                              title="Clic para editar">
                              {fmt(item.cantidad)}
                            </span>
                          )}
                        </td>

                        {/* Tarifa / P.U. */}
                        <td style={tdR}>{recurso ? fmt(recurso.precio_unitario) : "—"}</td>

                        {/* Costo, Rend., Total (Eq/MO) — o vacío + vacío + Total (Mat/Tr) */}
                        {usaRendimiento ? (
                          <>
                            <td style={tdR}>{fmt(C)}</td>
                            <td style={tdR}>{apu.rendimiento}</td>
                            <td style={{ ...tdR, fontWeight: 600, color: "#111827" }}>{fmt(D)}</td>
                          </>
                        ) : (
                          <>
                            <td></td>
                            <td></td>
                            <td style={{ ...tdR, fontWeight: 600, color: "#111827" }}>{fmt(D)}</td>
                          </>
                        )}

                        {/* Eliminar */}
                        <td style={{ ...tdR, padding: "9px 6px" }}>
                          <button onClick={() => eliminarItem(globalIdx)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: "1rem" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                            onMouseLeave={e => e.currentTarget.style.color = "#d1d5db"}>✕</button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Fila para agregar nuevo ítem */}
                  {agregando === key ? (
                    <tr style={{ background: "#eff6ff" }}>
                      <td style={{ padding: "10px 14px" }} colSpan={2}>
                        <select
                          value={formItem.recurso_id}
                          onChange={e => { setFormItem({ ...formItem, recurso_id: e.target.value }); setError(""); }}
                          style={{ border: "1px solid #93c5fd", borderRadius: "6px", padding: "6px 10px", fontSize: "0.85rem", width: "100%", outline: "none" }}>
                          <option value="">— Seleccionar recurso —</option>
                          {recursosDe(key).map(r => (
                            <option key={r.id} value={r.id}>{r.descripcion} — {r.unidad}</option>
                          ))}
                        </select>
                        {error && <div style={{ color: "#ef4444", fontSize: "0.75rem", marginTop: "4px" }}>{error}</div>}
                      </td>
                      <td style={{ padding: "10px 14px" }} colSpan={2}>
                        <input type="number" step="0.01" min="0"
                          value={formItem.cantidad}
                          onChange={e => setFormItem({ ...formItem, cantidad: e.target.value })}
                          placeholder="Cantidad"
                          style={{ border: "1px solid #93c5fd", borderRadius: "6px", padding: "6px 10px", fontSize: "0.85rem", width: "100%", outline: "none" }} />
                      </td>
                      <td colSpan={3} style={{ padding: "10px 14px" }}>
                        <button onClick={confirmarAgregar}
                          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 16px", fontSize: "0.85rem", cursor: "pointer", marginRight: "8px" }}>
                          Agregar
                        </button>
                        <button onClick={() => { setAgregando(null); setError(""); }}
                          style={{ background: "none", border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 12px", fontSize: "0.85rem", cursor: "pointer", color: "#6b7280" }}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: "8px 14px" }}>
                        <button onClick={() => { setFormItem({ recurso_id: "", cantidad: 1.0 }); setError(""); setAgregando(key); }}
                          style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500, padding: 0 }}>
                          + Agregar recurso
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* Totales */}
      <div style={{ ...card, padding: "20px 28px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Subtotal Equipos",      subtotalEquipos],
              ["Subtotal Mano de Obra", subtotalMO],
              ["Subtotal Materiales",   subtotalMateriales],
              ["Subtotal Transporte",   subtotalTransporte],
            ].map(([lbl, val]) => (
              <tr key={lbl}>
                <td style={{ padding: "6px 0", color: "#6b7280", fontSize: "0.875rem" }}>{lbl}</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 500, color: "#374151", width: "140px" }}>${fmt2(val)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #e5e7eb" }}>
              <td style={{ padding: "12px 0 0", fontWeight: 700, color: "#111827", fontSize: "1rem" }}>Total Costo Directo</td>
              <td style={{ padding: "12px 0 0", textAlign: "right", fontWeight: 700, color: "#1d4ed8", fontSize: "1.2rem" }}>${fmt2(totalCostoDirecto)}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}