import { useEffect, useMemo, useState } from "react";

export const API = "http://127.0.0.1:8000";

export const statusMeta = {
  vinculado: { label: "Vinculado", className: "budget-v2-status-linked" },
  pendiente: { label: "Pendiente", className: "budget-v2-status-pending" },
  sin_apu: { label: "Subcontratado", className: "budget-v2-status-noapu" },
  revisar: { label: "Revisar", className: "budget-v2-status-review" },
};

export const vincFilters = [
  ["todos", "Todos"],
  ["pendiente", "Pendientes"],
  ["vinculado", "Vinculados"],
  ["sin_apu", "Subcontratados"],
  ["revisar", "Revisar"],
];

export const analysisFilters = [
  ["todos", "Todos"],
  ["impacto", "Mayor impacto"],
  ["positivos", "Dif +"],
  ["sin_meta", "Sin meta"],
  ["sin_apu", "Subcontratados"],
  ["revisar", "Revisar"],
];

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "";
  return `$${value.toLocaleString("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function fmtTotalMoney(value) {
  if (!Number.isFinite(value)) return "";
  return `$${value.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNumber(value) {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtPct(value) {
  if (!Number.isFinite(value)) return "";
  return `${(value * 100).toLocaleString("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`;
}

function emptyBreakdown() {
  return { material: 0, mano_de_obra: 0, equipo: 0, transporte: 0, herramienta_menor: 0 };
}

function fmtBreakdown(values) {
  return {
    material: fmtMoney(values?.material),
    mano_de_obra: fmtMoney(values?.mano_de_obra),
    equipo: fmtMoney(values?.equipo),
    transporte: fmtMoney(values?.transporte),
    herramienta_menor: fmtMoney(values?.herramienta_menor),
  };
}

function isLine(node) {
  if (typeof node.es_rubro_operativo === "boolean") return node.es_rubro_operativo;
  if (typeof node.activo_como_rubro === "boolean" && typeof node.tiene_hijos === "boolean") {
    return node.activo_como_rubro && !node.tiene_hijos;
  }
  return node.tipo === "RUBRO";
}

function nodeLevel(node) {
  const level = Number(node.nivel);
  return Number.isInteger(level) ? Math.max(0, Math.min(7, level)) : 0;
}

function lineStatus(node, apuCost) {
  if (node.observaciones === "SIN_APU") return "sin_apu";
  if (!node.apu_id) return "pendiente";
  if (node.requiere_revision_apu || apuCost?.control_costo === "revisar_costo") return "revisar";
  return "vinculado";
}

function buildRows(nodes, costsByApu, apusById, paquetes = []) {
  const rubrosByContainer = new Map();
  const rowsById = new Map();
  const paqueteByNodeId = new Map(paquetes.map((paquete) => [String(paquete.nodo_id), paquete]));

  const rows = nodes.filter((node) => node.estado_actualizacion !== "obsoleto").map((node) => {
    const line = isLine(node);
    const paquete = paqueteByNodeId.get(String(node.id)) || null;
    const cost = node.apu_id ? costsByApu.get(node.apu_id) : null;
    const apu = node.apu_id ? apusById.get(node.apu_id) : null;
    const baseApu = apu?.es_variante ? apusById.get(apu.apu_base_id) : apu;
    const puRef = Number(node.precio_unitario_ref);
    const metrado = Number(node.metrado);
    const puMeta = cost?.precio_unitario;
    const totalRef = Number.isFinite(puRef) && Number.isFinite(metrado) ? puRef * metrado : null;
    const totalMeta = Number.isFinite(puMeta) && Number.isFinite(metrado) ? puMeta * metrado : null;
    const comparable = Number.isFinite(totalRef) && totalRef > 0 && Number.isFinite(totalMeta);
    const diff = comparable ? totalMeta - totalRef : null;
    const subtotales = cost?.subtotales || {};
    const breakdownRaw = line && Number.isFinite(metrado)
      ? {
          material: Number(subtotales.material || 0) * metrado,
          mano_de_obra: Number(subtotales.mano_de_obra || 0) * metrado,
          equipo: Number(subtotales.equipo || 0) * metrado,
          transporte: Number(subtotales.transporte || 0) * metrado,
          herramienta_menor: Number(cost?.herramienta_menor || 0) * metrado,
        }
      : emptyBreakdown();

    const row = {
      id: String(node.id),
      sourceId: node.id,
      kind: line ? "line" : "container",
      parentId: node.padre_id ? String(node.padre_id) : null,
      level: nodeLevel(node),
      descripcion: node.descripcion,
      unidad: node.unidad || "",
      metrado: fmtNumber(metrado),
      puRef: fmtMoney(puRef),
      ptRef: fmtTotalMoney(totalRef),
      puMeta: fmtMoney(puMeta),
      ptMeta: fmtTotalMoney(totalMeta),
      dif: fmtMoney(diff),
      difPct: comparable ? fmtPct(diff / totalRef) : "",
      observacion: node.observaciones || "",
      estado: line ? lineStatus(node, cost) : undefined,
      apu: baseApu?.codigo || apu?.codigo || cost?.codigo || "",
      apuNombre: baseApu?.nombre || apu?.nombre || "",
      apuBaseId: baseApu?.id || null,
      apuEfectivoId: apu?.id || null,
      paquete,
      varianteApu: apu?.es_variante ? (apu.variante_nombre || "Variante") : (apu ? "Base" : ""),
      rendimiento: apu?.rendimiento,
      desglose: fmtBreakdown(breakdownRaw),
      raw: { node, cost, apu, baseApu, puRef, puMeta, totalRef, totalMeta, diff, breakdown: breakdownRaw },
    };
    rowsById.set(row.id, row);
    return row;
  });

  rows.filter((row) => row.kind === "line").forEach((row) => {
    let parentId = row.parentId;
    while (parentId) {
      if (!rubrosByContainer.has(parentId)) rubrosByContainer.set(parentId, []);
      rubrosByContainer.get(parentId).push(row);
      parentId = rowsById.get(parentId)?.parentId;
    }
  });

  rows.filter((row) => row.kind === "container").forEach((row) => {
    const rubros = rubrosByContainer.get(row.id) || [];
    const totalRef = rubros.reduce((sum, rubro) => sum + (rubro.raw.totalRef || 0), 0);
    const metas = rubros.map((rubro) => rubro.raw.totalMeta).filter(Number.isFinite);
    const comparables = rubros.filter((rubro) => Number.isFinite(rubro.raw.diff));
    const totalMeta = metas.length ? metas.reduce((sum, value) => sum + value, 0) : null;
    const refComparable = comparables.reduce((sum, rubro) => sum + (rubro.raw.totalRef || 0), 0);
    const metaComparable = comparables.reduce((sum, rubro) => sum + (rubro.raw.totalMeta || 0), 0);
    const diff = refComparable > 0 ? metaComparable - refComparable : null;

    row.lines = rubros.length;
    row.linked = rubros.filter((rubro) => rubro.estado === "vinculado" || rubro.estado === "revisar").length;
    row.pending = rubros.filter((rubro) => rubro.estado === "pendiente").length;
    row.sinApu = rubros.filter((rubro) => rubro.estado === "sin_apu").length;
    row.revisar = rubros.filter((rubro) => rubro.estado === "revisar").length;
    row.ptRef = fmtTotalMoney(totalRef);
    row.ptMeta = fmtTotalMoney(totalMeta);
    row.dif = fmtMoney(diff);
    row.difPct = Number.isFinite(diff) && refComparable > 0 ? fmtPct(diff / refComparable) : "";
    const breakdown = rubros.reduce((acc, rubro) => {
      Object.entries(rubro.raw.breakdown || {}).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + Number(value || 0);
      });
      return acc;
    }, emptyBreakdown());
    row.desglose = fmtBreakdown(breakdown);
    row.raw.breakdown = breakdown;
  });

  return rows;
}

export function usePresupuestosV2Data() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [nodes, setNodes] = useState([]);
  const [paquetes, setPaquetes] = useState([]);
  const [apus, setApus] = useState([]);
  const [costs, setCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API}/presupuestos/proyectos/`);
        if (!response.ok) throw new Error("No se pudieron cargar los proyectos.");
        const data = await response.json();
        if (cancelled) return;
        setProjects(data);
        setSelectedProjectId((current) => current || String(data[0]?.id || ""));
      } catch (err) {
        if (!cancelled) setError(err.message || "No se pudo conectar con el backend.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setNodes([]);
      setPaquetes([]);
      return;
    }

    let cancelled = false;
    async function loadProjectData() {
      setLoading(true);
      setError("");
      try {
        const [nodesResponse, paquetesResponse, apusResponse, costsResponse] = await Promise.all([
          fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/nodos`),
          fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/paquetes`),
          fetch(`${API}/apus/?limit=2000`),
          fetch(`${API}/apus/costos/resumen?limit=2000`),
        ]);
        if (!nodesResponse.ok) throw new Error("No se pudieron cargar los rubros del proyecto.");
        if (!paquetesResponse.ok) throw new Error("No se pudieron cargar los paquetes del proyecto.");
        if (!apusResponse.ok) throw new Error("No se pudieron cargar los APUs.");
        if (!costsResponse.ok) throw new Error("No se pudieron cargar los costos de APUs.");
        const [nodesData, paquetesData, apusData, costsData] = await Promise.all([
          nodesResponse.json(),
          paquetesResponse.json(),
          apusResponse.json(),
          costsResponse.json(),
        ]);
        if (cancelled) return;
        setNodes(nodesData);
        setPaquetes(paquetesData);
        setApus(apusData);
        setCosts(costsData);
      } catch (err) {
        if (!cancelled) setError(err.message || "No se pudieron cargar los datos reales.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProjectData();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, selectedProjectId]);

  const rows = useMemo(() => {
    const costsByApu = new Map(costs.map((cost) => [cost.apu_id, cost]));
    const apusById = new Map(apus.map((apu) => [apu.id, apu]));
    return buildRows(nodes, costsByApu, apusById, paquetes);
  }, [apus, costs, nodes, paquetes]);

  const costsByApu = useMemo(() => {
    return Object.fromEntries(costs.map((cost) => [cost.apu_id, cost]));
  }, [costs]);

  const selectedProject = projects.find((project) => String(project.id) === selectedProjectId) || null;

  return {
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    apus,
    paquetes,
    costsByApu,
    rows,
    loading,
    error,
    reload: () => setReloadKey((current) => current + 1),
  };
}
