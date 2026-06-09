from sqlalchemy import Column, Integer, String, Float, Boolean, Date
from app.db import Base

class Recurso(Base):
    __tablename__ = "recursos"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String, unique=True, index=True, nullable=False)
    descripcion = Column(String, nullable=False)
    categoria = Column(String, nullable=False)   # Mano de Obra, Material, Equipo
    subcategoria = Column(String, nullable=True)
    familia = Column(String, nullable=True)
    unidad = Column(String, nullable=False)
    precio_unitario = Column(Float, nullable=False, default=0.0)
    fecha_precio = Column(Date, nullable=True)
    fuente_precio = Column(String, nullable=True)
    observacion = Column(String, nullable=True)
    activo = Column(Boolean, default=True)