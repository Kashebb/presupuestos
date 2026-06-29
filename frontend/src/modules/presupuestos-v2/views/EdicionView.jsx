import { useEffect, useMemo, useState } from "react";
import { ActionButton, ModalShell } from "../../../components/ui";
import { API } from "../data";
import PresupuestoTree from "../components/PresupuestoTree";
import CollapsibleSidePanel from "../components/CollapsibleSidePanel";
import { visibleContainers } from "../logic/tree";
import { editColumns, emptyEditRows } from "../mockData";

const FIELD_BY_COLUMN = {
  descripcion: "descripcion",
  unidad: "unidad",
  metrado: "metrado",
  puRef: "precio_unitario_ref",
  observacion: "observaciones",
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function rawCellValue(row, columnKey) {
  const node = row.raw?.node;
  if (columnKey === "descripcion") return node?.descripcion ?? row.descripcion ?? "";
  if (columnKey === "unidad") return node?.unidad ?? row.unidad ?? "";
  if (columnKey === "metrado") return node?.metrado ?? "";
  if (columnKey === "puRef") return node?.precio_unitario_ref ?? "";
  if (columnKey === "observacion") return node?.observaciones ?? "";
  return row[columnKey] ?? "";
}

function displayCellValue(row, columnKey, draftValue) {
  if (draftValue !== undefined) return draftValue;
  if (row.kind === "container" && ["unidad", "metrado", "puRef", "observacion"].includes(columnKey)) return "";
  if (columnKey === "observacion") return row.observacion || "";
  return row[columnKey] ?? "";
}

function buildPayload(changes) {
  const payload = {};
  Object.entries(changes).forEach(([columnKey, value]) => {
    const field = FIELD_BY_COLUMN[columnKey];
    if (!field) return;
    if (field === "metrado" || field === "precio_unitario_ref") {
      payload[field] = parseNumberInput(value);
    } else {
      payload[field] = String(value ?? "").trim() || null;
    }
  });
  return payload;
}

export default function EdicionView({
  rows = [],
  apus = [],
  selectedProjectId,
  onDataChange,
  onSelectionCountChange,
}) {
  const displayRows = rows.length ? rows : emptyEditRows;
  const [activeCell, setActiveCell] = useState({ rowId: String(displayRows[0]?.id || "draft-1"), colKey: "descripcion" });
  const [selectionAnchor, setSelectionAnchor] = useState({ rowIndex: 0, colIndex: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ rowIndex: 0, colIndex: 0 });
  const [rowSelectionAnchor, setRowSelectionAnchor] = useState(0);
  const [rowSelectionEnd, setRowSelectionEnd] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [saveState, setSaveState] = useState("Sin cambios pendientes");
  const [error, setError] = useState("");
  const [pendingFocusRowId, setPendingFocusRowId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(-1);
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [collapsedTreeIds, setCollapsedTreeIds] = useState(new Set());
  const [showTree, setShowTree] = useState(true);

  const activeRow = displayRows.find((row) => row.id === activeCell.rowId);
  const canEditActiveRow = activeRow?.kind === "line";
  const canDeleteActiveRow = Boolean(activeRow?.sourceId);
  const canStructureActiveRow = Boolean(activeRow?.sourceId);
  const dirtyCount = Object.values(drafts).reduce((sum, rowDraft) => sum + Object.keys(rowDraft).length, 0);
  const activeTreeId = activeRow?.kind === "container" ? activeRow.id : activeRow?.parentId || "all";
  const treeRows = useMemo(() => visibleContainers(displayRows, collapsedTreeIds), [collapsedTreeIds, displayRows]);
  const activeRowIndex = displayRows.findIndex((row) => row.id === activeCell.rowId);
  const activeColIndex = editColumns.findIndex((column) => column.key === activeCell.colKey);

  const searchMatches = useMemo(() => {
    const query = normalizeText(searchQuery.trim());
    if (!query) return [];
    return displayRows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => normalizeText([
        row.descripcion,
        row.unidad,
        row.observacion,
        row.raw?.node?.observaciones,
      ].join(" ")).includes(query));
  }, [displayRows, searchQuery]);

  const activeSuggestions = useMemo(() => {
    if (!activeRow || activeRow.kind !== "line" || !["descripcion", "unidad"].includes(activeCell.colKey)) return [];
    const draftValue = drafts[activeRow.id]?.[activeCell.colKey];
    const query = normalizeText(displayCellValue(activeRow, activeCell.colKey, draftValue)).trim();
    if (query.length < (activeCell.colKey === "unidad" ? 1 : 2)) return [];

    if (activeCell.colKey === "descripcion") {
      const rowMatches = displayRows
        .filter((row) => row.kind === "line" && row.id !== activeRow.id && normalizeText(row.descripcion).includes(query))
        .slice(0, 4)
        .map((row) => ({
          key: `row-${row.id}`,
          label: row.descripcion,
          detail: row.unidad ? `Fila existente | ${row.unidad}` : "Fila existente",
          unidad: row.unidad || "",
        }));
      const apuMatches = apus
        .filter((apu) => normalizeText(`${apu.codigo || ""} ${apu.nombre || ""}`).includes(query))
        .slice(0, 4)
        .map((apu) => ({
          key: `apu-${apu.id}`,
          label: apu.nombre || apu.codigo || "",
          detail: `APU ${apu.codigo || "-"} | ${apu.unidad || "sin unidad"}`,
          unidad: apu.unidad || "",
        }));
      return [...rowMatches, ...apuMatches].filter((item) => item.label).slice(0, 6);
    }

    const descriptionText = normalizeText(drafts[activeRow.id]?.descripcion ?? activeRow.descripcion);
    const units = new Map();
    displayRows
      .filter((row) => row.kind === "line" && row.unidad && normalizeText(row.unidad).includes(query))
      .forEach((row) => {
        const score = descriptionText && normalizeText(row.descripcion).includes(descriptionText.slice(0, 8)) ? 2 : 1;
        units.set(row.unidad, Math.max(units.get(row.unidad) || 0, score));
      });
    apus
      .filter((apu) => apu.unidad && normalizeText(apu.unidad).includes(query))
      .forEach((apu) => {
        const score = descriptionText && normalizeText(apu.nombre).includes(descriptionText.slice(0, 8)) ? 2 : 1;
        units.set(apu.unidad, Math.max(units.get(apu.unidad) || 0, score));
      });
    return [...units.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([unidad]) => ({ key: `unit-${unidad}`, label: unidad, detail: "Unidad sugerida", unidad }));
  }, [activeCell.colKey, activeRow, apus, displayRows, drafts]);

  const gridTemplate = useMemo(
    () => `42px ${editColumns.map((column) => column.width).join(" ")}`,
    []
  );

  const selectedRange = useMemo(() => ({
    rowStart: Math.min(selectionAnchor.rowIndex, selectionEnd.rowIndex),
    rowEnd: Math.max(selectionAnchor.rowIndex, selectionEnd.rowIndex),
    colStart: Math.min(selectionAnchor.colIndex, selectionEnd.colIndex),
    colEnd: Math.max(selectionAnchor.colIndex, selectionEnd.colIndex),
  }), [selectionAnchor, selectionEnd]);

  const selectedCellCount =
    (selectedRange.rowEnd - selectedRange.rowStart + 1) *
    (selectedRange.colEnd - selectedRange.colStart + 1);

  const selectedRowRange = useMemo(() => ({
    start: Math.min(rowSelectionAnchor, rowSelectionEnd),
    end: Math.max(rowSelectionAnchor, rowSelectionEnd),
  }), [rowSelectionAnchor, rowSelectionEnd]);

  const selectedRows = useMemo(() => {
    return displayRows.slice(selectedRowRange.start, selectedRowRange.end + 1).filter((row) => row?.sourceId);
  }, [displayRows, selectedRowRange]);

  const structureRows = useMemo(() => {
    return selectedRows.length ? selectedRows : (activeRow ? [activeRow] : []);
  }, [activeRow, selectedRows]);

  const moveAvailability = useMemo(() => {
    if (!structureRows.length) return { up: false, down: false };
    const parentIds = new Set(structureRows.map((row) => row.parentId || null));
    if (parentIds.size !== 1) return { up: false, down: false };
    const parentId = structureRows[0].parentId || null;
    const siblingRows = displayRows.filter((row) => (row.parentId || null) === parentId);
    const selectedIds = new Set(structureRows.map((row) => row.id));
    const indices = siblingRows
      .map((row, index) => selectedIds.has(row.id) ? index : -1)
      .filter((index) => index >= 0);
    if (!indices.length) return { up: false, down: false };
    const sorted = [...indices].sort((a, b) => a - b);
    const contiguous = sorted.every((index, position) => position === 0 || index === sorted[position - 1] + 1);
    if (!contiguous) return { up: false, down: false };
    return {
      up: sorted[0] > 0,
      down: sorted[sorted.length - 1] < siblingRows.length - 1,
    };
  }, [displayRows, structureRows]);

  useEffect(() => {
    onSelectionCountChange(selectedCellCount);
  }, [onSelectionCountChange, selectedCellCount]);

  useEffect(() => {
    setDrafts({});
    setSaveState("Sin cambios pendientes");
    setError("");
  }, [rows]);

  useEffect(() => {
    setSearchIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    const focusRowId = pendingFocusRowId || activeCell.rowId;
    if (!focusRowId || !displayRows.length) return;
    const rowIndex = displayRows.findIndex((row) => row.id === focusRowId);
    if (rowIndex < 0) return;
    const row = displayRows[rowIndex];
    setActiveCell((current) => ({ rowId: row.id, colKey: current.colKey || "descripcion" }));
    setSelectionAnchor({ rowIndex, colIndex: 0 });
    setSelectionEnd({ rowIndex, colIndex: editColumns.length - 1 });
    setRowSelectionAnchor(rowIndex);
    setRowSelectionEnd(rowIndex);
    if (pendingFocusRowId) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-budget-row-id="${focusRowId}"]`)?.scrollIntoView({
          block: "center",
          inline: "nearest",
        });
      });
    }
    if (pendingFocusRowId) setPendingFocusRowId("");
  }, [activeCell.rowId, displayRows, pendingFocusRowId]);

  const isCellSelected = (rowIndex, colIndex) =>
    rowIndex >= selectedRange.rowStart &&
    rowIndex <= selectedRange.rowEnd &&
    colIndex >= selectedRange.colStart &&
    colIndex <= selectedRange.colEnd;

  const startCellSelection = (row, rowIndex, column, colIndex) => {
    const next = { rowIndex, colIndex };
    setActiveCell({ rowId: row.id, colKey: column.key });
    setSelectionAnchor(next);
    setSelectionEnd(next);
    setRowSelectionAnchor(rowIndex);
    setRowSelectionEnd(rowIndex);
    setDragging(true);
  };

  const selectRow = (row, rowIndex, extend = false) => {
    setActiveCell({ rowId: row.id, colKey: "descripcion" });
    setSelectionAnchor({ rowIndex, colIndex: 0 });
    setSelectionEnd({ rowIndex, colIndex: editColumns.length - 1 });
    if (extend) {
      setRowSelectionEnd(rowIndex);
    } else {
      setRowSelectionAnchor(rowIndex);
      setRowSelectionEnd(rowIndex);
    }
  };

  const focusRow = (row, rowIndex, colKey = "descripcion") => {
    setActiveCell({ rowId: row.id, colKey });
    setSelectionAnchor({ rowIndex, colIndex: 0 });
    setSelectionEnd({ rowIndex, colIndex: editColumns.length - 1 });
    setRowSelectionAnchor(rowIndex);
    setRowSelectionEnd(rowIndex);
    requestAnimationFrame(() => {
      document.querySelector(`[data-budget-row-id="${row.id}"]`)?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });
  };

  const goToSearchMatch = (direction = 1) => {
    if (!searchMatches.length) return;
    const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    const match = searchMatches[nextIndex];
    setSearchIndex(nextIndex);
    focusRow(match.row, match.rowIndex);
  };

  const selectTreeRow = (rowId) => {
    if (rowId === "all") {
      const firstRow = displayRows[0];
      if (firstRow) focusRow(firstRow, 0);
      return;
    }
    const rowIndex = displayRows.findIndex((row) => row.id === rowId);
    if (rowIndex < 0) return;
    focusRow(displayRows[rowIndex], rowIndex);
  };

  const toggleTreeCollapse = (rowId) => {
    setCollapsedTreeIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const askConfirm = (config) => {
    setConfirmConfig(config);
  };

  const closeConfirm = () => {
    setConfirmConfig(null);
  };

  const runConfirmed = () => {
    const action = confirmConfig?.onConfirm;
    setConfirmConfig(null);
    action?.();
  };

  const extendCellSelection = (row, rowIndex, column, colIndex) => {
    if (!dragging) return;
    setActiveCell({ rowId: row.id, colKey: column.key });
    setSelectionEnd({ rowIndex, colIndex });
  };

  const updateDraft = (row, columnKey, value) => {
    const original = rawCellValue(row, columnKey);
    setError("");
    setDrafts((current) => {
      const next = { ...current };
      const rowDraft = { ...(next[row.id] || {}) };
      if (String(value ?? "") === String(original ?? "")) {
        delete rowDraft[columnKey];
      } else {
        rowDraft[columnKey] = value;
      }
      if (Object.keys(rowDraft).length) next[row.id] = rowDraft;
      else delete next[row.id];
      return next;
    });
    setSaveState("Cambios pendientes");
  };

  const handleGridPaste = (event) => {
    const text = event.clipboardData?.getData("text/plain") || "";
    if (!text.includes("\t") && !text.includes("\n")) return;
    if (activeRowIndex < 0 || activeColIndex < 0) return;
    event.preventDefault();
    setError("");

    const pastedRows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, index, lines) => line.length || index < lines.length - 1)
      .map((line) => line.split("\t"));

    let changed = 0;
    pastedRows.forEach((cells, rowOffset) => {
      const targetRow = displayRows[activeRowIndex + rowOffset];
      if (!targetRow || targetRow.kind !== "line") return;
      cells.forEach((cellValue, colOffset) => {
        const targetColumn = editColumns[activeColIndex + colOffset];
        if (!targetColumn?.editable) return;
        updateDraft(targetRow, targetColumn.key, cellValue);
        changed += 1;
      });
    });

    if (changed) setSaveState(`Pegado aplicado: ${changed} celda(s) pendientes`);
  };

  const applySuggestion = (row, columnKey, suggestion) => {
    if (!row || !suggestion) return;
    if (columnKey === "descripcion") {
      updateDraft(row, "descripcion", suggestion.label);
      const currentUnit = drafts[row.id]?.unidad ?? row.unidad;
      if (!currentUnit && suggestion.unidad) updateDraft(row, "unidad", suggestion.unidad);
    } else if (columnKey === "unidad") {
      updateDraft(row, "unidad", suggestion.unidad || suggestion.label);
    }
  };

  const saveChanges = async () => {
    if (!dirtyCount) return;
    setSaveState("Guardando...");
    setError("");
    try {
      for (const [rowId, changes] of Object.entries(drafts)) {
        const row = displayRows.find((item) => String(item.id) === String(rowId));
        if (!row || row.kind !== "line") continue;
        const response = await fetch(`${API}/presupuestos/nodos/${row.sourceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(changes)),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.detail || "No se pudo guardar una fila.");
        }
      }
      setDrafts({});
      setSaveState("Cambios guardados");
      onDataChange?.();
    } catch (err) {
      setSaveState("Cambios pendientes");
      setError(err.message || "No se pudieron guardar los cambios.");
    }
  };

  const addRowBelow = async () => {
    if (!selectedProjectId || !canEditActiveRow) return;
    setSaveState("Agregando fila...");
    setError("");
    try {
      const response = await fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/nodos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          despues_de_id: activeRow.sourceId,
          descripcion: "",
          unidad: activeRow.unidad || "",
          metrado: null,
          precio_unitario_ref: null,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "No se pudo agregar la fila.");
      }
      setSaveState("Fila agregada");
      onDataChange?.();
    } catch (err) {
      setSaveState(dirtyCount ? "Cambios pendientes" : "Sin cambios pendientes");
      setError(err.message || "No se pudo agregar la fila.");
    }
  };

  const deleteActiveRow = async () => {
    if (!canDeleteActiveRow) return;
    setSaveState("Eliminando bloque...");
    setError("");
    try {
      const response = await fetch(`${API}/presupuestos/nodos/${activeRow.sourceId}/bloque`, { method: "DELETE" });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "No se pudo eliminar la fila.");
      }
      const detail = await response.json().catch(() => null);
      setSaveState(`Eliminado: ${detail?.eliminados || 1} fila(s)`);
      onDataChange?.();
    } catch (err) {
      setSaveState(dirtyCount ? "Cambios pendientes" : "Sin cambios pendientes");
      setError(err.message || "No se pudo eliminar la fila.");
    }
  };

  const contiguousRowsBelow = (row) => {
    if (!row) return [];
    const startIndex = displayRows.findIndex((item) => item.id === row.id);
    if (startIndex < 0) return [];
    const result = [];
    for (let index = startIndex + 1; index < displayRows.length; index += 1) {
      const candidate = displayRows[index];
      if (!candidate || candidate.level < row.level) break;
      if (candidate.level === row.level) result.push(candidate);
    }
    return result;
  };

  const hasVisibleChildren = (row) => {
    if (!row) return false;
    const startIndex = displayRows.findIndex((item) => item.id === row.id);
    if (startIndex < 0 || startIndex >= displayRows.length - 1) return false;
    return displayRows[startIndex + 1]?.level > row.level;
  };

  const lowerBlockIds = (row) => contiguousRowsBelow(row).map((item) => item.sourceId).filter(Boolean);

  const runStructureAction = async (accion, sourceIds) => {
    if (!sourceIds.length) return;
    if (dirtyCount) {
      setError("Guarda o descarta los cambios pendientes antes de modificar estructura.");
      return;
    }
    setSaveState("Actualizando estructura...");
    setError("");
    try {
      const response = await fetch(`${API}/presupuestos/nodos/${sourceIds[0]}/mover-estructura`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, nodo_ids: sourceIds }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || "No se pudo actualizar la estructura.");
      }
      const focusId = activeRow?.id || String(sourceIds[0]);
      setPendingFocusRowId(focusId);
      setSaveState("Estructura actualizada");
      onDataChange?.();
    } catch (err) {
      setSaveState("Sin cambios pendientes");
      setError(err.message || "No se pudo actualizar la estructura.");
    }
  };

  const structureSelectionIds = () => {
    return structureRows.map((row) => row.sourceId).filter(Boolean);
  };

  const moveRows = (accion) => {
    runStructureAction(accion, structureSelectionIds());
  };

  const applyIndent = () => {
    if (!canStructureActiveRow) return;
    const selectedIds = structureSelectionIds();
    if (selectedIds.length > 1) {
      runStructureAction("sangrar", selectedIds);
      return;
    }
    const blockIds = hasVisibleChildren(activeRow) ? [] : lowerBlockIds(activeRow);
    if (blockIds.length) {
      askConfirm({
        title: "Aplicar sangria",
        body: `"${activeRow.descripcion}" puede convertirse en grupo.`,
        detail: `Se movera tambien ${blockIds.length} fila(s) de abajo como parte de este grupo. Si cancelas, se aplicara solo a la fila seleccionada.`,
        confirmLabel: "Mover con bloque",
        onConfirm: () => {
          runStructureAction("agrupar_abajo", [activeRow.sourceId, ...blockIds]);
        },
      });
      return;
    }
    runStructureAction("sangrar", [activeRow.sourceId]);
  };

  const confirmRemoveIndent = (onConfirm) => {
    askConfirm({
      title: "Quitar sangria",
      body: `"${activeRow.descripcion}" puede reubicarse al final del grupo actual.`,
      detail: "Si confirmas, la tabla te llevara automaticamente a la nueva ubicacion.",
      confirmLabel: "Quitar sangria",
      onConfirm,
    });
  };

  const removeIndent = () => {
    if (!canStructureActiveRow) return;
    const selectedIds = structureSelectionIds();
    if (selectedIds.length > 1) {
      confirmRemoveIndent(() => runStructureAction("quitar_sangria", selectedIds));
      return;
    }
    const blockIds = hasVisibleChildren(activeRow) ? [] : lowerBlockIds(activeRow);
    if (blockIds.length) {
      askConfirm({
        title: "Quitar sangria",
        body: `"${activeRow.descripcion}" puede salir con filas de abajo.`,
        detail: `Se movera tambien ${blockIds.length} fila(s) de abajo para conservar el bloque. Si cancelas, no se modifica la estructura.`,
        confirmLabel: "Mover con bloque",
        onConfirm: () => {
          runStructureAction("quitar_sangria_con_bloque", [activeRow.sourceId, ...blockIds]);
        },
      });
      return;
    }
    confirmRemoveIndent(() => runStructureAction("quitar_sangria", [activeRow.sourceId]));
  };

  const confirmDeleteActiveRow = () => {
    if (!canDeleteActiveRow) return;
    const startIndex = displayRows.findIndex((item) => item.id === activeRow.id);
    let blockSize = 1;
    if (startIndex >= 0) {
      for (let index = startIndex + 1; index < displayRows.length; index += 1) {
        if (displayRows[index].level <= activeRow.level) break;
        blockSize += 1;
      }
    }
    askConfirm({
      title: blockSize > 1 ? "Eliminar grupo" : "Eliminar fila",
      body: `"${activeRow.descripcion || "Fila sin descripcion"}" saldra de la grilla.`,
      detail: blockSize > 1
        ? `Se borrara realmente este grupo y ${blockSize - 1} fila(s) hija(s). Se creara un respaldo automatico antes de eliminar.`
        : "Se borrara realmente esta fila. Se creara un respaldo automatico antes de eliminar.",
      confirmLabel: blockSize > 1 ? "Eliminar bloque" : "Eliminar fila",
      danger: true,
      onConfirm: deleteActiveRow,
    });
  };

  return (
    <>
      <div className="budget-v2-toolbar">
        <div className="budget-v2-toolbar-group">
          <button type="button" disabled={!canEditActiveRow} onClick={addRowBelow}>Agregar fila</button>
          <button type="button" disabled={!canDeleteActiveRow} onClick={confirmDeleteActiveRow}>Eliminar fila</button>
        </div>
        <div className="budget-v2-toolbar-group">
          <button type="button" disabled={!canStructureActiveRow || Boolean(dirtyCount) || !moveAvailability.up} onClick={() => moveRows("subir")}>Subir</button>
          <button type="button" disabled={!canStructureActiveRow || Boolean(dirtyCount) || !moveAvailability.down} onClick={() => moveRows("bajar")}>Bajar</button>
          <button type="button" disabled={!canStructureActiveRow || Boolean(dirtyCount)} onClick={applyIndent}>Aplicar sangria</button>
          <button type="button" disabled={!canStructureActiveRow || Boolean(dirtyCount)} onClick={removeIndent}>Quitar sangria</button>
        </div>
        <div className="budget-v2-toolbar-spacer" />
        <div className="budget-v2-search" role="search">
          <input
            type="search"
            value={searchQuery}
            placeholder="Buscar en edicion..."
            aria-label="Buscar en edicion"
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
        <span className={`budget-v2-save-state ${dirtyCount ? "budget-v2-save-state-dirty" : ""}`}>{saveState}</span>
        <button type="button" className="budget-v2-save-button" disabled={!dirtyCount} onClick={saveChanges}>Guardar</button>
      </div>
      {error && <div className="budget-v2-edit-error">{error}</div>}

      <div className={`budget-v2-edit-layout ${!showTree ? "budget-v2-left-collapsed" : ""}`}>
        <CollapsibleSidePanel side="left" label="EDT" open={showTree} onToggle={() => setShowTree(value => !value)}>
          <PresupuestoTree
            rows={treeRows}
            selectedTreeId={activeTreeId}
            onSelect={selectTreeRow}
            collapsedTreeIds={collapsedTreeIds}
            onToggleCollapse={toggleTreeCollapse}
            mode="edicion"
          />
        </CollapsibleSidePanel>

        <div
          className="budget-v2-grid-shell"
          onPaste={handleGridPaste}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
        >
          <div className="budget-v2-grid-header" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="budget-v2-grid-corner" />
            {editColumns.map((column) => (
              <div key={column.key} className="budget-v2-grid-th">
                {column.label}
              </div>
            ))}
          </div>

          <div className="budget-v2-grid-body">
            {displayRows.map((row, rowIndex) => (
              <div
                key={row.id}
                data-budget-row-id={row.id}
                className={`budget-v2-grid-row ${row.kind === "container" ? "budget-v2-grid-row-container" : ""} ${rowIndex >= selectedRowRange.start && rowIndex <= selectedRowRange.end ? "budget-v2-grid-row-selected" : ""}`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <button
                  type="button"
                  className="budget-v2-row-number"
                  aria-label={`Seleccionar fila ${rowIndex + 1}`}
                  onClick={(event) => selectRow(row, rowIndex, event.shiftKey)}
                >
                  {rowIndex + 1}
                </button>
                {editColumns.map((column, colIndex) => {
                  const active = activeCell.rowId === row.id && activeCell.colKey === column.key;
                  const selected = isCellSelected(rowIndex, colIndex);
                  const editable = column.editable && row.kind === "line";
                  const draftValue = drafts[row.id]?.[column.key];
                  const value = displayCellValue(row, column.key, draftValue);
                  const dirty = draftValue !== undefined;

                  return (
                    <button
                      key={column.key}
                      type="button"
                      className={`budget-v2-cell ${selected ? "budget-v2-cell-selected" : ""} ${active ? "budget-v2-cell-active" : ""} ${!editable ? "budget-v2-cell-readonly" : ""} ${dirty ? "budget-v2-cell-dirty" : ""}`}
                      onMouseDown={() => startCellSelection(row, rowIndex, column, colIndex)}
                      onMouseEnter={() => extendCellSelection(row, rowIndex, column, colIndex)}
                      style={{
                        textAlign: column.align,
                        paddingLeft: column.key === "descripcion" ? `${12 + row.level * 18}px` : undefined,
                        fontWeight: row.kind === "container" && column.key === "descripcion" ? 800 : undefined,
                      }}
                    >
                      {active && editable ? (
                        <input
                          autoFocus
                          className="budget-v2-cell-input"
                          value={String(value ?? "")}
                          onChange={(event) => updateDraft(row, column.key, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onPaste={handleGridPaste}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveChanges();
                            if (event.key === "Escape") setActiveCell({ rowId: row.id, colKey: column.key });
                          }}
                        />
                      ) : (
                        value
                      )}
                      {active && editable && activeSuggestions.length > 0 && (
                        <div className="budget-v2-cell-suggestions">
                          {activeSuggestions.map((suggestion) => (
                            <div
                              key={suggestion.key}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                applySuggestion(row, column.key, suggestion);
                              }}
                            >
                              <strong>{suggestion.label}</strong>
                              <small>{suggestion.detail}</small>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmConfig && (
        <ModalShell
          title={confirmConfig.title}
          size="sm"
          onClose={closeConfirm}
          footer={(
            <>
              <ActionButton compact variant="secondary" onClick={closeConfirm}>Cancelar</ActionButton>
              <ActionButton compact variant={confirmConfig.danger ? "danger" : "primary"} onClick={runConfirmed}>
                {confirmConfig.confirmLabel || "Confirmar"}
              </ActionButton>
            </>
          )}
        >
          <div className="budget-v2-confirm-modal">
            <strong>{confirmConfig.body}</strong>
            {confirmConfig.detail && <span>{confirmConfig.detail}</span>}
          </div>
        </ModalShell>
      )}
    </>
  );
}
