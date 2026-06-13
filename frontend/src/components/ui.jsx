export function PageHeader({ title, subtitle, actions, meta }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <h1 className="m-0 text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ActionButton({ children, variant = "secondary", onClick, disabled, type = "button" }) {
  const variants = {
    primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    ghost: "border-transparent bg-transparent text-blue-700 hover:bg-blue-50",
    success: "border-green-600 bg-green-600 text-white hover:bg-green-700",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant] || variants.secondary}`}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
    gray: "bg-gray-100 text-gray-600",
  };

  return (
    <span className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${tones[tone] || tones.slate}`}>
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
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
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
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const tones = {
          red: "border-red-200 bg-red-50 text-red-900",
          amber: "border-amber-200 bg-amber-50 text-amber-900",
          green: "border-green-200 bg-green-50 text-green-900",
          blue: "border-blue-200 bg-blue-50 text-blue-900",
          slate: "border-slate-200 bg-white text-slate-900",
        };
        const interactive = Boolean(item.onClick);
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={!interactive}
            className={`rounded-md border p-3 text-left ${tones[item.tone] || tones.slate} ${
              interactive ? "cursor-pointer hover:border-blue-400 hover:shadow-sm" : "cursor-default"
            }`}
          >
            <div className="text-[10px] font-semibold uppercase text-slate-500">{item.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{item.value}</div>
            {item.detail && <div className="mt-0.5 text-[11px] text-slate-600">{item.detail}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function DataTable({ columns, rows, rowKey, emptyText = "Sin registros." }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-slate-100 text-[11px] text-slate-600">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`border-b border-slate-200 px-2.5 py-2 font-semibold ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
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
                <td className="px-3 py-8 text-center text-xs text-slate-400" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-100 hover:bg-slate-50">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-2.5 py-2 text-slate-700 ${column.align === "right" ? "text-right tabular-nums" : column.align === "center" ? "text-center" : "text-left"}`}
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

export function ModalShell({ title, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
        {children}
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export const fieldClass =
  "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export const labelClass = "mb-1 block text-[11px] font-semibold text-slate-600";
