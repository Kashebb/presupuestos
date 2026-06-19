import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  DataTable,
  EmptyState,
  MetricStrip,
  ModalShell,
  PageHeader,
  SectionHeader,
  ToolbarFilter,
  LoadingState,
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

const FILTROS_ESTADO = [
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
  { value: "todos", label: "Todos" },
];

const ESTADOS_VALIDACION = [
  { value: "aprobado", label: "Aprobado" },
  { value: "pendiente", label: "Pendiente" },
  { value: "piloto", label: "Piloto" },
  { value: "no_aprobado", label: "No aprobado" },
];

const VALIDACION_LABELS = Object.fromEntries(ESTADOS_VALIDACION.map((estado) => [estado.value, estado.label]));

const vacio = {
  codigo: "",
  descripcion: "",
  unidad: "",
  categoria: "material",
  subcategoria: "",
  familia: "",
  precio_unitario: "",
  estado_validacion: "pendiente",
};

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
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [modoModal, setModoModal] = useState("crear");
  const [codigoBase, setCodigoBase] = useState("");
  const [form, setForm] = useState(vacio);
  const [clasificaciones, setClasificaciones] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [edicionFila, setEdicionFila] = useState({});
  const [erroresFila, setErroresFila] = useState({});
  const [toasts, setToasts] = useState([]);

  const fetchRecursos = useCallback(async () => {
    setCargando(true);
    const params = new URLSearchParams({ estado: filtroEstado });
    const res = await fetch(`${API}/recursos/?${params}`);
    const data = await res.json();
    setRecursos(data);
    setCargando(false);
  }, [filtroEstado]);

  const fetchClasificaciones = useCallback(async () => {
    const res = await fetch(`${API}/recursos/clasificaciones`);
    if (!res.ok) return;
    const data = await res.json();
    setClasificaciones(data);
  }, []);

  const generarCodigo = useCallback(async (categoria, subcategoria, base = "") => {
    if (!categoria) return;
    if (!subcategoria && !base) {
      setForm((prev) => ({ ...prev, codigo: "" }));
      setError("Selecciona una subcategoria para generar el codigo.");
      return;
    }

    const params = new URLSearchParams({ categoria });
    if (subcategoria) params.append("subcategoria", subcategoria);
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
  }, []);

  useEffect(() => {
    fetchRecursos();
    fetchClasificaciones();
  }, [fetchRecursos, fetchClasificaciones]);

  useEffect(() => {
    function cancelarConEscape(event) {
      if (event.key === "Escape") {
        setEdicionFila({});
        setErroresFila({});
      }
    }

    window.addEventListener("keydown", cancelarConEscape);
    return () => window.removeEventListener("keydown", cancelarConEscape);
  }, []);

  useEffect(() => {
    if (!modal) return;
    generarCodigo(form.categoria, form.subcategoria, codigoBase);
  }, [form.categoria, form.subcategoria, codigoBase, modal, generarCodigo]);

  function mostrarToast(mensaje, tipo = "exito") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3500);
  }

  function subcategoriasDe(categoria) {
    return clasificaciones.find((item) => item.categoria === categoria)?.subcategorias || [];
  }

  function clasificacionInicial(categoria = "material") {
    const categoriaBase = clasificaciones.find((item) => item.categoria === categoria) || clasificaciones[0];
    const subcategoriaBase = categoriaBase?.subcategorias?.[0];
    return {
      categoria: categoriaBase?.categoria || categoria,
      subcategoria: subcategoriaBase?.nombre || "",
      familia: subcategoriaBase?.familias?.[0] || "",
    };
  }

  function actualizarCategoria(categoria) {
    const siguiente = clasificacionInicial(categoria);
    setForm((prev) => ({ ...prev, ...siguiente }));
  }

  function actualizarSubcategoria(subcategoria) {
    const subcategoriaInfo = subcategoriasDe(form.categoria).find((item) => item.nombre === subcategoria);
    setForm((prev) => ({
      ...prev,
      subcategoria,
      familia: subcategoriaInfo?.familias?.[0] || "",
    }));
  }

  function abrirCrear() {
    setModoModal("crear");
    setCodigoBase("");
    setForm({ ...vacio, ...clasificacionInicial("material") });
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
      subcategoria: recurso.subcategoria || "",
      familia: recurso.familia || "",
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
    if (!form.subcategoria.trim()) {
      setError("La subcategoria es obligatoria para generar el codigo.");
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

  function iniciarEdicion(recurso) {
    setEdicionFila({
      [recurso.id]: {
        descripcion: recurso.descripcion || "",
        unidad: recurso.unidad || "",
        precio_unitario: Number(recurso.precio_unitario || 0).toFixed(2),
        estado_validacion: recurso.estado_validacion || "pendiente",
      },
    });
    setErroresFila({});
  }

  function cancelarEdicion() {
    setEdicionFila({});
    setErroresFila({});
  }

  async function guardarEdicion(recurso) {
    const editado = edicionFila[recurso.id];
    if (!editado) return;

    if (!editado.descripcion.trim()) {
      setErroresFila({ [recurso.id]: "El nombre es obligatorio." });
      return;
    }
    if (!editado.unidad.trim()) {
      setErroresFila({ [recurso.id]: "La unidad es obligatoria." });
      return;
    }
    const precio = parseNumero(editado.precio_unitario);
    if (!Number.isFinite(precio) || precio < 0) {
      setErroresFila({ [recurso.id]: "Precio invalido." });
      return;
    }

    const res = await fetch(`${API}/recursos/${recurso.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...recurso,
        descripcion: editado.descripcion.trim(),
        unidad: editado.unidad.trim(),
        precio_unitario: precio,
        estado_validacion: editado.estado_validacion || "pendiente",
        fuente_validacion: editado.estado_validacion !== recurso.estado_validacion ? "MANUAL" : recurso.fuente_validacion,
      }),
    });

    if (res.ok) {
      const actualizado = await res.json();
      setRecursos((prev) => prev.map((item) => (item.id === recurso.id ? actualizado : item)));
      setEdicionFila({});
      setErroresFila({});
      mostrarToast("Recurso actualizado.");
    } else {
      setErroresFila({ [recurso.id]: "No se pudo guardar el recurso." });
      mostrarToast("No se pudo actualizar el recurso.", "error");
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

  async function reactivar(recurso) {
    const res = await fetch(`${API}/recursos/${recurso.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...recurso, activo: true }),
    });
    if (res.ok) {
      fetchRecursos();
      mostrarToast(`"${recurso.descripcion}" reactivado.`);
    } else {
      mostrarToast("Error al reactivar el recurso.", "error");
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

  const resumen = useMemo(() => ({
    total: recursos.length,
    mano_de_obra: recursos.filter((recurso) => recurso.categoria === "mano_de_obra").length,
    material: recursos.filter((recurso) => recurso.categoria === "material").length,
    equipo: recursos.filter((recurso) => recurso.categoria === "equipo").length,
    transporte: recursos.filter((recurso) => recurso.categoria === "transporte").length,
    otros: recursos.filter((recurso) => recurso.categoria === "otros").length,
  }), [recursos]);

  const columns = [
    { key: "codigo", label: "Codigo", width: "13%", render: (recurso) => recurso.codigo || "-" },
    {
      key: "descripcion",
      label: "Nombre",
      render: (recurso) => edicionFila[recurso.id] ? (
        <div>
          <input
            className={fieldClass}
            value={edicionFila[recurso.id].descripcion}
            onChange={(e) => setEdicionFila((prev) => ({ ...prev, [recurso.id]: { ...prev[recurso.id], descripcion: e.target.value } }))}
            autoFocus
          />
          {erroresFila[recurso.id] && <div className="mt-1 text-[10px] text-red-600">{erroresFila[recurso.id]}</div>}
        </div>
      ) : (
        <span className={`font-medium ${recurso.activo ? "text-slate-900" : "text-slate-400"}`}>{recurso.descripcion}</span>
      ),
    },
    {
      key: "unidad",
      label: "Unidad",
      width: "9%",
      render: (recurso) => edicionFila[recurso.id] ? (
        <input
          className={`${fieldClass} max-w-24`}
          value={edicionFila[recurso.id].unidad}
          onChange={(e) => setEdicionFila((prev) => ({ ...prev, [recurso.id]: { ...prev[recurso.id], unidad: e.target.value } }))}
        />
      ) : recurso.unidad,
    },
    {
      key: "precio_unitario",
      label: "Precio",
      align: "right",
      width: "14%",
      render: (recurso) => {
        if (!edicionFila[recurso.id]) {
          return <span className="resource-price-display">{Number(recurso.precio_unitario || 0).toFixed(2)}</span>;
        }

        return (
          <input
            type="text"
            inputMode="decimal"
            value={edicionFila[recurso.id].precio_unitario}
            onChange={(e) => setEdicionFila((prev) => ({ ...prev, [recurso.id]: { ...prev[recurso.id], precio_unitario: e.target.value } }))}
            className={`${fieldClass} ml-auto max-w-28 text-right tabular-nums`}
          />
        );
      },
    },
    {
      key: "validacion",
      label: "Validacion",
      align: "center",
      width: "12%",
      render: (recurso) => edicionFila[recurso.id] ? (
        <select
          className={fieldClass}
          value={edicionFila[recurso.id].estado_validacion}
          onChange={(e) => setEdicionFila((prev) => ({ ...prev, [recurso.id]: { ...prev[recurso.id], estado_validacion: e.target.value } }))}
        >
          {ESTADOS_VALIDACION.map((estado) => <option key={estado.value} value={estado.value}>{estado.label}</option>)}
        </select>
      ) : (
        <span className={`validation-badge validation-${recurso.estado_validacion || "pendiente"}`}>
          {VALIDACION_LABELS[recurso.estado_validacion] || "Pendiente"}
        </span>
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "center",
      width: "22%",
      render: (recurso) => (
        <div className="flex justify-center gap-1">
          {edicionFila[recurso.id] ? (
            <>
              <ActionButton variant="primary" compact onClick={() => guardarEdicion(recurso)}>Guardar</ActionButton>
              <ActionButton compact onClick={cancelarEdicion}>Cancelar</ActionButton>
            </>
          ) : (
            <>
              <ActionButton compact onClick={() => iniciarEdicion(recurso)}>Editar</ActionButton>
              <ActionButton compact onClick={() => abrirDuplicar(recurso)}>Duplicar</ActionButton>
              {recurso.activo ? (
                <ActionButton variant="danger" compact onClick={() => desactivar(recurso)}>Desactivar</ActionButton>
              ) : (
                <ActionButton variant="success" compact onClick={() => reactivar(recurso)}>Reactivar</ActionButton>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  const categoriasFormulario = clasificaciones.length
    ? clasificaciones.map((item) => item.categoria)
    : CATEGORIAS;
  const subcategoriasFormulario = subcategoriasDe(form.categoria);
  const familiasFormulario = subcategoriasFormulario.find((item) => item.nombre === form.subcategoria)?.familias || [];

  return (
    <div className="page-wrap">
      <PageHeader
        title="Recursos"
        subtitle="Biblioteca base de mano de obra, materiales, equipos y transporte."
        actions={<ActionButton variant="primary" disabled={clasificaciones.length === 0} onClick={abrirCrear}>Nuevo recurso</ActionButton>}
      />

      <div className="mb-3">
        <MetricStrip
          items={[
            { label: "Total recursos", value: resumen.total, detail: `${filtrados.length} visibles`, tone: "blue", active: filtroCategoria === "todos", onClick: () => setFiltroCategoria("todos") },
            { label: "Mano de obra", value: resumen.mano_de_obra, detail: "Recursos laborales", tone: "green", active: filtroCategoria === "mano_de_obra", onClick: () => setFiltroCategoria("mano_de_obra") },
            { label: "Materiales", value: resumen.material, detail: "Insumos directos", tone: "slate", active: filtroCategoria === "material", onClick: () => setFiltroCategoria("material") },
            { label: "Equipos", value: resumen.equipo, detail: "Maquinaria y herramientas", tone: "slate", active: filtroCategoria === "equipo", onClick: () => setFiltroCategoria("equipo") },
            { label: "Transporte", value: resumen.transporte, detail: "Movilizacion y acarreo", tone: "slate", active: filtroCategoria === "transporte", onClick: () => setFiltroCategoria("transporte") },
            { label: "Otros", value: resumen.otros, detail: "Categorias varias", tone: "slate", active: filtroCategoria === "otros", onClick: () => setFiltroCategoria("otros") },
          ]}
        />
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Buscar por nombre o codigo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className={`${fieldClass} max-w-xs`}
        />
      </div>

      {cargando ? (
        <LoadingState />
      ) : grupos.length === 0 ? (
        <EmptyState>No se encontraron recursos.</EmptyState>
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => (
            <section key={grupo.categoria}>
              <SectionHeader
                title={ETIQUETAS[grupo.categoria] || grupo.categoria}
                countLabel={`${grupo.recursos.length} recurso${grupo.recursos.length !== 1 ? "s" : ""}`}
                filters={<ToolbarFilter options={FILTROS_ESTADO} value={filtroEstado} onChange={setFiltroEstado} />}
              />
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
          title=""
          footer={
            <>
              <ActionButton onClick={() => setModal(false)}>Cancelar</ActionButton>
              <ActionButton variant="primary" disabled={guardando} onClick={guardar}>
                {guardando ? "Guardando..." : "Guardar"}
              </ActionButton>
            </>
          }
        >
          <div className="resource-modal-title-row">
            <h2>{modoModal === "duplicar" ? "Duplicar recurso" : "Nuevo recurso"}</h2>
            <input className="resource-code-display" value={form.codigo} readOnly placeholder="Pendiente" aria-label="Codigo automatico" />
          </div>

          <div>
            <label className={labelClass}>Nombre *</label>
            <input className={fieldClass} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Nombre del recurso" />
          </div>

          <div className="resource-classification-grid">
            <div>
              <label className={labelClass}>Categoria *</label>
              <select
                className={fieldClass}
                value={form.categoria}
                disabled={modoModal === "duplicar"}
                onChange={(e) => actualizarCategoria(e.target.value)}
              >
                {categoriasFormulario.map((categoria) => <option key={categoria} value={categoria}>{ETIQUETAS[categoria] || categoria}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Subcategoria *</label>
              <select
                className={fieldClass}
                value={form.subcategoria}
                disabled={modoModal === "duplicar" || subcategoriasFormulario.length === 0}
                onChange={(e) => actualizarSubcategoria(e.target.value)}
              >
                {subcategoriasFormulario.length === 0 ? (
                  <option value="">Sin subcategorias</option>
                ) : (
                  subcategoriasFormulario.map((subcategoria) => <option key={subcategoria.nombre} value={subcategoria.nombre}>{subcategoria.nombre}</option>)
                )}
              </select>
            </div>

            <div>
              <label className={labelClass}>Familia</label>
              <select
                className={fieldClass}
                value={form.familia}
                onChange={(e) => setForm({ ...form, familia: e.target.value })}
              >
                <option value="">Sin familia</option>
                {familiasFormulario.map((familia) => <option key={familia} value={familia}>{familia}</option>)}
              </select>
            </div>
          </div>

          <label className={`${labelClass} mt-3`}>Unidad *</label>
          <input className={fieldClass} value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="Ej: m3, kg, gl, u" />

          <label className={`${labelClass} mt-3`}>Precio unitario *</label>
          <input className={fieldClass} type="text" inputMode="decimal" value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })} placeholder="0.00" />

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </ModalShell>
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
