import { ActionButton, Panel, StatusBadge } from "../../../components/ui";
import { CAMPOS_CATEGORIA as CAMPOS, PRESETS_SUBCONTRATO } from "./subcontratosConfig";

export default function ConfiguracionAlcancePanel({ preset, setPreset, categorias, setCategorias, cantidad = 1, onAplicar, busy, vistaPrevia }) {
  const invalida = preset === "PERSONALIZADO" && !Object.values(categorias).some(Boolean);
  return <Panel className="budget-v2-subcontracts-config-panel">
    <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Alcance del subcontrato</h3><p className="text-xs text-slate-500">Se aplicará a {cantidad} rubro(s) válido(s).</p></div><StatusBadge tone="blue">PU automático</StatusBadge></div>
    <div className="space-y-2" role="radiogroup" aria-label="Preset del alcance">
      {PRESETS_SUBCONTRATO.map((item) => <label key={item.value} className={`budget-v2-subcontracts-preset-option ${preset === item.value ? "is-selected" : ""}`}>
        <input type="radio" name="preset-subcontrato" value={item.value} checked={preset === item.value} onChange={() => { setPreset(item.value); if (item.categorias) setCategorias(Object.fromEntries(CAMPOS.map(([campo], index) => [campo, item.categorias[index]]))); }} />
        <span><strong className="text-sm">{item.label}</strong>{item.categorias && <span className="block text-xs text-slate-500">{CAMPOS.filter((_, index) => item.categorias[index]).map(([, label]) => label).join(" · ")}</span>}</span>
      </label>)}
    </div>
    {preset === "PERSONALIZADO" && <fieldset className="mt-4 rounded border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">Categorías incluidas</legend><div className="grid gap-2 sm:grid-cols-2">{CAMPOS.map(([campo, label]) => <label key={campo} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(categorias[campo])} onChange={(e) => setCategorias((actual) => ({ ...actual, [campo]: e.target.checked }))} />{label}</label>)}</div><p className="mt-2 text-xs text-slate-500">Herramientas menores se incluyen automáticamente con Mano de obra.</p>{invalida && <p className="mt-2 text-sm text-red-700">Selecciona al menos una categoría.</p>}</fieldset>}
    {vistaPrevia && <div className="mt-4 rounded bg-slate-50 p-3 text-sm"><strong>Vista previa del snapshot</strong><dl className="mt-2 grid grid-cols-2 gap-2">{vistaPrevia.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl></div>}
    <ActionButton className="mt-4 w-full" variant="primary" disabled={busy || invalida || cantidad === 0} onClick={onAplicar}>{busy ? "Procesando..." : "Aplicar configuración"}</ActionButton>
  </Panel>;
}
