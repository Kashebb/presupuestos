import { statusMeta } from "../mockData";

export default function PanelApu({ selectedRow }) {
  const selectedHasApu = selectedRow?.kind === "line" && Boolean(selectedRow.apu);

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
            <span>{selectedRow.unidad} | {selectedRow.metrado} | P.U. meta {selectedRow.puMeta || "-"}</span>
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
                  <span>Und {selectedRow.unidad}</span>
                  <span>Rend. 0.0027</span>
                </div>
              </div>
              <div className="budget-v2-apu-card">
                <small>Comparacion economica</small>
                <div className="budget-v2-apu-diff">
                  <span>Dif total</span>
                  <strong className="budget-v2-diff-positive">{selectedRow.dif || "$0.00"}</strong>
                </div>
                <div className="budget-v2-apu-metrics">
                  <div><span>Dif unit.</span><strong>$0.35</strong></div>
                  <div><span>Dif %</span><strong>{selectedRow.difPct || "-"}</strong></div>
                  <div><span>Total ref</span><strong>{selectedRow.ptRef}</strong></div>
                  <div><span>Total meta</span><strong>{selectedRow.ptMeta}</strong></div>
                </div>
              </div>
              <div className="budget-v2-apu-card">
                <small>Desglose P.U.</small>
                {[
                  ["Materiales", "$0.00"],
                  ["Mano de obra", "$0.01"],
                  ["Equipos", "$0.10"],
                  ["Transporte", "$0.00"],
                ].map(([label, value]) => (
                  <div className="budget-v2-breakdown-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="budget-v2-apu-actions">
                <button type="button" className="budget-v2-apu-primary">Editar APU completo</button>
                <button type="button">Cambiar APU</button>
                <button type="button" className="budget-v2-apu-danger">Desvincular</button>
              </div>
            </>
          ) : (
            <div className="budget-v2-panel-empty">Esta linea no tiene APU vinculado.</div>
          )}
        </div>
      )}
    </aside>
  );
}
