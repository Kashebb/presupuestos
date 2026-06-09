import sys
import pandas as pd
from datetime import datetime

sys.path.insert(0, "backend")

from app.db import SessionLocal, engine, Base
from app.models.recurso import Recurso

Base.metadata.create_all(bind=engine)

df = pd.read_excel("bd_recursos.xlsx", header=1)

df = df[df["Activo"] == "Si"]

columnas = {
    "ID": "id",
    "Codigo": "codigo",
    "Descripcion": "descripcion",
    "Categoria": "categoria",
    "Subcategoria": "subcategoria",
    "Familia": "familia",
    "Unidad": "unidad",
    "Precio Unitario": "precio_unitario",
    "Fecha Precio": "fecha_precio",
    "Fuente Precio": "fuente_precio",
    "Observacion": "observacion",
}

df = df.rename(columns=columnas)
df = df[list(columnas.values())]

db = SessionLocal()

try:
    for _, row in df.iterrows():
        fecha = None
        if pd.notna(row["fecha_precio"]):
            try:
                fecha = pd.to_datetime(row["fecha_precio"]).date()
            except:
                fecha = None

        recurso = Recurso(
            codigo=str(row["codigo"]),
            descripcion=str(row["descripcion"]),
            categoria=str(row["categoria"]),
            subcategoria=str(row["subcategoria"]) if pd.notna(row["subcategoria"]) else None,
            familia=str(row["familia"]) if pd.notna(row["familia"]) else None,
            unidad=str(row["unidad"]),
            precio_unitario=float(row["precio_unitario"]) if pd.notna(row["precio_unitario"]) else 0.0,
            fecha_precio=fecha,
            fuente_precio=str(row["fuente_precio"]) if pd.notna(row["fuente_precio"]) else None,
            observacion=str(row["observacion"]) if pd.notna(row["observacion"]) else None,
            activo=True,
        )
        db.add(recurso)

    db.commit()
    print("✅ Importación completa")

except Exception as e:
    db.rollback()
    print(f"❌ Error: {e}")
finally:
    db.close()