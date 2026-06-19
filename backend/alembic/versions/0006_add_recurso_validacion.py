"""add recurso validacion fields

Revision ID: 0006_add_recurso_validacion
Revises: 0005_actualizaciones_presupuesto
Create Date: 2026-06-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_add_recurso_validacion"
down_revision = "0005_actualizaciones_presupuesto"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recursos",
        sa.Column("estado_validacion", sa.String(length=30), nullable=False, server_default="pendiente"),
    )
    op.add_column("recursos", sa.Column("fuente_validacion", sa.String(length=80), nullable=True))
    op.add_column("recursos", sa.Column("fecha_validacion", sa.Date(), nullable=True))
    op.add_column("recursos", sa.Column("nota_validacion", sa.String(), nullable=True))

    op.execute(
        """
        UPDATE recursos
        SET estado_validacion = 'aprobado',
            fuente_validacion = 'STOCKPROYECTOS',
            nota_validacion = 'Inicializado desde fuente_precio/observacion STOCKPROYECTO'
        WHERE upper(coalesce(fuente_precio, '') || ' ' || coalesce(observacion, '')) LIKE '%STOCKPROYECTO%'
        """
    )
    op.execute(
        """
        UPDATE recursos
        SET estado_validacion = 'piloto',
            fuente_validacion = 'NO_STOCKPROYECTOS',
            nota_validacion = 'Inicializado desde observacion PILOTO_NO_VALIDADO'
        WHERE upper(coalesce(observacion, '')) LIKE '%PILOTO_NO_VALIDADO%'
        """
    )
    op.execute(
        """
        UPDATE recursos
        SET estado_validacion = 'no_aprobado',
            fuente_validacion = 'NO_STOCKPROYECTOS',
            nota_validacion = 'Inicializado desde observacion NO_STOCKPROYECTOS'
        WHERE estado_validacion = 'pendiente'
          AND upper(coalesce(observacion, '')) LIKE '%NO_STOCKPROYECTOS%'
        """
    )


def downgrade() -> None:
    op.drop_column("recursos", "nota_validacion")
    op.drop_column("recursos", "fecha_validacion")
    op.drop_column("recursos", "fuente_validacion")
    op.drop_column("recursos", "estado_validacion")
