from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class APUItemBase(BaseModel):
    recurso_id: Optional[int] = None
    categoria: str
    cantidad: float
    orden: int = 0
    es_herramienta_menor: bool = False

class APUItemCreate(APUItemBase):
    pass

class APUItemOut(APUItemBase):
    id: int
    class Config:
        from_attributes = True

class APUBase(BaseModel):
    codigo: Optional[str] = None
    nombre: str
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    unidad: str
    rendimiento: float = 1.0
    estado: str = "en_revision"
    version: int = 1
    observacion: Optional[str] = None
    etiquetas: List[str] = Field(default_factory=list)
    es_variante: bool = False
    apu_base_id: Optional[int] = None
    proyecto_id: Optional[int] = None
    variante_nombre: Optional[str] = None
    copiado_desde_apu_id: Optional[int] = None

class APUCreate(APUBase):
    items: List[APUItemCreate] = []

class APUUpdate(APUBase):
    items: Optional[List[APUItemCreate]] = None

class APUEtiquetasUpdate(BaseModel):
    etiquetas: List[str] = Field(default_factory=list)

class APUOut(APUBase):
    id: int
    items: List[APUItemOut] = []
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    class Config:
        from_attributes = True
