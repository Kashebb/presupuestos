import { useEffect, useState } from "react";
import { API, statusMeta } from "../data";

const ETIQUETAS_APU_CONTROLADAS = [
  "validado",
  "referencial",
  "incompleto",
  "solo mano de obra",
  "solo materiales",
  "mano de obra + materiales",
  "ajustado con cotizacion",
  "requiere cotizacion",
  "subcontratado",
  "especial del proyecto",
];

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

export default function PanelApu({ selectedRow, onEditApu, onChangeApu, onUnlinkApu, onUpdateApuTags }) {
  const selectedHasApu = selectedRow?.kind === "line" && Boolean(selectedRow.apu);
  const hasActions = Boolean(onEditApu || onChangeApu || onUnlinkApu);
  const selectedApuId = selectedRow?.raw?.node?.apu_id || null;
  const selectedApuRendimiento = selectedRow?.raw?.apu?.rendimiento ?? null;
  const selectedApuPuMeta = selectedRow?.raw?.cost?.precio_unitario ?? null;
  const [detalleCosto, setDetalleCosto] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [draftTags, setDraftTags] = useState([]);
  const [savingTags, setSavingTags] = useState(false);
  const [tagError, setTagError] = useState("");

  useEffect(() => {
    if (!selectedApuId) {
      setDetalleCosto(null);
      setErrorDetalle("");
      setCargandoDetalle(false);
      return;
    }

    let cancelled = false;
    async function loadDetalleCosto() {
      setCargandoDetalle(true);
      setErrorDetalle("");
      try {
        const response = await fetch(`${API}/apus/${selectedApuId}/costo`);
        if (!response.ok) throw new Error("No se pudo cargar el desglose del APU.");
        const data = await response.json();
        if (!cancelled) setDetalleCosto(data);
      } catch (err) {
        if (!cancelled) {
          setDetalleCosto(null);
          setErrorDetalle(err.message || "No se pudo cargar el desglose del APU.");
        }
      } finally {
        if (!cancelled) setCargandoDetalle(false);
      }
    }

    loadDetalleCosto();
    return () => {
      cancelled = true;
    };
  }, [selectedApuId, selectedApuPuMeta, selectedApuRendimiento]);

  useEffect(() => {
    setDraftTags(Array.isArray(selectedRow?.raw?.apu?.etiquetas) ? selectedRow.raw.apu.etiquetas : []);
    setTagError("");
    setSavingTags(false);
  }, [selectedApuId, selectedRow?.raw?.apu?.etiquetas]);

  const toggleTag = (tag, checked) => {
    setDraftTags((current) => {
      if (checked && !current.includes(tag)) return [...current, tag];
      if (!checked) return current.filter((item) => item !== tag);
      return current;
    });
  };

  const saveTags = async () => {
    if (!onUpdateApuTags) return;
    setSavingTags(true);
    setTagError("");
    try {
      await onUpdateApuTags(draftTags);
    } catch (err) {
      setTagError(err.message || "No se pudieron guardar las etiquetas.");
    } finally {
      setSavingTags(false);
    }
  };

  const subtotales = detalleCosto?.subtotales || {};

  return (
    <aside className="budget-v2-apu-panel">
      <div className="budget-v2-panel-head">
        <strong>Panel APU</strong>
        <span>Apertura automatica</span>
      </div>
      {!selectedRow && <div className="budget-v2-panel-empty">Selecciona una linea operativa.</div>}
      {selectedRow?.kind === "container" && (
        <div className="budget-v2-panel-empty">
          <strong>{selectedRow.descripcion}</strong>
          <p>Contenedor seleccionado solo como contexto. Las acciones APU aplican a lineas operativas.</p>
        </div>
      )}
      {selectedRow?.kind === "line" && (
        <div className="budget-v2-panel-stack">
          <div className="budget-v2-apu-card">
            <small>Linea seleccionada</small>
            <strong>{selectedRow.descripcion}</strong>
            <span>{selectedRow.unidad} | {selectedRow.metrado} | P.U. ref {selectedRow.puRef || "-"}</span>
          </div>
          {selectedHasApu ? (
            <>
              <div className="budget-v2-apu-card">
                <div className="budget-v2-apu-card-head">
                  <small>APU vinculado</small>
                  <em>{statusMeta[selectedRow.estado]?.label}</em>
                </div>
                <strong>{selectedRow.apuNombre}</strong>
                <div className="budget-v2-apu-tags">
                  <span>{selectedRow.apu}</span>
                  <span>Variante {selectedRow.varianteApu || "Base"}</span>
                  <span>Und {selectedRow.unidad}</span>
                  <span>Rend. {Number.isFinite(selectedRow.rendimiento) ? selectedRow.rendimiento.toFixed(4) : "-"}</span>
                  {draftTags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
              <div className="budget-v2-apu-card">
                <small>Etiquetas APU</small>
                <div className="budget-v2-tag-picker budget-v2-tag-picker-compact">
                  {ETIQUETAS_APU_CONTROLADAS.map((tag) => (
                    <label key={tag}>
                      <input
                        type="checkbox"
                        checked={draftTags.includes(tag)}
                        disabled={!onUpdateApuTags || savingTags}
                        onChange={(event) => toggleTag(tag, event.target.checked)}
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
                {tagError && <div className="budget-v2-panel-note budget-v2-panel-note-error">{tagError}</div>}
                {onUpdateApuTags && (
                  <button type="button" className="budget-v2-panel-action budget-v2-panel-action-primary" disabled={savingTags} onClick={saveTags}>
                    {savingTags ? "Guardando..." : "Guardar etiquetas"}
                  </button>
                )}
              </div>
              <div className="budget-v2-apu-card">
                <small>Comparacion economica</small>
                <div className="budget-v2-apu-diff">
                  <span>Dif total</span>
                  <strong className="budget-v2-diff-positive">{selectedRow.dif || "$0.0000"}</strong>
                </div>
                <div className="budget-v2-apu-metrics">
                  <div><span>Dif unit.</span><strong>{selectedRow.raw?.puMeta != null && selectedRow.raw?.puRef != null ? `$${(selectedRow.raw.puMeta - selectedRow.raw.puRef).toLocaleString("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : "-"}</strong></div>
                  <div><span>Dif %</span><strong>{selectedRow.difPct || "-"}</strong></div>
                  <div><span>Total ref</span><strong>{selectedRow.ptRef}</strong></div>
                  <div><span>Total meta</span><strong>{selectedRow.ptMeta}</strong></div>
                </div>
              </div>
              <div className="budget-v2-apu-card">
                <small>Desglose P.U.</small>
                {cargandoDetalle && <div className="budget-v2-panel-note">Cargando desglose...</div>}
                {errorDetalle && <div className="budget-v2-panel-note budget-v2-panel-note-error">{errorDetalle}</div>}
                {[
                  ["Materiales", subtotales.material],
                  ["Mano de obra", subtotales.mano_de_obra],
                  ["Equipos", subtotales.equipo],
                  ["Transporte", subtotales.transporte],
                  ["Herr. menor", detalleCosto?.herramienta_menor],
                ].map(([label, value]) => (
                  <div className="budget-v2-breakdown-row" key={label}>
                    <span>{label}</span>
                    <strong>{fmtMoney(value)}</strong>
                  </div>
                ))}
              </div>
              {hasActions && (
                <div className="budget-v2-apu-actions">
                  {onEditApu && <button type="button" className="budget-v2-apu-primary" onClick={onEditApu}>Editar APU completo</button>}
                  {onChangeApu && <button type="button" onClick={onChangeApu}>Cambiar APU</button>}
                  {onUnlinkApu && <button type="button" className="budget-v2-apu-danger" onClick={onUnlinkApu}>Desvincular</button>}
                </div>
              )}
            </>
          ) : (
            <div className="budget-v2-panel-empty">Esta linea no tiene APU vinculado.</div>
          )}
        </div>
      )}
    </aside>
  );
}
