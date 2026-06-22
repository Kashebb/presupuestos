import { useState } from "react";
import Recursos from "./pages/Recursos";
import Apus from "./pages/Apus";
import ApuDetalle from "./pages/ApuDetalle";
import Presupuestos from "./pages/Presupuestos";
import PresupuestosV2 from "./pages/PresupuestosV2";
import Dashboard from "./pages/Dashboard";

function App() {
  const [pagina, setPagina] = useState("dashboard");
  const [apuSeleccionado, setApuSeleccionado] = useState(null);
  const [filtroApuInicial, setFiltroApuInicial] = useState("todos");
  const [filtroPresupuestoInicial, setFiltroPresupuestoInicial] = useState("todos");

  const navegar = (destino, opciones = {}) => {
    if (destino === "apus") {
      setApuSeleccionado(null);
      setFiltroApuInicial(opciones.filtro || "todos");
    }
    if (destino === "presupuestos") {
      setFiltroPresupuestoInicial(opciones.filtro || "todos");
    }
    setPagina(destino);
  };

  const irADetalle = (apu) => {
    setApuSeleccionado(apu);
    setPagina("apu_detalle");
  };

  const volverAApus = () => {
    setApuSeleccionado(null);
    setPagina("apus");
  };

  const navActivo = (nombre) =>
    pagina === nombre || (nombre === "apus" && pagina === "apu_detalle");

  const navItems = [
    ["dashboard", "Tablero"],
    ["recursos", "Recursos"],
    ["apus", "APUs"],
    ["presupuestos", "Presupuestos"],
    ["presupuestos_v2", "Presupuestos V2"],
  ];

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="top-nav-brand">
          <span className="top-nav-title">Sistema de Presupuestos</span>
          <span className="top-nav-subtitle">Control tecnico de costos</span>
        </div>
        <div className="top-nav-links">
          {navItems.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => navegar(key)}
              className={`nav-link ${navActivo(key) ? "nav-link-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <main className="app-main">
        {pagina === "dashboard" && <Dashboard onNavigate={navegar} />}
        {pagina === "recursos" && <Recursos />}
        {pagina === "apus" && <Apus onVerDetalle={irADetalle} initialFilter={filtroApuInicial} />}
        {pagina === "apu_detalle" && apuSeleccionado && (
          <ApuDetalle apu={apuSeleccionado} onVolver={volverAApus} />
        )}
        {pagina === "presupuestos" && <Presupuestos initialFilter={filtroPresupuestoInicial} onVerDetalle={irADetalle} />}
        {pagina === "presupuestos_v2" && <PresupuestosV2 />}
      </main>
    </div>
  );
}

export default App;
