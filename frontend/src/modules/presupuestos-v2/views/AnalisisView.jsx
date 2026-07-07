import { useEffect, useMemo, useState } from "react";
import DetalleAnalisis from "../components/DetalleAnalisis";
import PresupuestoTree from "../components/PresupuestoTree";
import CollapsibleSidePanel from "../components/CollapsibleSidePanel";
import { analysisFilters, statusMeta } from "../data";
import { descendantsOf, nearestContainerIdsForRows } from "../logic/tree";

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function AnalisisView({ rows = [], selectedTreeId, setSelectedTreeId, selectedRowId, setSelectedRowId, onVisibleCountChange }) {
  const [analysisFilter, setAnalysisFilter] = useState("todos");
  const [showTree, setShowTree] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(-1);
  const treeRows = rows.filter((row) => row.kind === "container");

  const visibleRows = useMemo(() => {
    const scopedIds = descendantsOf(rows, selectedTreeId);
    const scopedRows = rows.filter((row) => scopedIds.has(row.id));
    if (analysisFilter === "todos") return scopedRows;
    if (analysisFilter === "impacto") return scopedRows.filter((row) => row.kind === "container" || row.dif);
    if (analysisFilter === "positivos") return scopedRows.filter((row) => row.kind === "container" || row.raw?.diff > 0);
    if (analysisFilter === "sin_meta") return scopedRows.filter((row) => row.kind === "container" || row.estado === "pendiente");
    return scopedRows.filter((row) => row.kind === "container" || row.estado === analysisFilter);
  }, [analysisFilter, rows, selectedTreeId]);

  const selectedRow = rows.find((row) => row.id === selectedRowId);
  const searchMatches = useMemo(() => {
    const query = normalizarTexto(searchQuery.trim());
    if (!query) return [];
    return visibleRows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => normalizarTexto([
        row.descripcion,
        row.unidad,
        row.apu,
        row.apuNombre,
        row.varianteApu,
      ].join(" ")).includes(query));
  }, [searchQuery, visibleRows]);
  const treeMarkerIds = useMemo(
    () => nearestContainerIdsForRows(rows, searchMatches.map((match) => match.row)),
    [rows, searchMatches]
  );
  const summary = useMemo(() => {
    const lines = rows.filter((row) => row.kind === "line");
    const totalRef = lines.reduce((sum, row) => sum + (row.raw?.totalRef || 0), 0);
    const metaLines = lines.filter((row) => Number.isFinite(row.raw?.totalMeta));
    const totalMeta = metaLines.reduce((sum, row) => sum + (row.raw?.totalMeta || 0), 0);
    const diff = metaLines.reduce((sum, row) => sum + (Number.isFinite(row.raw?.diff) ? row.raw.diff : 0), 0);
    const totalMoney = (value) => `$${Number(value || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const money = (value) => `$${Number(value || 0).toLocaleString("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    return {
      totalRef: totalMoney(totalRef),
      totalMeta: metaLines.length ? totalMoney(totalMeta) : "-",
      diff: metaLines.length ? money(diff) : "-",
      sinMeta: lines.filter((row) => row.estado === "pendiente").length,
    };
  }, [rows]);

  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  useEffect(() => {
    setSearchIndex(-1);
  }, [searchQuery, selectedTreeId, analysisFilter]);

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

  const goToSearchMatch = (direction = 1) => {
    if (!searchMatches.length) return;
    const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    const match = searchMatches[nextIndex];
    setSearchIndex(nextIndex);
    selectTableRow(match.row);
    requestAnimationFrame(() => {
      document.querySelector(`[data-budget-analysis-row-id="${match.row.id}"]`)?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });
  };

  return (
    <div className={`budget-v2-analysis-layout ${!showTree ? "budget-v2-left-collapsed" : ""} ${!showDetailPanel ? "budget-v2-right-collapsed" : ""}`}>
      <CollapsibleSidePanel side="left" label="EDT" open={showTree} onToggle={() => setShowTree(value => !value)}>
        <PresupuestoTree rows={treeRows} selectedTreeId={selectedTreeId} onSelect={selectTreeRow} mode="analisis" markerIds={treeMarkerIds} />
      </CollapsibleSidePanel>

      <section className="budget-v2-analysis-main">
        <div className="budget-v2-analysis-summary">
          <div><small>Total ref</small><strong>{summary.totalRef}</strong></div>
          <div><small>Total meta</small><strong>{summary.totalMeta}</strong></div>
          <div><small>Diferencia</small><strong className="budget-v2-diff-positive">{summary.diff}</strong></div>
          <div><small>Lineas sin meta</small><strong>{summary.sinMeta}</strong></div>
        </div>
        <div className="budget-v2-linking-toolbar">
          <div className="budget-v2-filter-group">
            {analysisFilters.map(([key, label]) => (
              <button key={key} type="button" className={analysisFilter === key ? "budget-v2-filter-active" : ""} onClick={() => setAnalysisFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="budget-v2-toolbar-spacer" />
          <div className="budget-v2-search" role="search">
            <input
              type="search"
              value={searchQuery}
              placeholder="Buscar en analisis..."
              aria-label="Buscar en analisis"
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
        <div className="budget-v2-analysis-table">
          <div className="budget-v2-analysis-head">
            <span>Descripcion / estructura</span>
            <span>P.T. Ref</span>
            <span>P.T. Meta</span>
            <span>Dif. $</span>
            <span>Dif. %</span>
            <span>Estado analisis</span>
          </div>
          <div className="budget-v2-link-body">
            {visibleRows.map((row) => {
              const isContainer = row.kind === "container";
              const selected = selectedRowId === row.id;
              const meta = statusMeta[row.estado] || {};
              const metaNoApu = row.estado === "sin_apu";
              return (
                <button
                  key={row.id}
                  type="button"
                  data-budget-analysis-row-id={row.id}
                  className={`budget-v2-analysis-row ${isContainer ? "budget-v2-link-container" : ""} ${selected ? "budget-v2-link-selected" : ""}`}
                  onClick={() => selectTableRow(row)}
                >
                  <span style={{ paddingLeft: `${10 + row.level * 18}px` }}>
                    <strong>{row.descripcion}</strong>
                    {!isContainer && <small>{row.unidad} | {row.metrado} | P.U. ref {row.puRef || "-"} | P.U. meta {row.puMeta || "-"}</small>}
                  </span>
                  <span>{row.ptRef || "-"}</span>
                  <span className={metaNoApu ? "budget-v2-meta-noapu" : ""}>{row.ptMeta || "-"}</span>
                  <span className={row.dif ? "budget-v2-diff-positive" : ""}>{row.dif || "-"}</span>
                  <span>{row.difPct || "-"}</span>
                  <span>{isContainer ? "" : <em className={meta.className}>{metaNoApu ? "Subcontratado" : meta.label}</em>}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <CollapsibleSidePanel side="right" label="Detalle" open={showDetailPanel} onToggle={() => setShowDetailPanel(value => !value)}>
        <DetalleAnalisis selectedRow={selectedRow} />
      </CollapsibleSidePanel>
    </div>
  );
}
