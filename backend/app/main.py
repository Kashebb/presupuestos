from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import Base, engine
from app.models import recurso, apu
from app.api import recursos, apus

Base.metadata.create_all(bind=engine)

app = FastAPI(title="App Presupuestos", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recursos.router)
app.include_router(apus.router)

@app.get("/")
def root():
    return {"mensaje": "API de Presupuestos funcionando"}