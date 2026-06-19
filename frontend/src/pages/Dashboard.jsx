import { useEffect, useState } from "react";
import { ActionButton, DataTable, ErrorBanner, LoadingState, MetricStrip, PageHeader, StatusBadge } from "../components/ui";

const API = "http://127.0.0.1:8000";

function fmtNumero(valor) {
  return Number(valor || 0).toLocaleString("es-EC");
}

function fmtMoneda(valor) {
  return `$${Number(valor || 0).toLocaleString("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full rounded bg-slate-100">
        <div className="h-1.5 rounded bg-green-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-[11px] tabular-nums text-slate-600">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/dashboard/resumen`)
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el tablero.");
        return res.json();
      })
      .then(setResumen)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="page-wrap">
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    );
  }

  if (!resumen) {
    return <div className="page-wrap"><LoadingState>Cargando tablero...</LoadingState></div>;
  }

  const { recursos, apus, presupuestos, proyectos } = resumen;
  const pendientes = [
    {
      label: "APUs revisar costo",
      value: fmtNumero(apus.revisar_costo),
      detail: "No usar automaticamente",
      tone: apus.revisar_costo > 0 ? "red" : "green",
      onClick: () => onNavigate("apus", { filtro: "revisar_costo" }),
    },
    {
      label: "Rubros pendientes",
      value: fmtNumero(presupuestos.rubros_pendientes),
      detail: "Sin APU vinculado",
      tone: presupuestos.rubros_pendientes > 0 ? "amber" : "green",
      onClick: () => onNavigate("presupuestos", { filtro: "PENDIENTE" }),
    },
    {
      label: "Recursos piloto",
      value: fmtNumero(recursos.piloto_no_validado),
      detail: "Pendientes de validacion",
      tone: recursos.piloto_no_validado > 0 ? "amber" : "green",
      onClick: () => onNavigate("recursos"),
    },
    {
      label: "Rubros Sin APU",
      value: fmtNumero(presupuestos.rubros_sin_apu),
      detail: "Marcados manualmente",
      tone: presupuestos.rubros_sin_apu > 0 ? "slate" : "green",
      onClick: () => onNavigate("presupuestos", { filtro: "SIN_APU" }),
    },
  ];

  const resumenGeneral = [
    { label: "Recursos activos", value: fmtNumero(recursos.activos), detail: `${fmtNumero(recursos.total)} total`, tone: "blue" },
    { label: "APUs", value: fmtNumero(apus.total), detail: `${fmtNumero(apus.ok)} OK`, tone: "green" },
    { label: "Proyectos", value: fmtNumero(presupuestos.proyectos), detail: "Presupuestos registrados", tone: "slate" },
    { label: "Rubros", value: fmtNumero(presupuestos.rubros_total), detail: `${fmtNumero(presupuestos.rubros_vinculados)} vinculados`, tone: "slate" },
  ];

  const columns = [
    {
      key: "nombre",
      label: "Proyecto",
      render: (proyecto) => (
        <div>
          <div className="font-medium text-slate-900">{proyecto.nombre}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
            <span>{proyecto.codigo || "Sin codigo"}</span>
            <span>-</span>
            <StatusBadge tone={proyecto.estado === "activo" ? "green" : "gray"}>{proyecto.estado}</StatusBadge>
          </div>
        </div>
      ),
    },
    { key: "rubros_total", label: "Rubros", align: "right", render: (p) => fmtNumero(p.rubros_total) },
    { key: "rubros_vinculados", label: "Vinc.", align: "right", render: (p) => fmtNumero(p.rubros_vinculados) },
    { key: "rubros_pendientes", label: "Pend.", align: "right", render: (p) => fmtNumero(p.rubros_pendientes) },
    { key: "avance", label: "Avance", render: (p) => <ProgressBar value={p.avance_vinculacion} /> },
    { key: "total_referencial", label: "Total ref.", align: "right", render: (p) => fmtMoneda(p.total_referencial) },
  ];

  return (
    <div className="page-wrap">
      <PageHeader
        title="Tablero"
        subtitle="Bandeja operativa para priorizar pendientes de presupuestos."
        actions={
          <>
            <ActionButton variant="primary" onClick={() => onNavigate("presupuestos")}>
              Abrir presupuestos
            </ActionButton>
            <ActionButton onClick={() => onNavigate("apus")}>Ver APUs</ActionButton>
          </>
        }
      />

      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase text-slate-600">Pendiente de atencion</h2>
          <span className="text-[11px] text-slate-400">Selecciona una metrica para trabajarla</span>
        </div>
        <MetricStrip items={pendientes} />
      </section>

      <section className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-600">Resumen general</div>
        <MetricStrip items={resumenGeneral} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase text-slate-600">Presupuestos en trabajo</h2>
          <ActionButton variant="ghost" onClick={() => onNavigate("presupuestos")}>Gestionar</ActionButton>
        </div>
        <DataTable columns={columns} rows={proyectos} rowKey={(proyecto) => proyecto.id} emptyText="No hay presupuestos registrados." />
      </section>
    </div>
  );
}
