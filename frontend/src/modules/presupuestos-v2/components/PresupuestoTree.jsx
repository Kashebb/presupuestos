import { useMemo, useState } from "react";
import { treeStatusClass } from "../logic/tree";

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function PresupuestoTree({
  rows,
  selectedTreeId,
  onSelect,
  collapsedTreeIds,
  onToggleCollapse,
  mode = "vinculacion",
  markerIds,
}) {
  const [treeSearch, setTreeSearch] = useState("");
  const markerSet = markerIds instanceof Set ? markerIds : new Set(markerIds || []);
  const query = normalizarTexto(treeSearch.trim());
  const filteredRows = useMemo(() => {
    if (!query) return rows;
    return rows.filter((row) => normalizarTexto(row.descripcion).includes(query));
  }, [query, rows]);
  const markerPositions = filteredRows
    .map((row, index) => markerSet.has(row.id) ? { id: row.id, top: filteredRows.length <= 1 ? 0 : (index / (filteredRows.length - 1)) * 100 } : null)
    .filter(Boolean);

  return (
    <aside className="budget-v2-tree-panel">
      <div className="budget-v2-panel-head">
        <strong>EDT</strong>
        <span>{mode === "edicion" ? "Contexto visual" : "Filtro"}</span>
      </div>
      <div className="budget-v2-tree-search" role="search">
        <input
          type="search"
          value={treeSearch}
          placeholder="Buscar en arbol..."
          aria-label="Buscar en arbol por descripcion"
          onChange={(event) => setTreeSearch(event.target.value)}
        />
        <span>{treeSearch.trim() ? `${filteredRows.length} resultado(s)` : "Descripcion"}</span>
      </div>
      <div className="budget-v2-tree-scroll-frame">
        <div className="budget-v2-tree-scroll">
          <button type="button" className={`budget-v2-tree-item ${selectedTreeId === "all" ? "budget-v2-tree-active" : ""}`} onClick={() => onSelect("all")}>
            <span>Presupuesto completo</span>
            <small>{mode === "edicion" ? "Ir al inicio" : "Ver todo"}</small>
          </button>
          {filteredRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`budget-v2-tree-item ${selectedTreeId === row.id ? "budget-v2-tree-active" : ""} ${markerSet.has(row.id) ? "budget-v2-tree-marked" : ""}`}
              onClick={() => onSelect(row.id)}
              style={{ paddingLeft: `${12 + row.level * 14}px` }}
            >
              {mode === "vinculacion" || mode === "edicion" || mode === "desglose" ? (
                <span className="budget-v2-tree-label">
                  <span
                    className="budget-v2-tree-toggle"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleCollapse?.(row.id);
                    }}
                  >
                    {collapsedTreeIds?.has(row.id) ? ">" : "v"}
                  </span>
                  <span>{row.descripcion}</span>
                  {row.paquete && <em className="budget-v2-tree-package">{row.paquete.estado === "liberado" ? "Liberado" : "Paquete"}</em>}
                  <i className={`budget-v2-tree-dot ${treeStatusClass(row)}`} />
                </span>
              ) : (
                <span>{row.descripcion}</span>
              )}
              <small>
                {mode === "analisis"
                  ? row.ptMeta
                  : mode === "edicion"
                    ? `${row.lines} rubro(s)`
                    : mode === "desglose"
                      ? `${row.lines} rubro(s)`
                      : `${row.linked}/${row.lines} vinculadas`}
              </small>
            </button>
          ))}
          {treeSearch.trim() && !filteredRows.length && (
            <div className="budget-v2-tree-empty">Sin coincidencias en el arbol.</div>
          )}
        </div>
        {markerPositions.length > 0 && (
          <div className="budget-v2-tree-scroll-marks" aria-hidden="true">
            {markerPositions.map((marker) => (
              <i key={marker.id} style={{ top: `${marker.top}%` }} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
