import { useEffect, useState } from "react";
import { API, statusMeta } from "../data";

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DetalleAnalisis({ selectedRow }) {
  const selectedApuId = selectedRow?.kind === "line" ? selectedRow?.raw?.node?.apu_id : null;
  const [detalleCosto, setDetalleCosto] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");

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
  }, [selectedApuId]);

  const subtotales = detalleCosto?.subtotales || {};

  return (
    <aside className="budget-v2-apu-panel">
      <div className="budget-v2-panel-head">
        <strong>Detalle analisis</strong>
        <span>{selectedRow?.kind === "container" ? "Seccion" : "Linea"}</span>
      </div>
      {selectedRow?.kind === "container" ? (
        <div className="budget-v2-panel-stack">
          <div className="budget-v2-apu-card">
            <small>Contenedor seleccionado</small>
            <strong>{selectedRow.descripcion}</strong>
            <span>Subtotal ref {selectedRow.ptRef} | subtotal meta {selectedRow.ptMeta}</span>
          </div>
          <div className="budget-v2-apu-card">
            <small>Comparacion economica</small>
            <div className="budget-v2-apu-diff">
              <span>Dif total</span>
              <strong className="budget-v2-diff-positive">{selectedRow.dif}</strong>
            </div>
            <div className="budget-v2-apu-metrics">
              <div><span>Dif %</span><strong>{selectedRow.difPct}</strong></div>
              <div><span>Lineas</span><strong>{selectedRow.lines}</strong></div>
              <div><span>Pendientes</span><strong>{selectedRow.pending}</strong></div>
              <div><span>No aplica</span><strong>{selectedRow.sinApu}</strong></div>
            </div>
          </div>
          <div className="budget-v2-apu-card">
            <small>Estado de seccion</small>
            {[
              ["Vinculadas", selectedRow.linked],
              ["Pendientes", selectedRow.pending],
              ["No aplica", selectedRow.sinApu],
              ["Revisar", selectedRow.revisar],
            ].map(([label, value]) => (
              <div className="budget-v2-breakdown-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="budget-v2-panel-stack">
          <div className="budget-v2-apu-card">
            <small>Linea seleccionada</small>
            <strong>{selectedRow?.descripcion}</strong>
            <span>{selectedRow?.unidad} | {selectedRow?.metrado}</span>
          </div>
          <div className="budget-v2-apu-card">
            <small>Comparacion economica</small>
            <div className="budget-v2-apu-diff">
              <span>Dif total</span>
              <strong className={selectedRow?.dif ? "budget-v2-diff-positive" : ""}>{selectedRow?.dif || "-"}</strong>
            </div>
            <div className="budget-v2-apu-metrics">
              <div><span>P.U. ref</span><strong>{selectedRow?.puRef || "-"}</strong></div>
              <div><span>P.U. meta</span><strong className={selectedRow?.estado === "sin_apu" ? "budget-v2-meta-noapu-text" : ""}>{selectedRow?.puMeta || "-"}</strong></div>
              <div><span>Total ref</span><strong>{selectedRow?.ptRef || "-"}</strong></div>
              <div><span>Total meta</span><strong className={selectedRow?.estado === "sin_apu" ? "budget-v2-meta-noapu-text" : ""}>{selectedRow?.ptMeta || "-"}</strong></div>
            </div>
          </div>
          <div className="budget-v2-apu-card">
            <div className="budget-v2-apu-card-head">
              <small>Estado analisis</small>
              {selectedRow?.estado && <em>{selectedRow.estado === "sin_apu" ? "Meta sin APU" : statusMeta[selectedRow.estado]?.label}</em>}
            </div>
            {selectedRow?.apu ? (
              <div className="budget-v2-apu-tags">
                <span>{selectedRow.apu}</span>
                <span>{selectedRow.apuNombre}</span>
              </div>
            ) : (
              <span>{selectedRow?.estado === "sin_apu" ? "Esta linea suma con meta igual a referencia." : "Esta linea aun no tiene meta calculada."}</span>
            )}
          </div>
          {selectedRow?.apu && (
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
          )}
        </div>
      )}
    </aside>
  );
}
