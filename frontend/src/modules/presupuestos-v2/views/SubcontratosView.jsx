import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton, ErrorBanner, LoadingState, ModalFormFull, ModalFormGrid, ModalShell, PageHeader, fieldClass, labelClass } from "../../../components/ui";
import ConfiguracionAlcancePanel from "../subcontratos/ConfiguracionAlcancePanel";
import DistribucionSubcontratos from "../subcontratos/DistribucionSubcontratos";
import SubcontratoDetalle from "../subcontratos/SubcontratoDetalle";
import SubcontratosLista from "../subcontratos/SubcontratosLista";
import { CATEGORIAS_COMPLETAS, configuracionPayload } from "../subcontratos/subcontratosConfig";
import { describirErrorSubcontrato, subcontratosApi } from "../subcontratos/subcontratosApi";

const FORM_VACIO = { nombre: "", contratista: "", descripcion: "" };

export default function SubcontratosView({ selectedProjectId, projectName, budgetRows = [], onVisibleCountChange, onIrVinculacion }) {
  const [modo, setModo] = useState("lista");
  const [items, setItems] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [filtros, setFiltros] = useState({ busqueda: "", estado: "TODOS", alertas: "TODAS" });
  const [formModal, setFormModal] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [confirmacion, setConfirmacion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [exportandoId, setExportandoId] = useState(null);
  const [rubroModal, setRubroModal] = useState(null);
  const [presetRubro, setPresetRubro] = useState("COMPLETO");
  const [categoriasRubro, setCategoriasRubro] = useState(CATEGORIAS_COMPLETAS);
  const nombreRef = useRef(null);
  const projectRef = useRef(selectedProjectId);

  const cargarLista = useCallback(async (signal) => {
    if (!selectedProjectId) return;
    setLoading(true); setError("");
    try { const data = await subcontratosApi.listar(selectedProjectId, signal); setItems(Array.isArray(data) ? data : []); }
    catch (err) { if (err.name !== "AbortError") setError(describirErrorSubcontrato(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [selectedProjectId]);

  useEffect(() => { projectRef.current = selectedProjectId; const controller = new AbortController(); setModo("lista"); setDetalle(null); setResumen(null); setStatus(""); setError(""); cargarLista(controller.signal); return () => controller.abort(); }, [cargarLista, selectedProjectId]);
  useEffect(() => { onVisibleCountChange?.(modo === "lista" ? items.length : detalle?.rubros?.length || 0); }, [detalle, items.length, modo, onVisibleCountChange]);
  useEffect(() => { if (formModal) window.setTimeout(() => nombreRef.current?.focus(), 0); }, [formModal]);

  const abrirDetalle = async (item, conservarStatus = false) => {
    const projectAtStart = selectedProjectId; setLoading(true); setError(""); if (!conservarStatus) setStatus("");
    try { const [data, summary] = await Promise.all([subcontratosApi.obtener(item.id), subcontratosApi.resumen(item.id)]); if (projectRef.current !== projectAtStart) return; setDetalle(data); setResumen(summary); setModo("detalle"); }
    catch (err) { setError(describirErrorSubcontrato(err)); } finally { setLoading(false); }
  };
  const refrescarDetalle = async () => { if (!detalle?.id) return; const [data, summary] = await Promise.all([subcontratosApi.obtener(detalle.id), subcontratosApi.resumen(detalle.id)]); setDetalle(data); setResumen(summary); };
  const abrirFormulario = (item = null) => { setError(""); setFormModal(item || "nuevo"); setForm(item ? { nombre: item.nombre || "", contratista: item.contratista || "", descripcion: item.descripcion || "" } : FORM_VACIO); };
  const guardar = async () => {
    if (!form.nombre.trim()) { setError("El nombre del subcontrato es obligatorio."); return; }
    setSaving(true); setError(""); const payload = { nombre: form.nombre.trim(), contratista: form.contratista.trim() || null, descripcion: form.descripcion.trim() || null };
    try { const nuevo = formModal === "nuevo"; const guardado = nuevo ? await subcontratosApi.crear(selectedProjectId, payload) : await subcontratosApi.editar(formModal.id, payload); setFormModal(null); setStatus(nuevo ? `Subcontrato ${guardado.codigo} creado.` : "Cabecera actualizada."); await cargarLista(); await abrirDetalle(guardado, true); }
    catch (err) { setError(describirErrorSubcontrato(err)); } finally { setSaving(false); }
  };

  const solicitarAccion = (accion, item) => {
    const textos = { confirmar: ["Confirmar subcontrato", "Se bloqueará la edición y se conservarán los snapshots actuales."], reabrir: ["Reabrir subcontrato", "Volverá a borrador y conservará la última confirmación."], anular: ["Anular subcontrato", "Se conservará el historial en solo lectura."], eliminar: ["Eliminar borrador", "Se eliminarán la cabecera, asignaciones y snapshots."], retirar_rubro: ["Retirar rubro", "La asignación y sus snapshots se eliminarán del borrador."], retirar_masivo: ["Retirar rubros seleccionados", "Las asignaciones y snapshots seleccionados se eliminarán del borrador."] };
    setConfirmacion({ accion, item, titulo: textos[accion][0], mensaje: textos[accion][1] });
  };
  const ejecutarAccion = async () => {
    const { accion, item } = confirmacion; setBusyId(item.id); setSaving(true); setError("");
    try { if (accion === "retirar_rubro") await subcontratosApi.retirarRubro(detalle.id, item.id); else if (accion === "retirar_masivo") await Promise.all(item.map((r) => subcontratosApi.retirarRubro(detalle.id, r.id))); else await subcontratosApi[accion](item.id); setConfirmacion(null); setStatus({ confirmar: "Subcontrato confirmado.", reabrir: "Subcontrato reabierto.", anular: "Subcontrato anulado.", eliminar: "Borrador eliminado.", retirar_rubro: "Rubro retirado.", retirar_masivo: "Rubros seleccionados retirados." }[accion]); await cargarLista(); if (accion === "eliminar") { setModo("lista"); setDetalle(null); setResumen(null); } else if (accion === "retirar_rubro" || accion === "retirar_masivo") await refrescarDetalle(); else if (modo === "detalle") await abrirDetalle(item, true); }
    catch (err) { setConfirmacion(null); setError(describirErrorSubcontrato(err)); } finally { setBusyId(null); setSaving(false); }
  };

  const verificar = async () => { setSaving(true); setError(""); try { const data = await subcontratosApi.verificarCambios(detalle.id); const c = (data.resultados || []).reduce((a, r) => ({ ...a, [r.estado]: (a[r.estado] || 0) + 1 }), {}); setStatus(`Verificación: ${c.ACTUALIZADO || 0} actualizados, ${c.DESACTUALIZADO || 0} desactualizados, ${c.PENDIENTE_REVISION || 0} pendientes, ${c.ERROR || 0} errores.`); await refrescarDetalle(); await cargarLista(); } catch (err) { setError(describirErrorSubcontrato(err)); } finally { setSaving(false); } };
  const actualizar = async (asignacionIds, todos = false) => { setSaving(true); setError(""); try { const data = await subcontratosApi.actualizarRubros(detalle.id, todos ? { todos_desactualizados: true } : { asignacion_ids: asignacionIds }); const ok = (data.resultados || []).filter((r) => r.resultado === "actualizado").length; setStatus(`Snapshots actualizados: ${ok}.`); await refrescarDetalle(); await cargarLista(); } catch (err) { setError(describirErrorSubcontrato(err)); } finally { setSaving(false); } };
  const abrirAccionRubro = (accion, rubro) => { if (accion === "retirar") { solicitarAccion("retirar_rubro", rubro); return; } if (accion === "retirar_masivo") { solicitarAccion("retirar_masivo", rubro); return; } if (accion === "actualizar") { actualizar([rubro.id]); return; } if (accion === "actualizar_masivo") { actualizar(rubro.map((r) => r.id)); return; } const base = Array.isArray(rubro) ? rubro[0] : rubro; setPresetRubro(base.preset || "COMPLETO"); setCategoriasRubro({ incluye_materiales: base.incluye_materiales, incluye_mano_obra: base.incluye_mano_obra, incluye_equipos: base.incluye_equipos, incluye_transporte: base.incluye_transporte }); setRubroModal({ accion, rubro: base, rubros: Array.isArray(rubro) ? rubro : null }); };
  const aplicarRubro = async () => { setSaving(true); setError(""); try { const payload = configuracionPayload(presetRubro, categoriasRubro); if (rubroModal.accion === "revisar") await subcontratosApi.revisarRubro(detalle.id, rubroModal.rubro.id, { confirmar_cambio_apu: true, ...payload }); else if (rubroModal.rubros) await Promise.all(rubroModal.rubros.map((r) => subcontratosApi.configurarRubro(detalle.id, r.id, payload))); else await subcontratosApi.configurarRubro(detalle.id, rubroModal.rubro.id, payload); setStatus(rubroModal.accion === "revisar" ? "Cambio de APU revisado y snapshot regenerado." : `Configuración actualizada en ${rubroModal.rubros?.length || 1} rubro(s).`); setRubroModal(null); await refrescarDetalle(); await cargarLista(); } catch (err) { setError(describirErrorSubcontrato(err)); } finally { setSaving(false); } };
  const cargarMateriales = async () => { try { return await subcontratosApi.materiales(detalle.id); } catch (err) { setError(describirErrorSubcontrato(err)); return []; } };
  const exportarExcel = async (item) => {
    const aviso = item.estado === "BORRADOR" ? "Este documento se exportará marcado como BORRADOR. ¿Deseas continuar?" : item.estado === "ANULADO" ? "Este documento se exportará como documento histórico ANULADO. ¿Deseas continuar?" : null;
    if (aviso && !window.confirm(aviso)) return;
    setExportandoId(item.id); setError(""); setStatus("");
    try {
      const { blob, filename } = await subcontratosApi.exportarExcel(item.id);
      const url = URL.createObjectURL(blob); const enlace = document.createElement("a");
      enlace.href = url; enlace.download = filename; document.body.appendChild(enlace); enlace.click(); enlace.remove(); URL.revokeObjectURL(url);
      setStatus(`Excel ${filename} descargado.`);
    } catch (err) { setError(describirErrorSubcontrato(err)); }
    finally { setExportandoId(null); }
  };
  const distribucionCambiada = async (destinoId) => { await cargarLista(); if (detalle?.id === destinoId) await refrescarDetalle(); };

  const vistaPrevia = rubroModal ? [["Materiales", `$${Number(rubroModal.rubro.pu_materiales_snapshot || 0).toFixed(4)}`], ["Mano de obra", `$${Number(rubroModal.rubro.pu_mano_obra_snapshot || 0).toFixed(4)}`], ["Herramientas menores", `$${Number(rubroModal.rubro.pu_herramientas_snapshot || 0).toFixed(4)}`], ["Equipos sin H.M.", `$${Number(rubroModal.rubro.pu_equipos_snapshot || 0).toFixed(4)}`], ["Transporte", `$${Number(rubroModal.rubro.pu_transporte_snapshot || 0).toFixed(4)}`], ["PU seleccionado", `$${Number(rubroModal.rubro.pu_seleccionado_snapshot || 0).toFixed(4)}`], ["Metrado", Number(rubroModal.rubro.metrado_snapshot || 0).toFixed(4)], ["Total", `$${Number(rubroModal.rubro.total_snapshot || 0).toFixed(4)}`]] : null;

  return <section className="budget-v2-subcontracts">
    <PageHeader title="Subcontratos" subtitle="Cabeceras, estados, distribución e importes históricos del proyecto activo." meta={projectName || "Proyecto seleccionado"} actions={modo === "lista" ? <div className="flex gap-2"><ActionButton onClick={() => setModo("distribucion_general")}>Distribución general</ActionButton><ActionButton variant="primary" onClick={() => abrirFormulario()}>Nuevo subcontrato</ActionButton></div> : null} />
    {status && <div className="budget-v2-action-panel"><span className="budget-v2-action-status">{status}</span></div>}<ErrorBanner>{error}</ErrorBanner>
    {modo === "distribucion_general" || modo === "distribucion_detalle" ? <DistribucionSubcontratos proyectoId={selectedProjectId} subcontratos={items} subcontratoActual={modo === "distribucion_detalle" ? detalle : null} budgetRows={budgetRows} onClose={() => setModo(detalle ? "detalle" : "lista")} onChanged={distribucionCambiada} onIrVinculacion={onIrVinculacion} /> : loading && !detalle ? <LoadingState>Cargando subcontratos...</LoadingState> : modo === "lista" ? <SubcontratosLista items={items} filtros={filtros} setFiltros={setFiltros} onAbrir={abrirDetalle} onEditar={abrirFormulario} onAccion={solicitarAccion} onExportar={exportarExcel} busyId={busyId} exportandoId={exportandoId} /> : <SubcontratoDetalle detalle={detalle} resumen={resumen} onVolver={() => { setModo("lista"); setError(""); }} onEditar={() => abrirFormulario(detalle)} onAccion={solicitarAccion} onDistribuir={() => setModo("distribucion_detalle")} onVerificar={verificar} onActualizarTodos={() => actualizar(null, true)} onRubroAccion={abrirAccionRubro} onCargarMateriales={cargarMateriales} onExportar={exportarExcel} exportando={exportandoId === detalle.id} busy={saving} />}

    {formModal && <ModalShell title={formModal === "nuevo" ? "Nuevo subcontrato" : `Editar ${formModal.codigo}`} size="form" onClose={() => !saving && setFormModal(null)} footer={<><ActionButton disabled={saving} onClick={() => setFormModal(null)}>Cancelar</ActionButton><ActionButton variant="primary" disabled={saving} onClick={guardar}>{saving ? "Guardando..." : "Guardar"}</ActionButton></>}><ModalFormGrid>{formModal !== "nuevo" && <ModalFormFull><label className={labelClass}>Código</label><input className={fieldClass} value={formModal.codigo} readOnly /></ModalFormFull>}<ModalFormFull><label className={labelClass} htmlFor="subcontrato-nombre">Nombre *</label><input ref={nombreRef} id="subcontrato-nombre" className={fieldClass} value={form.nombre} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></ModalFormFull><ModalFormFull><label className={labelClass} htmlFor="subcontrato-contratista">Contratista</label><input id="subcontrato-contratista" className={fieldClass} value={form.contratista} onChange={(e) => setForm((f) => ({ ...f, contratista: e.target.value }))} /></ModalFormFull><ModalFormFull><label className={labelClass} htmlFor="subcontrato-descripcion">Descripción</label><textarea id="subcontrato-descripcion" className={fieldClass} rows={4} value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} /></ModalFormFull></ModalFormGrid></ModalShell>}
    {confirmacion && <ModalShell title={confirmacion.titulo} size="sm" onClose={() => !saving && setConfirmacion(null)} footer={<><ActionButton disabled={saving} onClick={() => setConfirmacion(null)}>Cancelar</ActionButton><ActionButton variant={confirmacion.accion === "reabrir" ? "primary" : "danger"} disabled={saving} onClick={ejecutarAccion}>{saving ? "Procesando..." : confirmacion.titulo}</ActionButton></>}><p className="text-sm text-slate-700">{confirmacion.mensaje}</p><p className="mt-3 text-sm font-semibold">{Array.isArray(confirmacion.item) ? `${confirmacion.item.length} rubros seleccionados` : `${confirmacion.item.codigo || confirmacion.item.nodo_item_snapshot || "Rubro"} · ${confirmacion.item.nombre || confirmacion.item.nodo_descripcion_snapshot}`}</p></ModalShell>}
    {rubroModal && <ModalShell title={rubroModal.accion === "revisar" ? "Revisar cambio de APU" : "Configurar alcance"} size="lg" onClose={() => !saving && setRubroModal(null)}><div className="grid gap-4 lg:grid-cols-[1fr_340px]"><div className="rounded border border-slate-200 p-4"><strong>{rubroModal.rubro.nodo_descripcion_snapshot}</strong><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">APU snapshot</dt><dd>{rubroModal.rubro.apu_codigo_snapshot || "—"} · {rubroModal.rubro.apu_nombre_snapshot}</dd></div><div><dt className="text-slate-500">APU vigente</dt><dd>{rubroModal.rubro.apu_vivo ? `${rubroModal.rubro.apu_vivo.codigo || "—"} · ${rubroModal.rubro.apu_vivo.nombre}` : "APU ausente: vincúlalo antes de continuar"}</dd></div></dl>{rubroModal.accion === "revisar" && <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900">La revisión reemplazará el snapshot con el APU vigente. Esta confirmación es explícita.</p>}</div><ConfiguracionAlcancePanel preset={presetRubro} setPreset={setPresetRubro} categorias={categoriasRubro} setCategorias={setCategoriasRubro} cantidad={1} busy={saving} onAplicar={aplicarRubro} vistaPrevia={vistaPrevia} /></div></ModalShell>}
  </section>;
}
