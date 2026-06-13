import { useState } from "react";
import Recursos from "./pages/Recursos";
import Apus from "./pages/Apus";
import ApuDetalle from "./pages/ApuDetalle";
import Presupuestos from "./pages/Presupuestos";
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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex gap-2 border-b border-slate-200 bg-white px-5 py-2">
        <button
          onClick={() => navegar("dashboard")}
          className={`rounded px-2.5 py-1.5 text-xs font-medium ${navActivo("dashboard") ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Tablero
        </button>
        <button
          onClick={() => navegar("recursos")}
          className={`rounded px-2.5 py-1.5 text-xs font-medium ${navActivo("recursos") ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Recursos
        </button>
        <button
          onClick={() => navegar("apus")}
          className={`rounded px-2.5 py-1.5 text-xs font-medium ${navActivo("apus") ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          APUs
        </button>
        <button
          onClick={() => navegar("presupuestos")}
          className={`rounded px-2.5 py-1.5 text-xs font-medium ${navActivo("presupuestos") ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Presupuestos
        </button>
      </nav>
      <main>
        {pagina === "dashboard" && <Dashboard onNavigate={navegar} />}
        {pagina === "recursos" && <Recursos />}
        {pagina === "apus" && <Apus onVerDetalle={irADetalle} initialFilter={filtroApuInicial} />}
        {pagina === "apu_detalle" && apuSeleccionado && (
          <ApuDetalle apu={apuSeleccionado} onVolver={volverAApus} />
        )}
        {pagina === "presupuestos" && <Presupuestos initialFilter={filtroPresupuestoInicial} />}
      </main>
    </div>
  );
}

export default App;
