"""
Modelos: Proyecto y NodoPresupuesto
Módulo: Presupuestos - Sesión 12
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean, JSON, UniqueConstraint
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

    paquetes = relationship(
        "PaquetePresupuesto",
        back_populates="proyecto",
        cascade="all, delete-orphan",
        foreign_keys="PaquetePresupuesto.proyecto_id",
        lazy="select",
    )


class NodoPresupuesto(Base):
    __tablename__ = "nodos_presupuesto"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False)
    padre_id = Column(Integer, ForeignKey("nodos_presupuesto.id", ondelete="CASCADE"), nullable=True)

    tipo = Column(String(20), nullable=False)
    nivel = Column(Integer, nullable=True)
    item = Column(String(60), nullable=True)
    descripcion = Column(String(500), nullable=False)
    orden = Column(Integer, default=0)

    unidad = Column(String(20), nullable=True)
    metrado = Column(Float, nullable=True)
    precio_unitario_ref = Column(Float, nullable=True)
    precio_unitario_subcontratado = Column(Float, nullable=True)
    apu_id = Column(Integer, ForeignKey("apus.id", ondelete="SET NULL"), nullable=True)
    activo_como_rubro = Column(Boolean, default=True, nullable=True)
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


class PaquetePresupuesto(Base):
    __tablename__ = "paquetes_presupuesto"
    __table_args__ = (
        UniqueConstraint("proyecto_id", "nodo_id", name="uq_paquetes_presupuesto_proyecto_nodo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False, index=True)
    nodo_id = Column(Integer, ForeignKey("nodos_presupuesto.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre = Column(String(240), nullable=False)
    estado = Column(String(30), default="activo", nullable=False)
    observacion = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_liberacion = Column(DateTime, nullable=True)

    proyecto = relationship(
        "Proyecto",
        back_populates="paquetes",
        foreign_keys=[proyecto_id],
    )
    nodo = relationship("NodoPresupuesto", foreign_keys=[nodo_id], lazy="select")


class UsoRecursosConfiguracion(Base):
    __tablename__ = "uso_recursos_configuraciones"
    __table_args__ = (
        UniqueConstraint("proyecto_id", "nombre", name="uq_uso_recursos_configuracion_proyecto_nombre"),
    )

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre = Column(String(160), nullable=False)
    configuracion_json = Column(JSON, nullable=False, default=dict)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    proyecto = relationship("Proyecto", foreign_keys=[proyecto_id], lazy="select")


class NodoAPURevision(Base):
    __tablename__ = "nodo_apu_revisiones"

    id = Column(Integer, primary_key=True, index=True)
    nodo_id = Column(Integer, ForeignKey("nodos_presupuesto.id", ondelete="CASCADE"), nullable=False, index=True)
    apu_id = Column(Integer, ForeignKey("apus.id", ondelete="SET NULL"), nullable=True, index=True)
    estado = Column(String(20), default="validado", nullable=False)
    firma_revision = Column(String(64), nullable=False, index=True)
    snapshot_descripcion = Column(String(500), nullable=True)
    snapshot_unidad = Column(String(20), nullable=True)
    snapshot_apu_id = Column(Integer, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    nodo = relationship("NodoPresupuesto", foreign_keys=[nodo_id], lazy="select")
    apu = relationship("APU", foreign_keys=[apu_id], lazy="select")
    items = relationship(
        "NodoAPURevisionItem",
        back_populates="revision",
        cascade="all, delete-orphan",
        lazy="select",
    )


class NodoAPURevisionItem(Base):
    __tablename__ = "nodo_apu_revision_items"

    id = Column(Integer, primary_key=True, index=True)
    revision_id = Column(Integer, ForeignKey("nodo_apu_revisiones.id", ondelete="CASCADE"), nullable=False, index=True)
    codigo_motivo = Column(String(80), nullable=False)
    descripcion_motivo = Column(Text, nullable=False)
    aprobado = Column(Boolean, default=True, nullable=False)
    comentario = Column(Text, nullable=True)

    revision = relationship("NodoAPURevision", back_populates="items", foreign_keys=[revision_id])
