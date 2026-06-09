from pydantic import BaseModel
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

class APUCreate(APUBase):
    items: List[APUItemCreate] = []

class APUUpdate(APUBase):
    items: Optional[List[APUItemCreate]] = None

class APUOut(APUBase):
    id: int
    items: List[APUItemOut] = []
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    class Config:
        from_attributes = True