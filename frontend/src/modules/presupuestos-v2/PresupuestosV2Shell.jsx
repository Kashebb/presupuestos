import { useState } from "react";
import { ActionButton, ModalShell, PageHeader, Panel } from "../../components/ui";
import { API, usePresupuestosV2Data } from "./data";
import AnalisisView from "./views/AnalisisView";
import DesgloseView from "./views/DesgloseView";
import EdicionView from "./views/EdicionView";
import VinculacionView from "./views/VinculacionView";

export default function PresupuestosV2Shell() {
  const [view, setView] = useState("edicion");
  const [workspaceMode, setWorkspaceMode] = useState("lista");
  const [selectedTreeId, setSelectedTreeId] = useState("all");
  const [selectedRowId, setSelectedRowId] = useState("");
  const [footerCount, setFooterCount] = useState(1);
  const [exportModalOpen, setExportModalOpen] = useState(false);
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
    desglose: "Desglose activo: costos por rubro con materiales, mano de obra, equipos y transporte.",
    analisis: "Modo lectura: comparacion con costos APU existentes.",
  };

  const footerMetric = {
    edicion: `${footerCount} celda(s) seleccionada(s)`,
    vinculacion: `${footerCount} fila(s) visibles`,
    desglose: `${footerCount} fila(s) visibles`,
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

  const selectedTreeRow = selectedTreeId === "all" ? null : rows.find((row) => row.id === selectedTreeId);

  const exportProject = (scope = "all") => {
    if (!selectedProjectId) return;
    const params = new URLSearchParams();
    if (scope === "selected" && selectedTreeRow?.sourceId) {
      params.set("root_nodo_id", String(selectedTreeRow.sourceId));
    }
    const query = params.toString();
    window.open(`${API}/presupuestos/proyectos/${selectedProjectId}/exportar-operativo.xlsx${query ? `?${query}` : ""}`, "_blank", "noopener,noreferrer");
    setExportModalOpen(false);
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
          <span>{view === "edicion" ? "Edicion" : view === "vinculacion" ? "Vinculacion" : view === "desglose" ? "Desglose" : "Analisis"}</span>
          <strong>{view === "analisis" || view === "desglose" ? "Solo lectura" : "Activo"}</strong>
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
          <ActionButton variant="secondary" compact onClick={() => setExportModalOpen(true)} disabled={!selectedProjectId || loading || Boolean(error)}>
            Exportar Excel
          </ActionButton>
        </div>
        {error && <div className="budget-v2-state budget-v2-state-error">{error}</div>}
        {!error && !loading && !projects.length && <div className="budget-v2-state">No hay proyectos registrados.</div>}
        {!error && !loading && Boolean(projects.length) && !rows.length && <div className="budget-v2-state">Este proyecto no tiene nodos cargados.</div>}

        <div className="budget-v2-tabs" aria-label="Vistas de Presupuestos V2">
          <button type="button" onClick={() => setView("edicion")} className={`budget-v2-tab ${view === "edicion" ? "budget-v2-tab-active" : ""}`}>Edicion</button>
          <button type="button" onClick={() => setView("vinculacion")} className={`budget-v2-tab ${view === "vinculacion" ? "budget-v2-tab-active" : ""}`}>Vinculacion</button>
          <button type="button" onClick={() => setView("desglose")} className={`budget-v2-tab ${view === "desglose" ? "budget-v2-tab-active" : ""}`}>Desglose</button>
          <button type="button" onClick={() => setView("analisis")} className={`budget-v2-tab ${view === "analisis" ? "budget-v2-tab-active" : ""}`}>Analisis</button>
        </div>

        {view === "edicion" && (
          <EdicionView
            rows={rows}
            apus={apus}
            selectedProjectId={selectedProjectId}
            onDataChange={reload}
            selectedTreeId={selectedTreeId}
            setSelectedTreeId={setSelectedTreeId}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            onSelectionCountChange={setFooterCount}
          />
        )}
        {view === "vinculacion" && (
          <VinculacionView
            rows={rows}
            apus={apus}
            costsByApu={costsByApu}
            selectedProjectId={selectedProjectId}
            onDataChange={reload}
            selectedTreeId={selectedTreeId}
            setSelectedTreeId={setSelectedTreeId}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            onVisibleCountChange={setFooterCount}
          />
        )}
        {view === "desglose" && (
          <DesgloseView
            rows={rows}
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
        {exportModalOpen && (
          <ModalShell
            title="Exportar Excel"
            size="md"
            onClose={() => setExportModalOpen(false)}
            footer={
              <>
                <ActionButton onClick={() => setExportModalOpen(false)}>Cancelar</ActionButton>
                <ActionButton onClick={() => exportProject("all")}>Exportar todo</ActionButton>
                <ActionButton variant="primary" onClick={() => exportProject("selected")} disabled={!selectedTreeRow}>
                  Exportar seleccionado
                </ActionButton>
              </>
            }
          >
            <div className="budget-v2-create-apu-modal">
              <div className="budget-v2-create-apu-intro">
                <strong>{selectedProject ? selectedProject.nombre : "Proyecto seleccionado"}</strong>
                <span>Elige si quieres exportar todo el presupuesto o solo la rama seleccionada en el arbol.</span>
              </div>
              <div className="budget-v2-export-choice">
                <div>
                  <small>Todo el presupuesto</small>
                  <strong>Incluye todos los capitulos, grupos y rubros activos.</strong>
                </div>
                <div>
                  <small>Seleccion actual del arbol</small>
                  <strong>{selectedTreeRow ? selectedTreeRow.descripcion : "No hay rama seleccionada"}</strong>
                  <span>{selectedTreeRow ? "Incluye esta rama con todos sus capitulos y rubros." : "Selecciona una rama en el arbol para habilitar esta opcion."}</span>
                </div>
              </div>
            </div>
          </ModalShell>
        )}
      </section>
    </div>
  );
}
