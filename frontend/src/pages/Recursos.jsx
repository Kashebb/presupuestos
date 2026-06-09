import { useState, useEffect } from 'react'

const API = 'http://127.0.0.1:8000'

const CATEGORIAS = ['mano_de_obra', 'material', 'equipo', 'transporte', 'otros']

const vacío = { codigo: '', descripcion: '', unidad: '', categoria: 'material', precio_unitario: '' }

export default function Recursos() {
  const [recursos, setRecursos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(vacío)
  const [editandoId, setEditandoId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchRecursos() }, [])

  async function fetchRecursos() {
    setCargando(true)
    const res = await fetch(`${API}/recursos/?limit=500`)
    const data = await res.json()
    setRecursos(data)
    setCargando(false)
  }

  function abrirCrear() {
    setForm(vacío)
    setEditandoId(null)
    setError('')
    setModal(true)
  }

  function abrirEditar(r) {
    setForm({
      codigo: r.codigo || '',
      descripcion: r.descripcion || '',
      unidad: r.unidad || '',
      categoria: r.categoria || 'material',
      precio_unitario: r.precio_unitario || ''
    })
    setEditandoId(r.id)
    setError('')
    setModal(true)
  }

  async function guardar() {
    if (!form.descripcion.trim()) { setError('El nombre es obligatorio.'); return }
    if (!form.unidad.trim()) { setError('La unidad es obligatoria.'); return }
    if (form.precio_unitario === '' || isNaN(Number(form.precio_unitario))) { setError('Ingresa un precio válido.'); return }

    setGuardando(true)
    setError('')

    const body = { ...form, precio_unitario: Number(form.precio_unitario) }
    const url = editandoId ? `${API}/recursos/${editandoId}` : `${API}/recursos/`
    const method = editandoId ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    setGuardando(false)

    if (res.ok) {
      setModal(false)
      fetchRecursos()
    } else {
      const err = await res.json()
      setError(err.detail || 'Error al guardar.')
    }
  }

  async function desactivar(r) {
    if (!confirm(`¿Desactivar "${r.descripcion}"?`)) return
    await fetch(`${API}/recursos/${r.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...r, activo: false })
    })
    fetchRecursos()
  }

  const filtrados = recursos.filter(r =>
    (r.descripcion || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (r.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Recursos</h1>
        <button onClick={abrirCrear} style={btnPrimario}>+ Nuevo recurso</button>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o tipo..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        style={{ padding: '8px 12px', width: '300px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}
      />

      {cargando ? <p>Cargando...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={th}>Código</th>
              <th style={th}>Nombre</th>
              <th style={th}>Unidad</th>
              <th style={th}>Tipo</th>
              <th style={th}>Precio</th>
              <th style={th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={td}>{r.codigo}</td>
                <td style={td}>{r.descripcion}</td>
                <td style={td}>{r.unidad}</td>
                <td style={td}>{r.categoria}</td>
                <td style={td}>${Number(r.precio_unitario).toFixed(2)}</td>
                <td style={td}>
                  <button onClick={() => abrirEditar(r)} style={btnEditar}>Editar</button>
                  <button onClick={() => desactivar(r)} style={btnDesactivar}>Desactivar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '12px', fontSize: '13px', color: '#888' }}>
        {filtrados.length} recursos encontrados
      </p>

      {/* MODAL */}
      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h2 style={{ marginTop: 0, fontSize: '18px' }}>
              {editandoId ? 'Editar recurso' : 'Nuevo recurso'}
            </h2>

            <label style={label}>Código</label>
            <input style={input} value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ej: MO-001" />

            <label style={label}>Nombre *</label>
            <input style={input} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Nombre del recurso" />

            <label style={label}>Unidad *</label>
            <input style={input} value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} placeholder="Ej: m3, kg, gl, u" />

            <label style={label}>Tipo *</label>
            <select style={input} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={label}>Precio unitario *</label>
            <input style={input} type="number" step="0.01" value={form.precio_unitario} onChange={e => setForm({ ...form, precio_unitario: e.target.value })} placeholder="0.00" />

            {error && <p style={{ color: 'red', fontSize: '13px', margin: '8px 0 0' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={btnCancelar}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={btnPrimario}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', borderBottom: '2px solid #ddd' }
const td = { padding: '8px 12px', fontSize: '13px' }
const label = { display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', marginTop: '12px' }
const input = { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
const overlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const modalBox = { background: 'white', borderRadius: '8px', padding: '28px', width: '420px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }
const btnPrimario = { padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }
const btnCancelar = { padding: '8px 16px', background: '#f3f4f6', color: '#333', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }
const btnEditar = { padding: '4px 10px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' }
const btnDesactivar = { padding: '4px 10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }