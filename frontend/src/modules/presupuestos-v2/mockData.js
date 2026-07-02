export const editColumns = [
  { key: "descripcion", label: "Descripcion", width: "minmax(420px, 1.8fr)", align: "left", editable: true },
  { key: "unidad", label: "Unidad", width: "90px", align: "center", editable: true },
  { key: "metrado", label: "Metrado", width: "120px", align: "right", editable: true },
  { key: "puRef", label: "P.U. Ref", width: "120px", align: "right", editable: true },
  { key: "ptRef", label: "Total Ref", width: "130px", align: "right", editable: false },
  { key: "observacion", label: "Observacion", width: "minmax(240px, 1fr)", align: "left", editable: true },
];

export const emptyEditRows = Array.from({ length: 18 }, (_, index) => ({
  id: `draft-${index + 1}`,
  level: index === 0 ? 0 : 1,
  descripcion: "",
  unidad: "",
  metrado: "",
  puRef: "",
  ptRef: "",
  observacion: "",
}));

export const budgetRows = [
  { id: "c-1", kind: "container", parentId: null, level: 0, descripcion: "Obras preliminares", lines: 3, linked: 1, pending: 1, sinApu: 1, revisar: 0, ptRef: "$2,235.00", ptMeta: "$2,235.00", dif: "$0.0000", difPct: "0.0000%" },
  { id: "l-1", kind: "line", parentId: "c-1", level: 1, descripcion: "Replanteo y nivelacion", unidad: "m2", metrado: "1,250.0000", puRef: "$0.8400", ptRef: "$1,050.00", puMeta: "$0.9000", ptMeta: "$1,125.00", dif: "$75.0000", difPct: "7.1400%", estado: "vinculado", apu: "APU-TOPO-0001", apuNombre: "Cuadrilla topografica" },
  { id: "l-2", kind: "line", parentId: "c-1", level: 1, descripcion: "Limpieza manual del terreno", unidad: "m2", metrado: "1,250.0000", puRef: "$0.4200", ptRef: "$525.00", puMeta: "", ptMeta: "", dif: "", difPct: "", estado: "pendiente", apu: "", apuNombre: "" },
  { id: "l-3", kind: "line", parentId: "c-1", level: 1, descripcion: "Cerramiento provisional", unidad: "ml", metrado: "185.0000", puRef: "$6.0000", ptRef: "$1,110.00", puMeta: "$6.0000", ptMeta: "$1,110.00", dif: "$0.0000", difPct: "0.0000%", estado: "sin_apu", apu: "", apuNombre: "" },
  { id: "c-2", kind: "container", parentId: null, level: 0, descripcion: "Movimiento de tierras", lines: 4, linked: 2, pending: 1, sinApu: 0, revisar: 1, ptRef: "$5,355.00", ptMeta: "$5,822.24", dif: "$467.2400", difPct: "8.7200%" },
  { id: "c-2-1", kind: "container", parentId: "c-2", level: 1, descripcion: "Excavacion", lines: 2, linked: 1, pending: 1, sinApu: 0, revisar: 1, ptRef: "$843.50", ptMeta: "$877.24", dif: "$33.7400", difPct: "4.0000%" },
  { id: "l-4", kind: "line", parentId: "c-2-1", level: 2, descripcion: "Excavacion manual en suelo comun", unidad: "m3", metrado: "96.4000", puRef: "$8.7500", ptRef: "$843.50", puMeta: "$9.1000", ptMeta: "$877.24", dif: "$33.7400", difPct: "4.0000%", estado: "revisar", apu: "APU-EXC-0008", apuNombre: "Excavacion manual suelo comun" },
  { id: "l-5", kind: "line", parentId: "c-2-1", level: 2, descripcion: "Desalojo de material", unidad: "m3", metrado: "96.4000", puRef: "$5.2000", ptRef: "$501.28", puMeta: "", ptMeta: "", dif: "", difPct: "", estado: "pendiente", apu: "", apuNombre: "" },
  { id: "l-6", kind: "line", parentId: "c-2", level: 1, descripcion: "Relleno compactado con material clasificado", unidad: "m3", metrado: "230.0000", puRef: "$19.6500", ptRef: "$4,519.50", puMeta: "$21.5000", ptMeta: "$4,945.00", dif: "$425.5000", difPct: "9.4100%", estado: "vinculado", apu: "APU-REL-0012", apuNombre: "Relleno compactado" },
];

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

export const statusMeta = {
  vinculado: { label: "Vinculado", className: "budget-v2-status-linked" },
  pendiente: { label: "Pendiente", className: "budget-v2-status-pending" },
  sin_apu: { label: "Subcontratado", className: "budget-v2-status-noapu" },
  revisar: { label: "Revisar", className: "budget-v2-status-review" },
};
