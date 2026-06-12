"""
Modelos: Proyecto y NodoPresupuesto
Módulo: Presupuestos
Sesión 12
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
    estado = Column(String(20), default="activo")  # activo | archivado
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Un proyecto tiene muchos nodos
    nodos = relationship(
        "NodoPresupuesto",
        back_populates="proyecto",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def __repr__(self):
        return f"<Proyecto id={self.id} nombre={self.nombre!r}>"


class NodoPresupuesto(Base):
    __tablename__ = "nodos_presupuesto"

    id = Column(Integer, primary_key=True, index=True)

    # FK al proyecto dueño
    proyecto_id = Column(
        Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False
    )

    # FK al nodo padre (NULL para nodos raíz FASE)
    padre_id = Column(
        Integer,
        ForeignKey("nodos_presupuesto.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Tipo de nodo según jerarquía SERCOP
    # FASE | CATEGORIA | SUBCATEGORIA | CAPITULO | SUBCAPITULO | GRUPO | RUBRO
    tipo = Column(String(20), nullable=False)

    # Código del item tal como viene del Excel (ej: 01.01.01.01.01.01)
    item = Column(String(60), nullable=True)

    # Descripción del nodo
    descripcion = Column(String(500), nullable=False)

    # Orden entre hermanos (para mantener el orden del Excel)
    orden = Column(Integer, default=0)

    # ── Solo los RUBROs tienen los campos siguientes ──

    # Unidad de medida (m2, m3, ml, u, kg, etc.)
    unidad = Column(String(20), nullable=True)

    # Metrado importado del Excel
    metrado = Column(Float, nullable=True)

    # Precio Unitario de referencia (del Excel, NO editable después de importar)
    precio_unitario_ref = Column(Float, nullable=True)

    # FK al APU vinculado (opcional; se asigna después de importar)
    apu_id = Column(
        Integer, ForeignKey("apus.id", ondelete="SET NULL"), nullable=True
    )

    # Estado de vinculación del rubro con un APU
    # PENDIENTE  → importado, sin APU asignado todavía
    # VINCULADO  → tiene apu_id asignado y unidades coinciden
    # SIN_APU    → rubro que el usuario marcó explícitamente como sin APU
    tipo_rubro = Column(String(20), nullable=True)

    # Observaciones libres (también guarda "SIN_APU" cuando viene así del Excel)
    observaciones = Column(Text, nullable=True)

    # ── Relaciones ──
    proyecto = relationship("Proyecto", back_populates="nodos")

    # Árbol recursivo: un nodo tiene muchos hijos
    hijos = relationship(
        "NodoPresupuesto",
        backref="padre",
        foreign_keys=[padre_id],
        cascade="all, delete-orphan",
        lazy="select",
    )

    # APU vinculado (acceso directo desde el nodo)
    apu = relationship("APU", foreign_keys=[apu_id], lazy="select")

    def __repr__(self):
        return (
            f"<NodoPresupuesto id={self.id} tipo={self.tipo!r} "
            f"descripcion={self.descripcion[:30]!r}>"
        )