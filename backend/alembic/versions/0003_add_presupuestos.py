"""add presupuestos tables

Revision ID: 0003_add_presupuestos
Revises: 84b496f68ba0
Create Date: 2026-06-11

Crea las tablas:
  - proyectos
  - nodos_presupuesto
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_add_presupuestos"
down_revision = "84b496f68ba0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "proyectos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column("codigo", sa.String(length=50), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=True),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=True),
        sa.Column("fecha_actualizacion", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo"),
    )
    op.create_index(op.f("ix_proyectos_id"), "proyectos", ["id"], unique=False)

    op.create_table(
        "nodos_presupuesto",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("proyecto_id", sa.Integer(), nullable=False),
        sa.Column("padre_id", sa.Integer(), nullable=True),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("item", sa.String(length=60), nullable=True),
        sa.Column("descripcion", sa.String(length=500), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=True),
        sa.Column("unidad", sa.String(length=20), nullable=True),
        sa.Column("metrado", sa.Float(), nullable=True),
        sa.Column("precio_unitario_ref", sa.Float(), nullable=True),
        sa.Column("apu_id", sa.Integer(), nullable=True),
        sa.Column("tipo_rubro", sa.String(length=20), nullable=True),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["apu_id"], ["apus.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["padre_id"], ["nodos_presupuesto.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["proyecto_id"], ["proyectos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_nodos_presupuesto_id"), "nodos_presupuesto", ["id"], unique=False)
    op.create_index("ix_nodos_proyecto", "nodos_presupuesto", ["proyecto_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_nodos_proyecto", table_name="nodos_presupuesto")
    op.drop_index(op.f("ix_nodos_presupuesto_id"), table_name="nodos_presupuesto")
    op.drop_table("nodos_presupuesto")
    op.drop_index(op.f("ix_proyectos_id"), table_name="proyectos")
    op.drop_table("proyectos")