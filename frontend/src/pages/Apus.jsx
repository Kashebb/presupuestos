import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  DataTable,
  MetricStrip,
  ModalShell,
  PageHeader,
  StatusBadge,
  ToolbarFilter,
  fieldClass,
  labelClass,
} from "../components/ui";

const API = "http://127.0.0.1:8000";

const ESTADOS = ["referencial", "en_revision", "revisar_costo", "inactivo", "activo"];
const CATEGORIAS = ["Obras Preliminares", "Movimiento de Tierras", "Estructura", "Mamposteria", "Cubierta", "Instalaciones", "Acabados", "Vias", "Otros"];

const modalBase = {
  codigo: "",
  nombre: "",
  unidad: "",
  rendimiento: 1.0,
  categoria: "",
  subcategoria: "",
  descripcion: "",
  estado: "en_revision",
  observacion: "",
};

function estadoTone(estado) {
  if (estado === "activo") return "green";
  if (estado === "referencial" || estado === "ok" || estado === "validado") return "green";
  if (estado === "en_revision") return "amber";
  if (estado === "revisar_costo") return "red";
  return "gray";
}

function fmtPrecio(valor) {
  if (valor === undefined || valor === null) return "-";
  return `$${Number(valor).toFixed(2)}`;
}

export default function Apus({ onVerDetalle, initialFilter = "todos" }) {
  const [apus, setApus] = useState([]);
  const [buscar, setBuscar] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(modalBase);
  const [editandoRapidoId, setEditandoRapidoId] = useState(null);
  const [formRapido, setFormRapido] = useState({ nombre: "", unidad: "" });
  const [error, setError] = useState("");
  const [costos, setCostos] = useState({});
  const [filtro, setFiltro] = useState(initialFilter);

  useEffect(() => {
    setFiltro(initialFilter || "todos");
  }, [initialFilter]);

  const cargarApus = useCallback(async () => {
    const params = new URLSearchParams({ limit: 500 });
    if (buscar) params.append("buscar", buscar);
    const [res, resCostos] = await Promise.all([
      fetch(`${API}/apus/?${params}`),
      fetch(`${API}/apus/costos/resumen?limit=500`),
    ]);
    const data = await res.json();
    const dataCostos = await resCostos.json();
    const costosPorApu = Object.fromEntries(dataCostos.map((c) => [c.apu_id, c]));
    setApus(data);
    setCostos(costosPorApu);
  }, [buscar]);

  useEffect(() => {
    cargarApus();
  }, [cargarApus]);

  const controlApu = useCallback((apu) => costos[apu.id]?.control_costo || "ok", [costos]);

  const apusFiltrados = useMemo(() => {
    return apus.filter((apu) => {
      const control = controlApu(apu);
      if (filtro === "revisar_costo") return control === "revisar_costo";
      if (filtro === "ok") return control !== "revisar_costo";
      if (filtro === "estado_revisar_costo") return apu.estado === "revisar_costo";
      if (["activo", "referencial", "en_revision", "inactivo"].includes(filtro)) return apu.estado === filtro;
      return true;
    });
  }, [apus, controlApu, filtro]);

  const resumen = useMemo(() => {
    const revisar = apus.filter((apu) => controlApu(apu) === "revisar_costo").length;
    return {
      total: apus.length,
      ok: apus.length - revisar,
      revisar,
      enRevision: apus.filter((apu) => apu.estado === "en_revision").length,
      inactivos: apus.filter((apu) => apu.estado === "inactivo").length,
      referencial: apus.filter((apu) => apu.estado === "referencial").length,
    };
  }, [apus, controlApu]);

  const abrirNuevo = () => {
    setForm(modalBase);
    setError("");
    setModalAbierto(true);
  };

  const abrirEditarRapido = (apu) => {
    setEditandoRapidoId(apu.id);
    setFormRapido({ nombre: apu.nombre || "", unidad: apu.unidad || "" });
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!form.unidad.trim()) {
      setError("La unidad es obligatoria.");
      return;
    }
    const res = await fetch(`${API}/apus/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rendimiento: parseFloat(form.rendimiento) || 1.0, items: [] }),
    });
    if (res.ok) {
      setModalAbierto(false);
      cargarApus();
    } else {
      setError("Error al guardar. Revisa los datos.");
    }
  };

  const guardarEdicionRapida = async (apu) => {
    if (!formRapido.nombre.trim() || !formRapido.unidad.trim()) return;
    const res = await fetch(`${API}/apus/${apu.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: formRapido.nombre.trim(), unidad: formRapido.unidad.trim() }),
    });
    if (res.ok) {
      const actualizado = await res.json();
      setApus((prev) => prev.map((item) => (item.id === apu.id ? actualizado : item)));
      setEditandoRapidoId(null);
    } else {
      setError("No se pudo guardar la edicion rapida.");
    }
  };

  const desactivar = async (id) => {
    if (!confirm("Desactivar este APU?")) return;
    const apu = apus.find((a) => a.id === id);
    await fetch(`${API}/apus/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...apu, estado: "inactivo", items: [] }),
    });
    cargarApus();
  };

  const controlBadge = (apu) => {
    const control = controlApu(apu);
    if (control === "revisar_costo") return <StatusBadge tone="red">Revisar costo</StatusBadge>;
    return <StatusBadge tone="green">OK</StatusBadge>;
  };

  const filtros = [
    { value: "todos", label: `Todos (${resumen.total})` },
    { value: "revisar_costo", label: `Revisar costo (${resumen.revisar})` },
    { value: "ok", label: `OK (${resumen.ok})` },
    { value: "referencial", label: `Referencial (${resumen.referencial})` },
    { value: "activo", label: "Activo" },
    { value: "en_revision", label: "En revision" },
    { value: "estado_revisar_costo", label: "Estado revisar costo" },
    { value: "inactivo", label: "Inactivo" },
  ];

  const columns = [
    { key: "codigo", label: "Codigo", width: "12%", render: (apu) => apu.codigo || "-" },
    {
      key: "nombre",
      label: "Nombre",
      render: (apu) => (
        <div>
          {editandoRapidoId === apu.id ? (
            <input
              value={formRapido.nombre}
              onChange={(e) => setFormRapido({ ...formRapido, nombre: e.target.value })}
              className={fieldClass}
              autoFocus
            />
          ) : (
            <div className="font-medium text-slate-900">{apu.nombre}</div>
          )}
          {apu.categoria && <div className="text-[11px] text-slate-500">{apu.categoria}</div>}
        </div>
      ),
    },
    {
      key: "unidad",
      label: "Unidad",
      width: "10%",
      render: (apu) => (
        editandoRapidoId === apu.id ? (
          <input
            value={formRapido.unidad}
            onChange={(e) => setFormRapido({ ...formRapido, unidad: e.target.value })}
            className={fieldClass}
          />
        ) : apu.unidad
      ),
    },
    { key: "precio", label: "PU Calc.", align: "right", width: "10%", render: (apu) => fmtPrecio(costos[apu.id]?.precio_unitario) },
    { key: "control", label: "Control", width: "12%", render: (apu) => controlBadge(apu) },
    { key: "estado", label: "Estado", width: "12%", render: (apu) => <StatusBadge tone={estadoTone(apu.estado)}>{apu.estado}</StatusBadge> },
    {
      key: "acciones",
      label: "Acciones",
      align: "center",
      width: "18%",
      render: (apu) => (
        <div className="flex justify-center gap-1">
          <ActionButton variant="ghost" compact onClick={() => onVerDetalle(apu)}>Ver</ActionButton>
          {editandoRapidoId === apu.id ? (
            <>
              <ActionButton variant="primary" compact onClick={() => guardarEdicionRapida(apu)}>Guardar</ActionButton>
              <ActionButton compact onClick={() => setEditandoRapidoId(null)}>Cancelar</ActionButton>
            </>
          ) : (
            <ActionButton compact onClick={() => abrirEditarRapido(apu)}>Editar</ActionButton>
          )}
          {apu.estado !== "inactivo" && <ActionButton variant="danger" compact onClick={() => desactivar(apu.id)}>Desactivar</ActionButton>}
        </div>
      ),
    },
  ];

  return (
    <div className="page-wrap">
      <PageHeader
        title="APUs"
        subtitle="Biblioteca reutilizable de analisis de precios unitarios."
        actions={<ActionButton variant="primary" onClick={abrirNuevo}>Nuevo APU</ActionButton>}
      />

      <div className="mb-3">
        <MetricStrip
          items={[
            { label: "Total APUs", value: resumen.total, detail: `${apusFiltrados.length} visibles`, tone: "blue" },
            { label: "OK", value: resumen.ok, detail: "Sin alerta de costo", tone: "green" },
            { label: "Revisar costo", value: resumen.revisar, detail: "Bloquear automatizacion", tone: resumen.revisar > 0 ? "red" : "green", onClick: () => setFiltro("revisar_costo") },
            { label: "En revision", value: resumen.enRevision, detail: "Estado tecnico", tone: resumen.enRevision > 0 ? "amber" : "green", onClick: () => setFiltro("en_revision") },
            { label: "Inactivos", value: resumen.inactivos, detail: "Fuera de uso", tone: "slate", onClick: () => setFiltro("inactivo") },
          ]}
        />
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Buscar por nombre o codigo..."
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          className={`${fieldClass} max-w-xs`}
        />
        <ToolbarFilter options={filtros} value={filtro} onChange={setFiltro} />
      </div>

      <DataTable columns={columns} rows={apusFiltrados} rowKey={(apu) => apu.id} emptyText="No hay APUs con ese filtro." />

      {modalAbierto && (
        <ModalShell
          title="Nuevo APU"
          footer={
            <>
              <ActionButton onClick={() => setModalAbierto(false)}>Cancelar</ActionButton>
              <ActionButton variant="primary" onClick={guardar}>Guardar</ActionButton>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className={labelClass}>Codigo</label>
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className={fieldClass} placeholder="Ej: APU-001" />
            </div>
            <div>
              <label className={labelClass}>Unidad *</label>
              <input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className={fieldClass} placeholder="m3, m2, kg..." />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={fieldClass} placeholder="Descripcion del rubro" />
            </div>
            <div>
              <label className={labelClass}>Rendimiento (h/unidad)</label>
              <input type="number" step="0.01" value={form.rendimiento} onChange={(e) => setForm({ ...form, rendimiento: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Estado</label>
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className={fieldClass}>
                {ESTADOS.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Categoria</label>
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className={fieldClass}>
                <option value="">Sin categoria</option>
                {CATEGORIAS.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Subcategoria</label>
              <input value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} className={fieldClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Observacion</label>
              <textarea value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} className={fieldClass} rows={2} />
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </ModalShell>
      )}
    </div>
  );
}
