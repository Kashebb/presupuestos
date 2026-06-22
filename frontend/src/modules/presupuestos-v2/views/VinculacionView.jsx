import { useEffect, useMemo, useState } from "react";
import { budgetRows, statusMeta, vincFilters } from "../mockData";
import { descendantsOf, visibleContainers } from "../logic/tree";
import PanelApu from "../components/PanelApu";
import PresupuestoTree from "../components/PresupuestoTree";

export default function VinculacionView({ selectedTreeId, setSelectedTreeId, selectedRowId, setSelectedRowId, onVisibleCountChange }) {
  const [vincFilter, setVincFilter] = useState("pendiente");
  const [collapsedTreeIds, setCollapsedTreeIds] = useState(new Set());

  const visibleRows = useMemo(() => {
    const scopedIds = descendantsOf(budgetRows, selectedTreeId);
    const scopedRows = budgetRows.filter((row) => scopedIds.has(row.id));
    if (vincFilter === "todos") return scopedRows;
    return scopedRows.filter((row) => row.kind === "container" || row.estado === vincFilter);
  }, [selectedTreeId, vincFilter]);

  const treeRows = useMemo(() => visibleContainers(budgetRows, collapsedTreeIds), [collapsedTreeIds]);
  const selectedRow = budgetRows.find((row) => row.id === selectedRowId);
  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  const toggleTreeCollapse = (rowId) => {
    setCollapsedTreeIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  return (
    <div className="budget-v2-linking-layout">
      <PresupuestoTree
        rows={treeRows}
        selectedTreeId={selectedTreeId}
        onSelect={setSelectedTreeId}
        collapsedTreeIds={collapsedTreeIds}
        onToggleCollapse={toggleTreeCollapse}
        mode="vinculacion"
      />

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
          <button type="button" disabled={!selectedRow || selectedRow.kind !== "line"}>Vincular APU</button>
          <button type="button" disabled={!selectedRow || selectedRow.kind !== "line"}>No aplica</button>
          <button type="button" disabled={!selectedRow || selectedRow.kind !== "line"}>Crear APU</button>
        </div>

        <div className="budget-v2-link-table">
          <div className="budget-v2-link-head">
            <span>Descripcion / estructura</span>
            <span>P.U. Meta</span>
            <span>P.T. Meta</span>
            <span>Estado</span>
          </div>
          <div className="budget-v2-link-body">
            {visibleRows.map((row) => {
              const isContainer = row.kind === "container";
              const selected = selectedRowId === row.id;
              const meta = statusMeta[row.estado] || {};
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`budget-v2-link-row ${isContainer ? "budget-v2-link-container" : ""} ${selected ? "budget-v2-link-selected" : ""}`}
                  onClick={() => setSelectedRowId(row.id)}
                >
                  <span>
                    <strong>{row.descripcion}</strong>
                    <small>{isContainer ? "" : `${row.unidad} | ${row.metrado} | P.U. meta ${row.puMeta || "-"}`}</small>
                  </span>
                  <span>{isContainer ? "" : (row.puMeta || "-")}</span>
                  <span>{row.ptMeta || "-"}</span>
                  <span>{!isContainer && <em className={meta.className}>{meta.label}</em>}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <PanelApu selectedRow={selectedRow} />
    </div>
  );
}
