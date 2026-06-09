import { useState, useEffect } from 'react'

const API = 'http://127.0.0.1:8000'

export default function Recursos() {
  const [recursos, setRecursos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetchRecursos()
  }, [])

  async function fetchRecursos() {
    setCargando(true)
    const res = await fetch(`${API}/recursos/?limit=500`)
    const data = await res.json()
    setRecursos(data)
    setCargando(false)
  }

  const filtrados = recursos.filter(r =>
    (r.descripcion || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (r.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
)

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Recursos</h1>

      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        style={{
          padding: '8px 12px',
          width: '300px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          marginBottom: '16px',
          fontSize: '14px'
        }}
      />

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={th}>Código</th>
              <th style={th}>Nombre</th>
              <th style={th}>Unidad</th>
              <th style={th}>Tipo</th>
              <th style={th}>Precio</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '12px', fontSize: '13px', color: '#888' }}>
        {filtrados.length} recursos encontrados
      </p>
    </div>
  )
}

const th = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '13px',
  fontWeight: '600',
  borderBottom: '2px solid #ddd'
}

const td = {
  padding: '8px 12px',
  fontSize: '13px'
}