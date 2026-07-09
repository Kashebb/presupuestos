import { useEffect, useMemo, useState } from "react";
import { ActionButton, ErrorBanner, ModalShell } from "../../../components/ui";
import ApuDetalle from "../../../pages/ApuDetalle";
import { API, statusMeta, vincFilters } from "../data";
import { descendantsOf, nearestContainerIdsForRows, visibleContainers } from "../logic/tree";
import PanelApu from "../components/PanelApu";
import PresupuestoTree from "../components/PresupuestoTree";
import CollapsibleSidePanel from "../components/CollapsibleSidePanel";
import useDebouncedValue from "../../../hooks/useDebouncedValue";

function normalizarUnidad(unidad) {
  const value = String(unidad || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("m²", "m2")
    .replace("m³", "m3");
  const aliases = {
    u: "u",
    und: "u",
    unidad: "u",
    unidades: "u",
    m: "m",
    ml: "m",
    m2: "m2",
    m3: "m3",
    kg: "kg",
  };
  return aliases[value] || value;
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizar(texto) {
  return normalizarTexto(texto)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function apuSearchText(apu) {
  return normalizarTexto(`${apu?.codigo || ""} ${apu?.nombre || ""} ${apu?.variante_nombre || ""} ${apu?.categoria || ""} ${apu?.subcategoria || ""} ${apu?.unidad || ""}`);
}

function esApuAjustadoDelProyecto(apu, selectedProjectId) {
  return Boolean(apu?.es_variante && String(apu.proyecto_id) === String(selectedProjectId));
}

function etiquetaTipoApu(apu, selectedProjectId) {
  return esApuAjustadoDelProyecto(apu, selectedProjectId) ? "APU ajustado" : "Base maestra";
}

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function parseNumberInput(value) {
  const text = String(value ?? "").trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!text) return null;
  const normalized = text.includes(",") && text.includes(".")
    ? text.replace(/,/g, "")
    : text.replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`Valor numerico invalido: ${value}`);
  return number;
}

function validarVinculacion(row, apu) {
  const unidadRubro = normalizarUnidad(row?.unidad);
  const unidadApu = normalizarUnidad(apu?.unidad);
  if (!unidadRubro) return { ok: false, mensaje: "No se puede vincular: el rubro no tiene unidad definida." };
  if (!unidadApu) return { ok: false, mensaje: "No se puede vincular: el APU no tiene unidad definida." };
  if (unidadRubro !== unidadApu) {
    return { ok: false, mensaje: `Unidad del rubro ${unidadRubro} y unidad del APU ${unidadApu} no coinciden.` };
  }
  return { ok: true };
}

export default function VinculacionView({
  rows = [],
  apus = [],
  costsByApu = {},
  selectedProjectId,
  onDataChange,
  selectedTreeId,
  setSelectedTreeId,
  collapsedTreeIds,
  setCollapsedTreeIds,
  selectedRowId,
  setSelectedRowId,
  onVisibleCountChange,
  onRibbonActionsChange,
}) {
  const [vincFilter, setVincFilter] = useState("pendiente");
  const [modalVincularOpen, setModalVincularOpen] = useState(false);
  const [modalCrearOpen, setModalCrearOpen] = useState(false);
  const [modalEditarApuOpen, setModalEditarApuOpen] = useState(false);
  const [modalImpactoApuOpen, setModalImpactoApuOpen] = useState(false);
  const [modalVarianteOpen, setModalVarianteOpen] = useState(false);
  const [varianteRow, setVarianteRow] = useState(null);
  const [varianteNombre, setVarianteNombre] = useState("");
  const [varianteSourceId, setVarianteSourceId] = useState("");
  const [apuSearch, setApuSearch] = useState("");
  const [apuSeleccionado, setApuSeleccionado] = useState(null);
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [apuImpacto, setApuImpacto] = useState(null);
  const [apuEditorOverride, setApuEditorOverride] = useState(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionRow, setRevisionRow] = useState(null);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionData, setRevisionData] = useState(null);
  const [revisionItems, setRevisionItems] = useState({});
  const [revisionWarning, setRevisionWarning] = useState("");
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  const [revisionDetail, setRevisionDetail] = useState(null);
  const [showTree, setShowTree] = useState(true);
  const [showApuPanel, setShowApuPanel] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(-1);
  const [subcontractDrafts, setSubcontractDrafts] = useState({});
  const [subcontractSavingId, setSubcontractSavingId] = useState("");
  const searchQueryDebounced = useDebouncedValue(searchQuery, 250);
  const apuSearchDebounced = useDebouncedValue(apuSearch, 300);

  const visibleRows = useMemo(() => {
    const scopedIds = descendantsOf(rows, selectedTreeId);
    const scopedRows = rows.filter((row) => scopedIds.has(row.id));
    if (vincFilter === "todos") return scopedRows;
    if (vincFilter === "vinculado") return scopedRows.filter((row) => row.kind === "container" || row.estado === "vinculado" || row.estado === "validado");
    return scopedRows.filter((row) => row.kind === "container" || row.estado === vincFilter);
  }, [rows, selectedTreeId, vincFilter]);

  const searchMatches = useMemo(() => {
    const query = normalizarTexto(searchQueryDebounced.trim());
    if (!query) return [];
    return visibleRows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => normalizarTexto([
        row.descripcion,
        row.unidad,
        row.apu,
        row.apuNombre,
        row.varianteApu,
        row.observacion,
        row.raw?.node?.observaciones,
      ].join(" ")).includes(query));
  }, [searchQueryDebounced, visibleRows]);
  const treeMarkerIds = useMemo(
    () => nearestContainerIdsForRows(rows, searchMatches.map((match) => match.row)),
    [rows, searchMatches]
  );

  const treeRows = useMemo(() => visibleContainers(rows, collapsedTreeIds), [collapsedTreeIds, rows]);
  const selectedRow = rows.find((row) => row.id === selectedRowId);
  const canUseSelectedLine = selectedRow?.kind === "line";
  const canCreateApu = canUseSelectedLine && !selectedRow.apu && Boolean(selectedRow.unidad);

  const variantUsageById = useMemo(() => {
    const usage = new Map();
    rows.forEach((row) => {
      const apuId = row.raw?.node?.apu_id;
      if (apuId) usage.set(apuId, (usage.get(apuId) || 0) + 1);
    });
    return usage;
  }, [rows]);

  const variantsByBaseId = useMemo(() => {
    const grouped = new Map();
    apus
      .filter((apu) => apu.es_variante && String(apu.proyecto_id) === String(selectedProjectId))
      .forEach((apu) => {
        const baseId = apu.apu_base_id;
        if (!grouped.has(baseId)) grouped.set(baseId, []);
        grouped.get(baseId).push({ ...apu, usos: variantUsageById.get(apu.id) || 0 });
      });
    grouped.forEach((variants) => {
      variants.sort((a, b) => String(a.variante_nombre || "").localeCompare(String(b.variante_nombre || "")));
    });
    return grouped;
  }, [apus, selectedProjectId, variantUsageById]);

  const apusConBusqueda = useMemo(() => (
    apus.map((apu) => ({ apu, searchText: apuSearchText(apu), nombreNorm: normalizarTexto(apu?.nombre) }))
  ), [apus]);

  const apusSugeridos = useMemo(() => {
    const query = apuSearchDebounced.trim();
    const queryTokens = tokenizar(query);
    return apusConBusqueda
      .filter(({ apu }) => apu.estado !== "inactivo")
      .filter(({ apu }) => !apu.es_variante || esApuAjustadoDelProyecto(apu, selectedProjectId))
      .filter(({ searchText }) => {
        if (!queryTokens.length) return true;
        return queryTokens.every((token) => searchText.includes(token));
      })
      .map(({ apu, searchText, nombreNorm }) => {
        const rowTokens = tokenizar(selectedRow?.descripcion);
        const tokens = queryTokens.length ? queryTokens : rowTokens;
        let score = 0;
        tokens.forEach((token) => {
          if (searchText.includes(token)) score += queryTokens.length ? 6 : 4;
          if (nombreNorm.includes(token)) score += queryTokens.length ? 4 : 3;
        });
        if (normalizarUnidad(selectedRow?.unidad) && normalizarUnidad(selectedRow?.unidad) === normalizarUnidad(apu?.unidad)) score += 10;
        if (normalizarTexto(apu?.nombre) === normalizarTexto(selectedRow?.descripcion)) score += 20;
        return { apu, score };
      })
      .filter(({ score }) => queryTokens.length || score > 0)
      .sort((a, b) => {
        const tipoA = esApuAjustadoDelProyecto(a.apu, selectedProjectId) ? 1 : 0;
        const tipoB = esApuAjustadoDelProyecto(b.apu, selectedProjectId) ? 1 : 0;
        return tipoB - tipoA || b.score - a.score || String(a.apu.nombre || "").localeCompare(String(b.apu.nombre || ""));
      })
      .slice(0, 80);
  }, [apuSearchDebounced, apusConBusqueda, selectedProjectId, selectedRow]);

  const apusClasificados = useMemo(() => {
    const resultado = { compatibles: [], incompatibles: [] };
    apusSugeridos.forEach(({ apu, score }) => {
      const validacion = validarVinculacion(selectedRow, apu);
      const item = { apu, score, mensaje: validacion.mensaje || "" };
      if (validacion.ok) resultado.compatibles.push(item);
      else resultado.incompatibles.push(item);
    });
    resultado.compatibles.sort((a, b) => b.score - a.score || String(a.apu.nombre || "").localeCompare(String(b.apu.nombre || "")));
    resultado.incompatibles.sort((a, b) => b.score - a.score || String(a.apu.nombre || "").localeCompare(String(b.apu.nombre || "")));
    return resultado;
  }, [apusSugeridos, selectedRow]);

  const apusParecidosCrear = useMemo(() => {
    return [...apusClasificados.compatibles, ...apusClasificados.incompatibles].slice(0, 8);
  }, [apusClasificados]);

  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  useEffect(() => {
    setModalVincularOpen(false);
    setModalCrearOpen(false);
    setModalEditarApuOpen(false);
    setModalImpactoApuOpen(false);
    setModalVarianteOpen(false);
    setApuSearch("");
    setApuSeleccionado(null);
    setVarianteRow(null);
    setVarianteNombre("");
    setVarianteSourceId("");
    setApuImpacto(null);
    setApuEditorOverride(null);
    setRevisionOpen(false);
    setRevisionRow(null);
    setRevisionData(null);
    setRevisionItems({});
    setRevisionWarning("");
    setRevisionHistoryOpen(false);
    setRevisionDetail(null);
    setActionError("");
    setActionStatus("");
  }, [selectedRowId]);

  useEffect(() => {
    setSearchIndex(-1);
  }, [searchQueryDebounced, selectedTreeId, vincFilter]);

  const runAction = async (action) => {
    if (!canUseSelectedLine) return;
    setActionStatus("Guardando...");
    setActionError("");
    try {
      await action();
      setActionStatus("Cambios aplicados.");
      setModalVincularOpen(false);
      setModalCrearOpen(false);
      setApuSearch("");
      setApuSeleccionado(null);
      onDataChange?.();
    } catch (err) {
      setActionStatus("");
      setActionError(err.message || "No se pudo aplicar la accion.");
    }
  };

  const runVariantAction = async (action) => {
    setActionStatus("Guardando...");
    setActionError("");
    try {
      await action();
      setActionStatus("Cambios aplicados.");
      onDataChange?.();
    } catch (err) {
      setActionStatus("");
      setActionError(err.message || "No se pudo aplicar la accion.");
    }
  };

  const marcarNoAplica = () => runAction(async () => {
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/marcar-sin-apu`, { method: "PATCH" });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo marcar como subcontratado.");
    }
  });

  const guardarPrecioSubcontratado = async (row) => {
    if (!row?.sourceId || row.estado !== "sin_apu") return;
    const draft = subcontractDrafts[row.id];
    if (draft === undefined) return;
    setSubcontractSavingId(row.id);
    setActionError("");
    try {
      const precio = parseNumberInput(draft);
      const response = await fetch(`${API}/presupuestos/nodos/${row.sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precio_unitario_subcontratado: precio }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "No se pudo guardar el P.U. Meta.");
      }
      setSubcontractDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setActionStatus("P.U. Meta subcontratado actualizado.");
      onDataChange?.();
    } catch (err) {
      setActionError(err.message || "No se pudo guardar el P.U. Meta.");
    } finally {
      setSubcontractSavingId("");
    }
  };

  const crearApu = (baseApu = null) => runAction(async () => {
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/crear-apu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseApu ? { base_apu_id: baseApu.id } : {}),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo crear el APU.");
    }
  });

  const vincularApu = (apu) => runAction(async () => {
    const validacion = validarVinculacion(selectedRow, apu);
    if (!validacion.ok) throw new Error(validacion.mensaje);
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/vincular-apu`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apu_id: apu.id }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo vincular el APU.");
    }
  });

  const desvincularApu = () => runAction(async () => {
    const response = await fetch(`${API}/presupuestos/nodos/${selectedRow.sourceId}/desvincular-apu`, { method: "PATCH" });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo desvincular el APU.");
    }
  });

  const cambiarVarianteApu = (row, value) => {
    if (!row?.raw?.node?.apu_id) return;
    if (value === "__new__") {
      setVarianteRow(row);
      setVarianteNombre("");
      setVarianteSourceId(String(row.apuEfectivoId || row.raw.node.apu_id));
      setActionError("");
      setModalVarianteOpen(true);
      return;
    }
    runVariantAction(async () => {
      const response = await fetch(`${API}/presupuestos/nodos/${row.sourceId}/variante-apu`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variante_apu_id: value === "base" ? null : Number(value) }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "No se pudo cambiar el APU ajustado.");
      }
    });
  };

  const crearVarianteApu = () => runVariantAction(async () => {
    if (!varianteRow) return;
    const response = await fetch(`${API}/presupuestos/nodos/${varianteRow.sourceId}/variantes-apu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variante_nombre: varianteNombre,
        copiar_desde_apu_id: Number(varianteSourceId || varianteRow.apuEfectivoId || varianteRow.raw?.node?.apu_id),
      }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "No se pudo crear el APU ajustado.");
    }
    setModalVarianteOpen(false);
    setVarianteRow(null);
    setVarianteNombre("");
    setVarianteSourceId("");
  });

  const cambiarApu = () => {
    if (!canUseSelectedLine) return;
    setApuSearch("");
    setApuSeleccionado(null);
    setActionError("");
    setModalVincularOpen(true);
  };

  const abrirRevisionApu = async (row) => {
    if (!row?.sourceId || row.estado !== "revisar") return;
    setSelectedRowId(row.id);
    setRevisionRow(row);
    setRevisionOpen(true);
    setRevisionLoading(true);
    setRevisionData(null);
    setRevisionItems({});
    setRevisionWarning("");
    setRevisionHistoryOpen(false);
    setRevisionDetail(null);
    try {
      const response = await fetch(`${API}/presupuestos/nodos/${row.sourceId}/revision-apu`);
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudo cargar la revision.");
      const initialItems = {};
      (detail.motivos_actuales || []).forEach((motivo) => {
        initialItems[motivo.codigo] = {
          aprobado: Boolean(motivo.aprobado),
          comentario: motivo.comentario || "",
        };
      });
      setRevisionData(detail);
      setRevisionItems(initialItems);
    } catch (err) {
      setRevisionWarning(err.message || "No se pudo cargar la revision.");
    } finally {
      setRevisionLoading(false);
    }
  };

  const actualizarRevisionItem = (codigo, patch) => {
    setRevisionItems((current) => ({
      ...current,
      [codigo]: { ...(current[codigo] || { aprobado: false, comentario: "" }), ...patch },
    }));
    setRevisionWarning("");
  };

  const guardarRevisionApu = async () => {
    const motivos = revisionData?.motivos_actuales || [];
    const incompletos = motivos.filter((motivo) => !revisionItems[motivo.codigo]?.aprobado);
    if (incompletos.length) {
      setRevisionWarning("Aprueba todas las observaciones antes de marcar como revisado.");
      return;
    }
    setRevisionLoading(true);
    setRevisionWarning("");
    try {
      const response = await fetch(`${API}/presupuestos/nodos/${revisionRow?.sourceId}/revision-apu/revisado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: motivos.map((motivo) => ({
            codigo_motivo: motivo.codigo,
            aprobado: true,
            comentario: revisionItems[motivo.codigo]?.comentario || "",
          })),
        }),
      });
      const detail = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof detail?.detail === "string" ? detail.detail : detail?.detail?.mensaje;
        throw new Error(message || "No se pudo guardar la revision.");
      }
      setActionStatus("Rubro marcado como validado.");
      setRevisionOpen(false);
      setRevisionRow(null);
      setRevisionData(null);
      setRevisionItems({});
      onDataChange?.();
    } catch (err) {
      setRevisionWarning(err.message || "No se pudo guardar la revision.");
    } finally {
      setRevisionLoading(false);
    }
  };

  const actualizarEtiquetasApu = async (etiquetas) => {
    if (!selectedRow?.raw?.node?.apu_id) return;
    setActionStatus("Guardando etiquetas...");
    setActionError("");
    try {
      const response = await fetch(`${API}/apus/${selectedRow.raw.node.apu_id}/etiquetas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etiquetas }),
      });
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudieron guardar las etiquetas.");
      setActionStatus("Etiquetas actualizadas.");
      onDataChange?.();
    } catch (err) {
      setActionStatus("");
      setActionError(err.message || "No se pudieron guardar las etiquetas.");
      throw err;
    }
  };

  const goToSearchMatch = (direction = 1) => {
    if (!searchMatches.length) return;
    const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    const match = searchMatches[nextIndex];
    setSearchIndex(nextIndex);
    setSelectedRowId(match.row.id);
    requestAnimationFrame(() => {
      document.querySelector(`[data-budget-link-row-id="${match.row.id}"]`)?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });
  };

  const selectTreeRow = (rowId) => {
    setSelectedTreeId(rowId);
    if (rowId === "all") {
      setSelectedRowId("");
      return;
    }
    const row = rows.find((item) => item.id === rowId);
    if (row) setSelectedRowId(row.id);
  };

  const selectTableRow = (row) => {
    setSelectedRowId(row.id);
    setSelectedTreeId(row.kind === "container" ? row.id : row.parentId || "all");
  };

  const abrirEditorApuGlobal = () => {
    if (!selectedRow?.raw?.node?.apu_id) return;
    setActionError("");
    setApuEditorOverride(null);
    setModalImpactoApuOpen(false);
    setModalEditarApuOpen(true);
  };

  const crearVarianteParaRubroActual = () => {
    if (!selectedRow?.raw?.node?.apu_id) return;
    setModalImpactoApuOpen(false);
    setVarianteRow(selectedRow);
    setVarianteNombre("");
    setVarianteSourceId(String(selectedRow.apuEfectivoId || selectedRow.raw.node.apu_id));
    setActionError("");
    setModalVarianteOpen(true);
  };

  const aislarNoLiberados = async () => {
    if (!selectedRow?.raw?.node?.apu_id) return;
    setActionError("");
    setActionStatus("Aislando rubros no liberados...");
    try {
      const response = await fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/apus/${selectedRow.raw.node.apu_id}/aislar-no-liberados`, {
        method: "POST",
      });
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudo aislar el APU.");
      setModalImpactoApuOpen(false);
      setApuEditorOverride({
        id: detail.apu_id,
        codigo: detail.variante?.codigo || selectedRow.apu,
        nombre: detail.variante?.nombre || selectedRow.apuNombre,
        unidad: selectedRow.unidad || selectedRow.raw?.apu?.unidad || "",
        rendimiento: selectedRow.rendimiento || selectedRow.raw?.apu?.rendimiento || 1,
        estado: "en_revision",
      });
      setActionStatus(`${detail.rubros_reasignados} rubro(s) no liberados aislados. ${detail.rubros_liberados_preservados} rubro(s) liberados quedaron intactos.`);
      setModalEditarApuOpen(true);
      onDataChange?.();
    } catch (err) {
      setActionStatus("");
      setActionError(err.message || "No se pudo aislar el APU.");
    }
  };

  const editarApu = async () => {
    if (!selectedRow?.raw?.node?.apu_id) return;
    setActionError("");
    setActionStatus("Revisando alcance del APU...");
    try {
      const response = await fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/apus/${selectedRow.raw.node.apu_id}/impacto-paquetes`);
      const detail = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detail?.detail || "No se pudo revisar el alcance del APU.");
      const paquetesLiberados = (detail.paquetes || []).filter((paquete) => paquete.estado === "liberado");
      if ((detail.total_rubros || 0) > 1 || paquetesLiberados.length > 0) {
        setApuImpacto(detail);
        setModalImpactoApuOpen(true);
      } else {
        abrirEditorApuGlobal();
      }
    } catch (err) {
      setActionError(err.message || "No se pudo revisar el alcance del APU.");
    } finally {
      setActionStatus("");
    }
  };

  const cerrarEditorApu = async ({ refresh = true } = {}) => {
    setModalEditarApuOpen(false);
    setApuEditorOverride(null);
    if (refresh) {
      setActionStatus("APU actualizado.");
      onDataChange?.();
    }
  };

  const toggleTreeCollapse = (rowId) => {
    setCollapsedTreeIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const ribbonActions = useMemo(() => [
    {
      key: "vincular-apu",
      label: "Vincular APU",
      disabled: !canUseSelectedLine,
      hint: canUseSelectedLine ? "" : "Selecciona una linea operativa.",
      onClick: () => setModalVincularOpen(true),
    },
    {
      key: "subcontratado",
      label: "Subcontratado",
      disabled: !canUseSelectedLine || selectedRow.estado === "sin_apu",
      hint: !canUseSelectedLine ? "Selecciona una linea operativa." : "",
      onClick: marcarNoAplica,
    },
    {
      key: "crear-apu",
      label: "Crear APU",
      disabled: !canCreateApu,
      hint: canCreateApu ? "" : "Selecciona una linea sin APU y con unidad.",
      onClick: () => setModalCrearOpen(true),
    },
  ], [canCreateApu, canUseSelectedLine, selectedRow]);

  useEffect(() => {
    onRibbonActionsChange?.(ribbonActions);
    return () => onRibbonActionsChange?.([]);
  }, [onRibbonActionsChange, ribbonActions]);

  return (
    <div className={`budget-v2-linking-layout ${!showTree ? "budget-v2-left-collapsed" : ""} ${!showApuPanel ? "budget-v2-right-collapsed" : ""}`}>
      <CollapsibleSidePanel side="left" label="EDT" open={showTree} onToggle={() => setShowTree(value => !value)}>
        <PresupuestoTree
          rows={treeRows}
          selectedTreeId={selectedTreeId}
          onSelect={selectTreeRow}
          collapsedTreeIds={collapsedTreeIds}
          onToggleCollapse={toggleTreeCollapse}
          mode="vinculacion"
          markerIds={treeMarkerIds}
        />
      </CollapsibleSidePanel>

      <section className="budget-v2-linking-main">
        <div className="budget-v2-linking-toolbar">
          <div className="budget-v2-filter-group">
            {vincFilters.map(([key, label]) => (
              <button key={key} type="button" className={vincFilter === key ? "budget-v2-filter-active" : ""} onClick={() => setVincFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="budget-v2-toolbar-spacer" />
          <div className="budget-v2-search" role="search">
            <input
              type="search"
              value={searchQuery}
              placeholder="Buscar en vinculacion..."
              aria-label="Buscar en vinculacion"
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                goToSearchMatch(event.shiftKey ? -1 : 1);
              }}
            />
            <span>{searchQuery.trim() ? `${searchMatches.length} resultado(s)` : "Buscar"}</span>
            <button type="button" disabled={!searchMatches.length} onClick={() => goToSearchMatch(-1)}>Anterior</button>
            <button type="button" disabled={!searchMatches.length} onClick={() => goToSearchMatch(1)}>Siguiente</button>
          </div>
        </div>
        {(actionStatus || actionError) && (
          <div className="budget-v2-action-panel">
            {actionStatus && <span className="budget-v2-action-status">{actionStatus}</span>}
            {actionError && <span className="budget-v2-action-error">{actionError}</span>}
          </div>
        )}

        <div className="budget-v2-link-table">
          <div className="budget-v2-link-head">
            <span>Descripcion / estructura</span>
            <span>APU ajustado</span>
            <span>P.U. Meta</span>
            <span>P.T. Meta</span>
            <span>Estado</span>
          </div>
          <div className="budget-v2-link-body">
            {visibleRows.map((row) => {
              const isContainer = row.kind === "container";
              const selected = selectedRowId === row.id;
              const meta = statusMeta[row.estado] || {};
              const variantes = row.apuBaseId ? (variantsByBaseId.get(row.apuBaseId) || []) : [];
              return (
                <div
                  key={row.id}
                  data-budget-link-row-id={row.id}
                  role="button"
                  tabIndex={0}
                  className={`budget-v2-link-row ${isContainer ? "budget-v2-link-container" : ""} ${selected ? "budget-v2-link-selected" : ""}`}
                  onClick={() => selectTableRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") selectTableRow(row);
                  }}
                >
                  <span>
                    <strong>{row.descripcion}</strong>
                    <small>{isContainer ? "" : `${row.unidad} | ${row.metrado} | P.U. ref ${row.puRef || "-"}`}</small>
                  </span>
                  <span className="budget-v2-link-variant-cell">
                    {!isContainer && row.raw?.node?.apu_id && (
                      <select
                        value={row.raw?.apu?.es_variante ? String(row.raw.apu.id) : "base"}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          cambiarVarianteApu(row, event.target.value);
                        }}
                      >
                        <option value="base">Base maestra</option>
                        {variantes.map((variante) => (
                          <option key={variante.id} value={String(variante.id)}>
                            {variante.variante_nombre || variante.nombre || "APU ajustado"} - {variante.usos} usos
                          </option>
                        ))}
                        <option value="__new__">+ Crear APU ajustado</option>
                      </select>
                    )}
                  </span>
                  <span>
                    {!isContainer && row.estado === "sin_apu" ? (
                      <input
                        className="budget-v2-link-meta-input"
                        value={subcontractDrafts[row.id] ?? String(row.raw?.node?.precio_unitario_subcontratado ?? row.raw?.puRef ?? "")}
                        disabled={subcontractSavingId === row.id}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setSubcontractDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                        onBlur={() => guardarPrecioSubcontratado(row)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            setSubcontractDrafts((current) => {
                              const next = { ...current };
                              delete next[row.id];
                              return next;
                            });
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      isContainer ? "" : (row.puMeta || "-")
                    )}
                  </span>
                  <span>{row.ptMeta || "-"}</span>
                  <span>
                    {!isContainer && (
                      <em
                        className={`${meta.className || ""} ${row.estado === "revisar" ? "budget-v2-status-clickable" : ""}`}
                        role={row.estado === "revisar" ? "button" : undefined}
                        tabIndex={row.estado === "revisar" ? 0 : undefined}
                        onClick={(event) => {
                          if (row.estado !== "revisar") return;
                          event.stopPropagation();
                          abrirRevisionApu(row);
                        }}
                        onKeyDown={(event) => {
                          if (row.estado !== "revisar") return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          abrirRevisionApu(row);
                        }}
                      >
                        {meta.label}
                      </em>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <CollapsibleSidePanel side="right" label="Panel APU" open={showApuPanel} onToggle={() => setShowApuPanel(value => !value)}>
        <PanelApu
          selectedRow={selectedRow}
          onEditApu={editarApu}
          onChangeApu={cambiarApu}
          onUnlinkApu={desvincularApu}
          onUpdateApuTags={actualizarEtiquetasApu}
        />
      </CollapsibleSidePanel>

      {revisionOpen && (
        <ModalShell
          title="Revisar rubro"
          size="lg"
          onClose={() => {
            setRevisionOpen(false);
            setRevisionRow(null);
            setRevisionData(null);
            setRevisionItems({});
            setRevisionWarning("");
            setRevisionDetail(null);
          }}
          footer={
            <>
              <ActionButton onClick={() => {
                setRevisionOpen(false);
                setRevisionRow(null);
                setRevisionData(null);
                setRevisionItems({});
                setRevisionWarning("");
                setRevisionDetail(null);
              }}>
                Cancelar
              </ActionButton>
              <ActionButton variant="primary" onClick={guardarRevisionApu} disabled={revisionLoading || !(revisionData?.motivos_actuales || []).length}>
                Revisado
              </ActionButton>
            </>
          }
        >
          <div className="budget-v2-review-modal">
            <div className="budget-v2-review-head">
              <span>Rubro</span>
              <strong>{revisionRow?.descripcion}</strong>
              <small>{revisionRow?.apu ? `${revisionRow.apu} | ${revisionRow.apuNombre}` : "Sin APU vinculado"}</small>
            </div>

            {revisionLoading && <div className="budget-v2-link-modal-empty">Cargando revision...</div>}
            {revisionWarning && <ErrorBanner>{revisionWarning}</ErrorBanner>}

            {!revisionLoading && revisionData && (
              <>
                <div className="budget-v2-review-list">
                  {(revisionData.motivos_actuales || []).map((motivo) => {
                    const item = revisionItems[motivo.codigo] || { aprobado: false, comentario: "" };
                    return (
                      <label key={motivo.codigo} className="budget-v2-review-item">
                        <span className="budget-v2-review-check">
                          <input
                            type="checkbox"
                            checked={item.aprobado}
                            onChange={(event) => actualizarRevisionItem(motivo.codigo, { aprobado: event.target.checked })}
                          />
                          <span>
                            <strong>{motivo.descripcion}</strong>
                            {(motivo.detalle || []).length > 0 && (
                              <button
                                type="button"
                                className="budget-v2-review-detail-link"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setRevisionDetail(motivo);
                                }}
                              >
                                Ver mas detalle
                              </button>
                            )}
                          </span>
                        </span>
                        <textarea
                          value={item.comentario}
                          rows={2}
                          placeholder="Comentario opcional"
                          onChange={(event) => actualizarRevisionItem(motivo.codigo, { comentario: event.target.value })}
                        />
                      </label>
                    );
                  })}
                  {!(revisionData.motivos_actuales || []).length && (
                    <div className="budget-v2-link-modal-empty">Este rubro no tiene observaciones pendientes.</div>
                  )}
                </div>

                <div className="budget-v2-review-history">
                  <button type="button" onClick={() => setRevisionHistoryOpen(value => !value)}>
                    <span>{revisionHistoryOpen ? "-" : "+"}</span>
                    Historial de revisiones ({(revisionData.historial || []).length})
                  </button>
                  {revisionHistoryOpen && (
                    <div className="budget-v2-review-history-list">
                      {(revisionData.historial || []).map((revision) => (
                        <div key={revision.id} className="budget-v2-review-history-card">
                          <strong>{revision.estado === "validado" ? "Validado" : revision.estado}</strong>
                          {(revision.items || []).map((item) => (
                            <p key={`${revision.id}-${item.codigo_motivo}`}>
                              <span>{item.aprobado ? "Aprobado" : "Pendiente"}</span>
                              {item.descripcion_motivo}
                              {item.comentario && <small>{item.comentario}</small>}
                            </p>
                          ))}
                        </div>
                      ))}
                      {!(revisionData.historial || []).length && (
                        <div className="budget-v2-link-modal-empty">Sin revisiones anteriores.</div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {revisionDetail && (
            <div className="budget-v2-review-detail-overlay" role="dialog" aria-modal="true">
              <div className="budget-v2-review-detail-card">
                <div className="budget-v2-review-detail-head">
                  <strong>{revisionDetail.descripcion}</strong>
                  <button type="button" onClick={() => setRevisionDetail(null)} aria-label="Cerrar detalle">x</button>
                </div>
                <div className="budget-v2-review-detail-body">
                  {(revisionDetail.detalle || []).map((linea, index) => (
                    <p key={`${revisionDetail.codigo}-${index}`}>{linea}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {modalVincularOpen && (
        <ModalShell
          title="Vincular APU"
          size="lg"
          onClose={() => {
            setModalVincularOpen(false);
            setApuSearch("");
            setApuSeleccionado(null);
            setActionError("");
          }}
          footer={
            <>
              <ActionButton onClick={() => {
                setModalVincularOpen(false);
                setApuSearch("");
                setApuSeleccionado(null);
                setActionError("");
              }}>
                Cancelar
              </ActionButton>
              <ActionButton variant="primary" onClick={() => apuSeleccionado && vincularApu(apuSeleccionado)} disabled={!apuSeleccionado}>
                Confirmar vinculo
              </ActionButton>
            </>
          }
        >
          <div className="budget-v2-link-modal">
            <aside className="budget-v2-link-modal-side">
              <div>
                <div className="budget-v2-link-modal-kicker">Rubro seleccionado</div>
                <div className="budget-v2-link-modal-title">{selectedRow?.descripcion}</div>
                <div className="budget-v2-link-modal-tags">
                  <span>1 rubro</span>
                  <span>Und: {normalizarUnidad(selectedRow?.unidad) || "sin unidad"}</span>
                </div>
              </div>
              <div className="budget-v2-link-modal-metrics">
                <div>
                  <span>P.U. ref</span>
                  <strong>{fmtMoney(selectedRow?.raw?.puRef)}</strong>
                </div>
                <div>
                  <span>Metrado</span>
                  <strong>{selectedRow?.metrado || "-"}</strong>
                </div>
              </div>
              {apuSeleccionado && (
                <div className="budget-v2-link-modal-ready">
                  <span>APU listo para confirmar</span>
                  <strong>{apuSeleccionado.nombre}</strong>
                  <small>
                    {apuSeleccionado.codigo || "-"} | Und {apuSeleccionado.unidad || "-"} | {fmtMoney(costsByApu[apuSeleccionado.id]?.precio_unitario)}
                  </small>
                </div>
              )}
              <ActionButton variant="ghost" onClick={() => setModalCrearOpen(true)} disabled={!canCreateApu}>
                Crear APU desde rubro
              </ActionButton>
            </aside>

            <section className="budget-v2-link-modal-main">
              <input
                type="text"
                placeholder="Buscar APU por nombre, codigo o categoria..."
                value={apuSearch}
                onChange={(event) => {
                  setApuSearch(event.target.value);
                  setApuSeleccionado(null);
                  setActionError("");
                }}
                className="budget-v2-link-modal-search"
              />
              <div className="budget-v2-link-modal-summary">
                <span>{apuSearch.trim() ? `${apusSugeridos.length} coincidencia(s) no inactivas` : "Sugerencias por nombre del rubro"}</span>
                {apuSearch.trim() && <span className="budget-v2-compatible-count">{apusClasificados.compatibles.length} compatibles</span>}
                {apuSearch.trim() && <span className="budget-v2-incompatible-count">{apusClasificados.incompatibles.length} incompatibles</span>}
              </div>

              <div className="budget-v2-link-modal-results">
                {apuSearch.trim() && apusSugeridos.length === 0 && (
                  <div className="budget-v2-link-modal-empty">No hay APUs coincidentes no inactivos.</div>
                )}

                {apusClasificados.compatibles.length > 0 && (
                  <div className="budget-v2-apu-result-section budget-v2-apu-result-compatible">
                    <div className="budget-v2-apu-result-title">APUs compatibles primero</div>
                    <table>
                      <thead>
                        <tr>
                          <th>APU</th>
                          <th>Unidad</th>
                          <th>P.U. Calc.</th>
                          <th>Estado</th>
                          <th>Seleccion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apusClasificados.compatibles.map(({ apu }) => (
                          <tr key={apu.id} className={apuSeleccionado?.id === apu.id ? "budget-v2-apu-row-selected" : ""}>
                            <td>
                              <strong>{apu.nombre}</strong>
                              <small>{apu.codigo || "-"} | {etiquetaTipoApu(apu, selectedProjectId)}</small>
                            </td>
                            <td>{apu.unidad || "-"}</td>
                            <td>{fmtMoney(costsByApu[apu.id]?.precio_unitario)}</td>
                            <td>{apu.estado}</td>
                            <td>
                              <button type="button" onClick={() => {
                                setApuSeleccionado(apu);
                                setActionError("");
                              }}>
                                {apuSeleccionado?.id === apu.id ? "Seleccionado" : "Seleccionar"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {apusClasificados.incompatibles.length > 0 && (
                  <div className="budget-v2-apu-result-section budget-v2-apu-result-incompatible">
                    <div className="budget-v2-apu-result-title">APUs incompatibles visibles</div>
                    <table>
                      <thead>
                        <tr>
                          <th>APU</th>
                          <th>Unidad</th>
                          <th>P.U. Calc.</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apusClasificados.incompatibles.map(({ apu, mensaje }) => (
                          <tr key={apu.id}>
                            <td>
                              <strong>{apu.nombre}</strong>
                              <small>{apu.codigo || "-"} | {etiquetaTipoApu(apu, selectedProjectId)}</small>
                            </td>
                            <td>{apu.unidad || "-"}</td>
                            <td>{fmtMoney(costsByApu[apu.id]?.precio_unitario)}</td>
                            <td>{mensaje}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <ErrorBanner>{actionError}</ErrorBanner>
            </section>
          </div>
        </ModalShell>
      )}

      {modalCrearOpen && (
        <ModalShell
          title="Crear APU desde rubro"
          size="md"
          onClose={() => {
            setModalCrearOpen(false);
            setActionError("");
          }}
          footer={
            <>
              <ActionButton onClick={() => setModalCrearOpen(false)}>Cancelar</ActionButton>
              <ActionButton variant="primary" onClick={() => crearApu()} disabled={!canCreateApu}>
                Crear desde cero
              </ActionButton>
            </>
          }
        >
          <div className="budget-v2-create-apu-modal">
            <div className="budget-v2-create-apu-intro">
              <strong>{selectedRow?.descripcion}</strong>
              <span>Se creara un APU en revision y quedara vinculado a este rubro.</span>
            </div>
            <div className="budget-v2-create-apu-list">
              <div className="budget-v2-apu-result-title">APUs parecidos para duplicar</div>
              {apusParecidosCrear.length === 0 && (
                <div className="budget-v2-link-modal-empty">No hay APUs parecidos. Puedes crear uno desde cero.</div>
              )}
              {apusParecidosCrear.map(({ apu, mensaje }) => (
                <div className="budget-v2-create-apu-option" key={apu.id}>
                  <div>
                    <strong>{apu.nombre}</strong>
                    <small>{apu.codigo || "-"} | Und {apu.unidad || "-"} | {fmtMoney(costsByApu[apu.id]?.precio_unitario)}</small>
                    {mensaje && <small>{mensaje}</small>}
                  </div>
                  <button type="button" onClick={() => crearApu(apu)}>
                    Duplicar y vincular
                  </button>
                </div>
              ))}
            </div>
            <ErrorBanner>{actionError}</ErrorBanner>
          </div>
        </ModalShell>
      )}

      {modalVarianteOpen && varianteRow && (
        <ModalShell
          title="Crear APU ajustado"
          size="md"
          onClose={() => {
            setModalVarianteOpen(false);
            setVarianteRow(null);
            setVarianteNombre("");
            setVarianteSourceId("");
            setActionError("");
          }}
          footer={
            <>
              <ActionButton onClick={() => setModalVarianteOpen(false)}>Cancelar</ActionButton>
              <ActionButton variant="primary" onClick={crearVarianteApu} disabled={!varianteNombre.trim()}>
                Crear y asignar
              </ActionButton>
            </>
          }
        >
          <div className="budget-v2-create-apu-modal">
            <div className="budget-v2-create-apu-intro">
              <strong>{varianteRow.apuNombre}</strong>
              <span>El APU ajustado quedara disponible para otros rubros y paquetes del mismo proyecto.</span>
            </div>
            <label className="budget-v2-variant-field">
              <span>Nombre del APU ajustado</span>
              <input
                type="text"
                value={varianteNombre}
                onChange={(event) => setVarianteNombre(event.target.value)}
                placeholder="Escribe el nombre manualmente"
                autoFocus
              />
            </label>
            <label className="budget-v2-variant-field">
              <span>Copiar desde</span>
              <select value={varianteSourceId} onChange={(event) => setVarianteSourceId(event.target.value)}>
                {varianteRow.raw?.baseApu && (
                  <option value={String(varianteRow.raw.baseApu.id)}>
                    Base maestra - {varianteRow.raw.baseApu.nombre}
                  </option>
                )}
                {(variantsByBaseId.get(varianteRow.apuBaseId) || []).map((variante) => (
                  <option key={variante.id} value={String(variante.id)}>
                    {variante.variante_nombre || variante.nombre || "APU ajustado"} - {variante.usos} usos
                  </option>
                ))}
              </select>
            </label>
            <ErrorBanner>{actionError}</ErrorBanner>
          </div>
        </ModalShell>
      )}

      {modalImpactoApuOpen && apuImpacto && selectedRow && (
        <ModalShell
          title="Alcance de edicion APU"
          size="md"
          onClose={() => {
            setModalImpactoApuOpen(false);
            setApuImpacto(null);
          }}
          footer={
            <>
              <ActionButton onClick={() => setModalImpactoApuOpen(false)}>Cancelar</ActionButton>
              <ActionButton onClick={crearVarianteParaRubroActual}>
                Solo este rubro
              </ActionButton>
              <ActionButton onClick={aislarNoLiberados}>
                Crear ajustado para activos
              </ActionButton>
              <ActionButton variant="primary" onClick={abrirEditorApuGlobal}>
                Editar compartido
              </ActionButton>
            </>
          }
        >
          <div className="budget-v2-impact-modal">
            <div className="budget-v2-create-apu-intro">
              <strong>{selectedRow.apuNombre || selectedRow.apu}</strong>
              <span>Este APU esta vinculado a {apuImpacto.total_rubros} rubro(s). Si editas el compartido, el cambio se vera en todos esos rubros.</span>
              <span>Crear ajustado para activos conserva intactos los paquetes liberados y abre una copia editable para el trabajo activo.</span>
            </div>
            {(apuImpacto.paquetes || []).length > 0 && (
              <div className="budget-v2-impact-list">
                {apuImpacto.paquetes.map((paquete) => (
                  <div key={paquete.id} className={paquete.estado === "liberado" ? "budget-v2-impact-released" : ""}>
                    <span>{paquete.estado === "liberado" ? "Liberado" : "Activo"}</span>
                    <strong>{paquete.nombre}</strong>
                    <small>{paquete.rubros} rubro(s) con este APU</small>
                  </div>
                ))}
              </div>
            )}
            {apuImpacto.rubros_fuera_paquete > 0 && (
              <div className="budget-v2-panel-note">
                {apuImpacto.rubros_fuera_paquete} rubro(s) usan este APU fuera de paquetes.
              </div>
            )}
            {(apuImpacto.paquetes || []).some((paquete) => paquete.estado === "liberado") && (
              <div className="budget-v2-panel-note budget-v2-panel-note-error">
                Hay paquetes liberados usando este APU. Editar compartido tambien los cambia.
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {modalEditarApuOpen && (apuEditorOverride || selectedRow?.raw?.node?.apu_id) && (
        <ModalShell
          title="Editar APU"
          size="lg"
          onClose={() => cerrarEditorApu({ refresh: false })}
        >
          <div className="budget-v2-apu-editor-modal">
            <ApuDetalle
              apu={apuEditorOverride || {
                id: selectedRow.raw.node.apu_id,
                codigo: selectedRow.raw.apu?.codigo || selectedRow.apu,
                nombre: selectedRow.raw.apu?.nombre || selectedRow.apuNombre || selectedRow.descripcion,
                unidad: selectedRow.unidad || "",
                rendimiento: selectedRow.rendimiento || 1,
                estado: selectedRow.raw.apu?.estado || "en_revision",
              }}
              projectId={selectedProjectId}
              onVolver={() => cerrarEditorApu({ refresh: true })}
              volverLabel="Guardar y cerrar"
            />
          </div>
        </ModalShell>
      )}
    </div>
  );
}
