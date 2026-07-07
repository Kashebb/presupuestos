from sqlalchemy import Column, Integer, String, Float, Boolean, Date, JSON, ForeignKey
from app.models.base import Base

class Recurso(Base):
    __tablename__ = "recursos"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=True, index=True)
    recurso_base_id = Column(Integer, ForeignKey("recursos.id", ondelete="SET NULL"), nullable=True, index=True)
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
    estado_validacion = Column(String, nullable=False, default="pendiente")
    fuente_validacion = Column(String, nullable=True)
    fecha_validacion = Column(Date, nullable=True)
    nota_validacion = Column(String, nullable=True)
    etiquetas = Column(JSON, nullable=False, default=list)
    activo = Column(Boolean, default=True)
