import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  DataTable,
  ModalShell,
  PageHeader,
  ToolbarFilter,
  fieldClass,
  labelClass,
} from "../components/ui";

const API = "http://127.0.0.1:8000";

const CATEGORIAS = ["mano_de_obra", "material", "equipo", "transporte", "otros"];

const ETIQUETAS = {
  mano_de_obra: "Mano de Obra",
  material: "Material",
  equipo: "Equipo",
  transporte: "Transporte",
  otros: "Otros",
};

const vacio = { codigo: "", descripcion: "", unidad: "", categoria: "material", precio_unitario: "" };

function parseNumero(valor) {
  if (valor === null || valor === undefined) return Number.NaN;
  const normalizado = String(valor).trim().replace(",", ".");
  if (!normalizado) return Number.NaN;
  return Number(normalizado);
}

function Toast({ toasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-[2000] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`min-w-60 rounded-md px-4 py-2 text-xs font-medium text-white shadow-lg ${
            toast.tipo === "exito" ? "bg-green-600" : toast.tipo === "alerta" ? "bg-amber-600" : "bg-red-600"
          }`}
        >
          {toast.mensaje}
        </div>
      ))}
    </div>
  );
}

export default function Recursos() {
  const [recursos, setRecursos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [modoModal, setModoModal] = useState("crear");
  const [codigoBase, setCodigoBase] = useState("");
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [precioEdits, setPrecioEdits] = useState({});
  const [precioErrores, setPrecioErrores] = useState({});
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    fetchRecursos();
  }, []);

  useEffect(() => {
    if (!modal) return;
    generarCodigo(form.categoria, codigoBase);
  }, [form.categoria, codigoBase, modal]);

  function mostrarToast(mensaje, tipo = "exito") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3500);
  }

  async function fetchRecursos() {
    setCargando(true);
    const res = await fetch(`${API}/recursos/?limit=500`);
    const data = await res.json();
    setRecursos(data);
    setCargando(false);
  }

  async function generarCodigo(categoria, base = "") {
    if (!categoria) return;
    const params = new URLSearchParams({ categoria });
    if (base) params.append("codigo_base", base);
    const res = await fetch(`${API}/recursos/siguiente-codigo?${params}`);
    if (!res.ok) {
      const err = await res.json();
      setForm((prev) => ({ ...prev, codigo: "" }));
      setError(err.detail || "No se pudo generar el codigo para esta categoria.");
      return;
    }
    const data = await res.json();
    setForm((prev) => ({ ...prev, codigo: data.codigo }));
    setError("");
  }

  function abrirCrear() {
    setModoModal("crear");
    setCodigoBase("");
    setForm(vacio);
    setError("");
    setModal(true);
  }

  function abrirDuplicar(recurso) {
    setModoModal("duplicar");
    setCodigoBase(recurso.codigo || "");
    setForm({
      codigo: "",
      descripcion: `${recurso.descripcion || ""} copia`,
      unidad: recurso.unidad || "",
      categoria: recurso.categoria || "material",
      precio_unitario: recurso.precio_unitario ?? "",
    });
    setError("");
    setModal(true);
  }

  async function guardar() {
    if (!form.codigo.trim()) {
      setError("No hay codigo automatico disponible para esta categoria.");
      return;
    }
    if (!form.descripcion.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!form.unidad.trim()) {
      setError("La unidad es obligatoria.");
      return;
    }
    const precio = parseNumero(form.precio_unitario);
    if (!Number.isFinite(precio) || precio < 0) {
      setError("Ingresa un precio valido.");
      return;
    }

    setGuardando(true);
    setError("");

    const body = { ...form, precio_unitario: precio, activo: true };
    const res = await fetch(`${API}/recursos/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setGuardando(false);

    if (res.ok) {
      setModal(false);
      fetchRecursos();
      mostrarToast(modoModal === "duplicar" ? "Recurso duplicado correctamente." : "Recurso creado correctamente.");
    } else {
      const err = await res.json();
      setError(err.detail || "Error al guardar.");
    }
  }

  async function guardarPrecioInline(recurso) {
    const editado = precioEdits[recurso.id];
    if (editado === undefined) return;

    const precio = parseNumero(editado);
    const anterior = Number(recurso.precio_unitario || 0);
    if (!Number.isFinite(precio) || precio < 0) {
      setPrecioErrores((prev) => ({ ...prev, [recurso.id]: "Precio invalido." }));
      return;
    }
    if (Math.abs(precio - anterior) < 0.000001) {
      setPrecioEdits((prev) => {
        const next = { ...prev };
        delete next[recurso.id];
        return next;
      });
      setPrecioErrores((prev) => {
        const next = { ...prev };
        delete next[recurso.id];
        return next;
      });
      return;
    }

    const res = await fetch(`${API}/recursos/${recurso.id}/precio`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ precio_unitario: precio }),
    });

    if (res.ok) {
      const actualizado = await res.json();
      setRecursos((prev) => prev.map((item) => (item.id === recurso.id ? actualizado : item)));
      setPrecioEdits((prev) => {
        const next = { ...prev };
        delete next[recurso.id];
        return next;
      });
      setPrecioErrores((prev) => {
        const next = { ...prev };
        delete next[recurso.id];
        return next;
      });
      mostrarToast("Precio actualizado.");
    } else {
      setPrecioEdits((prev) => ({ ...prev, [recurso.id]: anterior.toFixed(2) }));
      setPrecioErrores((prev) => ({ ...prev, [recurso.id]: "No se pudo guardar. Se restauro el valor anterior." }));
      mostrarToast("No se pudo actualizar el precio.", "error");
    }
  }

  async function desactivar(recurso) {
    if (!confirm(`Desactivar "${recurso.descripcion}"?`)) return;
    const res = await fetch(`${API}/recursos/${recurso.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...recurso, activo: false }),
    });
    if (res.ok) {
      fetchRecursos();
      mostrarToast(`"${recurso.descripcion}" desactivado.`, "alerta");
    } else {
      mostrarToast("Error al desactivar el recurso.", "error");
    }
  }

  const filtrados = useMemo(() => {
    return recursos.filter((recurso) => {
      const coincideBusqueda =
        (recurso.descripcion || "").toLowerCase().includes(busqueda.toLowerCase()) ||
        (recurso.codigo || "").toLowerCase().includes(busqueda.toLowerCase());
      const coincideCategoria = filtroCategoria === "todos" || recurso.categoria === filtroCategoria;
      return coincideBusqueda && coincideCategoria;
    });
  }, [recursos, busqueda, filtroCategoria]);

  const grupos = useMemo(() => {
    const orden = [...CATEGORIAS, ...new Set(filtrados.map((r) => r.categoria).filter(Boolean))];
    return [...new Set(orden)]
      .map((categoria) => ({
        categoria,
        recursos: filtrados.filter((recurso) => recurso.categoria === categoria),
      }))
      .filter((grupo) => grupo.recursos.length > 0);
  }, [filtrados]);

  const columns = [
    { key: "codigo", label: "Codigo", width: "13%", render: (recurso) => recurso.codigo || "-" },
    { key: "descripcion", label: "Nombre", render: (recurso) => <span className="font-medium text-slate-900">{recurso.descripcion}</span> },
    { key: "unidad", label: "Unidad", width: "9%" },
    {
      key: "precio_unitario",
      label: "Precio",
      align: "right",
      width: "14%",
      render: (recurso) => (
        <div>
          <input
            type="text"
            inputMode="decimal"
            value={precioEdits[recurso.id] ?? Number(recurso.precio_unitario || 0).toFixed(2)}
            onChange={(e) => setPrecioEdits((prev) => ({ ...prev, [recurso.id]: e.target.value }))}
            onBlur={() => guardarPrecioInline(recurso)}
            className={`${fieldClass} ml-auto max-w-28 text-right tabular-nums`}
          />
          {precioErrores[recurso.id] && <div className="mt-1 text-[10px] text-red-600">{precioErrores[recurso.id]}</div>}
        </div>
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "center",
      width: "22%",
      render: (recurso) => (
        <div className="flex justify-center gap-1">
          <ActionButton onClick={() => abrirDuplicar(recurso)}>Duplicar</ActionButton>
          {recurso.activo && <ActionButton variant="danger" onClick={() => desactivar(recurso)}>Desactivar</ActionButton>}
        </div>
      ),
    },
  ];

  const filtros = [
    { value: "todos", label: "Todos" },
    ...CATEGORIAS.map((categoria) => ({ value: categoria, label: ETIQUETAS[categoria] })),
  ];

  return (
    <div className="p-5">
      <PageHeader
        title="Recursos"
        subtitle="Biblioteca base de mano de obra, materiales, equipos y transporte."
        actions={<ActionButton variant="primary" onClick={abrirCrear}>Nuevo recurso</ActionButton>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
        <input
          type="text"
          placeholder="Buscar por nombre o codigo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className={`${fieldClass} max-w-xs`}
        />
        <ToolbarFilter options={filtros} value={filtroCategoria} onChange={setFiltroCategoria} />
      </div>

      {cargando ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">Cargando...</div>
      ) : grupos.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">No se encontraron recursos.</div>
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => (
            <section key={grupo.categoria}>
              <div className="mb-1 flex items-center justify-between rounded-t-md border border-slate-200 bg-slate-100 px-3 py-2">
                <h2 className="text-xs font-semibold text-slate-800">{ETIQUETAS[grupo.categoria] || grupo.categoria}</h2>
                <span className="text-[11px] text-slate-500">{grupo.recursos.length} recurso{grupo.recursos.length !== 1 ? "s" : ""}</span>
              </div>
              <DataTable columns={columns} rows={grupo.recursos} rowKey={(recurso) => recurso.id} emptyText="No se encontraron recursos." />
            </section>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        {filtrados.length} recurso{filtrados.length !== 1 ? "s" : ""} encontrado{filtrados.length !== 1 ? "s" : ""}
      </p>

      {modal && (
        <ModalShell
          title={modoModal === "duplicar" ? "Duplicar recurso" : "Nuevo recurso"}
          footer={
            <>
              <ActionButton onClick={() => setModal(false)}>Cancelar</ActionButton>
              <ActionButton variant="primary" disabled={guardando} onClick={guardar}>
                {guardando ? "Guardando..." : "Guardar"}
              </ActionButton>
            </>
          }
        >
          <label className={labelClass}>Codigo automatico</label>
          <input className={`${fieldClass} bg-slate-100`} value={form.codigo} readOnly placeholder="Se genera desde codigos existentes" />

          <label className={`${labelClass} mt-3`}>Nombre *</label>
          <input className={fieldClass} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Nombre del recurso" />

          <label className={`${labelClass} mt-3`}>Unidad *</label>
          <input className={fieldClass} value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="Ej: m3, kg, gl, u" />

          <label className={`${labelClass} mt-3`}>Tipo *</label>
          <select
            className={fieldClass}
            value={form.categoria}
            disabled={modoModal === "duplicar"}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          >
            {CATEGORIAS.map((categoria) => <option key={categoria} value={categoria}>{ETIQUETAS[categoria]}</option>)}
          </select>

          <label className={`${labelClass} mt-3`}>Precio unitario *</label>
          <input className={fieldClass} type="text" inputMode="decimal" value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })} placeholder="0.00" />

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </ModalShell>
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
