from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base
import enum

class EstadoAPU(str, enum.Enum):
    en_revision = "en_revision"
    aprobado = "aprobado"
    referencial = "referencial"

class CategoriaItem(str, enum.Enum):
    equipo = "equipo"
    mano_de_obra = "mano_de_obra"
    material = "material"
    transporte = "transporte"

class APU(Base):
    __tablename__ = "apus"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String, unique=True, index=True)
    nombre = Column(String, nullable=False)
    descripcion = Column(String, nullable=True)
    categoria = Column(String, nullable=True)
    subcategoria = Column(String, nullable=True)
    unidad = Column(String, nullable=False)
    rendimiento = Column(Float, nullable=False, default=1.0)
    estado = Column(String, default="en_revision")
    version = Column(Integer, default=1)
    observacion = Column(String, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("APUItem", back_populates="apu", cascade="all, delete-orphan")

class APUItem(Base):
    __tablename__ = "apu_items"

    id = Column(Integer, primary_key=True, index=True)
    apu_id = Column(Integer, ForeignKey("apus.id"), nullable=False)
    recurso_id = Column(Integer, ForeignKey("recursos.id"), nullable=True)
    categoria = Column(String, nullable=False)
    cantidad = Column(Float, nullable=False, default=1.0)
    orden = Column(Integer, default=0)
    es_herramienta_menor = Column(Boolean, default=False)

    apu = relationship("APU", back_populates="items")
    recurso = relationship("Recurso")