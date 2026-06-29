import { useEffect, useMemo, useState } from "react";
import { ActionButton, ErrorBanner, ModalShell } from "../../../components/ui";
import ApuDetalle from "../../../pages/ApuDetalle";
import { API, statusMeta, vincFilters } from "../data";
import { descendantsOf, visibleContainers } from "../logic/tree";
import PanelApu from "../components/PanelApu";
import PresupuestoTree from "../components/PresupuestoTree";
import CollapsibleSidePanel from "../components/CollapsibleSidePanel";

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

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizar(texto) {
  return normalizarTexto(texto)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function apuSearchText(apu) {
  return normalizarTexto(`${apu?.codigo || ""} ${apu?.nombre || ""} ${apu?.categoria || ""} ${apu?.subcategoria || ""} ${apu?.unidad || ""}`);
}

function apuSuggestionScore(row, apu, query) {
  const text = apuSearchText(apu);
  const rubroTokens = tokenizar(row?.descripcion);
  const queryTokens = tokenizar(query);
  const tokens = queryTokens.length ? queryTokens : rubroTokens;
  let score = 0;

  tokens.forEach((token) => {
    if (text.includes(token)) score += queryTokens.length ? 6 : 4;
    if (normalizarTexto(apu?.nombre).includes(token)) score += queryTokens.length ? 4 : 3;
  });

  if (normalizarUnidad(row?.unidad) && normalizarUnidad(row?.unidad) === normalizarUnidad(apu?.unidad)) score += 10;
  if (normalizarTexto(apu?.nombre) === normalizarTexto(row?.descripcion)) score += 20;
  return score;
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
  const [modalCrearOpen, setModalCrearOpen] = useState(false);
  const [modalEditarApuOpen, setModalEditarApuOpen] = useState(false);
  const [apuSearch, setApuSearch] = useState("");
  const [apuSeleccionado, setApuSeleccionado] = useState(null);
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [showTree, setShowTree] = useState(true);
  const [showApuPanel, setShowApuPanel] = useState(true);

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

  const apusSugeridos = useMemo(() => {
    const query = apuSearch.trim();
    const queryTokens = tokenizar(query);
    return apus
      .filter((apu) => apu.estado !== "inactivo")
      .filter((apu) => {
        if (!queryTokens.length) return true;
        const text = apuSearchText(apu);
        return queryTokens.every((token) => text.includes(token));
      })
      .map((apu) => ({ apu, score: apuSuggestionScore(selectedRow, apu, query) }))
      .filter(({ score }) => queryTokens.length || score > 0)
      .sort((a, b) => b.score - a.score || String(a.apu.nombre || "").localeCompare(String(b.apu.nombre || "")))
      .slice(0, 80);
  }, [apuSearch, apus, selectedRow]);

  const apusClasificados = useMemo(() => {
    const resultado = { compatibles: [], incompatibles: [] };
    apusSugeridos.forEach(({ apu, score }) => {
      const validacion = validarVinculacion(selectedRow, apu);
      const item = { apu, score, mensaje: validacion.mensaje || "" };
      if (validacion.ok) resultado.compatibles.push(item);
      else resultado.incompatibles.push(item);
    });
    resultado.compatibles.sort((a, b) => b.score - a.score || String(a.apu.nombre || "").localeCompare(String(b.apu.nombre || "")));
    resultado.incompatibles.sort((a, b) => b.score - a.score || String(a.apu.nombre || "").localeCompare(String(b.apu.nombre || "")));
    return resultado;
  }, [apusSugeridos, selectedRow]);

  const apusParecidosCrear = useMemo(() => {
    return [...apusClasificados.compatibles, ...apusClasificados.incompatibles].slice(0, 8);
  }, [apusClasificados]);

  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  useEffect(() => {
    setModalVincularOpen(false);
    setModalCrearOpen(false);
    setModalEditarApuOpen(false);
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
      setModalCrearOpen(false);
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
      throw new Error(detail?.detail || "No se pudo marcar como subcontratado.");
    }
  });

  const crearApu = (baseApu = null) => runAction(async () => {
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/crear-apu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseApu ? { base_apu_id: baseApu.id } : {}),
    });
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

  const desvincularApu = () => runAction(async () => {
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/desvincular-apu`, { method: "PATCH" });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo desvincular el APU.");
    }
  });

  const cambiarApu = () => {
    if (!canUseSelectedLine) return;
    setApuSearch("");
    setApuSeleccionado(null);
    setActionError("");
    setModalVincularOpen(true);
  };

  const editarApu = () => {
    if (!selectedRow?.raw?.node?.apu_id) return;
    setActionError("");
    setModalEditarApuOpen(true);
  };

  const cerrarEditorApu = async ({ refresh = true } = {}) => {
    setModalEditarApuOpen(false);
    if (refresh) {
      setActionStatus("APU actualizado.");
      onDataChange?.();
    }
  };

  const toggleTreeCollapse = (rowId) => {
    setCollapsedTreeIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  return (
    <div className={`budget-v2-linking-layout ${!showTree ? "budget-v2-left-collapsed" : ""} ${!showApuPanel ? "budget-v2-right-collapsed" : ""}`}>
      <CollapsibleSidePanel side="left" label="EDT" open={showTree} onToggle={() => setShowTree(value => !value)}>
        <PresupuestoTree
          rows={treeRows}
          selectedTreeId={selectedTreeId}
          onSelect={setSelectedTreeId}
          collapsedTreeIds={collapsedTreeIds}
          onToggleCollapse={toggleTreeCollapse}
          mode="vinculacion"
        />
      </CollapsibleSidePanel>

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
          <button type="button" disabled={!canUseSelectedLine || selectedRow.estado === "sin_apu"} onClick={marcarNoAplica}>Subcontratado</button>
          <button type="button" disabled={!canCreateApu} onClick={() => setModalCrearOpen(true)}>Crear APU</button>
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

      <CollapsibleSidePanel side="right" label="Panel APU" open={showApuPanel} onToggle={() => setShowApuPanel(value => !value)}>
        <PanelApu
          selectedRow={selectedRow}
          onEditApu={editarApu}
          onChangeApu={cambiarApu}
          onUnlinkApu={desvincularApu}
        />
      </CollapsibleSidePanel>

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
              <ActionButton variant="ghost" onClick={() => setModalCrearOpen(true)} disabled={!canCreateApu}>
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
                <span>{apuSearch.trim() ? `${apusSugeridos.length} coincidencia(s) no inactivas` : "Sugerencias por nombre del rubro"}</span>
                {apuSearch.trim() && <span className="budget-v2-compatible-count">{apusClasificados.compatibles.length} compatibles</span>}
                {apuSearch.trim() && <span className="budget-v2-incompatible-count">{apusClasificados.incompatibles.length} incompatibles</span>}
              </div>

              <div className="budget-v2-link-modal-results">
                {apuSearch.trim() && apusSugeridos.length === 0 && (
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

      {modalCrearOpen && (
        <ModalShell
          title="Crear APU desde rubro"
          size="md"
          onClose={() => {
            setModalCrearOpen(false);
            setActionError("");
          }}
          footer={
            <>
              <ActionButton onClick={() => setModalCrearOpen(false)}>Cancelar</ActionButton>
              <ActionButton variant="primary" onClick={() => crearApu()} disabled={!canCreateApu}>
                Crear desde cero
              </ActionButton>
            </>
          }
        >
          <div className="budget-v2-create-apu-modal">
            <div className="budget-v2-create-apu-intro">
              <strong>{selectedRow?.descripcion}</strong>
              <span>Se creara un APU en revision y quedara vinculado a este rubro.</span>
            </div>
            <div className="budget-v2-create-apu-list">
              <div className="budget-v2-apu-result-title">APUs parecidos para duplicar</div>
              {apusParecidosCrear.length === 0 && (
                <div className="budget-v2-link-modal-empty">No hay APUs parecidos. Puedes crear uno desde cero.</div>
              )}
              {apusParecidosCrear.map(({ apu, mensaje }) => (
                <div className="budget-v2-create-apu-option" key={apu.id}>
                  <div>
                    <strong>{apu.nombre}</strong>
                    <small>{apu.codigo || "-"} | Und {apu.unidad || "-"} | {fmtMoney(costsByApu[apu.id]?.precio_unitario)}</small>
                    {mensaje && <small>{mensaje}</small>}
                  </div>
                  <button type="button" onClick={() => crearApu(apu)}>
                    Duplicar y vincular
                  </button>
                </div>
              ))}
            </div>
            <ErrorBanner>{actionError}</ErrorBanner>
          </div>
        </ModalShell>
      )}

      {modalEditarApuOpen && selectedRow?.raw?.node?.apu_id && (
        <ModalShell
          title="Editar APU"
          size="lg"
          onClose={() => cerrarEditorApu({ refresh: false })}
        >
          <div className="budget-v2-apu-editor-modal">
            <ApuDetalle
              apu={{
                id: selectedRow.raw.node.apu_id,
                codigo: selectedRow.apu,
                nombre: selectedRow.apuNombre || selectedRow.descripcion,
                unidad: selectedRow.unidad || "",
                rendimiento: selectedRow.rendimiento || 1,
                estado: selectedRow.raw.apu?.estado || "en_revision",
              }}
              onVolver={() => cerrarEditorApu({ refresh: true })}
              volverLabel="Guardar y cerrar"
            />
          </div>
        </ModalShell>
      )}
    </div>
  );
}
