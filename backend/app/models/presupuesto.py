"""
Modelos: Proyecto y NodoPresupuesto
Módulo: Presupuestos - Sesión 12
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
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

    # True cuando el usuario sacó este rubro de su grupo automático
    individualizado = Column(Boolean, default=False, nullable=True)

    estado_actualizacion = Column(String(20), default="activo", nullable=True)
    origen_edicion = Column(String(30), default="importado", nullable=True)
    requiere_revision_apu = Column(Boolean, default=False, nullable=True)
    actualizacion_lote_id = Column(Integer, ForeignKey("actualizaciones_presupuesto_lotes.id", ondelete="SET NULL"), nullable=True)
    excel_fila = Column(Integer, nullable=True)
    excel_hoja = Column(String(120), nullable=True)
    excel_archivo = Column(String(260), nullable=True)
    fecha_actualizacion_fuente = Column(DateTime, nullable=True)
    fecha_edicion_manual = Column(DateTime, nullable=True)

    proyecto = relationship(
        "Proyecto",
        back_populates="nodos",
        foreign_keys=[proyecto_id],
    )

    hijos = relationship(
        "NodoPresupuesto",
        foreign_keys=[padre_id],
        primaryjoin="NodoPresupuesto.padre_id == NodoPresupuesto.id",
        lazy="select",
    )

    apu = relationship("APU", foreign_keys=[apu_id], lazy="select")


class ActualizacionPresupuestoLote(Base):
    __tablename__ = "actualizaciones_presupuesto_lotes"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False)
    archivo = Column(String(260), nullable=True)
    hoja = Column(String(120), nullable=False)
    estado = Column(String(20), default="aplicado", nullable=False)
    total_nodos_excel = Column(Integer, default=0)
    total_rubros_excel = Column(Integer, default=0)
    total_nodos_antes = Column(Integer, default=0)
    total_rubros_antes = Column(Integer, default=0)
    total_nodos_creados = Column(Integer, default=0)
    total_rubros_actualizados = Column(Integer, default=0)
    total_obsoletos_marcados = Column(Integer, default=0)
    total_excepciones = Column(Integer, default=0)
    resumen_json = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)

    proyecto = relationship("Proyecto", foreign_keys=[proyecto_id], lazy="select")

    
