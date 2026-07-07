import { useState } from "react";
import { ActionButton, ModalShell, PageHeader, Panel } from "../../components/ui";
import { API, usePresupuestosV2Data } from "./data";
import AnalisisView from "./views/AnalisisView";
import DesgloseView from "./views/DesgloseView";
import EdicionView from "./views/EdicionView";
import VinculacionView from "./views/VinculacionView";

export default function PresupuestosV2Shell() {
  const [view, setView] = useState("edicion");
  const [ribbonGroup, setRibbonGroup] = useState("edicion");
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
  const selectedRow = selectedRowId ? rows.find((row) => row.id === selectedRowId) : null;

  const switchView = (nextView, nextGroup = nextView) => {
    setView(nextView);
    setRibbonGroup(nextGroup);
  };

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

  const ribbonGroups = [
    {
      id: "edicion",
      label: "Edicion",
      actions: [
        { label: "Abrir edicion", active: view === "edicion", onClick: () => switchView("edicion", "edicion") },
        { label: "Agregar filas", onClick: () => switchView("edicion", "edicion"), hint: "Disponible dentro de la grilla de edicion." },
        { label: "Guardar", onClick: () => switchView("edicion", "edicion"), hint: "Usa Guardar en la grilla cuando existan cambios pendientes." },
      ],
    },
    {
      id: "vinculacion",
      label: "Vinculacion",
      actions: [
        { label: "Abrir vinculacion", active: view === "vinculacion", onClick: () => switchView("vinculacion", "vinculacion") },
        { label: "Vincular APU", onClick: () => switchView("vinculacion", "vinculacion"), hint: selectedRow ? `Seleccion actual: ${selectedRow.descripcion}` : "Selecciona un rubro para vincular." },
        { label: "Subcontratado", onClick: () => switchView("vinculacion", "vinculacion") },
      ],
    },
    {
      id: "apus",
      label: "APUs",
      actions: [
        { label: "Crear / duplicar", onClick: () => switchView("vinculacion", "apus"), hint: "Usa el panel de vinculacion para crear desde APUs parecidos." },
        { label: "Editar APU", onClick: () => switchView("vinculacion", "apus") },
        { label: "Ver desglose", onClick: () => switchView("desglose", "apus") },
      ],
    },
    {
      id: "recursos",
      label: "Recursos",
      actions: [
        { label: "Crear recurso", disabled: true, hint: "Siguiente fase: panel interno desde Presupuestos." },
        { label: "Editar recurso", disabled: true, hint: "Siguiente fase: edicion desde Presupuestos." },
      ],
    },
    {
      id: "paquetes",
      label: "Paquetes",
      actions: [
        { label: "Definir paquete", disabled: true, hint: "Fase posterior: paquetes/subproyectos." },
        { label: "Mostrar liberados", disabled: true, hint: "Fase posterior: filtro de paquetes liberados." },
      ],
    },
    {
      id: "orden",
      label: "Orden",
      actions: [
        { label: "Subir / bajar", onClick: () => switchView("edicion", "orden"), hint: "Disponible en la barra compacta de edicion." },
        { label: "Sangria", onClick: () => switchView("edicion", "orden") },
        { label: "Quitar sangria", onClick: () => switchView("edicion", "orden") },
      ],
    },
    {
      id: "vista",
      label: "Vista",
      actions: [
        { label: "Edicion", active: view === "edicion", onClick: () => switchView("edicion", "vista") },
        { label: "Vinculacion", active: view === "vinculacion", onClick: () => switchView("vinculacion", "vista") },
        { label: "Desglose", active: view === "desglose", onClick: () => switchView("desglose", "vista") },
        { label: "Analisis", active: view === "analisis", onClick: () => switchView("analisis", "vista") },
      ],
    },
    {
      id: "exportar",
      label: "Exportar",
      actions: [
        { label: "Exportar Excel", onClick: () => setExportModalOpen(true), disabled: !selectedProjectId || loading || Boolean(error) },
        { label: "Todo", onClick: () => exportProject("all"), disabled: !selectedProjectId || loading || Boolean(error) },
        { label: "Seleccion", onClick: () => exportProject("selected"), disabled: !selectedTreeRow || loading || Boolean(error) },
      ],
    },
    {
      id: "importar",
      label: "Importar",
      actions: [
        { label: "Importar Excel", disabled: true, hint: "Se mantiene fuera de esta fase para no tocar datos." },
      ],
    },
  ];

  const activeRibbonGroup = ribbonGroups.find((group) => group.id === ribbonGroup) || ribbonGroups[0];

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
        </div>
        {error && <div className="budget-v2-state budget-v2-state-error">{error}</div>}
        {!error && !loading && !projects.length && <div className="budget-v2-state">No hay proyectos registrados.</div>}
        {!error && !loading && Boolean(projects.length) && !rows.length && <div className="budget-v2-state">Este proyecto no tiene nodos cargados.</div>}

        <div className="budget-v2-ribbon" aria-label="Cinta de acciones de Presupuestos V2">
          <div className="budget-v2-ribbon-tabs">
            {ribbonGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={activeRibbonGroup.id === group.id ? "budget-v2-ribbon-tab-active" : ""}
                onClick={() => setRibbonGroup(group.id)}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="budget-v2-ribbon-actions">
            {activeRibbonGroup.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.active ? "budget-v2-ribbon-action-active" : ""}
                disabled={action.disabled}
                title={action.hint || ""}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
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
