import { useEffect, useMemo, useRef, useState } from "react";
import { API } from "../data";

const CAMPOS = [
  ["rubro", "Rubro"],
  ["categoria", "Categoría"],
  ["recurso", "Recurso"],
  ["capitulo", "Capítulo"],
  ["apu", "APU"],
];

const etiquetaCampo = (campo) => CAMPOS.find(([id]) => id === campo)?.[1] || campo;
const dinero = (valor) => `$${Number(valor || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numero = (valor) => Number(valor || 0).toLocaleString("es-EC", { maximumFractionDigits: 4 });

function valorCampo(movimiento, campo) {
  if (campo === "recurso") return { id: movimiento.recurso.clave_consolidacion, label: movimiento.recurso.descripcion };
  if (campo === "apu") return movimiento.apu ? { id: movimiento.apu.id, label: movimiento.apu.nombre } : { id: "subcontratado", label: "Subcontratado" };
  if (campo === "categoria") return { id: movimiento.categoria_recurso, label: movimiento.categoria_recurso || "Sin categoría" };
  const valor = movimiento.ruta?.[campo];
  if (valor) return { id: valor.id, label: valor.descripcion };
  return { id: `sin-${campo}`, label: "Sin asignar" };
}

function resumenPaquetes(movimientos) {
  const resultado = new Map();
  movimientos.forEach((movimiento) => {
    const clave = movimiento.paquete?.id ?? "sin-paquete";
    const actual = resultado.get(clave) || { origenes: new Set(), cantidad: 0, costoTotal: 0, costoUnitario: 0, movimientos: [] };
    actual.origenes.add(movimiento.origen);
    actual.cantidad += Number(movimiento.cantidad || 0);
    actual.costoTotal += Number(movimiento.costo_total || 0);
    actual.movimientos.push(movimiento);
    resultado.set(clave, actual);
  });
  resultado.forEach((valor) => {
    valor.costoUnitario = valor.cantidad ? valor.costoTotal / valor.cantidad : 0;
    valor.origen = valor.origenes.size === 1 ? [...valor.origenes][0] : "Inconsistente";
  });
  return resultado;
}

function construirFilas(movimientos, campos) {
  const raiz = { key: "raiz", label: "", level: -1, children: new Map(), movimientos: [] };
  movimientos.forEach((movimiento) => {
    let nodo = raiz;
    nodo.movimientos.push(movimiento);
    campos.forEach((campo) => {
      const valor = valorCampo(movimiento, campo);
      const key = `${nodo.key}/${campo}:${valor.id}`;
      if (!nodo.children.has(key)) nodo.children.set(key, { key, label: valor.label, field: campo, level: nodo.level + 1, children: new Map(), movimientos: [] });
      nodo = nodo.children.get(key);
      nodo.movimientos.push(movimiento);
    });
  });
  const filas = [];
  const visitar = (nodo) => {
    [...nodo.children.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "es"))
      .forEach((hijo) => {
        filas.push({ ...hijo, paquetes: resumenPaquetes(hijo.movimientos), esDetalle: hijo.field === "recurso" });
        visitar(hijo);
      });
  };
  visitar(raiz);
  return filas;
}

export default function UsoRecursosView({ selectedProjectId, onVisibleCountChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rowFields, setRowFields] = useState(["rubro", "categoria", "recurso"]);
  const [selectedPackages, setSelectedPackages] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [panel, setPanel] = useState("configurar");
  const [configuraciones, setConfiguraciones] = useState([]);
  const [configuracionActivaId, setConfiguracionActivaId] = useState("");
  const frozenPaneRef = useRef(null);
  const metricsPaneRef = useRef(null);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/uso-recursos`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || "No se pudo cargar el uso de recursos.");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setSelectedPackages(payload.paquetes.map((item) => item.id));
        }
      })
      .catch((err) => !cancelled && setError(err.message || "No se pudo cargar el uso de recursos."))
      .finally(() => !cancelled && setLoading(false));
    fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/uso-recursos/configuraciones`)
      .then((response) => response.ok ? response.json() : [])
      .then((items) => !cancelled && setConfiguraciones(items));
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  const paquetesVisibles = useMemo(() => {
    if (!data) return [];
    return data.paquetes.filter((paquete) => selectedPackages.includes(paquete.id));
  }, [data, selectedPackages]);
  const movimientos = useMemo(() => {
    if (!data) return [];
    const seleccion = new Set(selectedPackages);
    return data.movimientos.filter((item) => seleccion.has(item.paquete?.id));
  }, [data, selectedPackages]);
  const filas = useMemo(() => construirFilas(movimientos, rowFields), [movimientos, rowFields]);
  const selectedRow = filas.find((fila) => fila.key === selectedKey);

  useEffect(() => { onVisibleCountChange(filas.filter((fila) => fila.esDetalle).length); }, [filas, onVisibleCountChange]);

  const cambiarPaquete = (id) => setSelectedPackages((actual) => actual.includes(id) ? actual.filter((item) => item !== id) : [...actual, id]);
  const moverCampo = (index, delta) => setRowFields((actual) => {
    const destino = index + delta;
    if (destino < 0 || destino >= actual.length) return actual;
    const siguiente = [...actual];
    [siguiente[index], siguiente[destino]] = [siguiente[destino], siguiente[index]];
    return siguiente;
  });
  const agregarCampo = (campo) => setRowFields((actual) => actual.includes(campo) ? actual : [...actual, campo]);
  const quitarCampo = (campo) => setRowFields((actual) => actual.length <= 1 ? actual : actual.filter((item) => item !== campo));
  const restablecer = () => { setRowFields(["rubro", "categoria", "recurso"]); setSelectedPackages(data?.paquetes.map((item) => item.id) || []); setSelectedKey(""); };
  const cargarConfiguracion = (id) => {
    setConfiguracionActivaId(id);
    const configuracion = configuraciones.find((item) => String(item.id) === String(id))?.configuracion;
    if (!configuracion) return;
    setRowFields(configuracion.rowFields || ["rubro", "categoria", "recurso"]);
    setSelectedPackages(configuracion.packageIds || []);
  };
  const guardarConfiguracion = async () => {
    const nombre = window.prompt("Nombre de la configuración:");
    if (!nombre?.trim()) return;
    const response = await fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/uso-recursos/configuraciones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, configuracion: { rowFields, packageIds: selectedPackages } }) });
    if (!response.ok) return;
    const guardada = await response.json();
    setConfiguraciones((actual) => [...actual.filter((item) => item.id !== guardada.id), guardada].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setConfiguracionActivaId(String(guardada.id));
  };
  const exportarExcel = async () => {
    const response = await fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/uso-recursos/exportar.xlsx`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ row_fields: rowFields, package_ids: selectedPackages }) });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = "uso_recursos.xlsx"; link.click(); URL.revokeObjectURL(url);
  };
  const sincronizarVertical = (origen) => {
    const destino = origen === "metricas" ? frozenPaneRef.current : metricsPaneRef.current;
    const actual = origen === "metricas" ? metricsPaneRef.current : frozenPaneRef.current;
    if (destino && actual && destino.scrollTop !== actual.scrollTop) destino.scrollTop = actual.scrollTop;
  };

  const totalProyecto = movimientos.reduce((total, item) => total + Number(item.costo_total || 0), 0);
  return (
    <section className="budget-v2-resource-usage">
      <aside className="budget-v2-resource-panel">
        <div className="budget-v2-resource-panel-tabs">
          <button type="button" className={panel === "configurar" ? "active" : ""} onClick={() => setPanel("configurar")}>Configurar</button>
          <button type="button" className={panel === "detalle" ? "active" : ""} onClick={() => setPanel("detalle")}>Detalle</button>
        </div>
        {panel === "configurar" ? (
          <div className="budget-v2-resource-panel-body">
            <strong>Filtros</strong>
            <label>Paquetes</label>
            <div className="budget-v2-resource-package-list">
              {(data?.paquetes || []).map((paquete) => <label key={paquete.id}><input type="checkbox" checked={selectedPackages.includes(paquete.id)} onChange={() => cambiarPaquete(paquete.id)} /> {paquete.nombre}</label>)}
            </div>
            <strong>Filas</strong>
            <small>Ordena los niveles como una tabla dinámica.</small>
            <div className="budget-v2-resource-fields">
              {rowFields.map((campo, index) => <div key={campo}><span>{etiquetaCampo(campo)}</span><button type="button" onClick={() => moverCampo(index, -1)}>↑</button><button type="button" onClick={() => moverCampo(index, 1)}>↓</button><button type="button" onClick={() => quitarCampo(campo)}>×</button></div>)}
            </div>
            <label>Agregar campo</label>
            <select value="" onChange={(event) => { if (event.target.value) agregarCampo(event.target.value); }}><option value="">Seleccionar…</option>{CAMPOS.filter(([id]) => !rowFields.includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            <button type="button" className="budget-v2-resource-reset" onClick={restablecer}>Restablecer vista</button>
            <label>Configuraciones guardadas</label>
            <select value={configuracionActivaId} onChange={(event) => cargarConfiguracion(event.target.value)}><option value="">Seleccionar…</option>{configuraciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
            <button type="button" className="budget-v2-resource-reset" onClick={guardarConfiguracion}>Guardar configuración</button>
            <button type="button" className="budget-v2-resource-reset" onClick={exportarExcel}>Exportar Excel</button>
            <small>La configuración guarda paquetes y jerarquía de filas para este proyecto.</small>
          </div>
        ) : (
          <div className="budget-v2-resource-panel-body">
            {!selectedRow && <span>Selecciona una fila para ver su trazabilidad.</span>}
            {selectedRow && <><strong>{selectedRow.label}</strong><small>{selectedRow.movimientos.length} movimiento(s) incluidos.</small><div className="budget-v2-resource-detail-list">{selectedRow.movimientos.slice(0, 30).map((item, index) => <div key={`${item.rubro.id}-${item.recurso.id || index}`}><b>{item.paquete?.nombre}</b><span>{item.rubro.descripcion}</span><span>{item.apu?.nombre || "Subcontratado"}</span><span>{item.origen} · {numero(item.cantidad)} {item.recurso.unidad} · {dinero(item.costo_total)}</span></div>)}</div></>}
          </div>
        )}
      </aside>
      <main className="budget-v2-resource-main">
        <header><div><small>Consulta y análisis</small><h2>Uso de recursos</h2></div><div><small>Costo total visible</small><strong>{dinero(totalProyecto)}</strong></div></header>
        {loading && <div className="budget-v2-state">Calculando uso de recursos…</div>}
        {error && <div className="budget-v2-state budget-v2-state-error">{error}</div>}
        {!loading && !error && <div className="budget-v2-resource-table-wrap">
          <div ref={frozenPaneRef} className="budget-v2-resource-frozen-pane" onScroll={() => sincronizarVertical("frozen")}>
            <table className="budget-v2-resource-frozen-table"><colgroup><col /><col /></colgroup><thead><tr><th>{etiquetaCampo(rowFields[rowFields.length - 1])}</th><th>Unidad</th></tr></thead><tbody>{filas.map((fila) => <tr key={fila.key} className={fila.esDetalle ? "budget-v2-resource-leaf" : "budget-v2-resource-group"} onClick={() => { setSelectedKey(fila.key); setPanel("detalle"); }}><td title={fila.label} style={{ paddingLeft: `${12 + fila.level * 18}px` }}><b>{fila.label}</b></td><td>{fila.esDetalle ? fila.movimientos[0]?.recurso?.unidad : ""}</td></tr>)}</tbody><tfoot><tr><th>Total monetario</th><th /></tr></tfoot></table>
          </div>
          <div ref={metricsPaneRef} className="budget-v2-resource-scroll-pane" onScroll={() => sincronizarVertical("metricas")}>
            <table className="budget-v2-resource-metrics-table"><colgroup>{paquetesVisibles.flatMap((paquete) => ["origen", "cantidad", "costo-u", "costo-t"].map((campo) => <col key={`${paquete.id}-${campo}`} />))}<col /><col /></colgroup><thead><tr>{paquetesVisibles.map((paquete) => <th key={paquete.id} colSpan="4">{paquete.nombre}</th>)}<th rowSpan="2">Cant. total</th><th rowSpan="2">Costo total</th></tr><tr>{paquetesVisibles.flatMap((paquete) => ["Origen", "Cant.", "Costo U.", "Costo T."].map((titulo) => <th key={`${paquete.id}-${titulo}`}>{titulo}</th>))}</tr></thead><tbody>{filas.map((fila) => { const totalCantidad = fila.movimientos.reduce((total, item) => total + Number(item.cantidad || 0), 0); const totalCosto = fila.movimientos.reduce((total, item) => total + Number(item.costo_total || 0), 0); return <tr key={fila.key} className={fila.esDetalle ? "budget-v2-resource-leaf" : "budget-v2-resource-group"} onClick={() => { setSelectedKey(fila.key); setPanel("detalle"); }}>{paquetesVisibles.flatMap((paquete) => { const valor = fila.paquetes.get(paquete.id); return [<td key={`${paquete.id}-o`} title={valor?.origen || ""}>{valor?.origen || "—"}</td>, <td key={`${paquete.id}-q`}>{valor ? numero(valor.cantidad) : "—"}</td>, <td key={`${paquete.id}-u`}>{valor ? dinero(valor.costoUnitario) : "—"}</td>, <td key={`${paquete.id}-t`}>{valor ? dinero(valor.costoTotal) : "—"}</td>]; })}<td>{fila.esDetalle ? numero(totalCantidad) : ""}</td><td>{dinero(totalCosto)}</td></tr>; })}</tbody><tfoot><tr>{paquetesVisibles.flatMap((paquete) => { const total = movimientos.filter((item) => item.paquete?.id === paquete.id).reduce((sum, item) => sum + Number(item.costo_total || 0), 0); return [<td key={`${paquete.id}-blank1`} />, <td key={`${paquete.id}-blank2`} />, <td key={`${paquete.id}-blank3`} />, <td key={`${paquete.id}-sum`}>{dinero(total)}</td>]; })}<td /><td>{dinero(totalProyecto)}</td></tr></tfoot></table>
          </div>
        </div>}
        {!loading && !error && data?.advertencias?.length > 0 && <p className="budget-v2-resource-warning">{data.advertencias.length} advertencia(s): hay rubros sin APU, subcontratados sin precio o recursos fuera de alcance. No se han ocultado.</p>}
      </main>
    </section>
  );
}
