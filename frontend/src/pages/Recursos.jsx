import { useState, useEffect } from 'react'

const API = 'http://127.0.0.1:8000'

const CATEGORIAS = ['mano_de_obra', 'material', 'equipo', 'transporte', 'otros']

const ETIQUETAS = {
  mano_de_obra: 'Mano de Obra',
  material: 'Material',
  equipo: 'Equipo',
  transporte: 'Transporte',
  otros: 'Otros'
}

const vacío = { codigo: '', descripcion: '', unidad: '', categoria: 'material', precio_unitario: '' }

// ── Toast simple ──────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '12px 18px',
          borderRadius: '6px',
          fontSize: '14px',
          color: 'white',
          background: t.tipo === 'exito' ? '#16a34a' : t.tipo === 'alerta' ? '#d97706' : '#dc2626',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: '240px'
        }}>
          {t.tipo === 'exito' ? '✓ ' : t.tipo === 'alerta' ? '⚠ ' : '✕ '}{t.mensaje}
        </div>
      ))}
    </div>
  )
}

export default function Recursos() {
  const [recursos, setRecursos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(vacío)
  const [editandoId, setEditandoId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState([])

  useEffect(() => { fetchRecursos() }, [])

  function mostrarToast(mensaje, tipo = 'exito') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, mensaje, tipo }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

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
      mostrarToast(editandoId ? 'Recurso actualizado correctamente.' : 'Recurso creado correctamente.')
    } else {
      const err = await res.json()
      setError(err.detail || 'Error al guardar.')
    }
  }

  async function desactivar(r) {
    if (!confirm(`¿Desactivar "${r.descripcion}"?`)) return
    const res = await fetch(`${API}/recursos/${r.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...r, activo: false })
    })
    if (res.ok) {
      fetchRecursos()
      mostrarToast(`"${r.descripcion}" desactivado.`, 'alerta')
    } else {
      mostrarToast('Error al desactivar el recurso.', 'error')
    }
  }

  const filtrados = recursos.filter(r => {
    const coincideBusqueda =
      (r.descripcion || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.codigo || '').toLowerCase().includes(busqueda.toLowerCase())
    const coincideCategoria = filtroCategoria === 'todos' || r.categoria === filtroCategoria
    return coincideBusqueda && coincideCategoria
  })

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Recursos</h1>
        <button onClick={abrirCrear} style={btnPrimario}>+ Nuevo recurso</button>
      </div>

      {/* Barra de búsqueda + filtros */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ padding: '8px 12px', width: '260px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
        />

        {/* Botones de filtro */}
        {['todos', ...CATEGORIAS].map(cat => (
          <button
            key={cat}
            onClick={() => setFiltroCategoria(cat)}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              borderRadius: '20px',
              border: '1px solid',
              cursor: 'pointer',
              borderColor: filtroCategoria === cat ? '#2563eb' : '#d1d5db',
              background: filtroCategoria === cat ? '#2563eb' : 'white',
              color: filtroCategoria === cat ? 'white' : '#374151',
              fontWeight: filtroCategoria === cat ? '600' : '400',
              transition: 'all 0.15s'
            }}
          >
            {cat === 'todos' ? 'Todos' : ETIQUETAS[cat]}
          </button>
        ))}
      </div>

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
                <td style={td}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    background: COLORES_CAT[r.categoria]?.bg || '#f3f4f6',
                    color: COLORES_CAT[r.categoria]?.text || '#374151'
                  }}>
                    {ETIQUETAS[r.categoria] || r.categoria}
                  </span>
                </td>
                <td style={td}>${Number(r.precio_unitario).toFixed(2)}</td>
                <td style={td}>
                  <button onClick={() => abrirEditar(r)} style={btnEditar}>Editar</button>
                  <button onClick={() => desactivar(r)} style={btnDesactivar}>Desactivar</button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center', color: '#888', padding: '24px' }}>
                  No se encontraron recursos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '12px', fontSize: '13px', color: '#888' }}>
        {filtrados.length} recurso{filtrados.length !== 1 ? 's' : ''} encontrado{filtrados.length !== 1 ? 's' : ''}
      </p>

      {/* MODAL */}
      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h2 style={{ marginTop: 0, fontSize: '18px' }}>
              {editandoId ? 'Editar recurso' : 'Nuevo recurso'}
            </h2>

            <label style={labelStyle}>Código</label>
            <input style={inputStyle} value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ej: MO-001" />

            <label style={labelStyle}>Nombre *</label>
            <input style={inputStyle} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Nombre del recurso" />

            <label style={labelStyle}>Unidad *</label>
            <input style={inputStyle} value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} placeholder="Ej: m3, kg, gl, u" />

            <label style={labelStyle}>Tipo *</label>
            <select style={inputStyle} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{ETIQUETAS[c]}</option>)}
            </select>

            <label style={labelStyle}>Precio unitario *</label>
            <input style={inputStyle} type="number" step="0.01" value={form.precio_unitario} onChange={e => setForm({ ...form, precio_unitario: e.target.value })} placeholder="0.00" />

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

      <Toast toasts={toasts} />
    </div>
  )
}

const COLORES_CAT = {
  mano_de_obra: { bg: '#dbeafe', text: '#1d4ed8' },
  material:     { bg: '#dcfce7', text: '#15803d' },
  equipo:       { bg: '#fef9c3', text: '#a16207' },
  transporte:   { bg: '#ede9fe', text: '#6d28d9' },
  otros:        { bg: '#f3f4f6', text: '#374151' }
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', borderBottom: '2px solid #ddd' }
const td = { padding: '8px 12px', fontSize: '13px' }
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', marginTop: '12px' }
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
const overlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const modalBox = { background: 'white', borderRadius: '8px', padding: '28px', width: '420px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }
const btnPrimario = { padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }
const btnCancelar = { padding: '8px 16px', background: '#f3f4f6', color: '#333', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }
const btnEditar = { padding: '4px 10px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' }
const btnDesactivar = { padding: '4px 10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }