import { useEffect, useMemo, useState } from "react";
import DetalleAnalisis from "../components/DetalleAnalisis";
import PresupuestoTree from "../components/PresupuestoTree";
import { analysisFilters, budgetRows, statusMeta } from "../mockData";
import { descendantsOf } from "../logic/tree";

export default function AnalisisView({ selectedTreeId, setSelectedTreeId, selectedRowId, setSelectedRowId, onVisibleCountChange }) {
  const [analysisFilter, setAnalysisFilter] = useState("todos");
  const treeRows = budgetRows.filter((row) => row.kind === "container");

  const visibleRows = useMemo(() => {
    const scopedIds = descendantsOf(budgetRows, selectedTreeId);
    const scopedRows = budgetRows.filter((row) => scopedIds.has(row.id));
    if (analysisFilter === "todos") return scopedRows;
    if (analysisFilter === "impacto") return scopedRows.filter((row) => row.kind === "container" || row.dif);
    if (analysisFilter === "positivos") return scopedRows.filter((row) => row.kind === "container" || row.dif?.startsWith("$"));
    if (analysisFilter === "sin_meta") return scopedRows.filter((row) => row.kind === "container" || row.estado === "pendiente");
    return scopedRows.filter((row) => row.kind === "container" || row.estado === analysisFilter);
  }, [analysisFilter, selectedTreeId]);

  const selectedRow = budgetRows.find((row) => row.id === selectedRowId);
  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  return (
    <div className="budget-v2-analysis-layout">
      <PresupuestoTree rows={treeRows} selectedTreeId={selectedTreeId} onSelect={setSelectedTreeId} mode="analisis" />

      <section className="budget-v2-analysis-main">
        <div className="budget-v2-analysis-summary">
          <div><small>Total ref</small><strong>$7,590.00</strong></div>
          <div><small>Total meta</small><strong>$8,057.24</strong></div>
          <div><small>Diferencia</small><strong className="budget-v2-diff-positive">$467.24</strong></div>
          <div><small>Lineas sin meta</small><strong>2</strong></div>
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
                  <span>{isContainer ? "" : <em className={meta.className}>{metaNoApu ? "Meta sin APU" : meta.label}</em>}</span>
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
