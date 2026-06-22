import { useEffect, useMemo, useState } from "react";
import { editColumns, emptyEditRows } from "../mockData";

export default function EdicionView({ rows = [], onSelectionCountChange }) {
  const displayRows = rows.length ? rows : emptyEditRows;
  const [activeCell, setActiveCell] = useState({ rowId: String(displayRows[0]?.id || "draft-1"), colKey: "descripcion" });
  const [selectionAnchor, setSelectionAnchor] = useState({ rowIndex: 0, colIndex: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ rowIndex: 0, colIndex: 0 });
  const [dragging, setDragging] = useState(false);

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

  useEffect(() => {
    onSelectionCountChange(selectedCellCount);
  }, [onSelectionCountChange, selectedCellCount]);

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
    setDragging(true);
  };

  const extendCellSelection = (row, rowIndex, column, colIndex) => {
    if (!dragging) return;
    setActiveCell({ rowId: row.id, colKey: column.key });
    setSelectionEnd({ rowIndex, colIndex });
  };

  return (
    <>
      <div className="budget-v2-toolbar">
        <div className="budget-v2-toolbar-group">
          <button type="button" disabled>Agregar fila</button>
          <button type="button" disabled>Eliminar fila</button>
        </div>
        <div className="budget-v2-toolbar-group">
          <button type="button" disabled>Aplicar sangria</button>
          <button type="button" disabled>Quitar sangria</button>
        </div>
        <div className="budget-v2-toolbar-spacer" />
        <span className="budget-v2-save-state">Sin cambios pendientes</span>
        <button type="button" className="budget-v2-save-button" disabled>Guardar</button>
      </div>

      <div className="budget-v2-grid-shell" onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}>
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
            <div key={row.id} className="budget-v2-grid-row" style={{ gridTemplateColumns: gridTemplate }}>
              <button type="button" className="budget-v2-row-number" aria-label={`Seleccionar fila ${rowIndex + 1}`}>
                {rowIndex + 1}
              </button>
              {editColumns.map((column, colIndex) => {
                const active = activeCell.rowId === row.id && activeCell.colKey === column.key;
                const selected = isCellSelected(rowIndex, colIndex);
                return (
                  <button
                    key={column.key}
                    type="button"
                    className={`budget-v2-cell ${selected ? "budget-v2-cell-selected" : ""} ${active ? "budget-v2-cell-active" : ""} ${!column.editable ? "budget-v2-cell-readonly" : ""}`}
                    onMouseDown={() => startCellSelection(row, rowIndex, column, colIndex)}
                    onMouseEnter={() => extendCellSelection(row, rowIndex, column, colIndex)}
                    style={{
                      textAlign: column.align,
                      paddingLeft: column.key === "descripcion" ? `${12 + row.level * 18}px` : undefined,
                      fontWeight: row.kind === "container" && column.key === "descripcion" ? 800 : undefined,
                    }}
                  >
                    {column.key === "observacion" && row.kind === "line" ? row.raw?.node?.observaciones || "" : row[column.key]}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
