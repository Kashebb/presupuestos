from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EstadoSubcontrato(str, Enum):
    BORRADOR = "BORRADOR"
    CONFIRMADO = "CONFIRMADO"
    ANULADO = "ANULADO"


class EstadoRevisionSubcontrato(str, Enum):
    ACTUALIZADO = "ACTUALIZADO"
    DESACTUALIZADO = "DESACTUALIZADO"
    PENDIENTE_REVISION = "PENDIENTE_REVISION"
    ERROR = "ERROR"


class PresetSubcontrato(str, Enum):
    COMPLETO = "COMPLETO"
    SOLO_MATERIALES = "SOLO_MATERIALES"
    SOLO_MANO_OBRA = "SOLO_MANO_OBRA"
    MANO_OBRA_EQUIPOS = "MANO_OBRA_EQUIPOS"
    MATERIALES_TRANSPORTE = "MATERIALES_TRANSPORTE"
    PERSONALIZADO = "PERSONALIZADO"


class CategoriaRecursoSubcontrato(str, Enum):
    MATERIAL = "material"
    MANO_DE_OBRA = "mano_de_obra"
    EQUIPO = "equipo"
    TRANSPORTE = "transporte"


class SubcontratoBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    contratista: str | None = Field(default=None, max_length=250)
    descripcion: str | None = None


class SubcontratoCreate(SubcontratoBase):
    pass


class SubcontratoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=200)
    contratista: str | None = Field(default=None, max_length=250)
    descripcion: str | None = None


class SubcontratoOut(SubcontratoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    proyecto_id: int
    codigo: str
    estado: EstadoSubcontrato
    fecha_confirmacion: datetime | None
    fecha_anulacion: datetime | None
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class SubcontratoCodigoSecuenciaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    proyecto_id: int
    ultimo_numero: int = Field(ge=0)


class ConfiguracionCategoriasSubcontrato(BaseModel):
    preset: PresetSubcontrato
    incluye_materiales: bool = False
    incluye_mano_obra: bool = False
    incluye_equipos: bool = False
    incluye_transporte: bool = False

    @model_validator(mode="after")
    def validar_configuracion(self):
        seleccion = (
            self.incluye_materiales,
            self.incluye_mano_obra,
            self.incluye_equipos,
            self.incluye_transporte,
        )
        if not any(seleccion):
            raise ValueError("Debe seleccionarse al menos una categoría")

        configuraciones_fijas = {
            PresetSubcontrato.COMPLETO: (True, True, True, True),
            PresetSubcontrato.SOLO_MATERIALES: (True, False, False, False),
            PresetSubcontrato.SOLO_MANO_OBRA: (False, True, False, False),
            PresetSubcontrato.MANO_OBRA_EQUIPOS: (False, True, True, False),
            PresetSubcontrato.MATERIALES_TRANSPORTE: (True, False, False, True),
        }
        esperado = configuraciones_fijas.get(self.preset)
        if esperado is not None and seleccion != esperado:
            raise ValueError("La selección de categorías no coincide con el preset")
        return self


class SubcontratoRubroBase(ConfiguracionCategoriasSubcontrato):
    nodo_presupuesto_id: int | None = None
    apu_id_snapshot: int | None = None
    nodo_item_snapshot: str | None = Field(default=None, max_length=60)
    nodo_descripcion_snapshot: str = Field(min_length=1, max_length=500)
    nodo_unidad_snapshot: str | None = Field(default=None, max_length=20)
    apu_codigo_snapshot: str | None = None
    apu_nombre_snapshot: str = Field(min_length=1)
    metrado_snapshot: float = Field(ge=0)
    pu_materiales_snapshot: float = Field(default=0, ge=0)
    pu_mano_obra_snapshot: float = Field(default=0, ge=0)
    pu_herramientas_snapshot: float = Field(default=0, ge=0)
    pu_equipos_snapshot: float = Field(default=0, ge=0)
    pu_transporte_snapshot: float = Field(default=0, ge=0)
    pu_seleccionado_snapshot: float = Field(default=0, ge=0)
    total_snapshot: float = Field(default=0, ge=0)
    firma_calculo: str = Field(min_length=64, max_length=64)
    estado_revision: EstadoRevisionSubcontrato = EstadoRevisionSubcontrato.ACTUALIZADO


class SubcontratoRubroCreate(SubcontratoRubroBase):
    pass


class SubcontratoRubroOut(SubcontratoRubroBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subcontrato_id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class SubcontratoRubroRecursoSnapshotBase(BaseModel):
    recurso_id: int | None = None
    recurso_codigo_snapshot: str | None = None
    recurso_descripcion_snapshot: str = Field(min_length=1)
    recurso_unidad_snapshot: str | None = None
    recurso_categoria_snapshot: CategoriaRecursoSubcontrato
    cantidad_unitaria_snapshot: float = Field(ge=0)
    metrado_snapshot: float = Field(ge=0)
    cantidad_total_snapshot: float = Field(ge=0)
    incluido_subcontrato: bool


class SubcontratoRubroRecursoSnapshotCreate(SubcontratoRubroRecursoSnapshotBase):
    pass


class SubcontratoRubroRecursoSnapshotOut(SubcontratoRubroRecursoSnapshotBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subcontrato_rubro_id: int
    fecha_creacion: datetime


class SeleccionCategoriasSubcontrato(BaseModel):
    incluye_materiales: bool = False
    incluye_mano_obra: bool = False
    incluye_equipos: bool = False
    incluye_transporte: bool = False


class SubcontratoRubrosAsignar(BaseModel):
    nodo_ids: list[int] = Field(min_length=1)
    preset: PresetSubcontrato
    seleccion_personalizada: SeleccionCategoriasSubcontrato | None = None


class SubcontratoRubroConfigurar(BaseModel):
    preset: PresetSubcontrato
    seleccion_personalizada: SeleccionCategoriasSubcontrato | None = None


class SubcontratoRubrosActualizar(BaseModel):
    asignacion_ids: list[int] | None = None
    todos_desactualizados: bool = False

    @model_validator(mode="after")
    def validar_alcance(self):
        if not self.todos_desactualizados and not self.asignacion_ids:
            raise ValueError("Indique asignaciones o todos_desactualizados")
        return self


class SubcontratoRubroRevisar(BaseModel):
    confirmar_cambio_apu: bool
    preset: PresetSubcontrato | None = None
    seleccion_personalizada: SeleccionCategoriasSubcontrato | None = None
