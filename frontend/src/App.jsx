import { useState } from "react";
import Recursos from "./pages/Recursos";
import Apus from "./pages/Apus";
import ApuDetalle from "./pages/ApuDetalle";
import Presupuestos from "./pages/Presupuestos";

function App() {
  const [pagina, setPagina] = useState("recursos");
  const [apuSeleccionado, setApuSeleccionado] = useState(null);

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
      <nav className="bg-white border-b px-6 py-3 flex gap-4">
        <button
          onClick={() => setPagina("recursos")}
          className={`text-sm font-medium px-3 py-1.5 rounded ${navActivo("recursos") ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          Recursos
        </button>
        <button
          onClick={() => { setApuSeleccionado(null); setPagina("apus"); }}
          className={`text-sm font-medium px-3 py-1.5 rounded ${navActivo("apus") ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          APUs
        </button>
        <button
          onClick={() => setPagina("presupuestos")}
          className={`text-sm font-medium px-3 py-1.5 rounded ${navActivo("presupuestos") ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          Presupuestos
        </button>
      </nav>
      <main>
        {pagina === "recursos" && <Recursos />}
        {pagina === "apus" && <Apus onVerDetalle={irADetalle} />}
        {pagina === "apu_detalle" && apuSeleccionado && (
          <ApuDetalle apu={apuSeleccionado} onVolver={volverAApus} />
        )}
        {pagina === "presupuestos" && <Presupuestos />}
      </main>
    </div>
  );
}

export default App;