import logging
import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import HTTPException

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

DB_PATH = PROJECT_ROOT / "presupuestos.db"
BACKUP_ROOT = PROJECT_ROOT / "backups"
ONEDRIVE_DAILY_BACKUP_ROOT = Path(
    r"C:\Users\luisa\OneDrive - Santec Group\Automatizaciones\03 Aplicaciones\presupuestos\backups"
)

BackupTipo = Literal["critico", "diario", "manual"]


def _motivo_seguro(motivo: str) -> str:
    limpio = re.sub(r"[^A-Za-z0-9_-]+", "_", motivo.strip())
    limpio = limpio.strip("_")
    return limpio or "sin_motivo"


def _archivos_db(carpeta: Path, marcador: str | None = None) -> list[Path]:
    if not carpeta.exists():
        return []
    archivos = [archivo for archivo in carpeta.glob("*.db") if archivo.is_file()]
    if marcador:
        archivos = [archivo for archivo in archivos if marcador in archivo.name]
    return sorted(archivos, key=lambda archivo: archivo.stat().st_mtime, reverse=True)


def _aplicar_limite(carpeta: Path, limite: int, marcador: str | None = None) -> None:
    for archivo in _archivos_db(carpeta, marcador=marcador)[limite:]:
        archivo.unlink()


def _aplicar_retencion_critico(carpeta: Path) -> None:
    _aplicar_limite(carpeta, limite=20)


def _aplicar_retencion_diario(carpeta: Path) -> None:
    _aplicar_limite(carpeta, limite=7, marcador="_diario_")
    _aplicar_limite(carpeta, limite=4, marcador="_semanal_")
    _aplicar_limite(carpeta, limite=6, marcador="_mensual_")


def _marcador_diario(ahora: datetime) -> str:
    marcadores = ["diario"]
    if ahora.weekday() == 0:
        marcadores.append("semanal")
    if ahora.day == 1:
        marcadores.append("mensual")
    return "_".join(marcadores)


def existe_backup_diario_hoy() -> bool:
    carpeta = BACKUP_ROOT / "diario"
    hoy = datetime.now().strftime("%Y%m%d")
    return any(archivo.is_file() and hoy in archivo.name for archivo in carpeta.glob("*.db")) if carpeta.exists() else False


def mover_backups_legacy_pre_cascada() -> int:
    BACKUP_ROOT.mkdir(exist_ok=True)
    destino = BACKUP_ROOT / "legacy_pre_cascada"
    destino.mkdir(exist_ok=True)

    movidos = 0
    for archivo in BACKUP_ROOT.glob("*.db"):
        if not archivo.is_file():
            continue
        archivo.replace(destino / archivo.name)
        movidos += 1
    return movidos


def crear_backup(motivo: str, tipo: BackupTipo) -> str:
    if tipo not in ("critico", "diario", "manual"):
        raise HTTPException(status_code=500, detail=f"Tipo de backup no soportado: {tipo}")
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="No se encontro la base para crear respaldo.")

    ahora = datetime.now()
    motivo_limpio = _motivo_seguro(motivo)
    carpeta = BACKUP_ROOT / tipo
    carpeta.mkdir(parents=True, exist_ok=True)

    timestamp = ahora.strftime("%Y%m%d_%H%M%S")
    marcador = f"{_marcador_diario(ahora)}_" if tipo == "diario" else ""
    destino = carpeta / f"presupuestos_{marcador}{motivo_limpio}_{timestamp}.db"

    try:
        src = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
        dst = sqlite3.connect(destino)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo crear respaldo automatico: {exc}") from exc

    if tipo == "critico":
        _aplicar_retencion_critico(carpeta)
    elif tipo == "diario":
        _aplicar_retencion_diario(carpeta)
        try:
            ONEDRIVE_DAILY_BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
            shutil.copy2(destino, ONEDRIVE_DAILY_BACKUP_ROOT / destino.name)
        except OSError as exc:
            logger.error("No se pudo copiar el backup diario a OneDrive: %s", exc)

    return str(destino)
