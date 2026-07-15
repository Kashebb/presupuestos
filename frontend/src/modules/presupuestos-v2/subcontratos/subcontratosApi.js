import { API } from "../data";

export class SubcontratosApiError extends Error {
  constructor(message, detail, status) {
    super(message);
    this.name = "SubcontratosApiError";
    this.detail = detail;
    this.status = status;
  }
}

function detailMessage(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (detail?.mensaje) return detail.mensaje;
  if (Array.isArray(detail)) return detail.map((item) => item.msg || JSON.stringify(item)).join(" · ");
  return fallback;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new SubcontratosApiError("No se pudo conectar con el servidor.", null, 0);
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail ?? payload;
    throw new SubcontratosApiError(detailMessage(detail, `Error del servidor (${response.status}).`), detail, response.status);
  }
  return payload;
}

async function download(path) {
  let response;
  try { response = await fetch(`${API}${path}`); }
  catch { throw new SubcontratosApiError("No se pudo conectar con el servidor.", null, 0); }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail ?? payload;
    throw new SubcontratosApiError(detailMessage(detail, `Error del servidor (${response.status}).`), detail, response.status);
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return { blob: await response.blob(), filename: match?.[1] || "subcontrato.xlsx" };
}

export const subcontratosApi = {
  listar: (proyectoId, signal) => request(`/presupuestos/proyectos/${proyectoId}/subcontratos`, { signal }),
  crear: (proyectoId, datos) => request(`/presupuestos/proyectos/${proyectoId}/subcontratos`, { method: "POST", body: JSON.stringify(datos) }),
  obtener: (id, signal) => request(`/presupuestos/subcontratos/${id}`, { signal }),
  editar: (id, datos) => request(`/presupuestos/subcontratos/${id}`, { method: "PATCH", body: JSON.stringify(datos) }),
  eliminar: (id) => request(`/presupuestos/subcontratos/${id}`, { method: "DELETE" }),
  confirmar: (id) => request(`/presupuestos/subcontratos/${id}/confirmar`, { method: "POST" }),
  reabrir: (id) => request(`/presupuestos/subcontratos/${id}/reabrir`, { method: "POST" }),
  anular: (id) => request(`/presupuestos/subcontratos/${id}/anular`, { method: "POST" }),
  resumen: (id, signal) => request(`/presupuestos/subcontratos/${id}/resumen`, { signal }),
  distribucion: (proyectoId, signal) => request(`/presupuestos/proyectos/${proyectoId}/subcontratos/distribucion`, { signal }),
  asignarRubros: (id, datos) => request(`/presupuestos/subcontratos/${id}/rubros/asignar`, { method: "POST", body: JSON.stringify(datos) }),
  configurarRubro: (id, asignacionId, datos) => request(`/presupuestos/subcontratos/${id}/rubros/${asignacionId}`, { method: "PATCH", body: JSON.stringify(datos) }),
  retirarRubro: (id, asignacionId) => request(`/presupuestos/subcontratos/${id}/rubros/${asignacionId}`, { method: "DELETE" }),
  verificarCambios: (id) => request(`/presupuestos/subcontratos/${id}/rubros/verificar-cambios`, { method: "POST" }),
  actualizarRubros: (id, datos) => request(`/presupuestos/subcontratos/${id}/rubros/actualizar`, { method: "POST", body: JSON.stringify(datos) }),
  revisarRubro: (id, asignacionId, datos) => request(`/presupuestos/subcontratos/${id}/rubros/${asignacionId}/revisar`, { method: "POST", body: JSON.stringify(datos) }),
  materiales: (id, signal) => request(`/presupuestos/subcontratos/${id}/materiales-suministrar`, { signal }),
  exportarExcel: (id) => download(`/presupuestos/subcontratos/${id}/exportar.xlsx`),
};

export function describirErrorSubcontrato(error) {
  if (!error) return "";
  const detail = error.detail;
  const resultados = detail?.resultados;
  if (!Array.isArray(resultados) || !resultados.length) return error.message || "Ocurrió un error.";
  const motivos = resultados.flatMap((item) => item.motivos || []).join(", ");
  return `${error.message}${motivos ? `: ${motivos}` : ""}`;
}
