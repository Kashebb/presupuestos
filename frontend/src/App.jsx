import { useState } from "react";
import Recursos from "./pages/Recursos";
import Apus from "./pages/Apus";

function App() {
  const [pagina, setPagina] = useState("recursos");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex gap-4">
        <button
          onClick={() => setPagina("recursos")}
          className={`text-sm font-medium px-3 py-1.5 rounded ${pagina === "recursos" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          Recursos
        </button>
        <button
          onClick={() => setPagina("apus")}
          className={`text-sm font-medium px-3 py-1.5 rounded ${pagina === "apus" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          APUs
        </button>
      </nav>
      <main>
        {pagina === "recursos" && <Recursos />}
        {pagina === "apus" && <Apus />}
      </main>
    </div>
  );
}

export default App;