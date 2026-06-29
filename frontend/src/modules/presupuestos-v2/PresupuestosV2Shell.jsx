import { useState } from "react";
import { ActionButton, PageHeader, Panel } from "../../components/ui";
import { usePresupuestosV2Data } from "./data";
import AnalisisView from "./views/AnalisisView";
import EdicionView from "./views/EdicionView";
import VinculacionView from "./views/VinculacionView";

export default function PresupuestosV2Shell() {
  const [view, setView] = useState("edicion");
  const [workspaceMode, setWorkspaceMode] = useState("lista");
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
    vinculacion: "Vinculacion activa: rubros reales con acciones APU controladas.",
    analisis: "Modo lectura: comparacion con costos APU existentes.",
  };

  const footerMetric = {
    edicion: `${footerCount} celda(s) seleccionada(s)`,
    vinculacion: `${footerCount} fila(s) visibles`,
    analisis: `${footerCount} fila(s) analizadas`,
  };

  const openProject = (projectId) => {
    setSelectedProjectId(String(projectId));
    setSelectedTreeId("all");
    setSelectedRowId("");
    setFooterCount(1);
    setWorkspaceMode("detalle");
  };

  const backToProjects = () => {
    setSelectedTreeId("all");
    setSelectedRowId("");
    setWorkspaceMode("lista");
  };

  if (workspaceMode === "lista") {
    return (
      <div className="budget-v2-shell">
        <section className="budget-v2-project-list">
          <PageHeader
            title="Presupuestos"
            subtitle="Selecciona un proyecto para editar presupuesto, vincular APUs y revisar costos."
            meta={loading ? "Cargando proyectos..." : `${projects.length} proyecto(s) disponible(s)`}
          />
          {error && <div className="budget-v2-state budget-v2-state-error">{error}</div>}
          {!error && !loading && !projects.length && (
            <div className="budget-v2-state">No hay proyectos registrados.</div>
          )}
          <div className="budget-v2-project-grid">
            {projects.map((project) => {
              const isLoadedProject = String(project.id) === String(selectedProjectId);
              return (
                <Panel key={project.id} className="budget-v2-project-card">
                  <div className="budget-v2-project-card-main">
                    <div className="budget-v2-project-card-kicker">Proyecto</div>
                    <strong>{project.nombre}</strong>
                    <span>{project.codigo || "sin codigo"}</span>
                    {project.descripcion && <p>{project.descripcion}</p>}
                  </div>
                  <div className="budget-v2-project-card-metrics">
                    <div>
                      <small>Estado</small>
                      <b>{project.estado || "activo"}</b>
                    </div>
                    <div>
                      <small>Filas</small>
                      <b>{isLoadedProject && !loading ? rows.length : "-"}</b>
                    </div>
                    <div>
                      <small>Flujo</small>
                      <b>Edicion / Vinculacion</b>
                    </div>
                  </div>
                  <div className="budget-v2-project-card-actions">
                    <ActionButton variant="primary" onClick={() => openProject(project.id)}>
                      Abrir presupuesto
                    </ActionButton>
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="budget-v2-shell">
      <header className="budget-v2-header">
        <div>
          <div className="budget-v2-kicker">Presupuesto operativo</div>
          <h1>Presupuestos</h1>
          <p>{selectedProject ? `${selectedProject.nombre} · ${selectedProject.codigo || "sin codigo"}` : "Lectura de datos reales del backend existente."}</p>
        </div>
        <div className="budget-v2-status">
          <span>{view === "edicion" ? "Edicion" : view === "vinculacion" ? "Vinculacion" : "Analisis"}</span>
          <strong>{view === "analisis" ? "Solo lectura" : "Activo"}</strong>
        </div>
      </header>

      <section className="budget-v2-workspace">
        <div className="budget-v2-projectbar">
          <button type="button" className="budget-v2-back-button" onClick={backToProjects}>Volver a proyectos</button>
          <div className="budget-v2-project-locked">
            <small>Proyecto</small>
            <strong>{selectedProject ? `${selectedProject.nombre} · ${selectedProject.codigo || "sin codigo"}` : "Proyecto seleccionado"}</strong>
          </div>
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
            apus={apus}
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
