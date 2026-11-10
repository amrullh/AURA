"""Validasi kontrak: kelima contoh response harus lolos skema pydantic."""
import json
from pathlib import Path

from app.schemas import AgentResult

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "ai" / "examples"

CASES = [
    "response_1_clean.json",
    "response_2_exception_harga_dan_jumlah.json",
    "response_3_duplicate.json",
    "response_4_needs_review_item_di_luar_po.json",
    "response_5_needs_review_po_tidak_ditemukan.json",
]


def _normalize(obj):
    """Buang field opsional bernilai None agar perbandingan tidak bergantung penulisannya."""
    OPTIONAL = {"delta_pct", "review_reason", "page", "detail", "tool_args_summary",
                "duration_ms", "original_invoice_number", "original_total_amount",
                "original_created_at", "match_basis", "escalation"}
    if isinstance(obj, dict):
        return {k: _normalize(v) for k, v in obj.items() if not (k in OPTIONAL and v is None)}
    if isinstance(obj, list):
        return [_normalize(v) for v in obj]
    return obj


def test_semua_contoh_lolos_skema():
    for name in CASES:
        data = json.loads((EXAMPLES / name).read_text(encoding="utf-8"))
        result = AgentResult.model_validate(data)
        # Round-trip: tidak ada field yang hilang atau berubah nilai.
        assert _normalize(result.model_dump()) == _normalize(data), f"round-trip gagal: {name}"


def test_request_lolos_skema():
    from app.schemas import ProcessRequest

    data = json.loads((EXAMPLES / "request.json").read_text(encoding="utf-8"))
    ProcessRequest.model_validate(data)


def test_error_shape():
    """Bentuk error 422 sesuai contoh."""
    from app.schemas import AgentResult  # noqa: F401

    import json as _json

    data = _json.loads((EXAMPLES / "error_422_berkas_tidak_terbaca.json").read_text(encoding="utf-8"))
    assert set(data["error"]) == {"code", "message"}
