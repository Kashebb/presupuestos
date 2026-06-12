import { useCallback, useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

const ESTADOS = ["activo", "en_revision", "inactivo"];
const CATEGORIAS = ["Obras Preliminares", "Movimiento de Tierras", "Estructura", "Mampostería", "Cubierta", "Instalaciones", "Acabados", "Vías", "Otros"];

const modalBase = {
  codigo: "", nombre: "", unidad: "", rendimiento: 1.0,
  categoria: "", subcategoria: "", descripcion: "",
  estado: "en_revision", observacion: ""
};

export default function Apus(props) {
  const [apus, setApus] = useState([]);
  const [buscar, setBuscar] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(modalBase);
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState("");

  const cargarApus = useCallback(async () => {
    const params = new URLSearchParams({ limit: 200 });
    if (buscar) params.append("buscar", buscar);
    const res = await fetch(`${API}/apus/?${params}`);
    const data = await res.json();
    setApus(data);
  }, [buscar]);

  useEffect(() => { cargarApus(); }, [cargarApus]);

  const abrirNuevo = () => {
    setForm(modalBase);
    setEditandoId(null);
    setError("");
    setModalAbierto(true);
  };

  const abrirEditar = (apu) => {
    setForm({
      codigo: apu.codigo || "", nombre: apu.nombre, unidad: apu.unidad,
      rendimiento: apu.rendimiento, categoria: apu.categoria || "",
      subcategoria: apu.subcategoria || "", descripcion: apu.descripcion || "",
      estado: apu.estado, observacion: apu.observacion || ""
    });
    setEditandoId(apu.id);
    setError("");
    setModalAbierto(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (!form.unidad.trim()) { setError("La unidad es obligatoria."); return; }
    const url = editandoId ? `${API}/apus/${editandoId}` : `${API}/apus/`;
    const method = editandoId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rendimiento: parseFloat(form.rendimiento) || 1.0, items: [] })
    });
    if (res.ok) {
      setModalAbierto(false);
      cargarApus();
    } else {
      setError("Error al guardar. Revisa los datos.");
    }
  };

  const desactivar = async (id) => {
    if (!confirm("¿Desactivar este APU?")) return;
    const apu = apus.find(a => a.id === id);
    await fetch(`${API}/apus/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...apu, estado: "inactivo", items: [] })
    });
    cargarApus();
  };

  const estadoBadge = (estado) => {
    const colores = {
      activo: "bg-green-100 text-green-800",
      en_revision: "bg-yellow-100 text-yellow-800",
      inactivo: "bg-gray-100 text-gray-500"
    };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colores[estado] || "bg-gray-100"}`}>{estado}</span>;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">APUs</h1>
        <button onClick={abrirNuevo} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
          + Nuevo APU
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o código..."
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
        className="border border-gray-300 rounded px-3 py-2 w-full max-w-md mb-4 text-sm"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-700 text-left">
              <th className="px-3 py-2 border">Código</th>
              <th className="px-3 py-2 border">Nombre</th>
              <th className="px-3 py-2 border">Unidad</th>
              <th className="px-3 py-2 border">Rendimiento</th>
              <th className="px-3 py-2 border">Categoría</th>
              <th className="px-3 py-2 border">Estado</th>
              <th className="px-3 py-2 border">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {apus.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-gray-400">No hay APUs registrados.</td></tr>
            )}
            {apus.map(apu => (
              <tr key={apu.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 border text-gray-500">{apu.codigo || "—"}</td>
                <td className="px-3 py-2 border font-medium">{apu.nombre}</td>
                <td className="px-3 py-2 border">{apu.unidad}</td>
                <td className="px-3 py-2 border text-right">{apu.rendimiento}</td>
                <td className="px-3 py-2 border">{apu.categoria || "—"}</td>
                <td className="px-3 py-2 border">{estadoBadge(apu.estado)}</td>
                <td className="px-3 py-2 border">
                  <button onClick={() => props.onVerDetalle(apu)} className="text-green-600 hover:underline text-xs mr-3">Ver</button>
                  <button onClick={() => abrirEditar(apu)} className="text-blue-600 hover:underline text-xs mr-3">Editar</button>
                  {apu.estado !== "inactivo" && (
                    <button onClick={() => desactivar(apu.id)} className="text-red-500 hover:underline text-xs">Desactivar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4">{editandoId ? "Editar APU" : "Nuevo APU"}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">Código</label>
                <input value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full" placeholder="Ej: APU-001" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Unidad *</label>
                <input value={form.unidad} onChange={e => setForm({...form, unidad: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full" placeholder="m3, m2, kg..." />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-600 mb-1">Nombre *</label>
                <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full" placeholder="Descripción del rubro" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Rendimiento (h/unidad)</label>
                <input type="number" step="0.01" value={form.rendimiento}
                  onChange={e => setForm({...form, rendimiento: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full">
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Categoría</label>
                <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full">
                  <option value="">— Sin categoría —</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Subcategoría</label>
                <input value={form.subcategoria} onChange={e => setForm({...form, subcategoria: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full" />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-600 mb-1">Observación</label>
                <textarea value={form.observacion} onChange={e => setForm({...form, observacion: e.target.value})}
                  className="border rounded px-2 py-1.5 w-full" rows={2} />
              </div>
            </div>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalAbierto(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
