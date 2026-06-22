import { useEffect, useMemo, useState } from "react";
import DetalleAnalisis from "../components/DetalleAnalisis";
import PresupuestoTree from "../components/PresupuestoTree";
import { analysisFilters, statusMeta } from "../data";
import { descendantsOf } from "../logic/tree";

export default function AnalisisView({ rows = [], selectedTreeId, setSelectedTreeId, selectedRowId, setSelectedRowId, onVisibleCountChange }) {
  const [analysisFilter, setAnalysisFilter] = useState("todos");
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
  const summary = useMemo(() => {
    const lines = rows.filter((row) => row.kind === "line");
    const totalRef = lines.reduce((sum, row) => sum + (row.raw?.totalRef || 0), 0);
    const metaLines = lines.filter((row) => Number.isFinite(row.raw?.totalMeta));
    const totalMeta = metaLines.reduce((sum, row) => sum + (row.raw?.totalMeta || 0), 0);
    const diff = metaLines.reduce((sum, row) => sum + (Number.isFinite(row.raw?.diff) ? row.raw.diff : 0), 0);
    const money = (value) => `$${Number(value || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      totalRef: money(totalRef),
      totalMeta: metaLines.length ? money(totalMeta) : "-",
      diff: metaLines.length ? money(diff) : "-",
      sinMeta: lines.filter((row) => row.estado === "pendiente").length,
    };
  }, [rows]);

  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  return (
    <div className="budget-v2-analysis-layout">
      <PresupuestoTree rows={treeRows} selectedTreeId={selectedTreeId} onSelect={setSelectedTreeId} mode="analisis" />

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
                  className={`budget-v2-analysis-row ${isContainer ? "budget-v2-link-container" : ""} ${selected ? "budget-v2-link-selected" : ""}`}
                  onClick={() => setSelectedRowId(row.id)}
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

      <DetalleAnalisis selectedRow={selectedRow} />
    </div>
  );
}
