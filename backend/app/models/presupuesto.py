"""
Modelos: Proyecto y NodoPresupuesto
Módulo: Presupuestos - Sesión 12
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from app.models.base import Base


class Proyecto(Base):
    __tablename__ = "proyectos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    codigo = Column(String(50), unique=True, nullable=True)
    descripcion = Column(Text, nullable=True)
    estado = Column(String(20), default="activo")
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    nodos = relationship(
        "NodoPresupuesto",
        back_populates="proyecto",
        cascade="all, delete-orphan",
        foreign_keys="NodoPresupuesto.proyecto_id",
        lazy="select",
    )


class NodoPresupuesto(Base):
    __tablename__ = "nodos_presupuesto"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False)
    padre_id = Column(Integer, ForeignKey("nodos_presupuesto.id", ondelete="CASCADE"), nullable=True)

    tipo = Column(String(20), nullable=False)
    item = Column(String(60), nullable=True)
    descripcion = Column(String(500), nullable=False)
    orden = Column(Integer, default=0)

    unidad = Column(String(20), nullable=True)
    metrado = Column(Float, nullable=True)
    precio_unitario_ref = Column(Float, nullable=True)
    apu_id = Column(Integer, ForeignKey("apus.id", ondelete="SET NULL"), nullable=True)
    tipo_rubro = Column(String(20), nullable=True)
    observaciones = Column(Text, nullable=True)

    # Relación al proyecto
    proyecto = relationship(
        "Proyecto",
        back_populates="nodos",
        foreign_keys=[proyecto_id],
    )

    # Relación recursiva: hijos (un nodo padre tiene muchos hijos)
    hijos = relationship(
        "NodoPresupuesto",
        foreign_keys=[padre_id],
        primaryjoin="NodoPresupuesto.padre_id == NodoPresupuesto.id",
        lazy="select",
    )

    # APU vinculado
    apu = relationship("APU", foreign_keys=[apu_id], lazy="select")