import { useEffect } from "react";

export function PageHeader({ title, subtitle, actions, meta }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function ScreenBlock({ children, compact = false }) {
  return <section className={compact ? "screen-block screen-block-compact" : "screen-block"}>{children}</section>;
}

export function BlockHeader({ title, hint, actions }) {
  return (
    <div className="block-header">
      <h2 className="block-title">{title}</h2>
      <div className="block-header-side">
        {hint && <span className="block-hint">{hint}</span>}
        {actions}
      </div>
    </div>
  );
}

export function SectionHeader({ title, subtitle, countLabel, status, filters, actions, collapsible = false, collapsed = false, onToggle }) {
  const content = (
    <>
      <div className="section-header-main">
        {collapsible && (
          <span className="section-header-caret" aria-hidden="true">
            {collapsed ? ">" : "v"}
          </span>
        )}
        <div>
          <h2 className="section-header-title">{title}</h2>
          {subtitle && <p className="section-header-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="section-header-actions">
        {filters}
        {status && <span className="section-header-status">{status}</span>}
        {countLabel && <span className="section-header-count">{countLabel}</span>}
        {actions}
      </div>
    </>
  );

  if (collapsible) {
    return (
      <button type="button" className="section-header section-header-clickable" onClick={onToggle} aria-expanded={!collapsed}>
        {content}
      </button>
    );
  }

  return <div className="section-header">{content}</div>;
}

export function ActionButton({ children, variant = "secondary", onClick, disabled, type = "button", compact = false, className = "" }) {
  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn-danger",
    ghost: "btn-ghost",
    success: "btn-success",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`app-btn ${compact ? "app-btn-compact" : ""} ${variants[variant] || variants.secondary} ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({ children, className = "" }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function ViewTabs({ items, value, onChange, ariaLabel = "Vistas" }) {
  return (
    <div className="view-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`view-tab ${active ? "view-tab-active" : ""}`}
          >
            <span className="view-tab-label">{item.label}</span>
            {item.meta && <span className="view-tab-meta">{item.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ToolbarShell({ children, className = "" }) {
  return <div className={`toolbar-shell ${className}`}>{children}</div>;
}

export function SidebarShell({ children, collapsed = false, onToggle, label = "Secciones" }) {
  if (collapsed) {
    return (
      <aside className="sidebar-shell sidebar-shell-collapsed" aria-label={label}>
        <button type="button" className="sidebar-toggle-vertical" onClick={onToggle} aria-label={`Mostrar ${label}`}>
          Mostrar {label}
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar-shell" aria-label={label}>
      <div className="sidebar-shell-header">
        <span>{label}</span>
        <button type="button" className="sidebar-toggle" onClick={onToggle}>
          Ocultar
        </button>
      </div>
      {children}
    </aside>
  );
}

export function EmptyState({ children = "Sin registros." }) {
  return <Panel className="empty-state">{children}</Panel>;
}

export function LoadingState({ children = "Cargando..." }) {
  return <Panel className="loading-state">{children}</Panel>;
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return <div className="error-banner">{children}</div>;
}

export function ModalCodeHeader({ title, code, loading = false, placeholder = "Pendiente" }) {
  return (
    <div className="modal-code-title-row">
      <h2>{title}</h2>
      <input
        className="code-display"
        value={loading ? "Generando..." : code}
        readOnly
        placeholder={placeholder}
        aria-label="Codigo automatico"
      />
    </div>
  );
}

export function ModalFormGrid({ children }) {
  return <div className="modal-form-grid">{children}</div>;
}

export function ModalFormFull({ children }) {
  return <div className="modal-form-full">{children}</div>;
}

export function StatusBadge({ children, tone = "slate" }) {
  const tones = {
    slate: "status-slate",
    green: "status-green",
    amber: "status-amber",
    red: "status-red",
    blue: "status-blue",
    gray: "status-gray",
  };

  return (
    <span className={`status-badge ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

export function ToolbarFilter({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`filter-chip ${active ? "filter-chip-active" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MetricStrip({ items }) {
  return (
    <div className="metric-grid">
      {items.map((item) => {
        const tones = {
          red: "metric-red",
          amber: "metric-amber",
          green: "metric-green",
          blue: "metric-blue",
          slate: "metric-slate",
        };
        const interactive = Boolean(item.onClick);
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={!interactive}
            className={`metric-card ${tones[item.tone] || tones.slate} ${interactive ? "metric-card-interactive" : ""} ${item.active ? "metric-card-active" : ""}`}
          >
            <div className="metric-label">{item.label}</div>
            <div className="metric-value">{item.value}</div>
            {item.detail && <div className="metric-detail">{item.detail}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function CategoryStrip({ items, value, onChange, label }) {
  return (
    <div className="category-filter">
      {label && <div className="category-filter-label">{label}</div>}
      <div className="category-strip">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={`category-card ${active ? "category-card-active" : ""}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DataTable({ columns, rows, rowKey, emptyText = "Sin registros." }) {
  return (
    <div className="data-table-shell">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="data-table-empty" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.align === "right" ? "text-right tabular-nums" : column.align === "center" ? "text-center" : "text-left"}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ModalShell({ title, children, footer, size = "md", onClose }) {
  const sizes = {
    sm: "modal-shell-sm",
    md: "",
    form: "modal-shell-form",
    lg: "modal-shell-lg",
  };

  useEffect(() => {
    if (!onClose) return undefined;

    function closeWithEscape(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return (
    <div className="modal-overlay">
      <div className={`modal-shell ${sizes[size] || ""}`}>
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function BottomSheet({ title, meta, actions, children, footer, onClose }) {
  useEffect(() => {
    if (!onClose) return undefined;

    function closeWithEscape(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return (
    <div className="bottom-sheet-overlay">
      <div className="bottom-sheet">
        <div className="bottom-sheet-header">
          <div>
            {title && <h2 className="bottom-sheet-title">{title}</h2>}
            {meta && <div className="bottom-sheet-meta">{meta}</div>}
          </div>
          {actions && <div className="bottom-sheet-actions">{actions}</div>}
        </div>
        <div className="bottom-sheet-body">{children}</div>
        {footer && <div className="bottom-sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

export const fieldClass =
  "form-field";

export const labelClass = "form-label";
