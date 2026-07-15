export const CAMPOS_CATEGORIA = [
  ["incluye_materiales", "Materiales"], ["incluye_mano_obra", "Mano de obra + H.M."],
  ["incluye_equipos", "Equipos"], ["incluye_transporte", "Transporte"],
];

export const PRESETS_SUBCONTRATO = [
  { value: "COMPLETO", label: "Completo", categorias: [true, true, true, true] },
  { value: "SOLO_MATERIALES", label: "Solo materiales", categorias: [true, false, false, false] },
  { value: "SOLO_MANO_OBRA", label: "Solo mano de obra", categorias: [false, true, false, false] },
  { value: "MANO_OBRA_EQUIPOS", label: "Mano de obra + equipos", categorias: [false, true, true, false] },
  { value: "MATERIALES_TRANSPORTE", label: "Materiales + transporte", categorias: [true, false, false, true] },
  { value: "PERSONALIZADO", label: "Personalizado", categorias: null },
];

export const CATEGORIAS_COMPLETAS = Object.fromEntries(CAMPOS_CATEGORIA.map(([campo]) => [campo, true]));

export function configuracionPayload(preset, categorias) {
  return { preset, ...(preset === "PERSONALIZADO" ? { seleccion_personalizada: categorias } : {}) };
}
