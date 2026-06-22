import { useEffect, useMemo, useState } from "react";
import { ActionButton, ErrorBanner, ModalShell } from "../../../components/ui";
import { API, statusMeta, vincFilters } from "../data";
import { descendantsOf, visibleContainers } from "../logic/tree";
import PanelApu from "../components/PanelApu";
import PresupuestoTree from "../components/PresupuestoTree";

function normalizarUnidad(unidad) {
  const value = String(unidad || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("m²", "m2")
    .replace("m³", "m3");
  const aliases = {
    u: "u",
    und: "u",
    unidad: "u",
    unidades: "u",
    m: "m",
    ml: "m",
    m2: "m2",
    m3: "m3",
    kg: "kg",
  };
  return aliases[value] || value;
}

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function validarVinculacion(row, apu) {
  const unidadRubro = normalizarUnidad(row?.unidad);
  const unidadApu = normalizarUnidad(apu?.unidad);
  if (!unidadRubro) return { ok: false, mensaje: "No se puede vincular: el rubro no tiene unidad definida." };
  if (!unidadApu) return { ok: false, mensaje: "No se puede vincular: el APU no tiene unidad definida." };
  if (unidadRubro !== unidadApu) {
    return { ok: false, mensaje: `Unidad del rubro ${unidadRubro} y unidad del APU ${unidadApu} no coinciden.` };
  }
  return { ok: true };
}

export default function VinculacionView({
  rows = [],
  apus = [],
  costsByApu = {},
  onDataChange,
  selectedTreeId,
  setSelectedTreeId,
  selectedRowId,
  setSelectedRowId,
  onVisibleCountChange,
}) {
  const [vincFilter, setVincFilter] = useState("pendiente");
  const [collapsedTreeIds, setCollapsedTreeIds] = useState(new Set());
  const [modalVincularOpen, setModalVincularOpen] = useState(false);
  const [apuSearch, setApuSearch] = useState("");
  const [apuSeleccionado, setApuSeleccionado] = useState(null);
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");

  const visibleRows = useMemo(() => {
    const scopedIds = descendantsOf(rows, selectedTreeId);
    const scopedRows = rows.filter((row) => scopedIds.has(row.id));
    if (vincFilter === "todos") return scopedRows;
    return scopedRows.filter((row) => row.kind === "container" || row.estado === vincFilter);
  }, [rows, selectedTreeId, vincFilter]);

  const treeRows = useMemo(() => visibleContainers(rows, collapsedTreeIds), [collapsedTreeIds, rows]);
  const selectedRow = rows.find((row) => row.id === selectedRowId);
  const canUseSelectedLine = selectedRow?.kind === "line";
  const canCreateApu = canUseSelectedLine && !selectedRow.apu && Boolean(selectedRow.unidad);

  const apusFiltrados = useMemo(() => {
    const query = apuSearch.trim().toLowerCase();
    if (!query) return [];
    return apus
      .filter((apu) => apu.estado !== "inactivo")
      .filter((apu) => {
        const text = `${apu.codigo || ""} ${apu.nombre || ""} ${apu.unidad || ""}`.toLowerCase();
        return text.includes(query);
      })
      .slice(0, 80);
  }, [apuSearch, apus]);

  const apusClasificados = useMemo(() => {
    const resultado = { compatibles: [], incompatibles: [] };
    apusFiltrados.forEach((apu) => {
      const validacion = validarVinculacion(selectedRow, apu);
      const item = { apu, mensaje: validacion.mensaje || "" };
      if (validacion.ok) resultado.compatibles.push(item);
      else resultado.incompatibles.push(item);
    });
    return resultado;
  }, [apusFiltrados, selectedRow]);

  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  useEffect(() => {
    setModalVincularOpen(false);
    setApuSearch("");
    setApuSeleccionado(null);
    setActionError("");
    setActionStatus("");
  }, [selectedRowId]);

  const runAction = async (action) => {
    if (!canUseSelectedLine) return;
    setActionStatus("Guardando...");
    setActionError("");
    try {
      await action();
      setActionStatus("Cambios aplicados.");
      setModalVincularOpen(false);
      setApuSearch("");
      setApuSeleccionado(null);
      onDataChange?.();
    } catch (err) {
      setActionStatus("");
      setActionError(err.message || "No se pudo aplicar la accion.");
    }
  };

  const marcarNoAplica = () => runAction(async () => {
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/marcar-sin-apu`, { method: "PATCH" });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo marcar como No aplica.");
    }
  });

  const crearApu = () => runAction(async () => {
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/crear-apu`, { method: "POST" });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo crear el APU.");
    }
  });

  const vincularApu = (apu) => runAction(async () => {
    const validacion = validarVinculacion(selectedRow, apu);
    if (!validacion.ok) throw new Error(validacion.mensaje);
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/vincular-apu`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apu_id: apu.id }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo vincular el APU.");
    }
  });

  const toggleTreeCollapse = (rowId) => {
    setCollapsedTreeIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  return (
    <div className="budget-v2-linking-layout">
      <PresupuestoTree
        rows={treeRows}
        selectedTreeId={selectedTreeId}
        onSelect={setSelectedTreeId}
        collapsedTreeIds={collapsedTreeIds}
        onToggleCollapse={toggleTreeCollapse}
        mode="vinculacion"
      />

      <section className="budget-v2-linking-main">
        <div className="budget-v2-linking-toolbar">
          <div className="budget-v2-filter-group">
            {vincFilters.map(([key, label]) => (
              <button key={key} type="button" className={vincFilter === key ? "budget-v2-filter-active" : ""} onClick={() => setVincFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="budget-v2-toolbar-spacer" />
          <button type="button" disabled={!canUseSelectedLine} onClick={() => setModalVincularOpen(true)}>Vincular APU</button>
          <button type="button" disabled={!canUseSelectedLine || selectedRow.estado === "sin_apu"} onClick={marcarNoAplica}>No aplica</button>
          <button type="button" disabled={!canCreateApu} onClick={crearApu}>Crear APU</button>
        </div>
        {(actionStatus || actionError) && (
          <div className="budget-v2-action-panel">
            {actionStatus && <span className="budget-v2-action-status">{actionStatus}</span>}
            {actionError && <span className="budget-v2-action-error">{actionError}</span>}
          </div>
        )}

        <div className="budget-v2-link-table">
          <div className="budget-v2-link-head">
            <span>Descripcion / estructura</span>
            <span>P.U. Meta</span>
            <span>P.T. Meta</span>
            <span>Estado</span>
          </div>
          <div className="budget-v2-link-body">
            {visibleRows.map((row) => {
              const isContainer = row.kind === "container";
              const selected = selectedRowId === row.id;
              const meta = statusMeta[row.estado] || {};
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`budget-v2-link-row ${isContainer ? "budget-v2-link-container" : ""} ${selected ? "budget-v2-link-selected" : ""}`}
                  onClick={() => setSelectedRowId(row.id)}
                >
                  <span>
                    <strong>{row.descripcion}</strong>
                    <small>{isContainer ? "" : `${row.unidad} | ${row.metrado} | P.U. meta ${row.puMeta || "-"}`}</small>
                  </span>
                  <span>{isContainer ? "" : (row.puMeta || "-")}</span>
                  <span>{row.ptMeta || "-"}</span>
                  <span>{!isContainer && <em className={meta.className}>{meta.label}</em>}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <PanelApu selectedRow={selectedRow} />

      {modalVincularOpen && (
        <ModalShell
          title="Vincular APU"
          size="lg"
          onClose={() => {
            setModalVincularOpen(false);
            setApuSearch("");
            setApuSeleccionado(null);
            setActionError("");
          }}
          footer={
            <>
              <ActionButton onClick={() => {
                setModalVincularOpen(false);
                setApuSearch("");
                setApuSeleccionado(null);
                setActionError("");
              }}>
                Cancelar
              </ActionButton>
              <ActionButton variant="primary" onClick={() => apuSeleccionado && vincularApu(apuSeleccionado)} disabled={!apuSeleccionado}>
                Confirmar vinculo
              </ActionButton>
            </>
          }
        >
          <div className="budget-v2-link-modal">
            <aside className="budget-v2-link-modal-side">
              <div>
                <div className="budget-v2-link-modal-kicker">Rubro seleccionado</div>
                <div className="budget-v2-link-modal-title">{selectedRow?.descripcion}</div>
                <div className="budget-v2-link-modal-tags">
                  <span>1 rubro</span>
                  <span>Und: {normalizarUnidad(selectedRow?.unidad) || "sin unidad"}</span>
                </div>
              </div>
              <div className="budget-v2-link-modal-metrics">
                <div>
                  <span>P.U. ref</span>
                  <strong>{fmtMoney(selectedRow?.raw?.puRef)}</strong>
                </div>
                <div>
                  <span>Metrado</span>
                  <strong>{selectedRow?.metrado || "-"}</strong>
                </div>
              </div>
              {apuSeleccionado && (
                <div className="budget-v2-link-modal-ready">
                  <span>APU listo para confirmar</span>
                  <strong>{apuSeleccionado.nombre}</strong>
                  <small>
                    {apuSeleccionado.codigo || "-"} | Und {apuSeleccionado.unidad || "-"} | {fmtMoney(costsByApu[apuSeleccionado.id]?.precio_unitario)}
                  </small>
                </div>
              )}
              <ActionButton variant="ghost" onClick={crearApu} disabled={!canCreateApu}>
                Crear APU desde rubro
              </ActionButton>
            </aside>

            <section className="budget-v2-link-modal-main">
              <input
                type="text"
                placeholder="Buscar APU por nombre, codigo o categoria..."
                value={apuSearch}
                onChange={(event) => {
                  setApuSearch(event.target.value);
                  setApuSeleccionado(null);
                  setActionError("");
                }}
                className="budget-v2-link-modal-search"
              />
              <div className="budget-v2-link-modal-summary">
                <span>{apuSearch.trim() ? `${apusFiltrados.length} coincidencia(s) no inactivas` : "Escribe para buscar APUs"}</span>
                {apuSearch.trim() && <span className="budget-v2-compatible-count">{apusClasificados.compatibles.length} compatibles</span>}
                {apuSearch.trim() && <span className="budget-v2-incompatible-count">{apusClasificados.incompatibles.length} incompatibles</span>}
              </div>

              <div className="budget-v2-link-modal-results">
                {apuSearch.trim() && apusFiltrados.length === 0 && (
                  <div className="budget-v2-link-modal-empty">No hay APUs coincidentes no inactivos.</div>
                )}

                {apusClasificados.compatibles.length > 0 && (
                  <div className="budget-v2-apu-result-section budget-v2-apu-result-compatible">
                    <div className="budget-v2-apu-result-title">APUs compatibles primero</div>
                    <table>
                      <thead>
                        <tr>
                          <th>APU</th>
                          <th>Unidad</th>
                          <th>P.U. Calc.</th>
                          <th>Estado</th>
                          <th>Seleccion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apusClasificados.compatibles.map(({ apu }) => (
                          <tr key={apu.id} className={apuSeleccionado?.id === apu.id ? "budget-v2-apu-row-selected" : ""}>
                            <td>
                              <strong>{apu.nombre}</strong>
                              <small>{apu.codigo || "-"}</small>
                            </td>
                            <td>{apu.unidad || "-"}</td>
                            <td>{fmtMoney(costsByApu[apu.id]?.precio_unitario)}</td>
                            <td>{apu.estado}</td>
                            <td>
                              <button type="button" onClick={() => {
                                setApuSeleccionado(apu);
                                setActionError("");
                              }}>
                                {apuSeleccionado?.id === apu.id ? "Seleccionado" : "Seleccionar"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {apusClasificados.incompatibles.length > 0 && (
                  <div className="budget-v2-apu-result-section budget-v2-apu-result-incompatible">
                    <div className="budget-v2-apu-result-title">APUs incompatibles visibles</div>
                    <table>
                      <thead>
                        <tr>
                          <th>APU</th>
                          <th>Unidad</th>
                          <th>P.U. Calc.</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apusClasificados.incompatibles.map(({ apu, mensaje }) => (
                          <tr key={apu.id}>
                            <td>
                              <strong>{apu.nombre}</strong>
                              <small>{apu.codigo || "-"}</small>
                            </td>
                            <td>{apu.unidad || "-"}</td>
                            <td>{fmtMoney(costsByApu[apu.id]?.precio_unitario)}</td>
                            <td>{mensaje}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <ErrorBanner>{actionError}</ErrorBanner>
            </section>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
