import { useEffect, useMemo, useState } from "react";
import CollapsibleSidePanel from "../components/CollapsibleSidePanel";
import PanelApu from "../components/PanelApu";
import PresupuestoTree from "../components/PresupuestoTree";
import { descendantsOf, visibleContainers } from "../logic/tree";

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function DesgloseView({
  rows = [],
  selectedTreeId,
  setSelectedTreeId,
  selectedRowId,
  setSelectedRowId,
  onVisibleCountChange,
}) {
  const [collapsedTreeIds, setCollapsedTreeIds] = useState(new Set());
  const [showTree, setShowTree] = useState(true);
  const [showApuPanel, setShowApuPanel] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(-1);

  const visibleRows = useMemo(() => {
    const scopedIds = descendantsOf(rows, selectedTreeId);
    return rows.filter((row) => scopedIds.has(row.id));
  }, [rows, selectedTreeId]);

  const treeRows = useMemo(() => visibleContainers(rows, collapsedTreeIds), [collapsedTreeIds, rows]);
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

  useEffect(() => {
    onVisibleCountChange(visibleRows.length);
  }, [onVisibleCountChange, visibleRows.length]);

  useEffect(() => {
    setSearchIndex(-1);
  }, [searchQuery, selectedTreeId]);

  const toggleTreeCollapse = (rowId) => {
    setCollapsedTreeIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
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

  const goToSearchMatch = (direction = 1) => {
    if (!searchMatches.length) return;
    const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    const match = searchMatches[nextIndex];
    setSearchIndex(nextIndex);
    setSelectedRowId(match.row.id);
    requestAnimationFrame(() => {
      document.querySelector(`[data-budget-breakdown-row-id="${match.row.id}"]`)?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });
  };

  return (
    <div className={`budget-v2-linking-layout budget-v2-breakdown-layout ${!showTree ? "budget-v2-left-collapsed" : ""} ${!showApuPanel ? "budget-v2-right-collapsed" : ""}`}>
      <CollapsibleSidePanel side="left" label="EDT" open={showTree} onToggle={() => setShowTree(value => !value)}>
        <PresupuestoTree
          rows={treeRows}
          selectedTreeId={selectedTreeId}
          onSelect={selectTreeRow}
          collapsedTreeIds={collapsedTreeIds}
          onToggleCollapse={toggleTreeCollapse}
          mode="desglose"
        />
      </CollapsibleSidePanel>

      <section className="budget-v2-linking-main">
        <div className="budget-v2-linking-toolbar">
          <div className="budget-v2-filter-group">
            <button type="button" className="budget-v2-filter-active">Desglose por rubro</button>
          </div>
          <div className="budget-v2-toolbar-spacer" />
          <div className="budget-v2-search" role="search">
            <input
              type="search"
              value={searchQuery}
              placeholder="Buscar en desglose..."
              aria-label="Buscar en desglose"
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

        <div className="budget-v2-link-table budget-v2-breakdown-table">
          <div className="budget-v2-link-head budget-v2-breakdown-head">
            <span>Descripcion / estructura</span>
            <span>Variante APU</span>
            <span>Materiales</span>
            <span>Mano de obra</span>
            <span>Equipos</span>
            <span>Transporte</span>
            <span>Herr. menor</span>
            <span>Total APU</span>
          </div>
          <div className="budget-v2-link-body">
            {visibleRows.map((row) => {
              const isContainer = row.kind === "container";
              const selected = selectedRowId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  data-budget-breakdown-row-id={row.id}
                  className={`budget-v2-link-row budget-v2-breakdown-grid-row ${isContainer ? "budget-v2-link-container" : ""} ${selected ? "budget-v2-link-selected" : ""}`}
                  onClick={() => setSelectedRowId(row.id)}
                >
                  <span style={{ paddingLeft: `${10 + row.level * 18}px` }}>
                    <strong>{row.descripcion}</strong>
                    {!isContainer && <small>{row.unidad} | {row.metrado} | {row.apu || "sin APU"}</small>}
                  </span>
                  <span>{!isContainer && row.raw?.node?.apu_id ? row.varianteApu || "Base" : ""}</span>
                  <span>{row.desglose?.material || "-"}</span>
                  <span>{row.desglose?.mano_de_obra || "-"}</span>
                  <span>{row.desglose?.equipo || "-"}</span>
                  <span>{row.desglose?.transporte || "-"}</span>
                  <span>{row.desglose?.herramienta_menor || "-"}</span>
                  <span>{row.ptMeta || "-"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <CollapsibleSidePanel side="right" label="Panel APU" open={showApuPanel} onToggle={() => setShowApuPanel(value => !value)}>
        <PanelApu selectedRow={selectedRow} />
      </CollapsibleSidePanel>
    </div>
  );
}
