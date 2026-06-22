export const editColumns = [
  { key: "descripcion", label: "Descripcion", width: "minmax(420px, 1.8fr)", align: "left", editable: false },
  { key: "unidad", label: "Unidad", width: "90px", align: "center", editable: false },
  { key: "metrado", label: "Metrado", width: "120px", align: "right", editable: false },
  { key: "puRef", label: "P.U. Ref", width: "120px", align: "right", editable: false },
  { key: "ptRef", label: "Total Ref", width: "130px", align: "right", editable: false },
  { key: "observacion", label: "Observacion", width: "minmax(240px, 1fr)", align: "left", editable: false },
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
  { id: "c-1", kind: "container", parentId: null, level: 0, descripcion: "Obras preliminares", lines: 3, linked: 1, pending: 1, sinApu: 1, revisar: 0, ptRef: "$2,235.00", ptMeta: "$2,235.00", dif: "$0.00", difPct: "0.00%" },
  { id: "l-1", kind: "line", parentId: "c-1", level: 1, descripcion: "Replanteo y nivelacion", unidad: "m2", metrado: "1,250.000", puRef: "$0.84", ptRef: "$1,050.00", puMeta: "$0.90", ptMeta: "$1,125.00", dif: "$75.00", difPct: "7.14%", estado: "vinculado", apu: "APU-TOPO-0001", apuNombre: "Cuadrilla topografica" },
  { id: "l-2", kind: "line", parentId: "c-1", level: 1, descripcion: "Limpieza manual del terreno", unidad: "m2", metrado: "1,250.000", puRef: "$0.42", ptRef: "$525.00", puMeta: "", ptMeta: "", dif: "", difPct: "", estado: "pendiente", apu: "", apuNombre: "" },
  { id: "l-3", kind: "line", parentId: "c-1", level: 1, descripcion: "Cerramiento provisional", unidad: "ml", metrado: "185.000", puRef: "$6.00", ptRef: "$1,110.00", puMeta: "$6.00", ptMeta: "$1,110.00", dif: "$0.00", difPct: "0.00%", estado: "sin_apu", apu: "", apuNombre: "" },
  { id: "c-2", kind: "container", parentId: null, level: 0, descripcion: "Movimiento de tierras", lines: 4, linked: 2, pending: 1, sinApu: 0, revisar: 1, ptRef: "$5,355.00", ptMeta: "$5,822.24", dif: "$467.24", difPct: "8.72%" },
  { id: "c-2-1", kind: "container", parentId: "c-2", level: 1, descripcion: "Excavacion", lines: 2, linked: 1, pending: 1, sinApu: 0, revisar: 1, ptRef: "$843.50", ptMeta: "$877.24", dif: "$33.74", difPct: "4.00%" },
  { id: "l-4", kind: "line", parentId: "c-2-1", level: 2, descripcion: "Excavacion manual en suelo comun", unidad: "m3", metrado: "96.400", puRef: "$8.75", ptRef: "$843.50", puMeta: "$9.10", ptMeta: "$877.24", dif: "$33.74", difPct: "4.00%", estado: "revisar", apu: "APU-EXC-0008", apuNombre: "Excavacion manual suelo comun" },
  { id: "l-5", kind: "line", parentId: "c-2-1", level: 2, descripcion: "Desalojo de material", unidad: "m3", metrado: "96.400", puRef: "$5.20", ptRef: "$501.28", puMeta: "", ptMeta: "", dif: "", difPct: "", estado: "pendiente", apu: "", apuNombre: "" },
  { id: "l-6", kind: "line", parentId: "c-2", level: 1, descripcion: "Relleno compactado con material clasificado", unidad: "m3", metrado: "230.000", puRef: "$19.65", ptRef: "$4,519.50", puMeta: "$21.50", ptMeta: "$4,945.00", dif: "$425.50", difPct: "9.41%", estado: "vinculado", apu: "APU-REL-0012", apuNombre: "Relleno compactado" },
];

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

export const statusMeta = {
  vinculado: { label: "Vinculado", className: "budget-v2-status-linked" },
  pendiente: { label: "Pendiente", className: "budget-v2-status-pending" },
  sin_apu: { label: "No aplica", className: "budget-v2-status-noapu" },
  revisar: { label: "Revisar", className: "budget-v2-status-review" },
};
