"""Endpoint agent: GET /health dan POST /process (kontrak BE <-> AGENT)."""
from __future__ import annotations

import logging
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from . import pipeline
from .errors import AgentHttpError
from .schemas import AgentResult, ProcessRequest

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("aura-agent")

app = FastAPI(title="AURA Agent", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process")
def process(req: ProcessRequest):
    t0 = time.monotonic()
    try:
        result: AgentResult = pipeline.run(req)
    except AgentHttpError as e:
        log.warning("Invoice %s: %s", req.invoice_id, e.message)
        return JSONResponse(status_code=e.status, content={"error": {"code": e.code, "message": e.message}})
    except Exception as e:  # jangan bocorkan detail teknis ke pengguna
        log.exception("Invoice %s: error tak terduga", req.invoice_id)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL", "message": "Pemrosesan gagal. Coba ulang beberapa saat lagi."}},
        )
    log.info(
        "Invoice %s: %s (conf %.2f, %d iter, %.1fs)",
        req.invoice_id, result.verdict, result.confidence, result.iterations, time.monotonic() - t0,
    )
    return result.model_dump()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("AGENT_PORT", "8000")))
