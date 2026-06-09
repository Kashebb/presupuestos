import sqlite3

# Mapa de valores actuales → valores normalizados
MAPA = {
    "Mano de Obra": "mano_de_obra",
    "Material":     "material",
    "Materiales":   "material",
    "Equipo":       "equipo",
    "Equipos":      "equipo",
    "Transporte":   "transporte",
    "Otros":        "otros",
}

conn = sqlite3.connect("presupuestos.db")
cur = conn.cursor()

for original, normalizado in MAPA.items():
    cur.execute(
        "UPDATE recursos SET categoria = ? WHERE categoria = ?",
        (normalizado, original)
    )
    print(f"{cur.rowcount} registros: '{original}' → '{normalizado}'")

conn.commit()
conn.close()
print("\nListo.")