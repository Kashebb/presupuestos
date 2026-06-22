import { treeStatusClass } from "../logic/tree";

export default function PresupuestoTree({
  rows,
  selectedTreeId,
  onSelect,
  collapsedTreeIds,
  onToggleCollapse,
  mode = "vinculacion",
}) {
  return (
    <aside className="budget-v2-tree-panel">
      <div className="budget-v2-panel-head">
        <strong>EDT</strong>
        <span>{mode === "analisis" ? "Filtro" : "Contexto visual"}</span>
      </div>
      <div className="budget-v2-tree-scroll">
        <button type="button" className={`budget-v2-tree-item ${selectedTreeId === "all" ? "budget-v2-tree-active" : ""}`} onClick={() => onSelect("all")}>
          <span>Presupuesto completo</span>
          <small>{mode === "analisis" ? "Analisis global" : "Lectura global"}</small>
        </button>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`budget-v2-tree-item ${selectedTreeId === row.id ? "budget-v2-tree-active" : ""}`}
            onClick={() => onSelect(row.id)}
            style={{ paddingLeft: `${12 + row.level * 14}px` }}
          >
            {mode === "vinculacion" ? (
              <span className="budget-v2-tree-label">
                <span
                  className="budget-v2-tree-toggle"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleCollapse(row.id);
                  }}
                >
                  {collapsedTreeIds.has(row.id) ? ">" : "v"}
                </span>
                <span>{row.descripcion}</span>
                <i className={`budget-v2-tree-dot ${treeStatusClass(row)}`} />
              </span>
            ) : (
              <span>{row.descripcion}</span>
            )}
            <small>{mode === "analisis" ? row.ptMeta : `${row.linked}/${row.lines} vinculadas`}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}
