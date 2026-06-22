import { useState } from "react";
import AnalisisView from "./views/AnalisisView";
import EdicionView from "./views/EdicionView";
import VinculacionView from "./views/VinculacionView";

export default function PresupuestosV2Shell() {
  const [view, setView] = useState("edicion");
  const [selectedTreeId, setSelectedTreeId] = useState("c-2");
  const [selectedRowId, setSelectedRowId] = useState("l-4");
  const [footerCount, setFooterCount] = useState(1);

  const footerText = {
    edicion: "Contrato actual: la edicion no muestra item, estado, APU ni arbol.",
    vinculacion: "Contrato actual: contenedores visibles, acciones APU solo en lineas operativas.",
    analisis: "Contrato actual: No aplica suma como meta sin APU.",
  };

  const footerMetric = {
    edicion: `${footerCount} celda(s) seleccionada(s)`,
    vinculacion: `${footerCount} fila(s) visibles`,
    analisis: `${footerCount} fila(s) analizadas`,
  };

  return (
    <div className="budget-v2-shell">
      <header className="budget-v2-header">
        <div>
          <div className="budget-v2-kicker">Modulo nuevo</div>
          <h1>Presupuestos V2</h1>
          <p>Vista Edicion aislada, sin datos reales ni conexion a backend.</p>
        </div>
        <div className="budget-v2-status">
          <span>{view === "edicion" ? "Edicion" : view === "vinculacion" ? "Vinculacion" : "Analisis"}</span>
          <strong>Solo UI</strong>
        </div>
      </header>

      <section className="budget-v2-workspace">
        <div className="budget-v2-tabs" aria-label="Vistas de Presupuestos V2">
          <button type="button" onClick={() => setView("edicion")} className={`budget-v2-tab ${view === "edicion" ? "budget-v2-tab-active" : ""}`}>Edicion</button>
          <button type="button" onClick={() => setView("vinculacion")} className={`budget-v2-tab ${view === "vinculacion" ? "budget-v2-tab-active" : ""}`}>Vinculacion</button>
          <button type="button" onClick={() => setView("analisis")} className={`budget-v2-tab ${view === "analisis" ? "budget-v2-tab-active" : ""}`}>Analisis</button>
        </div>

        {view === "edicion" && <EdicionView onSelectionCountChange={setFooterCount} />}
        {view === "vinculacion" && (
          <VinculacionView
            selectedTreeId={selectedTreeId}
            setSelectedTreeId={setSelectedTreeId}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            onVisibleCountChange={setFooterCount}
          />
        )}
        {view === "analisis" && (
          <AnalisisView
            selectedTreeId={selectedTreeId}
            setSelectedTreeId={setSelectedTreeId}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            onVisibleCountChange={setFooterCount}
          />
        )}

        <footer className="budget-v2-footer">
          <span>{footerText[view]}</span>
          <span>{footerMetric[view]}</span>
        </footer>
      </section>
    </div>
  );
}
