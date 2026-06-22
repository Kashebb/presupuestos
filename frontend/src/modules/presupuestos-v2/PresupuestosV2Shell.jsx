import { useState } from "react";
import { usePresupuestosV2Data } from "./data";
import AnalisisView from "./views/AnalisisView";
import EdicionView from "./views/EdicionView";
import VinculacionView from "./views/VinculacionView";

export default function PresupuestosV2Shell() {
  const [view, setView] = useState("edicion");
  const [selectedTreeId, setSelectedTreeId] = useState("all");
  const [selectedRowId, setSelectedRowId] = useState("");
  const [footerCount, setFooterCount] = useState(1);
  const {
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    apus,
    costsByApu,
    rows,
    loading,
    error,
    reload,
  } = usePresupuestosV2Data();

  const footerText = {
    edicion: "Edicion activa: cambios manuales controlados sobre filas operativas.",
    vinculacion: "Modo lectura: contenedores y rubros reales, acciones APU deshabilitadas.",
    analisis: "Modo lectura: comparacion con costos APU existentes.",
  };

  const footerMetric = {
    edicion: `${footerCount} celda(s) seleccionada(s)`,
    vinculacion: `${footerCount} fila(s) visibles`,
    analisis: `${footerCount} fila(s) analizadas`,
  };

  return (
    <div className="budget-v2-shell">
      <header className="budget-v2-header">
        <div>
          <div className="budget-v2-kicker">Modulo nuevo</div>
          <h1>Presupuestos V2</h1>
          <p>{selectedProject ? `${selectedProject.nombre} · ${selectedProject.codigo || "sin codigo"}` : "Lectura de datos reales del backend existente."}</p>
        </div>
        <div className="budget-v2-status">
          <span>{view === "edicion" ? "Edicion" : view === "vinculacion" ? "Vinculacion" : "Analisis"}</span>
          <strong>{view === "edicion" ? "Activo" : "Solo lectura"}</strong>
        </div>
      </header>

      <section className="budget-v2-workspace">
        <div className="budget-v2-projectbar">
          <label>
            Proyecto
            <select value={selectedProjectId} onChange={(event) => {
              setSelectedProjectId(event.target.value);
              setSelectedTreeId("all");
              setSelectedRowId("");
            }}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.nombre}</option>
              ))}
            </select>
          </label>
          <span>{loading ? "Cargando..." : `${rows.length} fila(s) cargadas`}</span>
        </div>
        {error && <div className="budget-v2-state budget-v2-state-error">{error}</div>}
        {!error && !loading && !projects.length && <div className="budget-v2-state">No hay proyectos registrados.</div>}
        {!error && !loading && Boolean(projects.length) && !rows.length && <div className="budget-v2-state">Este proyecto no tiene nodos cargados.</div>}

        <div className="budget-v2-tabs" aria-label="Vistas de Presupuestos V2">
          <button type="button" onClick={() => setView("edicion")} className={`budget-v2-tab ${view === "edicion" ? "budget-v2-tab-active" : ""}`}>Edicion</button>
          <button type="button" onClick={() => setView("vinculacion")} className={`budget-v2-tab ${view === "vinculacion" ? "budget-v2-tab-active" : ""}`}>Vinculacion</button>
          <button type="button" onClick={() => setView("analisis")} className={`budget-v2-tab ${view === "analisis" ? "budget-v2-tab-active" : ""}`}>Analisis</button>
        </div>

        {view === "edicion" && (
          <EdicionView
            rows={rows}
            selectedProjectId={selectedProjectId}
            onDataChange={reload}
            onSelectionCountChange={setFooterCount}
          />
        )}
        {view === "vinculacion" && (
          <VinculacionView
            rows={rows}
            apus={apus}
            costsByApu={costsByApu}
            onDataChange={reload}
            selectedTreeId={selectedTreeId}
            setSelectedTreeId={setSelectedTreeId}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            onVisibleCountChange={setFooterCount}
          />
        )}
        {view === "analisis" && (
          <AnalisisView
            rows={rows}
            selectedTreeId={selectedTreeId}
            setSelectedTreeId={setSelectedTreeId}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            onVisibleCountChange={setFooterCount}
          />
        )}

        <footer className="budget-v2-footer">
          <span>{footerText[view]}</span>
          <span>{footerMetric[view]}</span>
        </footer>
      </section>
    </div>
  );
}
