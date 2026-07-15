import { useState } from "react";
import { ActionButton, DataTable, MetricStrip, Panel, StatusBadge } from "../../../components/ui";
import { EstadoBadge } from "./SubcontratosLista";

const MONEY = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const DATE = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" });

const PRESETS = {
  COMPLETO: "Completo", SOLO_MATERIALES: "Solo materiales", SOLO_MANO_OBRA: "Solo mano de obra",
  MANO_OBRA_EQUIPOS: "Mano de obra y equipos", MATERIALES_TRANSPORTE: "Materiales y transporte", PERSONALIZADO: "Personalizado",
};

export default function SubcontratoDetalle({ detalle, resumen, onVolver, onEditar, onAccion, onDistribuir, onVerificar, onRubroAccion, onActualizarTodos, onCargarMateriales, onExportar, busy, exportando }) {
  const [materiales, setMateriales] = useState(null);
  const [materialesLoading, setMaterialesLoading] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const conteo = resumen?.conteo_revision || {};
  const columns = [
    { key: "seleccion", label: "", render: (r) => <input type="checkbox" disabled={detalle.estado !== "BORRADOR"} aria-label={`Seleccionar ${r.nodo_descripcion_snapshot}`} checked={seleccionados.has(r.id)} onChange={() => setSeleccionados((actual) => { const next = new Set(actual); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next; })} /> },
    { key: "item", label: "Ítem", render: (r) => r.nodo_item_snapshot || "—" },
    { key: "rubro", label: "Rubro", render: (r) => <div><strong>{r.nodo_descripcion_snapshot}</strong><div className="text-xs text-slate-500">{r.apu_codigo_snapshot || "Sin código APU"} · {r.apu_nombre_snapshot}</div></div> },
    { key: "unidad", label: "Unidad", render: (r) => r.nodo_unidad_snapshot || "—" },
    { key: "metrado", label: "Metrado", align: "right", render: (r) => NUMBER.format(Number(r.metrado_snapshot || 0)) },
    { key: "preset", label: "Configuración", render: (r) => PRESETS[r.preset] || r.preset },
    { key: "pu", label: "PU seleccionado", align: "right", render: (r) => MONEY.format(Number(r.pu_seleccionado_snapshot || 0)) },
    { key: "total", label: "Total", align: "right", render: (r) => MONEY.format(Number(r.total_snapshot || 0)) },
    { key: "revision", label: "Revisión", render: (r) => <EstadoBadge estado={r.estado_revision} /> },
    { key: "acciones", label: "Acciones", render: (r) => detalle.estado !== "BORRADOR" ? <span className="text-xs text-slate-500">Solo lectura</span> : <div className="flex flex-wrap gap-1"><ActionButton compact onClick={() => onRubroAccion("configurar", r)}>Configurar</ActionButton>{r.estado_revision === "DESACTUALIZADO" && <ActionButton compact onClick={() => onRubroAccion("actualizar", r)}>Actualizar</ActionButton>}{r.estado_revision === "PENDIENTE_REVISION" && <ActionButton compact variant="primary" onClick={() => onRubroAccion("revisar", r)}>Revisar APU</ActionButton>}<ActionButton compact variant="danger" onClick={() => onRubroAccion("retirar", r)}>Retirar</ActionButton></div> },
  ];
  const metricas = [
    { label: "Rubros", value: resumen?.cantidad_rubros ?? detalle.rubros.length, tone: "slate" },
    { label: "Total", value: MONEY.format(Number(resumen?.total || 0)), tone: "blue" },
    { label: "Actualizados", value: conteo.ACTUALIZADO || 0, tone: "green" },
    { label: "Desactualizados", value: conteo.DESACTUALIZADO || 0, tone: "amber" },
    { label: "Pendientes", value: conteo.PENDIENTE_REVISION || 0, tone: "blue" },
    { label: "Errores", value: conteo.ERROR || 0, tone: "red" },
  ];

  return <div className="budget-v2-subcontract-detail">
    <div className="budget-v2-subcontract-detail-toolbar">
      <ActionButton onClick={onVolver}>Volver a la lista</ActionButton>
      <div className="budget-v2-subcontract-detail-actions">
        <ActionButton onClick={() => onExportar(detalle)} disabled={exportando}>{exportando ? "Exportando..." : "Exportar Excel"}</ActionButton>
        <ActionButton onClick={onVerificar} disabled={busy || detalle.estado === "ANULADO"}>Verificar cambios</ActionButton>
        {detalle.estado === "BORRADOR" && <ActionButton variant="primary" onClick={onDistribuir}>Distribuir rubros</ActionButton>}
        {detalle.estado === "BORRADOR" && Number(conteo.DESACTUALIZADO || 0) > 0 && <ActionButton onClick={onActualizarTodos} disabled={busy}>Actualizar desactualizados</ActionButton>}
        {detalle.estado === "BORRADOR" && <ActionButton onClick={onEditar}>Editar cabecera</ActionButton>}
        {detalle.estado === "BORRADOR" && <ActionButton variant="success" disabled={busy} onClick={() => onAccion("confirmar", detalle)}>Confirmar</ActionButton>}
        {detalle.estado === "CONFIRMADO" && <ActionButton disabled={busy} onClick={() => onAccion("reabrir", detalle)}>Reabrir</ActionButton>}
        {detalle.estado !== "ANULADO" && <ActionButton variant="danger" disabled={busy} onClick={() => onAccion("anular", detalle)}>Anular</ActionButton>}
        {detalle.estado === "BORRADOR" && <ActionButton variant="danger" disabled={busy} onClick={() => onAccion("eliminar", detalle)}>Eliminar</ActionButton>}
      </div>
    </div>
    <Panel className="budget-v2-subcontract-identity">
      <div className="budget-v2-subcontract-identity-head">
        <div><div className="text-sm font-semibold text-blue-700">{detalle.codigo}</div><h2 className="text-xl font-bold text-slate-900">{detalle.nombre}</h2><p className="mt-1 text-sm text-slate-600">{detalle.contratista || "Sin contratista"}</p></div>
        <EstadoBadge estado={detalle.estado} />
      </div>
      {detalle.descripcion && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{detalle.descripcion}</p>}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-500">Creado</dt><dd>{DATE.format(new Date(detalle.fecha_creacion))}</dd></div>
        <div><dt className="text-slate-500">Actualizado</dt><dd>{DATE.format(new Date(detalle.fecha_actualizacion))}</dd></div>
        <div><dt className="text-slate-500">Última confirmación</dt><dd>{detalle.fecha_confirmacion ? DATE.format(new Date(detalle.fecha_confirmacion)) : "—"}</dd></div>
        <div><dt className="text-slate-500">Anulación</dt><dd>{detalle.fecha_anulacion ? DATE.format(new Date(detalle.fecha_anulacion)) : "—"}</dd></div>
      </dl>
    </Panel>
    <MetricStrip items={metricas} />
    <Panel className="budget-v2-subcontract-section">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Asignaciones</h3><StatusBadge tone={detalle.estado === "BORRADOR" ? "blue" : "slate"}>{detalle.estado === "BORRADOR" ? "Edición habilitada" : "Solo lectura"}</StatusBadge></div>
      {detalle.estado === "BORRADOR" && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 p-2"><span className="text-sm"><strong>{seleccionados.size} seleccionados</strong></span><div className="flex flex-wrap gap-1"><ActionButton compact onClick={() => setSeleccionados(new Set((detalle.rubros || []).map((r) => r.id)))}>Seleccionar todos</ActionButton><ActionButton compact onClick={() => setSeleccionados(new Set())}>Limpiar</ActionButton><ActionButton compact disabled={!seleccionados.size} onClick={() => onRubroAccion("configurar_masivo", (detalle.rubros || []).filter((r) => seleccionados.has(r.id)))}>Aplicar preset</ActionButton><ActionButton compact disabled={!seleccionados.size} onClick={() => onRubroAccion("actualizar_masivo", (detalle.rubros || []).filter((r) => seleccionados.has(r.id)))}>Actualizar</ActionButton><ActionButton compact variant="danger" disabled={!seleccionados.size} onClick={() => onRubroAccion("retirar_masivo", (detalle.rubros || []).filter((r) => seleccionados.has(r.id)))}>Retirar</ActionButton></div></div>}
      <DataTable columns={columns} rows={detalle.rubros || []} rowKey={(r) => r.id} emptyText="Este subcontrato todavía no tiene rubros asignados." />
    </Panel>
    <Panel className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900">Materiales a suministrar por la contratante</h3><p className="text-xs text-slate-500">Consolidado exclusivo de snapshots.</p></div>{materiales === null && <ActionButton disabled={materialesLoading} onClick={async () => { setMaterialesLoading(true); const data = await onCargarMateriales(); setMateriales(data || []); setMaterialesLoading(false); }}>{materialesLoading ? "Cargando..." : "Cargar materiales"}</ActionButton>}</div>{materiales !== null && <DataTable columns={[{ key: "codigo", label: "Código", render: (m) => m.codigo || "—" }, { key: "descripcion", label: "Descripción" }, { key: "unidad", label: "Unidad", render: (m) => m.unidad || "—" }, { key: "cantidad", label: "Cantidad", align: "right", render: (m) => NUMBER.format(Number(m.cantidad_total || 0)) }, { key: "rubros", label: "Rubros de origen", align: "right", render: (m) => m.cantidad_rubros_origen }]} rows={materiales} rowKey={(m) => `${m.codigo}-${m.descripcion}-${m.unidad}`} emptyText="Todos los materiales están incluidos en el subcontrato." />}</Panel>
    <Panel className="p-4"><h3 className="font-semibold text-slate-900">Resumen del alcance</h3><div className="mt-3 grid gap-4 md:grid-cols-3"><div><strong className="text-sm">Por preset</strong><ul className="mt-1 text-sm text-slate-600">{Object.entries(resumen?.conteo_preset || {}).map(([k, v]) => <li key={k}>{PRESETS[k] || k}: {v}</li>)}</ul></div><div><strong className="text-sm">Componentes monetarios</strong><ul className="mt-1 text-sm text-slate-600">{Object.entries(resumen?.componentes_monetarios || {}).map(([k, v]) => <li key={k}>{k.replaceAll("_snapshot", "").replaceAll("_", " ")}: {MONEY.format(Number(v || 0))}</li>)}</ul></div><div><strong className="text-sm">Materiales externos</strong><p className="mt-1 text-sm text-slate-600">Cantidad: {NUMBER.format(Number(resumen?.cantidad_materiales_suministrar || 0))}</p><p className="text-sm text-slate-600">Recursos consolidados: {resumen?.recursos_materiales_consolidados || 0}</p></div></div></Panel>
  </div>;
}
