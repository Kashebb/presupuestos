from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .base import Base


ESTADOS_SUBCONTRATO = ("BORRADOR", "CONFIRMADO", "ANULADO")
ESTADOS_REVISION_SUBCONTRATO = (
    "ACTUALIZADO",
    "DESACTUALIZADO",
    "PENDIENTE_REVISION",
    "ERROR",
)
PRESETS_SUBCONTRATO = (
    "COMPLETO",
    "SOLO_MATERIALES",
    "SOLO_MANO_OBRA",
    "MANO_OBRA_EQUIPOS",
    "MATERIALES_TRANSPORTE",
    "PERSONALIZADO",
)
CATEGORIAS_SUBCONTRATO = ("material", "mano_de_obra", "equipo", "transporte")


class Subcontrato(Base):
    __tablename__ = "subcontratos"
    __table_args__ = (
        UniqueConstraint("proyecto_id", "codigo", name="uq_subcontratos_proyecto_codigo"),
        CheckConstraint(
            "estado IN ('BORRADOR', 'CONFIRMADO', 'ANULADO')",
            name="ck_subcontratos_estado",
        ),
        Index("ix_subcontratos_proyecto_estado", "proyecto_id", "estado"),
        Index("ix_subcontratos_proyecto_fecha_actualizacion", "proyecto_id", "fecha_actualizacion"),
    )

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(
        Integer,
        ForeignKey("proyectos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    codigo = Column(String(30), nullable=False)
    nombre = Column(String(200), nullable=False)
    contratista = Column(String(250), nullable=True)
    descripcion = Column(Text, nullable=True)
    estado = Column(String(20), nullable=False, default="BORRADOR")
    fecha_confirmacion = Column(DateTime, nullable=True)
    fecha_anulacion = Column(DateTime, nullable=True)
    fecha_creacion = Column(DateTime, nullable=False, default=datetime.utcnow)
    fecha_actualizacion = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    proyecto = relationship("Proyecto", foreign_keys=[proyecto_id], lazy="select")
    rubros = relationship(
        "SubcontratoRubro",
        back_populates="subcontrato",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="select",
    )


class SubcontratoCodigoSecuencia(Base):
    __tablename__ = "subcontrato_codigo_secuencias"
    __table_args__ = (
        CheckConstraint("ultimo_numero >= 0", name="ck_subcontrato_codigo_secuencias_no_negativo"),
    )

    proyecto_id = Column(
        Integer,
        ForeignKey("proyectos.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    ultimo_numero = Column(Integer, nullable=False, default=0)

    proyecto = relationship("Proyecto", foreign_keys=[proyecto_id], lazy="select")


class SubcontratoRubro(Base):
    __tablename__ = "subcontrato_rubros"
    __table_args__ = (
        CheckConstraint(
            "preset IN ('COMPLETO', 'SOLO_MATERIALES', 'SOLO_MANO_OBRA', "
            "'MANO_OBRA_EQUIPOS', 'MATERIALES_TRANSPORTE', 'PERSONALIZADO')",
            name="ck_subcontrato_rubros_preset",
        ),
        CheckConstraint(
            "estado_revision IN ('ACTUALIZADO', 'DESACTUALIZADO', 'PENDIENTE_REVISION', 'ERROR')",
            name="ck_subcontrato_rubros_estado_revision",
        ),
        CheckConstraint(
            "incluye_materiales OR incluye_mano_obra OR "
            "incluye_equipos OR incluye_transporte",
            name="ck_subcontrato_rubros_categoria_seleccionada",
        ),
        CheckConstraint(
            "(preset = 'COMPLETO' AND incluye_materiales AND incluye_mano_obra "
            "AND incluye_equipos AND incluye_transporte) OR "
            "(preset = 'SOLO_MATERIALES' AND incluye_materiales AND NOT incluye_mano_obra "
            "AND NOT incluye_equipos AND NOT incluye_transporte) OR "
            "(preset = 'SOLO_MANO_OBRA' AND NOT incluye_materiales AND incluye_mano_obra "
            "AND NOT incluye_equipos AND NOT incluye_transporte) OR "
            "(preset = 'MANO_OBRA_EQUIPOS' AND NOT incluye_materiales AND incluye_mano_obra "
            "AND incluye_equipos AND NOT incluye_transporte) OR "
            "(preset = 'MATERIALES_TRANSPORTE' AND incluye_materiales AND NOT incluye_mano_obra "
            "AND NOT incluye_equipos AND incluye_transporte) OR "
            "preset = 'PERSONALIZADO'",
            name="ck_subcontrato_rubros_configuracion_preset",
        ),
        CheckConstraint("metrado_snapshot >= 0", name="ck_subcontrato_rubros_metrado_no_negativo"),
        CheckConstraint(
            "pu_materiales_snapshot >= 0 AND pu_mano_obra_snapshot >= 0 "
            "AND pu_herramientas_snapshot >= 0 AND pu_equipos_snapshot >= 0 "
            "AND pu_transporte_snapshot >= 0 AND pu_seleccionado_snapshot >= 0 "
            "AND total_snapshot >= 0",
            name="ck_subcontrato_rubros_importes_no_negativos",
        ),
        Index("ix_subcontrato_rubros_subcontrato_estado", "subcontrato_id", "estado_revision"),
    )

    id = Column(Integer, primary_key=True, index=True)
    subcontrato_id = Column(
        Integer,
        ForeignKey("subcontratos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nodo_presupuesto_id = Column(
        Integer,
        ForeignKey("nodos_presupuesto.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    apu_id_snapshot = Column(
        Integer,
        ForeignKey("apus.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    nodo_item_snapshot = Column(String(60), nullable=True)
    nodo_descripcion_snapshot = Column(String(500), nullable=False)
    nodo_unidad_snapshot = Column(String(20), nullable=True)
    apu_codigo_snapshot = Column(String, nullable=True)
    apu_nombre_snapshot = Column(String, nullable=False)
    preset = Column(String(30), nullable=False)
    incluye_materiales = Column(Boolean, nullable=False, default=False)
    incluye_mano_obra = Column(Boolean, nullable=False, default=False)
    incluye_equipos = Column(Boolean, nullable=False, default=False)
    incluye_transporte = Column(Boolean, nullable=False, default=False)
    metrado_snapshot = Column(Float, nullable=False)
    pu_materiales_snapshot = Column(Float, nullable=False, default=0.0)
    pu_mano_obra_snapshot = Column(Float, nullable=False, default=0.0)
    pu_herramientas_snapshot = Column(Float, nullable=False, default=0.0)
    pu_equipos_snapshot = Column(Float, nullable=False, default=0.0)
    pu_transporte_snapshot = Column(Float, nullable=False, default=0.0)
    pu_seleccionado_snapshot = Column(Float, nullable=False, default=0.0)
    total_snapshot = Column(Float, nullable=False, default=0.0)
    firma_calculo = Column(String(64), nullable=False, index=True)
    estado_revision = Column(String(30), nullable=False, default="ACTUALIZADO")
    fecha_creacion = Column(DateTime, nullable=False, default=datetime.utcnow)
    fecha_actualizacion = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    subcontrato = relationship("Subcontrato", back_populates="rubros", foreign_keys=[subcontrato_id])
    nodo_presupuesto = relationship("NodoPresupuesto", foreign_keys=[nodo_presupuesto_id], lazy="select")
    apu_snapshot = relationship("APU", foreign_keys=[apu_id_snapshot], lazy="select")
    recursos_snapshot = relationship(
        "SubcontratoRubroRecursoSnapshot",
        back_populates="subcontrato_rubro",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="select",
    )


class SubcontratoRubroRecursoSnapshot(Base):
    __tablename__ = "subcontrato_rubro_recursos_snapshot"
    __table_args__ = (
        CheckConstraint(
            "recurso_categoria_snapshot IN ('material', 'mano_de_obra', 'equipo', 'transporte')",
            name="ck_subcontrato_rubro_recursos_categoria",
        ),
        CheckConstraint(
            "cantidad_unitaria_snapshot >= 0 AND metrado_snapshot >= 0 "
            "AND cantidad_total_snapshot >= 0",
            name="ck_subcontrato_rubro_recursos_cantidades_no_negativas",
        ),
        Index(
            "ix_subcontrato_rubro_recursos_asignacion_categoria_incluido",
            "subcontrato_rubro_id",
            "recurso_categoria_snapshot",
            "incluido_subcontrato",
        ),
        Index(
            "ix_subcontrato_rubro_recursos_recurso_unidad",
            "recurso_id",
            "recurso_unidad_snapshot",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    subcontrato_rubro_id = Column(
        Integer,
        ForeignKey("subcontrato_rubros.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recurso_id = Column(
        Integer,
        ForeignKey("recursos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recurso_codigo_snapshot = Column(String, nullable=True)
    recurso_descripcion_snapshot = Column(String, nullable=False)
    recurso_unidad_snapshot = Column(String, nullable=True)
    recurso_categoria_snapshot = Column(String(30), nullable=False)
    cantidad_unitaria_snapshot = Column(Float, nullable=False)
    metrado_snapshot = Column(Float, nullable=False)
    cantidad_total_snapshot = Column(Float, nullable=False)
    incluido_subcontrato = Column(Boolean, nullable=False)
    fecha_creacion = Column(DateTime, nullable=False, default=datetime.utcnow)

    subcontrato_rubro = relationship(
        "SubcontratoRubro",
        back_populates="recursos_snapshot",
        foreign_keys=[subcontrato_rubro_id],
    )
    recurso = relationship("Recurso", foreign_keys=[recurso_id], lazy="select")
