import { useEffect, useState } from "react";
import { ActionButton, PageHeader, SectionHeader } from "../components/ui";

const API = "http://127.0.0.1:8000";

const SECCIONES = [
  { key: "equipo",       label: "Equipos",      usaRendimiento: true,  labelB: "Tarifa", tooltipB: "B: tarifa o costo horario del equipo" },
  { key: "mano_de_obra", label: "Mano de Obra", usaRendimiento: true,  labelB: "Tarifa", tooltipB: "B: salario por hora" },
  { key: "material",     label: "Materiales",   usaRendimiento: false, labelB: "P.U.",   tooltipB: "B: precio unitario del material" },
  { key: "transporte",   label: "Transporte",   usaRendimiento: false, labelB: "P.U.",   tooltipB: "B: tarifa de transporte" },
];

const ESTADOS_APU = [
  ["referencial", "Validado / Referencial"],
  ["en_revision", "En revision"],
  ["revisar_costo", "Revisar costo"],
  ["inactivo", "Inactivo"],
  ["activo", "Activo"],
];

const normalizarBusqueda = (valor) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const textoRecurso = (recurso) =>
  normalizarBusqueda([
    recurso.descripcion,
    recurso.codigo,
    recurso.unidad,
    recurso.fuente_precio,
    recurso.observacion,
  ].filter(Boolean).join(" "));

const puntuarRecurso = (recurso, terminos) => {
  const descripcion = normalizarBusqueda(recurso.descripcion);
  const codigo = normalizarBusqueda(recurso.codigo);
  const unidad = normalizarBusqueda(recurso.unidad);
  const fuente = normalizarBusqueda(recurso.fuente_precio);
  const observacion = normalizarBusqueda(recurso.observacion);

  return terminos.reduce((total, termino) => {
    if (codigo === termino) return total + 120;
    if (codigo.startsWith(termino)) return total + 90;
    if (descripcion.startsWith(termino)) return total + 80;
    if (descripcion.includes(termino)) return total + 50;
    if (unidad === termino) return total + 25;
    if (fuente.includes(termino)) return total + 18;
    if (observacion.includes(termino)) return total + 12;
    return total;
  }, 0);
};

const recursoDetalleBreve = (recurso) => {
  const detalle = recurso.fuente_precio || recurso.observacion || "";
  return detalle.length > 48 ? `${detalle.slice(0, 45)}...` : detalle;
};

const parseNumero = (value) => Number.parseFloat(String(value ?? "").replace(",", "."));
const roundTo = (value, decimals) => {
  const numero = parseNumero(value);
  return Number.isFinite(numero) ? Number(numero.toFixed(decimals)) : 0;
};
const round3 = (value) => roundTo(value, 3);
const fmt2 = (n) => roundTo(n, 2).toFixed(2);
const fmt3 = (n) => round3(n).toFixed(3);

const estadoBadge = (estado) => {
  const estilos = {
    activo:      { background: "#dcfce7", color: "#166534" },
    referencial: { background: "#dcfce7", color: "#166534" },
    ok:          { background: "#dcfce7", color: "#166534" },
    validado:    { background: "#dcfce7", color: "#166534" },
    en_revision: { background: "#fef9c3", color: "#854d0e" },
    revisar_costo: { background: "#fee2e2", color: "#991b1b" },
    inactivo:    { background: "#f3f4f6", color: "#6b7280" },
  };
  const s = estilos[estado] || estilos.inactivo;
  return (
    <span style={{ ...s, padding: "2px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600 }}>
      {estado}
    </span>
  );
};

// Ãcono con tooltip al pasar el cursor por encima
const InfoIcon = ({ tooltip }) => (
  <span
    title={tooltip}
    style={{
      display: "inline-block",
      marginLeft: "4px",
      color: "#9ca3af",
      fontSize: "0.75rem",
      cursor: "help",
      verticalAlign: "1px",
    }}
  >
    i
  </span>
);

export default function ApuDetalle({ apu: apuInicial, onVolver, volverLabel = "Volver a APUs" }) {
  const [apu, setApu]                       = useState(apuInicial);
  const [rendimientoEdit, setRendimientoEdit] = useState(apuInicial.rendimiento);
  const [items, setItems]                   = useState([]);
  const [recursos, setRecursos]             = useState([]);
  const [, setCostoOficial]                 = useState(null);
  const [agregando, setAgregando]           = useState(null);
  const [formItem, setFormItem]             = useState({ recurso_id: "", cantidad: 1.0 });
  const [busquedaRecurso, setBusquedaRecurso] = useState("");
  const [indiceResultadoActivo, setIndiceResultadoActivo] = useState(0);
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [cantidadEdit, setCantidadEdit]     = useState("");
  const [error, setError]                   = useState("");
  const [cargando, setCargando]             = useState(true);
  const [seccionesContraidas, setSeccionesContraidas] = useState(new Set());
  const [laboral] = useState({ horasDia: 8, diasSemana: 5, semanasMes: 4 });
  const [rendimientoModo, setRendimientoModo] = useState("h_unidad");
  const [rendimientoCampoValor, setRendimientoCampoValor] = useState("");
  const [categoriasCostoObjetivo, setCategoriasCostoObjetivo] = useState(["equipo", "mano_de_obra"]);
  const [costoObjetivoValor, setCostoObjetivoValor] = useState("");
  const [panelCostoObjetivoOpen, setPanelCostoObjetivoOpen] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      const [resApu, resRec] = await Promise.all([
        fetch(`${API}/apus/${apu.id}`),
        fetch(`${API}/recursos/?estado=activos`)
      ]);
      const dataApu = await resApu.json();
      const dataRec = await resRec.json();
      setApu(dataApu);
      setRendimientoEdit(dataApu.rendimiento);
      setItems(dataApu.items || []);
      setRecursos(Array.isArray(dataRec) ? dataRec : []);
      fetch(`${API}/apus/${apu.id}/costo`)
        .then(r => r.ok ? r.json() : null)
        .then(setCostoOficial)
        .catch(() => setCostoOficial(null));
      setCargando(false);
    };
    cargar();
  }, [apu.id]);


  // â”€â”€ Cálculos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const rendimientoBaseActual = parseNumero(rendimientoEdit);
  const baseRendimiento = Number.isFinite(rendimientoBaseActual) && rendimientoBaseActual > 0 ? round3(rendimientoBaseActual) : round3(apu.rendimiento);
  const R = baseRendimiento;

  const costoBaseItem = (item) => {
    const recurso = recursos.find(rc => rc.id === item.recurso_id);
    if (!recurso) return 0;
    return round3(round3(item.cantidad) * round3(recurso.precio_unitario));
  };

  const costoItem = (item, r) => {
    const C = costoBaseItem(item);
    const usaR = item.categoria === "equipo" || item.categoria === "mano_de_obra";
    return usaR ? round3(C * round3(r)) : C;
  };

  const itemsCosto          = items.filter(i => !i.es_herramienta_menor);
  const resumenCostoParaR = (rendimiento) => {
    const sumarCosto = (lista) => lista.reduce((a, i) => round3(a + costoItem(i, rendimiento)), 0);
    const manoDeObra = sumarCosto(itemsCosto.filter(i => i.categoria === "mano_de_obra"));
    const herramientaMenor = round3(manoDeObra * 0.05);
    const equipo = round3(sumarCosto(itemsCosto.filter(i => i.categoria === "equipo")) + herramientaMenor);
    const material = sumarCosto(itemsCosto.filter(i => i.categoria === "material"));
    const transporte = sumarCosto(itemsCosto.filter(i => i.categoria === "transporte"));
    return {
      equipo,
      mano_de_obra: manoDeObra,
      material,
      transporte,
      herramienta_menor: herramientaMenor,
      total: round3(equipo + manoDeObra + material + transporte),
    };
  };
  const resumenCosto = resumenCostoParaR(R);
  const resumenCostoUnitario = resumenCostoParaR(1);
  const subtotalMO          = resumenCosto.mano_de_obra;
  const herramientasMenores = resumenCosto.herramienta_menor;
  const subtotalEquipos     = resumenCosto.equipo;
  const subtotalMateriales  = resumenCosto.material;
  const subtotalTransporte  = resumenCosto.transporte;
  const totalCostoDirecto   = resumenCosto.total;

  const subtotalDe = (key) => ({
    equipo: subtotalEquipos,
    mano_de_obra: subtotalMO,
    material: subtotalMateriales,
    transporte: subtotalTransporte
  })[key] || 0;

  // â”€â”€ Persistencia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const guardarItems = async (nuevosItems, rendimientoActual) => {
    const r = round3(rendimientoActual ?? apu.rendimiento);
    await fetch(`${API}/apus/${apu.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: apu.nombre, unidad: apu.unidad, rendimiento: r, estado: apu.estado,
        items: nuevosItems.filter(i => !i.es_herramienta_menor).map((i, idx) => ({
          recurso_id: i.recurso_id, categoria: i.categoria,
          cantidad: round3(i.cantidad), orden: idx, es_herramienta_menor: false,
        }))
      })
    });
    const costo = await fetch(`${API}/apus/${apu.id}/costo`).then(r => r.ok ? r.json() : null).catch(() => null);
    setCostoOficial(costo);
  };

  const guardarRendimientoBase = async (valorBase) => {
    const nuevoR = Number(valorBase);
    const valido = !isNaN(nuevoR) && nuevoR > 0;
    const valorFinal = valido ? round3(nuevoR) : round3(apu.rendimiento);
    const apuActualizado = { ...apu, rendimiento: valorFinal };
    setApu(apuActualizado);
    setRendimientoEdit(valorFinal);
    await guardarItems(items, valorFinal);
  };

  const guardarEstado = async (nuevoEstado) => {
    const apuActualizado = { ...apu, estado: nuevoEstado };
    setApu(apuActualizado);
    await fetch(`${API}/apus/${apu.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: apu.nombre,
        unidad: apu.unidad,
        rendimiento: round3(apu.rendimiento),
        estado: nuevoEstado,
        categoria: apu.categoria,
        subcategoria: apu.subcategoria,
        descripcion: apu.descripcion,
        observacion: apu.observacion,
        items: items.filter(i => !i.es_herramienta_menor).map((i, idx) => ({
          recurso_id: i.recurso_id,
          categoria: i.categoria,
          cantidad: round3(i.cantidad),
          orden: idx,
          es_herramienta_menor: false,
        })),
      })
    });
  };

  // â”€â”€ Agregar ítem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const confirmarAgregar = async () => {
    if (!formItem.recurso_id) { setError("Selecciona un recurso."); return; }
    const recursoId = parseInt(formItem.recurso_id);
    const yaExiste = items.some(i => i.categoria === agregando && i.recurso_id === recursoId && !i.es_herramienta_menor);
    if (yaExiste) {
      setError("Este recurso ya esta agregado en esta categoria.");
      return;
    }
    const nuevo = {
      recurso_id: recursoId,
      cantidad:   round3(formItem.cantidad) || 1.0,
      categoria:  agregando,
      es_herramienta_menor: false,
    };
    const nuevosItems = [...items, nuevo];
    setItems(nuevosItems);
    await guardarItems(nuevosItems);
    setAgregando(null);
    setFormItem({ recurso_id: "", cantidad: 1.0 });
    setBusquedaRecurso("");
    setIndiceResultadoActivo(0);
    setError("");
  };

  const cancelarAgregar = () => {
    setAgregando(null);
    setFormItem({ recurso_id: "", cantidad: 1.0 });
    setBusquedaRecurso("");
    setIndiceResultadoActivo(0);
    setError("");
  };

  // â”€â”€ Editar cantidad inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const iniciarEditCantidad = (globalIdx, cantidadActual) => {
    setEditandoCantidad(globalIdx);
    setCantidadEdit(cantidadActual);
  };

  const confirmarEditCantidad = async (globalIdx) => {
    const nueva = parseFloat(cantidadEdit);
    if (!nueva || nueva <= 0) { setEditandoCantidad(null); return; }
    const nuevaNormalizada = round3(nueva);
    const nuevosItems = items.map((i, idx) =>
      idx === globalIdx ? { ...i, cantidad: nuevaNormalizada } : i
    );
    setItems(nuevosItems);
    setEditandoCantidad(null);
    await guardarItems(nuevosItems);
  };

  // â”€â”€ Eliminar ítem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const eliminarItem = async (globalIdx) => {
    if (!confirm("¿Eliminar este ítem?")) return;
    const nuevosItems = items.filter((_, i) => i !== globalIdx);
    setItems(nuevosItems);
    await guardarItems(nuevosItems);
  };

  // â”€â”€ Contraer / expandir sección â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const toggleSeccion = (key) => {
    setSeccionesContraidas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const horasDia = Math.max(parseFloat(laboral.horasDia) || 0, 0);
  const diasSemana = Math.max(parseFloat(laboral.diasSemana) || 0, 0);
  const semanasMes = Math.max(parseFloat(laboral.semanasMes) || 0, 0);
  const horasSemana = horasDia * diasSemana;
  const horasMes = horasSemana * semanasMes;

  const rendimientoValores = {
    h_unidad: baseRendimiento,
    dia_unidad: horasDia ? round3(baseRendimiento / horasDia) : 0,
    semana_unidad: horasSemana ? round3(baseRendimiento / horasSemana) : 0,
    mes_unidad: horasMes ? round3(baseRendimiento / horasMes) : 0,
    unidad_h: baseRendimiento ? round3(1 / baseRendimiento) : 0,
    unidad_dia: baseRendimiento ? round3(horasDia / baseRendimiento) : 0,
    unidad_semana: baseRendimiento ? round3(horasSemana / baseRendimiento) : 0,
    unidad_mes: baseRendimiento ? round3(horasMes / baseRendimiento) : 0,
  };

  const baseDesdeRendimiento = (key, valor) => {
    const n = parseNumero(valor);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (key === "h_unidad") return round3(n);
    if (key === "dia_unidad") return horasDia ? round3(n * horasDia) : null;
    if (key === "semana_unidad") return horasSemana ? round3(n * horasSemana) : null;
    if (key === "mes_unidad") return horasMes ? round3(n * horasMes) : null;
    if (key === "unidad_h") return round3(1 / n);
    if (key === "unidad_dia") return horasDia ? round3(horasDia / n) : null;
    if (key === "unidad_semana") return horasSemana ? round3(horasSemana / n) : null;
    if (key === "unidad_mes") return horasMes ? round3(horasMes / n) : null;
    return null;
  };

  const valorModoDesdeBase = (key, base) => {
    if (key === "h_unidad") return round3(base);
    if (key === "dia_unidad") return horasDia ? round3(base / horasDia) : 0;
    if (key === "semana_unidad") return horasSemana ? round3(base / horasSemana) : 0;
    if (key === "mes_unidad") return horasMes ? round3(base / horasMes) : 0;
    if (key === "unidad_h") return base ? round3(1 / base) : 0;
    if (key === "unidad_dia") return base ? round3(horasDia / base) : 0;
    if (key === "unidad_semana") return base ? round3(horasSemana / base) : 0;
    if (key === "unidad_mes") return base ? round3(horasMes / base) : 0;
    return 0;
  };

  const actualizarRendimientoEnPantalla = (base) => {
    const normalizado = round3(base);
    if (!normalizado || normalizado <= 0) return;
    setRendimientoEdit(normalizado);
    setRendimientoCampoValor(fmt3(valorModoDesdeBase(rendimientoModo, normalizado)));
  };

  const actualizarRendimientoCampo = (valor) => {
    setRendimientoCampoValor(valor);
    const base = baseDesdeRendimiento(rendimientoModo, valor);
    if (base) setRendimientoEdit(base);
  };

  const resumenCostoRedondeado = (rendimiento) => Number(fmt2(resumenCostoParaR(rendimiento).total));

  const buscarRendimientoConCambioVisible = (direccion) => {
    const actual = baseDesdeRendimiento(rendimientoModo, rendimientoCampoValor) || baseRendimiento;
    const costoActual = resumenCostoRedondeado(actual);
    for (let paso = 1; paso <= 1000; paso += 1) {
      const candidato = round3(actual + direccion * paso * 0.001);
      if (candidato <= 0) break;
      if (resumenCostoRedondeado(candidato) !== costoActual) return candidato;
    }
    return Math.max(0.001, round3(actual + direccion * 0.001));
  };

  const categoriaObjetivoOpciones = [
    ["equipo", "Equipos"],
    ["mano_de_obra", "Mano de obra"],
    ["material", "Materiales"],
    ["transporte", "Transporte"],
  ];

  const toggleCategoriaCostoObjetivo = (categoria) => {
    setCategoriasCostoObjetivo((actuales) => {
      if (actuales.includes(categoria)) {
        const siguientes = actuales.filter((item) => item !== categoria);
        return siguientes.length ? siguientes : actuales;
      }
      return [...actuales, categoria];
    });
  };

  const coeficienteObjetivo = () => {
    return categoriasCostoObjetivo.reduce((total, categoria) => {
      if (categoria === "equipo" || categoria === "mano_de_obra") return round3(total + resumenCostoUnitario[categoria]);
      return total;
    }, 0);
  };

  const fijoObjetivo = () => {
    return categoriasCostoObjetivo.reduce((total, categoria) => {
      if (categoria === "material" || categoria === "transporte") return round3(total + resumenCosto[categoria]);
      return total;
    }, 0);
  };

  const rendimientoParaCostoObjetivo = () => {
    const objetivo = parseNumero(costoObjetivoValor);
    if (!Number.isFinite(objetivo) || objetivo <= 0) return null;
    const coeficiente = coeficienteObjetivo();
    if (!coeficiente || coeficiente <= 0) return null;
    const baseObjetivo = objetivo - fijoObjetivo();
    if (baseObjetivo <= 0) return null;
    return round3(baseObjetivo / coeficiente);
  };

  const aplicarCostoObjetivo = async () => {
    const rendimientoObjetivo = rendimientoParaCostoObjetivo();
    if (!rendimientoObjetivo) {
      setError("No se puede calcular ese costo objetivo con el rendimiento actual.");
      return;
    }
    setError("");
    actualizarRendimientoEnPantalla(rendimientoObjetivo);
    await guardarRendimientoBase(rendimientoObjetivo);
    setPanelCostoObjetivoOpen(false);
  };

  const confirmarRendimientoCampo = async () => {
    const base = baseDesdeRendimiento(rendimientoModo, rendimientoCampoValor);
    if (!base) return;
    await guardarRendimientoBase(base);
  };

  const guardarYVolver = async () => {
    if (editandoCantidad !== null) {
      await confirmarEditCantidad(editandoCantidad);
    } else if (rendimientoCampoValor) {
      await confirmarRendimientoCampo();
    }
    await onVolver?.();
  };

  const rendimientoModoValor = fmt3(rendimientoValores[rendimientoModo]);
  const rendimientoValue = rendimientoCampoValor || rendimientoModoValor;
  const rendimientoStep = 0.001;
  const recursosDe = (key) => recursos.filter(r => r.categoria === key);
  const recursoSeleccionado = formItem.recurso_id
    ? recursos.find(r => r.id === parseInt(formItem.recurso_id))
    : null;
  const recursosFiltradosDe = (key) => {
    const base = recursosDe(key);
    const terminos = normalizarBusqueda(busquedaRecurso).split(/\s+/).filter(Boolean);
    if (!terminos.length) return base.slice(0, 8);

    return base
      .filter(r => terminos.every(termino => textoRecurso(r).includes(termino)))
      .map(r => ({ recurso: r, puntaje: puntuarRecurso(r, terminos) }))
      .sort((a, b) => b.puntaje - a.puntaje || (a.recurso.descripcion || "").localeCompare(b.recurso.descripcion || ""))
      .slice(0, 8)
      .map(({ recurso }) => recurso);
  };
  const seleccionarRecurso = (recurso) => {
    const yaExiste = items.some(i => i.categoria === agregando && i.recurso_id === recurso.id && !i.es_herramienta_menor);
    setFormItem({ ...formItem, recurso_id: String(recurso.id) });
    setBusquedaRecurso(recurso.descripcion || recurso.codigo || "");
    setIndiceResultadoActivo(0);
    setError(yaExiste ? "Este recurso ya esta agregado en esta categoria." : "");
  };
  const rendimientoCampos = [
    ["h_unidad", `h/${apu.unidad}`],
    ["dia_unidad", `dia/${apu.unidad}`],
    ["semana_unidad", `semana/${apu.unidad}`],
    ["mes_unidad", `mes/${apu.unidad}`],
    ["unidad_h", `${apu.unidad}/h`],
    ["unidad_dia", `${apu.unidad}/dia`],
    ["unidad_semana", `${apu.unidad}/semana`],
    ["unidad_mes", `${apu.unidad}/mes`],
  ];

  useEffect(() => {
    setRendimientoCampoValor(rendimientoModoValor);
  }, [rendimientoModoValor]);

  if (cargando) return (
    <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>
      Cargando...
    </div>
  );

  // â”€â”€ Estilos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const card   = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
  const thBase = { padding: "8px 10px", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" };
  const thL    = { ...thBase, textAlign: "left" };
  const thR    = { ...thBase, textAlign: "right" };
  const tdBase = { padding: "9px 10px", fontSize: "0.85rem", borderBottom: "1px solid #f3f4f6", color: "#374151" };
  const tdL    = { ...tdBase, textAlign: "left" };
  const tdR    = { ...tdBase, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div className="page-wrap">
      <PageHeader
        title={apu.nombre}
        subtitle="Detalle tecnico y composicion del APU."
        actions={<ActionButton onClick={guardarYVolver}>{volverLabel}</ActionButton>}
      />

      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: "8px", padding: "10px 12px", marginBottom: "12px" }}>
        {[
          ["Equipos", subtotalEquipos],
          ["Mano de obra", subtotalMO],
          ["Materiales", subtotalMateriales],
          ["Transporte", subtotalTransporte],
          ["Total directo", totalCostoDirecto],
        ].map(([label, value]) => (
          <div key={label} style={{ border: "1px solid #e5e7eb", borderRadius: "6px", background: label === "Total directo" ? "#f0fdf4" : "#f8fafc", padding: "8px 10px" }}>
            <div style={{ color: "#6b7280", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
            <strong style={{ color: label === "Total directo" ? "#166534" : "#111827", fontSize: "1rem", fontVariantNumeric: "tabular-nums" }}>${fmt2(value)}</strong>
          </div>
        ))}
      </div>

      {/* Cabecera del APU */}
      <div style={{ ...card, padding: "14px 18px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Resumen APU</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {estadoBadge(apu.estado)}
            <select
              value={apu.estado || "en_revision"}
              onChange={e => guardarEstado(e.target.value)}
              style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "4px 8px", fontSize: "0.75rem", color: "#374151", background: "#fff" }}
            >
              {ESTADOS_APU.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "32px" }}>
          {[["Codigo", apu.codigo || "-"], ["Unidad", apu.unidad], ["Categoria", apu.categoria || "-"]].map(([lbl, val]) => (
            <div key={lbl}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "4px" }}>{lbl}</div>
              <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "0.95rem" }}>{val}</div>
            </div>
          ))}
          <div style={{ flex: "1 1 420px", minWidth: "320px" }}>
            <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "6px" }}>Rendimiento</div>
            <div style={{ border: "1px solid #d1fae5", borderRadius: "8px", padding: "10px", background: "#f0fdf4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.78rem", color: "#14532d", fontWeight: 600 }}>Editar desde</span>
                <select
                  value={rendimientoModo}
                  onChange={e => setRendimientoModo(e.target.value)}
                  style={{ border: "1px solid #86efac", borderRadius: "6px", padding: "4px 8px", fontSize: "0.82rem", color: "#14532d", background: "#fff" }}
                >
                  {rendimientoCampos.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  step={rendimientoStep}
                  min="0.0001"
                  value={rendimientoValue}
                  onChange={e => actualizarRendimientoCampo(e.target.value)}
                  onBlur={confirmarRendimientoCampo}
                  onKeyDown={e => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      actualizarRendimientoEnPantalla(buscarRendimientoConCambioVisible(e.key === "ArrowUp" ? 1 : -1));
                    }
                    if (e.key === "Enter") confirmarRendimientoCampo();
                    if (e.key === "Escape") setRendimientoCampoValor(rendimientoModoValor);
                  }}
                  style={{ border: "1px solid #86efac", borderRadius: "6px", padding: "4px 8px", width: "112px", fontSize: "0.9rem", fontWeight: 700, color: "#1f2937", outline: "none" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(92px, 1fr))", gap: "6px", fontSize: "0.72rem", color: "#374151" }}>
                {rendimientoCampos.map(([key, label]) => (
                  <div key={key} style={{ background: "#fff", border: "1px solid #dcfce7", borderRadius: "6px", padding: "5px 7px" }}>
                    <div style={{ color: "#6b7280" }}>{label}</div>
                    <strong>{fmt2(rendimientoValores[key])}</strong>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginTop: "9px", borderTop: "1px solid #dcfce7", paddingTop: "9px" }}>
                <span style={{ color: "#166534", fontSize: "0.72rem", fontWeight: 700 }}>
                  Costo objetivo por categorias
                </span>
                <button
                  type="button"
                  onClick={() => setPanelCostoObjetivoOpen(value => !value)}
                  style={{ border: "1px solid #166534", borderRadius: "6px", background: "#fff", color: "#166534", padding: "5px 9px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                >
                  {panelCostoObjetivoOpen ? "Ocultar" : "Establecer"}
                </button>
              </div>
              {panelCostoObjetivoOpen && (
                <div style={{ display: "grid", gap: "8px", marginTop: "8px", border: "1px solid #bbf7d0", borderRadius: "8px", background: "#fff", padding: "9px" }}>
                  <div style={{ color: "#14532d", fontSize: "0.72rem", fontWeight: 700 }}>
                    Selecciona las categorias que quieres cuadrar con el costo objetivo.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {categoriaObjetivoOpciones.map(([key, label]) => {
                      const activo = categoriasCostoObjetivo.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleCategoriaCostoObjetivo(key)}
                          style={{
                            border: `1px solid ${activo ? "#166534" : "#bbf7d0"}`,
                            borderRadius: "999px",
                            background: activo ? "#166534" : "#fff",
                            color: activo ? "#fff" : "#14532d",
                            padding: "4px 8px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px", alignItems: "center" }}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={costoObjetivoValor}
                      onChange={e => setCostoObjetivoValor(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") aplicarCostoObjetivo(); }}
                      placeholder="Costo objetivo"
                      style={{ border: "1px solid #86efac", borderRadius: "6px", padding: "5px 8px", fontSize: "0.82rem", color: "#1f2937", outline: "none" }}
                    />
                    <button
                      type="button"
                      onClick={aplicarCostoObjetivo}
                      style={{ border: "1px solid #166534", borderRadius: "6px", background: "#166534", color: "#fff", padding: "6px 10px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      Establecer
                    </button>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "0.68rem" }}>
                    Materiales y transporte se tratan como costo fijo; equipos y mano de obra se ajustan mediante rendimiento.
                  </div>
                </div>
              )}
              <div style={{ marginTop: "7px", fontSize: "0.68rem", color: "#6b7280" }}>
                Configuracion: {laboral.horasDia} h/dia · {laboral.diasSemana} dias/semana · {laboral.semanasMes} semanas/mes
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secciones */}
      {SECCIONES.map(({ key, label, usaRendimiento, labelB, tooltipB }) => {
        const itemsSeccion = itemsCosto.filter(i => i.categoria === key);
        const contraida = seccionesContraidas.has(key);
        const resultadosRecursos = agregando === key ? recursosFiltradosDe(key) : [];
        const indiceActivo = resultadosRecursos.length ? Math.min(indiceResultadoActivo, resultadosRecursos.length - 1) : 0;

        return (
          <div key={key} style={{ ...card, marginBottom: "16px", overflow: "hidden" }}>

            <SectionHeader
              title={label}
              countLabel={`${itemsSeccion.length} item${itemsSeccion.length !== 1 ? "s" : ""}`}
              status={<span>Subtotal: <strong>${fmt2(subtotalDe(key))}</strong></span>}
              collapsible
              collapsed={contraida}
              onToggle={() => toggleSeccion(key)}
            />

            {/* Tabla (oculta si está contraída) */}
            {!contraida && (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "36%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "7%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thL}>Descripción</th>
                    <th style={{ ...thR, cursor: "help" }} title="A: cantidad">Cant.<InfoIcon tooltip="A: cantidad" /></th>
                    <th style={{ ...thR, cursor: "help" }} title={tooltipB}>{labelB}<InfoIcon tooltip={tooltipB} /></th>
                    {usaRendimiento ? (
                      <>
                        <th style={{ ...thR, cursor: "help" }} title="C = A Ã— B (costo unitario)">Costo<InfoIcon tooltip="C = A Ã— B" /></th>
                        <th style={{ ...thR, cursor: "help" }} title="R: rendimiento (h por unidad)">Rend.<InfoIcon tooltip="R: rendimiento" /></th>
                        <th style={{ ...thR, cursor: "help" }} title="D = C Ã— R (total del ítem)">Total<InfoIcon tooltip="D = C Ã— R" /></th>
                      </>
                    ) : (
                      <>
                        <th style={{ ...thBase, textAlign: "center", color: "#d1d5db" }}>—</th>
                        <th style={{ ...thBase, textAlign: "center", color: "#d1d5db" }}>—</th>
                        <th style={{ ...thR, cursor: "help" }} title="Total = A Ã— B">Total<InfoIcon tooltip="Total = A Ã— B" /></th>
                      </>
                    )}
                    <th style={thBase}></th>
                  </tr>
                </thead>
                <tbody>

                  {/* Herramientas Menores — fila fija primera en Equipos, no editable */}
                  {key === "equipo" && (
                    <tr style={{ background: "#fffbeb" }}>
                      <td style={{ ...tdL, fontStyle: "italic", color: "#92400e", fontSize: "0.82rem" }}>Herramientas Menores 5% MO</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, color: "#d97706" }}>—</td>
                      <td style={{ ...tdR, fontWeight: 600, color: "#92400e" }}>{fmt2(herramientasMenores)}</td>
                      <td></td>
                    </tr>
                  )}

                  {/* Sin ítems */}
                  {itemsSeccion.length === 0 && key !== "equipo" && (
                    <tr>
                      <td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#d1d5db", fontSize: "0.85rem" }}>
                        Sin ítems
                      </td>
                    </tr>
                  )}

                  {/* Ãtems de la sección */}
                  {itemsSeccion.map((item) => {
                    const recurso   = recursos.find(r => r.id === item.recurso_id);
                    const globalIdx = items.indexOf(item);
                    const C = recurso ? round3(round3(item.cantidad) * round3(recurso.precio_unitario)) : 0;
                    const D = usaRendimiento ? round3(C * round3(R)) : C;
                    return (
                      <tr key={globalIdx}
                        onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>

                        {/* Descripción + unidad entre paréntesis */}
                        <td style={{ ...tdL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {recurso?.descripcion || "—"}
                          {recurso?.unidad && <span style={{ color: "#9ca3af", marginLeft: "4px" }}>({recurso.unidad})</span>}
                        </td>

                        {/* Cantidad — editable inline */}
                        <td style={tdR}>
                          {editandoCantidad === globalIdx ? (
                            <input
                              type="number" step="0.001" min="0"
                              value={cantidadEdit}
                              autoFocus
                              onChange={e => setCantidadEdit(e.target.value)}
                              onBlur={() => confirmarEditCantidad(globalIdx)}
                              onKeyDown={e => { if (e.key === "Enter") confirmarEditCantidad(globalIdx); if (e.key === "Escape") setEditandoCantidad(null); }}
                              style={{ border: "1px solid #bbf7d0", borderRadius: "4px", padding: "2px 6px", width: "70px", textAlign: "right", fontSize: "0.85rem", outline: "none" }}
                            />
                          ) : (
                            <span
                              onClick={() => iniciarEditCantidad(globalIdx, item.cantidad)}
                              style={{ cursor: "pointer", borderBottom: "1px dashed #bbf7d0", paddingBottom: "1px" }}
                              title="Clic para editar">
                              {fmt2(item.cantidad)}
                            </span>
                          )}
                        </td>

                        {/* Tarifa / P.U. */}
                        <td style={tdR}>{recurso ? fmt2(recurso.precio_unitario) : "—"}</td>

                        {/* Costo, Rend., Total (Eq/MO) — o vacío + vacío + Total (Mat/Tr) */}
                        {usaRendimiento ? (
                          <>
                            <td style={tdR}>{fmt2(C)}</td>
                            <td style={tdR}>{fmt2(R)}</td>
                            <td style={{ ...tdR, fontWeight: 600, color: "#111827" }}>{fmt2(D)}</td>
                          </>
                        ) : (
                          <>
                            <td></td>
                            <td></td>
                            <td style={{ ...tdR, fontWeight: 600, color: "#111827" }}>{fmt2(D)}</td>
                          </>
                        )}

                        {/* Eliminar */}
                        <td style={{ ...tdR, padding: "9px 6px" }}>
                          <button onClick={() => eliminarItem(globalIdx)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: "1rem" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                            onMouseLeave={e => e.currentTarget.style.color = "#d1d5db"}>✕</button>
                        </td>
                      </tr>
                    );
                  })}

                  {agregando === key ? (
                    <tr style={{ background: "#f0fdf4" }}>
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }} colSpan={4}>
                        <div>
                          <input
                            type="text"
                            value={busquedaRecurso}
                            autoFocus
                            onChange={e => {
                              setBusquedaRecurso(e.target.value);
                              setFormItem({ ...formItem, recurso_id: "" });
                              setIndiceResultadoActivo(0);
                              setError("");
                            }}
                            onKeyDown={e => {
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setIndiceResultadoActivo(prev => Math.min(prev + 1, Math.max(resultadosRecursos.length - 1, 0)));
                              }
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setIndiceResultadoActivo(prev => Math.max(prev - 1, 0));
                              }
                              if (e.key === "Enter" && resultadosRecursos[indiceActivo]) {
                                e.preventDefault();
                                seleccionarRecurso(resultadosRecursos[indiceActivo]);
                              }
                              if (e.key === "Escape") cancelarAgregar();
                            }}
                            placeholder={`Buscar recurso en ${label.toLowerCase()} por nombre, codigo, unidad o fuente...`}
                            style={{ border: "1px solid #bbf7d0", borderRadius: "6px", padding: "7px 10px", fontSize: "0.85rem", width: "100%", outline: "none", background: "#fff" }}
                          />
                          <div style={{ marginTop: "6px", border: "1px solid #dcfce7", borderRadius: "6px", overflow: "hidden", background: "#fff" }}>
                            {resultadosRecursos.length === 0 ? (
                              <div style={{ padding: "8px 10px", color: "#9ca3af", fontSize: "0.78rem" }}>
                                No hay recursos coincidentes en esta categoria.
                              </div>
                            ) : resultadosRecursos.map((r, idx) => {
                              const activo = idx === indiceActivo;
                              const seleccionado = String(r.id) === String(formItem.recurso_id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => seleccionarRecurso(r)}
                                  onMouseEnter={() => setIndiceResultadoActivo(idx)}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(180px, 1fr) 92px 56px 82px",
                                    gap: "8px",
                                    width: "100%",
                                    border: "none",
                                    borderBottom: idx === resultadosRecursos.length - 1 ? "none" : "1px solid #f3f4f6",
                                    background: seleccionado ? "#dcfce7" : activo ? "#f0fdf4" : "#fff",
                                    color: "#1f2937",
                                    cursor: "pointer",
                                    padding: "7px 10px",
                                    textAlign: "left",
                                    fontSize: "0.78rem",
                                  }}
                                >
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{r.descripcion}</span>
                                  <span style={{ color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.codigo || "-"}</span>
                                  <span style={{ color: "#64748b" }}>{r.unidad || "-"}</span>
                                  <span style={{ color: "#111827", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${fmt2(r.precio_unitario)}</span>
                                  {recursoDetalleBreve(r) && (
                                    <span style={{ gridColumn: "1 / -1", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.72rem" }}>
                                      {recursoDetalleBreve(r)}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {recursoSeleccionado && (
                            <div style={{ marginTop: "6px", padding: "6px 8px", border: "1px solid #bbf7d0", borderRadius: "6px", background: "#fff", color: "#14532d", fontSize: "0.76rem" }}>
                              Seleccionado: <strong>{recursoSeleccionado.descripcion}</strong> ({recursoSeleccionado.unidad || "-"}) - ${fmt2(recursoSeleccionado.precio_unitario)}
                            </div>
                          )}
                          {error && <div style={{ color: "#ef4444", fontSize: "0.75rem", marginTop: "4px" }}>{error}</div>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <input type="number" step="0.001" min="0"
                          value={formItem.cantidad}
                          onChange={e => setFormItem({ ...formItem, cantidad: e.target.value })}
                          placeholder="Cantidad"
                          style={{ border: "1px solid #bbf7d0", borderRadius: "6px", padding: "6px 10px", fontSize: "0.85rem", width: "100%", outline: "none" }} />
                      </td>
                      <td colSpan={2} style={{ padding: "10px 14px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                        <button onClick={confirmarAgregar}
                          style={{ background: "#166534", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 16px", fontSize: "0.85rem", cursor: "pointer", marginRight: "8px" }}>
                          Agregar
                        </button>
                        <button onClick={cancelarAgregar}
                          style={{ background: "none", border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 12px", fontSize: "0.85rem", cursor: "pointer", color: "#6b7280" }}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: "8px 14px" }}>
                        <button onClick={() => { setFormItem({ recurso_id: "", cantidad: 1.0 }); setBusquedaRecurso(""); setIndiceResultadoActivo(0); setError(""); setAgregando(key); }}
                          style={{ background: "none", border: "none", color: "#15803d", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500, padding: 0 }}>
                          + Agregar recurso
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* Totales */}
      <div style={{ ...card, padding: "20px 28px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Subtotal Equipos",      subtotalEquipos],
              ["Subtotal Mano de Obra", subtotalMO],
              ["Subtotal Materiales",   subtotalMateriales],
              ["Subtotal Transporte",   subtotalTransporte],
            ].map(([lbl, val]) => (
              <tr key={lbl}>
                <td style={{ padding: "6px 0", color: "#6b7280", fontSize: "0.875rem" }}>{lbl}</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 500, color: "#374151", width: "140px" }}>${fmt2(val)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #e5e7eb" }}>
              <td style={{ padding: "12px 0 0", fontWeight: 700, color: "#111827", fontSize: "1rem" }}>Total Costo Directo</td>
              <td style={{ padding: "12px 0 0", textAlign: "right", fontWeight: 700, color: "#166534", fontSize: "1.2rem" }}>${fmt2(totalCostoDirecto)}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}
