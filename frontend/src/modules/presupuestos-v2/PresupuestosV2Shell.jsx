import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  ErrorBanner,
  ModalCodeHeader,
  ModalFormFull,
  ModalFormGrid,
  ModalShell,
  PageHeader,
  Panel,
  fieldClass,
  labelClass,
} from "../../components/ui";
import { API, usePresupuestosV2Data } from "./data";
import { descendantsOf } from "./logic/tree";
import AnalisisView from "./views/AnalisisView";
import DesgloseView from "./views/DesgloseView";
import EdicionView from "./views/EdicionView";
import VinculacionView from "./views/VinculacionView";

const CATEGORIAS_RECURSO = ["mano_de_obra", "material", "equipo", "transporte", "otros"];
const ETIQUETAS_RECURSO_CONTROLADAS = [
  "precio validado",
  "precio referencial",
  "precio cotizado",
  "proveedor confirmado",
  "sin precio actualizado",
  "requiere validacion",
  "especial del proyecto",
  "solo este subproyecto",
];
const ETIQUETAS_RECURSO = {
  mano_de_obra: "Mano de Obra",
  material: "Material",
  equipo: "Equipo",
  transporte: "Transporte",
  otros: "Otros",
};
const RECURSO_VACIO = {
  codigo: "",
  descripcion: "",
  unidad: "",
  categoria: "material",
  subcategoria: "",
  familia: "",
  precio_unitario: "",
  estado_validacion: "pendiente",
  etiquetas: [],
};
const EXPORT_VIEWS = [
  { id: "todo", label: "Todo", detail: "Todos los rubros activos." },
  { id: "pendientes", label: "Pendientes", detail: "Rubros sin APU vinculado." },
  { id: "vinculados", label: "Vinculados", detail: "Rubros con APU vigente." },
  { id: "revisar", label: "Revisar", detail: "Rubros con APU por revisar." },
  { id: "subcontratados", label: "Subcontratados", detail: "Rubros marcados sin APU." },
];

function parseNumero(valor) {
  if (valor === null || valor === undefined) return Number.NaN;
  const normalizado = String(valor).trim().replace(",", ".");
  if (!normalizado) return Number.NaN;
  return Number(normalizado);
}

export default function PresupuestosV2Shell() {
  const [view, setView] = useState("edicion");
  const [ribbonGroup, setRibbonGroup] = useState("edicion");
  const [workspaceMode, setWorkspaceMode] = useState("lista");
  const [selectedTreeId, setSelectedTreeId] = useState("all");
  const [selectedRowId, setSelectedRowId] = useState("");
  const [footerCount, setFooterCount] = useState(1);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportView, setExportView] = useState("todo");
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState(RECURSO_VACIO);
  const [resourceClassifications, setResourceClassifications] = useState([]);
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceCodeLoading, setResourceCodeLoading] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [resourceStatus, setResourceStatus] = useState("");
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [packageForm, setPackageForm] = useState({ nombre: "", observacion: "" });
  const [packageSaving, setPackageSaving] = useState(false);
  const [packageError, setPackageError] = useState("");
  const [packageStatus, setPackageStatus] = useState("");
  const [showReleasedPackages, setShowReleasedPackages] = useState(false);
  const {
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    apus,
    paquetes,
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
  const selectedContextRow = selectedTreeRow || selectedRow;
  const paquetesByNodeId = useMemo(() => new Map(paquetes.map((paquete) => [String(paquete.nodo_id), paquete])), [paquetes]);
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const selectedPackage = useMemo(() => {
    let cursor = selectedContextRow;
    while (cursor) {
      const paquete = paquetesByNodeId.get(cursor.id);
      if (paquete) return paquete;
      cursor = cursor.parentId ? rowsById.get(cursor.parentId) : null;
    }
    return null;
  }, [paquetesByNodeId, rowsById, selectedContextRow]);
  const visibleRows = useMemo(() => {
    if (showReleasedPackages) return rows;
    const hiddenIds = new Set();
    paquetes
      .filter((paquete) => paquete.estado === "liberado")
      .forEach((paquete) => {
        descendantsOf(rows, String(paquete.nodo_id)).forEach((id) => hiddenIds.add(id));
      });
    return rows.filter((row) => !hiddenIds.has(row.id));
  }, [paquetes, rows, showReleasedPackages]);

  useEffect(() => {
    if (selectedTreeId !== "all" && !visibleRows.some((row) => row.id === selectedTreeId)) {
      setSelectedTreeId("all");
    }
    if (selectedRowId && !visibleRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId("");
    }
  }, [selectedRowId, selectedTreeId, visibleRows]);

  const switchView = (nextView, nextGroup = nextView) => {
    setView(nextView);
    setRibbonGroup(nextGroup);
  };

  const exportProject = (scope = "all", viewId = exportView) => {
    if (!selectedProjectId) return;
    const params = new URLSearchParams();
    if (scope === "selected" && selectedTreeRow?.sourceId) {
      params.set("root_nodo_id", String(selectedTreeRow.sourceId));
    }
    if (viewId && viewId !== "todo") {
      params.set("vista_exportacion", viewId);
    }
    const query = params.toString();
    window.open(`${API}/presupuestos/proyectos/${selectedProjectId}/exportar-operativo.xlsx${query ? `?${query}` : ""}`, "_blank", "noopener,noreferrer");
    setExportModalOpen(false);
  };

  const subcategoriasDe = (categoria) => {
    return resourceClassifications.find((item) => item.categoria === categoria)?.subcategorias || [];
  };

  const clasificacionInicial = (categoria = "material", classifications = resourceClassifications) => {
    const categoriaBase = classifications.find((item) => item.categoria === categoria) || classifications[0];
    const subcategoriaBase = categoriaBase?.subcategorias?.[0];
    return {
      categoria: categoriaBase?.categoria || categoria,
      subcategoria: subcategoriaBase?.nombre || "",
      familia: subcategoriaBase?.familias?.[0] || "",
    };
  };

  const generarCodigoRecurso = async (categoria, subcategoria) => {
    if (!categoria || !subcategoria) {
      setResourceForm((current) => ({ ...current, codigo: "" }));
      return;
    }
    setResourceCodeLoading(true);
    setResourceError("");
    try {
      const params = new URLSearchParams({ categoria, subcategoria });
      const response = await fetch(`${API}/recursos/siguiente-codigo?${params}`);
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudo generar el codigo.");
      setResourceForm((current) => ({ ...current, codigo: detail.codigo || "" }));
    } catch (err) {
      setResourceForm((current) => ({ ...current, codigo: "" }));
      setResourceError(err.message || "No se pudo generar el codigo del recurso.");
    } finally {
      setResourceCodeLoading(false);
    }
  };

  const abrirCrearRecurso = async () => {
    setRibbonGroup("recursos");
    setResourceError("");
    setResourceStatus("");
    setResourceModalOpen(true);
    try {
      const response = await fetch(`${API}/recursos/clasificaciones`);
      if (!response.ok) throw new Error("No se pudieron cargar las clasificaciones de recursos.");
      const classifications = await response.json();
      const safeClassifications = Array.isArray(classifications) ? classifications : [];
      const inicial = clasificacionInicial("material", safeClassifications);
      setResourceClassifications(safeClassifications);
      setResourceForm({ ...RECURSO_VACIO, ...inicial });
      if (inicial.categoria && inicial.subcategoria) await generarCodigoRecurso(inicial.categoria, inicial.subcategoria);
    } catch (err) {
      setResourceClassifications([]);
      setResourceForm(RECURSO_VACIO);
      setResourceError(err.message || "No se pudo preparar el panel de recurso.");
    }
  };

  const actualizarCategoriaRecurso = async (categoria) => {
    const siguiente = clasificacionInicial(categoria);
    setResourceForm((current) => ({ ...current, ...siguiente }));
    await generarCodigoRecurso(siguiente.categoria, siguiente.subcategoria);
  };

  const actualizarSubcategoriaRecurso = async (subcategoria) => {
    const subcategoriaInfo = subcategoriasDe(resourceForm.categoria).find((item) => item.nombre === subcategoria);
    const siguiente = {
      subcategoria,
      familia: subcategoriaInfo?.familias?.[0] || "",
    };
    setResourceForm((current) => ({ ...current, ...siguiente }));
    await generarCodigoRecurso(resourceForm.categoria, subcategoria);
  };

  const guardarRecurso = async () => {
    if (!resourceForm.codigo.trim()) {
      setResourceError("No hay codigo automatico disponible para esta categoria.");
      return;
    }
    if (!resourceForm.descripcion.trim()) {
      setResourceError("El nombre es obligatorio.");
      return;
    }
    if (!resourceForm.unidad.trim()) {
      setResourceError("La unidad es obligatoria.");
      return;
    }
    if (!resourceForm.subcategoria.trim()) {
      setResourceError("La subcategoria es obligatoria.");
      return;
    }
    const precio = parseNumero(resourceForm.precio_unitario);
    if (!Number.isFinite(precio) || precio < 0) {
      setResourceError("Ingresa un precio valido.");
      return;
    }

    setResourceSaving(true);
    setResourceError("");
    try {
      const response = await fetch(`${API}/recursos/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...resourceForm,
          descripcion: resourceForm.descripcion.trim(),
          unidad: resourceForm.unidad.trim(),
          precio_unitario: precio,
          etiquetas: resourceForm.etiquetas,
          activo: true,
        }),
      });
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudo crear el recurso.");
      setResourceModalOpen(false);
      setResourceStatus(`Recurso creado: ${detail?.codigo || resourceForm.codigo}`);
    } catch (err) {
      setResourceError(err.message || "No se pudo crear el recurso.");
    } finally {
      setResourceSaving(false);
    }
  };

  const abrirCrearPaquete = () => {
    if (!selectedContextRow) {
      setPackageStatus("Selecciona una rama del arbol para crear un paquete.");
      return;
    }
    setRibbonGroup("paquetes");
    setPackageError("");
    setPackageStatus("");
    setPackageForm({
      nombre: selectedContextRow.paquete?.nombre || selectedContextRow.descripcion || "",
      observacion: selectedContextRow.paquete?.observacion || "",
    });
    setPackageModalOpen(true);
  };

  const guardarPaquete = async () => {
    if (!selectedContextRow?.sourceId) {
      setPackageError("Selecciona una rama valida del presupuesto.");
      return;
    }
    if (!packageForm.nombre.trim()) {
      setPackageError("El nombre del paquete es obligatorio.");
      return;
    }
    setPackageSaving(true);
    setPackageError("");
    try {
      const response = await fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/paquetes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodo_id: selectedContextRow.sourceId,
          nombre: packageForm.nombre.trim(),
          observacion: packageForm.observacion.trim() || null,
        }),
      });
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudo crear el paquete.");
      setPackageModalOpen(false);
      setPackageStatus(`Paquete creado: ${detail?.nombre || packageForm.nombre}`);
      reload();
    } catch (err) {
      setPackageError(err.message || "No se pudo crear el paquete.");
    } finally {
      setPackageSaving(false);
    }
  };

  const cambiarEstadoPaquete = async (paquete, accion) => {
    if (!paquete) {
      setPackageStatus("Selecciona una rama que pertenezca a un paquete.");
      return;
    }
    setPackageError("");
    setPackageStatus("");
    try {
      const response = await fetch(`${API}/presupuestos/paquetes/${paquete.id}/${accion}`, { method: "PATCH" });
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudo actualizar el paquete.");
      setPackageStatus(accion === "liberar" ? `Paquete liberado: ${detail.nombre}` : `Paquete reabierto: ${detail.nombre}`);
      reload();
    } catch (err) {
      setPackageStatus(err.message || "No se pudo actualizar el paquete.");
    }
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
        { label: "Crear recurso", onClick: abrirCrearRecurso, hint: "Crea un recurso sin salir de Presupuestos." },
        { label: "Editar recurso", disabled: true, hint: "Siguiente fase: edicion desde Presupuestos." },
      ],
    },
    {
      id: "paquetes",
      label: "Paquetes",
      actions: [
        {
          label: "Crear paquete",
          onClick: abrirCrearPaquete,
          disabled: !selectedContextRow || Boolean(selectedContextRow.paquete),
          hint: selectedContextRow?.paquete ? "Esta rama ya tiene paquete." : "Crea un paquete desde la seleccion actual.",
        },
        {
          label: "Liberar",
          onClick: () => cambiarEstadoPaquete(selectedPackage, "liberar"),
          disabled: !selectedPackage || selectedPackage.estado === "liberado",
          hint: "Marca el paquete como finalizado y lo oculta del trabajo activo.",
        },
        {
          label: "Reabrir",
          onClick: () => cambiarEstadoPaquete(selectedPackage, "reabrir"),
          disabled: !selectedPackage || selectedPackage.estado !== "liberado",
          hint: "Devuelve el paquete al trabajo activo.",
        },
        {
          label: showReleasedPackages ? "Ocultar liberados" : "Mostrar liberados",
          active: showReleasedPackages,
          onClick: () => setShowReleasedPackages((current) => !current),
          hint: "Los paquetes liberados se ocultan por defecto en arbol y tablas.",
        },
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
        { label: "Todo", onClick: () => exportProject("all", "todo"), disabled: !selectedProjectId || loading || Boolean(error) },
        { label: "Seleccion", onClick: () => exportProject("selected", "todo"), disabled: !selectedTreeRow || loading || Boolean(error) },
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
          <span>{loading ? "Cargando..." : `${visibleRows.length} fila(s) visibles`}</span>
        </div>
        {error && <div className="budget-v2-state budget-v2-state-error">{error}</div>}
        {!error && !loading && !projects.length && <div className="budget-v2-state">No hay proyectos registrados.</div>}
        {!error && !loading && Boolean(projects.length) && !visibleRows.length && <div className="budget-v2-state">No hay filas visibles con los filtros actuales.</div>}

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
            rows={visibleRows}
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
        {resourceStatus && <div className="budget-v2-action-panel"><span className="budget-v2-action-status">{resourceStatus}</span></div>}
        {packageStatus && <div className="budget-v2-action-panel"><span className="budget-v2-action-status">{packageStatus}</span></div>}
        {view === "vinculacion" && (
          <VinculacionView
            rows={visibleRows}
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
            rows={visibleRows}
            selectedTreeId={selectedTreeId}
            setSelectedTreeId={setSelectedTreeId}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            onVisibleCountChange={setFooterCount}
          />
        )}
        {view === "analisis" && (
          <AnalisisView
            rows={visibleRows}
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
                <ActionButton onClick={() => exportProject("all", exportView)}>Exportar todo</ActionButton>
                <ActionButton variant="primary" onClick={() => exportProject("selected", exportView)} disabled={!selectedTreeRow}>
                  Exportar seleccion
                </ActionButton>
              </>
            }
          >
            <div className="budget-v2-create-apu-modal">
              <div className="budget-v2-create-apu-intro">
                <strong>{selectedProject ? selectedProject.nombre : "Proyecto seleccionado"}</strong>
                <span>Elige la vista y si quieres exportar todo el presupuesto o solo la rama seleccionada en el arbol.</span>
              </div>
              <div className="budget-v2-export-views">
                {EXPORT_VIEWS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={exportView === item.id ? "budget-v2-export-view-active" : ""}
                    onClick={() => setExportView(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </button>
                ))}
              </div>
              <div className="budget-v2-export-choice">
                <div>
                  <small>Todo el presupuesto</small>
                  <strong>Aplica la vista elegida sobre todos los capitulos, grupos y rubros activos.</strong>
                </div>
                <div>
                  <small>Seleccion actual del arbol</small>
                  <strong>{selectedTreeRow ? selectedTreeRow.descripcion : "No hay rama seleccionada"}</strong>
                  <span>{selectedTreeRow ? "Aplica la vista elegida solo dentro de esta rama." : "Selecciona una rama en el arbol para habilitar esta opcion."}</span>
                </div>
              </div>
            </div>
          </ModalShell>
        )}
        {packageModalOpen && (
          <ModalShell
            title="Crear paquete"
            size="md"
            onClose={() => {
              setPackageModalOpen(false);
              setPackageError("");
            }}
            footer={
              <>
                <ActionButton onClick={() => setPackageModalOpen(false)}>Cancelar</ActionButton>
                <ActionButton variant="primary" disabled={packageSaving} onClick={guardarPaquete}>
                  {packageSaving ? "Guardando..." : "Guardar paquete"}
                </ActionButton>
              </>
            }
          >
            <div className="budget-v2-package-modal">
              <div className="budget-v2-create-apu-intro">
                <strong>{selectedContextRow?.descripcion || "Rama seleccionada"}</strong>
                <span>El paquete queda asociado a esta rama del arbol. Al liberarlo, se oculta del trabajo activo por defecto.</span>
              </div>
              <label className={labelClass}>Nombre *</label>
              <input
                className={fieldClass}
                value={packageForm.nombre}
                onChange={(event) => setPackageForm({ ...packageForm, nombre: event.target.value })}
                placeholder="Nombre del paquete"
                autoFocus
              />
              <label className={labelClass}>Observacion</label>
              <textarea
                className={fieldClass}
                rows={3}
                value={packageForm.observacion}
                onChange={(event) => setPackageForm({ ...packageForm, observacion: event.target.value })}
                placeholder="Nota opcional"
              />
              <ErrorBanner>{packageError}</ErrorBanner>
            </div>
          </ModalShell>
        )}
        {resourceModalOpen && (
          <ModalShell
            title=""
            size="form"
            onClose={() => {
              setResourceModalOpen(false);
              setResourceError("");
            }}
            footer={
              <>
                <ActionButton onClick={() => setResourceModalOpen(false)}>Cancelar</ActionButton>
                <ActionButton variant="primary" disabled={resourceSaving || resourceCodeLoading} onClick={guardarRecurso}>
                  {resourceSaving ? "Guardando..." : "Guardar recurso"}
                </ActionButton>
              </>
            }
          >
            <div className="budget-v2-resource-modal">
              <ModalCodeHeader title="Nuevo recurso desde Presupuestos" code={resourceForm.codigo} loading={resourceCodeLoading} />
              <div className="budget-v2-create-apu-intro">
                <strong>{selectedRow?.descripcion || selectedTreeRow?.descripcion || "Presupuesto activo"}</strong>
                <span>El recurso se crea en la base de recursos y queda disponible para usar en APUs sin salir de Presupuestos.</span>
              </div>

              <ModalFormGrid>
                <ModalFormFull>
                  <label className={labelClass}>Nombre *</label>
                  <input
                    className={fieldClass}
                    value={resourceForm.descripcion}
                    onChange={(event) => setResourceForm({ ...resourceForm, descripcion: event.target.value })}
                    placeholder="Nombre del recurso"
                    autoFocus
                  />
                </ModalFormFull>

                <div>
                  <label className={labelClass}>Categoria *</label>
                  <select
                    className={fieldClass}
                    value={resourceForm.categoria}
                    onChange={(event) => actualizarCategoriaRecurso(event.target.value)}
                  >
                    {(resourceClassifications.length ? resourceClassifications.map((item) => item.categoria) : CATEGORIAS_RECURSO).map((categoria) => (
                      <option key={categoria} value={categoria}>{ETIQUETAS_RECURSO[categoria] || categoria}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Subcategoria *</label>
                  <select
                    className={fieldClass}
                    value={resourceForm.subcategoria}
                    disabled={subcategoriasDe(resourceForm.categoria).length === 0}
                    onChange={(event) => actualizarSubcategoriaRecurso(event.target.value)}
                  >
                    {subcategoriasDe(resourceForm.categoria).length === 0 ? (
                      <option value="">Sin subcategorias</option>
                    ) : (
                      subcategoriasDe(resourceForm.categoria).map((subcategoria) => (
                        <option key={subcategoria.nombre} value={subcategoria.nombre}>{subcategoria.nombre}</option>
                      ))
                    )}
                  </select>
                </div>

                <ModalFormFull>
                  <label className={labelClass}>Familia</label>
                  <select
                    className={fieldClass}
                    value={resourceForm.familia}
                    onChange={(event) => setResourceForm({ ...resourceForm, familia: event.target.value })}
                  >
                    <option value="">Sin familia</option>
                    {(subcategoriasDe(resourceForm.categoria).find((item) => item.nombre === resourceForm.subcategoria)?.familias || []).map((familia) => (
                      <option key={familia} value={familia}>{familia}</option>
                    ))}
                  </select>
                </ModalFormFull>

                <div>
                  <label className={labelClass}>Unidad *</label>
                  <input
                    className={fieldClass}
                    value={resourceForm.unidad}
                    onChange={(event) => setResourceForm({ ...resourceForm, unidad: event.target.value })}
                    placeholder="Ej: m3, kg, gl, u"
                  />
                </div>

                <div>
                  <label className={labelClass}>Precio unitario *</label>
                  <input
                    className={fieldClass}
                    type="text"
                    inputMode="decimal"
                    value={resourceForm.precio_unitario}
                    onChange={(event) => setResourceForm({ ...resourceForm, precio_unitario: event.target.value })}
                    placeholder="0.0000"
                  />
                </div>

                <ModalFormFull>
                  <label className={labelClass}>Etiquetas controladas</label>
                  <div className="budget-v2-tag-picker">
                    {ETIQUETAS_RECURSO_CONTROLADAS.map((etiqueta) => {
                      const checked = resourceForm.etiquetas.includes(etiqueta);
                      return (
                        <label key={etiqueta}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...resourceForm.etiquetas, etiqueta]
                                : resourceForm.etiquetas.filter((item) => item !== etiqueta);
                              setResourceForm({ ...resourceForm, etiquetas: next });
                            }}
                          />
                          <span>{etiqueta}</span>
                        </label>
                      );
                    })}
                  </div>
                </ModalFormFull>
              </ModalFormGrid>
              <ErrorBanner>{resourceError}</ErrorBanner>
            </div>
          </ModalShell>
        )}
      </section>
    </div>
  );
}
