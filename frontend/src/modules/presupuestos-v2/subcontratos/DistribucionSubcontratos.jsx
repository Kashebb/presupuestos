import { useEffect, useMemo, useState } from "react";
import { ActionButton, ErrorBanner, Panel, StatusBadge } from "../../../components/ui";
import PresupuestoTree from "../components/PresupuestoTree";
import { descendantsOf, visibleContainers } from "../logic/tree";
import ConfiguracionAlcancePanel from "./ConfiguracionAlcancePanel";
import { CATEGORIAS_COMPLETAS, configuracionPayload, PRESETS_SUBCONTRATO } from "./subcontratosConfig";
import { describirErrorSubcontrato, subcontratosApi } from "./subcontratosApi";

const NUMBER = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const PAGE_SIZE = 100;

function clasificar(rubro, actualId) {
  if (!rubro.apu_id) return "SIN_APU";
  if (!rubro.subcontrato_activo) return "DISPONIBLE";
  return rubro.subcontrato_activo.id === actualId ? "ACTUAL" : "OTRO";
}

function EstadoDistribucion({ rubro, actualId }) {
  const tipo = clasificar(rubro, actualId);
  if (tipo === "SIN_APU") return <StatusBadge tone="red">Sin APU</StatusBadge>;
  if (tipo === "DISPONIBLE") return <StatusBadge tone="green">Disponible</StatusBadge>;
  if (tipo === "ACTUAL") return <StatusBadge tone="blue">Asignado al actual</StatusBadge>;
  return <StatusBadge tone="amber">Asignado a otro</StatusBadge>;
}

export default function DistribucionSubcontratos({ proyectoId, subcontratos, subcontratoActual = null, budgetRows = [], onClose, onChanged, onIrVinculacion }) {
  const [rubros, setRubros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [destinoId, setDestinoId] = useState(subcontratoActual?.id || "");
  const [preset, setPreset] = useState("COMPLETO");
  const [categorias, setCategorias] = useState(CATEGORIAS_COMPLETAS);
  const [configOpen, setConfigOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [ramaId, setRamaId] = useState("all");
  const [ramasColapsadas, setRamasColapsadas] = useState(new Set());
  const [filtros, setFiltros] = useState({ busqueda: "", estado: "TODOS", preset: "TODOS", unidad: "TODAS" });

  const cargar = async (signal) => {
    setLoading(true); setError("");
    try { const data = await subcontratosApi.distribucion(proyectoId, signal); setRubros(Array.isArray(data) ? data : []); }
    catch (err) { if (err.name !== "AbortError") setError(describirErrorSubcontrato(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  };
  useEffect(() => { const controller = new AbortController(); cargar(controller.signal); return () => controller.abort(); }, [proyectoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const borradores = subcontratos.filter((s) => s.estado === "BORRADOR");
  const ramas = useMemo(() => visibleContainers(budgetRows, ramasColapsadas), [budgetRows, ramasColapsadas]);
  const idsRama = useMemo(() => {
    if (ramaId === "all") return null;
    const uiIds = descendantsOf(budgetRows, ramaId);
    return new Set(budgetRows.filter((r) => uiIds.has(r.id)).map((r) => Number(r.sourceId)));
  }, [budgetRows, ramaId]);
  const unidades = useMemo(() => [...new Set(rubros.map((r) => r.unidad).filter(Boolean))].sort(), [rubros]);
  const visibles = useMemo(() => {
    const q = filtros.busqueda.trim().toLocaleLowerCase("es");
    return rubros.filter((r) => {
      const estado = clasificar(r, subcontratoActual?.id);
      const revision = r.estado_revision;
      const texto = [r.item, r.descripcion, r.apu_id].join(" ").toLocaleLowerCase("es");
      const estadoOk = filtros.estado === "TODOS" || estado === filtros.estado || revision === filtros.estado;
      return (!q || texto.includes(q)) && estadoOk && (filtros.preset === "TODOS" || r.configuracion?.preset === filtros.preset) &&
        (filtros.unidad === "TODAS" || r.unidad === filtros.unidad) && (!idsRama || idsRama.has(Number(r.nodo_id)));
    });
  }, [filtros, idsRama, rubros, subcontratoActual?.id]);
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginaRows = visibles.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE);
  const asignables = visibles.filter((r) => clasificar(r, subcontratoActual?.id) === "DISPONIBLE");
  const seleccion = rubros.filter((r) => seleccionados.has(r.nodo_id));
  const validos = seleccion.filter((r) => clasificar(r, subcontratoActual?.id) === "DISPONIBLE");
  const toggle = (r) => {
    if (clasificar(r, subcontratoActual?.id) !== "DISPONIBLE") return;
    setSeleccionados((actual) => { const next = new Set(actual); if (next.has(r.nodo_id)) next.delete(r.nodo_id); else next.add(r.nodo_id); return next; });
  };
  const seleccionarVisibles = () => setSeleccionados(new Set(asignables.map((r) => r.nodo_id)));
  const limpiar = () => { setFiltros({ busqueda: "", estado: "TODOS", preset: "TODOS", unidad: "TODAS" }); setRamaId("all"); setPagina(1); };

  const asignar = async () => {
    if (!destinoId || !validos.length) return;
    setBusy(true); setError("");
    try {
      const data = await subcontratosApi.asignarRubros(destinoId, { nodo_ids: validos.map((r) => r.nodo_id), ...configuracionPayload(preset, categorias) });
      setResultado(data.resultados || []); setConfigOpen(false);
      const exitos = new Set((data.resultados || []).filter((r) => r.resultado === "asignado").map((r) => r.nodo_id));
      setSeleccionados((actual) => new Set([...actual].filter((id) => !exitos.has(id))));
      await cargar(); await onChanged?.(Number(destinoId));
    } catch (err) { setError(describirErrorSubcontrato(err)); }
    finally { setBusy(false); }
  };
  const conteosResultado = useMemo(() => (resultado || []).reduce((acc, r) => { acc[r.resultado] = (acc[r.resultado] || 0) + 1; return acc; }, {}), [resultado]);

  return <div className="space-y-3 budget-v2-subcontracts-distribution">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-bold">{subcontratoActual ? `Distribuir rubros · ${subcontratoActual.codigo}` : "Distribución general de rubros"}</h2><p className="text-sm text-slate-500">{subcontratoActual ? "El destino está fijado al borrador actual." : "Selecciona rubros y un borrador de destino."}</p></div><ActionButton onClick={onClose}>Cerrar distribución</ActionButton></div>
    <ErrorBanner>{error}</ErrorBanner>
    {resultado && <Panel className="p-3"><strong>Resultado masivo</strong><div className="mt-2 flex flex-wrap gap-2"><StatusBadge tone="green">Asignados: {conteosResultado.asignado || 0}</StatusBadge><StatusBadge tone="red">Sin APU: {conteosResultado.sin_apu || 0}</StatusBadge><StatusBadge tone="amber">Bloqueados: {conteosResultado.bloqueado || 0}</StatusBadge><StatusBadge tone="gray">No operativos: {conteosResultado.no_operativo || 0}</StatusBadge><StatusBadge tone="red">Errores: {conteosResultado.error || 0}</StatusBadge></div>{resultado.some((r) => r.resultado !== "asignado") && <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold">Ver rechazados</summary><ul className="mt-1 list-disc pl-5">{resultado.filter((r) => r.resultado !== "asignado").map((r) => <li key={r.nodo_id}>Nodo {r.nodo_id}: {r.resultado} {r.detalle ? `· ${r.detalle}` : ""}</li>)}</ul></details>}</Panel>}
    <div className="grid gap-3 budget-v2-subcontracts-distribution-grid xl:grid-cols-[230px_minmax(0,1fr)_320px]">
      <PresupuestoTree
        rows={ramas}
        selectedTreeId={ramaId}
        onSelect={(id) => { setRamaId(id); setPagina(1); }}
        collapsedTreeIds={ramasColapsadas}
        onToggleCollapse={(id) => setRamasColapsadas((actual) => {
          const siguiente = new Set(actual);
          if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
          return siguiente;
        })}
        mode="desglose"
      />
      <div className="min-w-0 space-y-3">
        <Panel className="p-3"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5"><input className="form-field" placeholder="Ítem, rubro o APU" value={filtros.busqueda} onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))} /><select className="form-field" value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}><option value="TODOS">Todos</option><option value="DISPONIBLE">Disponibles</option><option value="ACTUAL">Asignados al actual</option><option value="OTRO">Asignados a otros</option><option value="SIN_APU">Sin APU</option><option value="DESACTUALIZADO">Desactualizados</option><option value="PENDIENTE_REVISION">Pendientes de revisión</option><option value="ERROR">Error</option></select><select className="form-field" value={filtros.preset} onChange={(e) => setFiltros((f) => ({ ...f, preset: e.target.value }))}><option value="TODOS">Todos los presets</option>{PRESETS_SUBCONTRATO.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select><select className="form-field" value={filtros.unidad} onChange={(e) => setFiltros((f) => ({ ...f, unidad: e.target.value }))}><option value="TODAS">Todas las unidades</option>{unidades.map((u) => <option key={u}>{u}</option>)}</select><ActionButton onClick={limpiar}>Limpiar filtros</ActionButton></div></Panel>
        <Panel className="p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm"><strong>{seleccionados.size} seleccionados</strong> · {validos.length} válidos · {seleccion.filter((r) => !r.apu_id).length} sin APU · {seleccion.filter((r) => clasificar(r, subcontratoActual?.id) === "OTRO").length} bloqueados</span><div className="flex gap-2"><ActionButton compact onClick={seleccionarVisibles}>Seleccionar filtrados válidos</ActionButton><ActionButton compact onClick={() => setSeleccionados(new Set())}>Limpiar selección</ActionButton><ActionButton compact variant="primary" disabled={!validos.length || (!subcontratoActual && !destinoId)} onClick={() => setConfigOpen(true)}>Asignar</ActionButton></div></div>
          <div className="max-h-[58vh] overflow-auto"><table className="data-table min-w-[1050px]"><thead className="sticky top-0 bg-white"><tr><th><input type="checkbox" aria-label="Seleccionar todos los rubros visibles" checked={asignables.length > 0 && asignables.every((r) => seleccionados.has(r.nodo_id))} onChange={(e) => e.target.checked ? seleccionarVisibles() : setSeleccionados(new Set())} /></th><th>Ítem</th><th>Descripción</th><th>Unidad</th><th>Metrado</th><th>APU</th><th>Configuración</th><th>Estado</th><th>Subcontrato activo</th><th>Acciones</th></tr></thead><tbody>{paginaRows.map((r) => { const tipo = clasificar(r, subcontratoActual?.id); return <tr key={r.nodo_id}><td><input type="checkbox" aria-label={`Seleccionar ${r.descripcion}`} disabled={tipo !== "DISPONIBLE"} checked={seleccionados.has(r.nodo_id)} onChange={() => toggle(r)} /></td><td>{r.item || "—"}</td><td><strong>{r.descripcion}</strong>{r.razon_bloqueo && <div className="text-xs text-red-700">{r.razon_bloqueo}</div>}</td><td>{r.unidad || "—"}</td><td className="text-right tabular-nums">{NUMBER.format(Number(r.metrado || 0))}</td><td>{r.apu_id ? `APU #${r.apu_id}` : "Sin APU"}</td><td>{r.configuracion?.preset || "—"}</td><td><EstadoDistribucion rubro={r} actualId={subcontratoActual?.id} />{r.estado_revision && <div className="mt-1 text-xs">{r.estado_revision.replaceAll("_", " ")}</div>}</td><td>{r.subcontrato_activo ? `${r.subcontrato_activo.codigo} · ${r.subcontrato_activo.nombre}` : "—"}</td><td>{tipo === "DISPONIBLE" ? <ActionButton compact onClick={() => { setSeleccionados(new Set([r.nodo_id])); setConfigOpen(true); }}>Asignar</ActionButton> : tipo === "SIN_APU" ? <ActionButton compact onClick={() => onIrVinculacion?.(r.nodo_id)}>Ir a Vinculación</ActionButton> : <span className="text-xs text-slate-500">Solo lectura</span>}</td></tr>; })}{!paginaRows.length && <tr><td colSpan="10" className="p-6 text-center text-slate-500">{loading ? "Cargando rubros..." : "No hay rubros con estos filtros."}</td></tr>}</tbody></table></div>
          <div className="mt-2 flex items-center justify-between text-sm"><span>{visibles.length} resultado(s) · página {paginaSegura} de {totalPaginas}</span><div className="flex gap-1"><ActionButton compact disabled={paginaSegura <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>Anterior</ActionButton><ActionButton compact disabled={paginaSegura >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</ActionButton></div></div>
        </Panel>
      </div>
      <div>{!subcontratoActual && <Panel className="mb-3 p-3"><label className="form-label">Subcontrato destino</label><select className="form-field" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}><option value="">Seleccionar borrador</option>{borradores.map((s) => <option key={s.id} value={s.id}>{s.codigo} · {s.nombre}</option>)}</select>{!borradores.length && <p className="mt-2 text-sm text-red-700">No hay borradores disponibles.</p>}</Panel>}{configOpen ? <ConfiguracionAlcancePanel preset={preset} setPreset={setPreset} categorias={categorias} setCategorias={setCategorias} cantidad={validos.length} busy={busy} onAplicar={asignar} /> : <Panel className="p-4 text-sm text-slate-600">Selecciona rubros disponibles y abre <strong>Asignar</strong> para configurar el alcance. Los importes se calcularán exclusivamente en el backend.</Panel>}</div>
    </div>
  </div>;
}
