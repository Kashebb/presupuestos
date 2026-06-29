export default function CollapsibleSidePanel({
  side = "left",
  label,
  open,
  onToggle,
  children,
}) {
  if (!open) {
    return (
      <button
        type="button"
        className={`budget-v2-side-rail budget-v2-side-rail-${side}`}
        onClick={onToggle}
        title={`Mostrar ${label}`}
      >
        <strong>{side === "left" ? ">" : "<"}</strong>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className={`budget-v2-side-panel-wrap budget-v2-side-panel-wrap-${side}`}>
      {children}
      <button
        type="button"
        className={`budget-v2-side-toggle budget-v2-side-toggle-${side}`}
        onClick={onToggle}
        title={`Ocultar ${label}`}
      >
        {side === "left" ? "<" : ">"}
      </button>
    </div>
  );
}
