import { ActionButton, DataTable, EmptyState, MetricStrip, Panel, StatusBadge } from "../../../components/ui";

const MONEY = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" });

export function EstadoBadge({ estado }) {
  const meta = {
    BORRADOR: ["Borrador", "amber"],
    CONFIRMADO: ["Confirmado", "green"],
    ANULADO: ["Anulado", "gray"],
    ACTUALIZADO: ["Actualizado", "green"],
    DESACTUALIZADO: ["Desactualizado", "amber"],
    PENDIENTE_REVISION: ["Pendiente de revisión", "blue"],
    ERROR: ["Error", "red"],
  }[estado] || [estado || "Sin estado", "slate"];
  return <StatusBadge tone={meta[1]}>{meta[0]}</StatusBadge>;
}

function alertasDe(item) {
  const conteo = item.conteo_revision || {};
  return Number(conteo.DESACTUALIZADO || 0) + Number(conteo.PENDIENTE_REVISION || 0) + Number(conteo.ERROR || 0);
}

export default function SubcontratosLista({ items, filtros, setFiltros, onAbrir, onEditar, onAccion, onExportar, busyId, exportandoId }) {
  const activos = items.filter((item) => item.estado !== "ANULADO");
  const metricas = [
    { label: "Subcontratos", value: items.length, detail: "Total del proyecto", tone: "slate" },
    { label: "Borradores", value: items.filter((i) => i.estado === "BORRADOR").length, tone: "amber" },
    { label: "Confirmados", value: items.filter((i) => i.estado === "CONFIRMADO").length, tone: "green" },
    { label: "Anulados", value: items.filter((i) => i.estado === "ANULADO").length, tone: "slate" },
    { label: "Total activo", value: MONEY.format(activos.reduce((s, i) => s + Number(i.total_snapshot || 0), 0)), tone: "blue" },
    { label: "Alertas", value: items.reduce((s, i) => s + alertasDe(i), 0), detail: "Requieren atención", tone: "red" },
  ];
  const termino = filtros.busqueda.trim().toLocaleLowerCase("es");
  const visibles = items.filter((item) => {
    const coincideTexto = !termino || [item.codigo, item.nombre, item.contratista].some((v) => String(v || "").toLocaleLowerCase("es").includes(termino));
    const coincideEstado = filtros.estado === "TODOS" || item.estado === filtros.estado;
    const alertas = alertasDe(item);
    const coincideAlerta = filtros.alertas === "TODAS" || (filtros.alertas === "CON" ? alertas > 0 : alertas === 0);
    return coincideTexto && coincideEstado && coincideAlerta;
  });

  const columns = [
    { key: "codigo", label: "Código", render: (i) => <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onAbrir(i)}>{i.codigo}</button> },
    { key: "nombre", label: "Nombre", render: (i) => <div><strong>{i.nombre}</strong><div className="text-xs text-slate-500">{i.contratista || "Sin contratista"}</div></div> },
    { key: "estado", label: "Estado", render: (i) => <EstadoBadge estado={i.estado} /> },
    { key: "rubros", label: "Rubros", align: "right", render: (i) => i.cantidad_rubros || 0 },
    { key: "total", label: "Total", align: "right", render: (i) => MONEY.format(Number(i.total_snapshot || 0)) },
    { key: "alertas", label: "Alertas", align: "center", render: (i) => alertasDe(i) ? <StatusBadge tone="red">{alertasDe(i)} pendiente(s)</StatusBadge> : <span className="text-sm text-slate-500">Sin alertas</span> },
    { key: "fecha", label: "Actualizado", render: (i) => i.fecha_actualizacion ? DATE.format(new Date(i.fecha_actualizacion)) : "—" },
    { key: "acciones", label: "Acciones", render: (i) => <div className="flex flex-wrap gap-1">
      <ActionButton compact onClick={() => onAbrir(i)}>Abrir</ActionButton>
      <ActionButton compact disabled={exportandoId === i.id} onClick={() => onExportar(i)}>{exportandoId === i.id ? "Exportando..." : "Exportar Excel"}</ActionButton>
      {i.estado === "BORRADOR" && <ActionButton compact onClick={() => onEditar(i)}>Editar</ActionButton>}
      {i.estado === "BORRADOR" && <ActionButton compact variant="success" disabled={busyId === i.id} onClick={() => onAccion("confirmar", i)}>Confirmar</ActionButton>}
      {i.estado === "CONFIRMADO" && <ActionButton compact disabled={busyId === i.id} onClick={() => onAccion("reabrir", i)}>Reabrir</ActionButton>}
      {i.estado !== "ANULADO" && <ActionButton compact variant="danger" disabled={busyId === i.id} onClick={() => onAccion("anular", i)}>Anular</ActionButton>}
      {i.estado === "BORRADOR" && <ActionButton compact variant="danger" disabled={busyId === i.id} onClick={() => onAccion("eliminar", i)}>Eliminar</ActionButton>}
    </div> },
  ];

  return <div className="budget-v2-subcontracts-list">
    <MetricStrip items={metricas} />
    <Panel className="budget-v2-subcontracts-filter-panel">
      <div className="budget-v2-subcontracts-filters">
        <label><span className="form-label">Buscar</span><input className="form-field" value={filtros.busqueda} onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))} placeholder="Código, nombre o contratista" /></label>
        <label><span className="form-label">Estado</span><select className="form-field" value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}><option value="TODOS">Todos</option><option value="BORRADOR">Borradores</option><option value="CONFIRMADO">Confirmados</option><option value="ANULADO">Anulados</option></select></label>
        <label><span className="form-label">Alertas</span><select className="form-field" value={filtros.alertas} onChange={(e) => setFiltros((f) => ({ ...f, alertas: e.target.value }))}><option value="TODAS">Todas</option><option value="CON">Con alertas</option><option value="SIN">Sin alertas</option></select></label>
      </div>
    </Panel>
    {!items.length ? <EmptyState>No hay subcontratos registrados. Crea el primero para este proyecto.</EmptyState> : <DataTable columns={columns} rows={visibles} rowKey={(i) => i.id} emptyText="No hay subcontratos que coincidan con los filtros." />}
  </div>;
}
