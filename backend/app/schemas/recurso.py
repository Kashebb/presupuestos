from pydantic import BaseModel
from typing import Optional
from datetime import date

class RecursoBase(BaseModel):
    codigo: str
    descripcion: str
    categoria: str
    subcategoria: Optional[str] = None
    familia: Optional[str] = None
    unidad: str
    precio_unitario: float = 0.0
    fecha_precio: Optional[date] = None
    fuente_precio: Optional[str] = None
    observacion: Optional[str] = None
    estado_validacion: str = "pendiente"
    fuente_validacion: Optional[str] = None
    fecha_validacion: Optional[date] = None
    nota_validacion: Optional[str] = None
    activo: bool = True

class RecursoCreate(RecursoBase):
    pass

class RecursoUpdate(RecursoBase):
    pass

class RecursoPrecioUpdate(BaseModel):
    precio_unitario: float

class RecursoOut(RecursoBase):
    id: int

    class Config:
        from_attributes = True
