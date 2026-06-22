import { useEffect, useMemo, useState } from "react";

export const API = "http://127.0.0.1:8000";

export const statusMeta = {
  vinculado: { label: "Vinculado", className: "budget-v2-status-linked" },
  pendiente: { label: "Pendiente", className: "budget-v2-status-pending" },
  sin_apu: { label: "No aplica", className: "budget-v2-status-noapu" },
  revisar: { label: "Revisar", className: "budget-v2-status-review" },
};

export const vincFilters = [
  ["todos", "Todos"],
  ["pendiente", "Pendientes"],
  ["vinculado", "Vinculados"],
  ["sin_apu", "No aplica"],
  ["revisar", "Revisar"],
];

export const analysisFilters = [
  ["todos", "Todos"],
  ["impacto", "Mayor impacto"],
  ["positivos", "Dif +"],
  ["sin_meta", "Sin meta"],
  ["sin_apu", "No aplica"],
  ["revisar", "Revisar"],
];

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "";
  return `$${value.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNumber(value) {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("es-EC", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtPct(value) {
  if (!Number.isFinite(value)) return "";
  return `${(value * 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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

function buildRows(nodes, costsByApu, apusById) {
  const rubrosByContainer = new Map();
  const rowsById = new Map();

  const rows = nodes.map((node) => {
    const line = isLine(node);
    const cost = node.apu_id ? costsByApu.get(node.apu_id) : null;
    const apu = node.apu_id ? apusById.get(node.apu_id) : null;
    const puRef = Number(node.precio_unitario_ref);
    const metrado = Number(node.metrado);
    const puMeta = cost?.precio_unitario;
    const totalRef = Number.isFinite(puRef) && Number.isFinite(metrado) ? puRef * metrado : null;
    const totalMeta = Number.isFinite(puMeta) && Number.isFinite(metrado) ? puMeta * metrado : null;
    const comparable = Number.isFinite(totalRef) && totalRef > 0 && Number.isFinite(totalMeta);
    const diff = comparable ? totalMeta - totalRef : null;

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
      ptRef: fmtMoney(totalRef),
      puMeta: fmtMoney(puMeta),
      ptMeta: fmtMoney(totalMeta),
      dif: fmtMoney(diff),
      difPct: comparable ? fmtPct(diff / totalRef) : "",
      estado: line ? lineStatus(node, cost) : undefined,
      apu: apu?.codigo || cost?.codigo || "",
      apuNombre: apu?.nombre || "",
      rendimiento: apu?.rendimiento,
      raw: { node, cost, apu, puRef, puMeta, totalRef, totalMeta, diff },
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
    row.ptRef = fmtMoney(totalRef);
    row.ptMeta = fmtMoney(totalMeta);
    row.dif = fmtMoney(diff);
    row.difPct = Number.isFinite(diff) && refComparable > 0 ? fmtPct(diff / refComparable) : "";
  });

  return rows;
}

export function usePresupuestosV2Data() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [nodes, setNodes] = useState([]);
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
      return;
    }

    let cancelled = false;
    async function loadProjectData() {
      setLoading(true);
      setError("");
      try {
        const [nodesResponse, apusResponse, costsResponse] = await Promise.all([
          fetch(`${API}/presupuestos/proyectos/${selectedProjectId}/nodos`),
          fetch(`${API}/apus/?limit=500`),
          fetch(`${API}/apus/costos/resumen?limit=500`),
        ]);
        if (!nodesResponse.ok) throw new Error("No se pudieron cargar los rubros del proyecto.");
        if (!apusResponse.ok) throw new Error("No se pudieron cargar los APUs.");
        if (!costsResponse.ok) throw new Error("No se pudieron cargar los costos de APUs.");
        const [nodesData, apusData, costsData] = await Promise.all([
          nodesResponse.json(),
          apusResponse.json(),
          costsResponse.json(),
        ]);
        if (cancelled) return;
        setNodes(nodesData);
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
    return buildRows(nodes, costsByApu, apusById);
  }, [apus, costs, nodes]);

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
    costsByApu,
    rows,
    loading,
    error,
    reload: () => setReloadKey((current) => current + 1),
  };
}
