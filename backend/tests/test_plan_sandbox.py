from __future__ import annotations

import io
import zipfile

from docx import Document

from app.models.enums import ArtifactIngestStatus
from app.services.sandbox import parser
from tests.conftest import create_session, wait_job


async def _upload_plan(client, sid, headers, name: str, data: bytes):
    return await client.post(f"/api/v1/sessions/{sid}/plan", headers=headers, files={"file": (name, data)})


async def test_plan_upload_txt_md_docx_and_validation_last_wins(client):
    sid, headers = await create_session(client)
    for name, data in [("plan.txt", b"- first intent"), ("plan.md", b"- second intent")]:
        res = await _upload_plan(client, sid, headers, name, data)
        assert res.status_code == 202, res.text
        job = await wait_job(client, sid, headers, res.json()["jobId"])
        assert job["status"] == "SUCCEEDED"

    doc_buf = io.BytesIO()
    doc = Document()
    doc.add_paragraph("- docx intent")
    doc.save(doc_buf)
    res = await _upload_plan(client, sid, headers, "plan.docx", doc_buf.getvalue())
    assert res.status_code == 202
    await wait_job(client, sid, headers, res.json()["jobId"])
    state = client.app.state.store._states[sid]
    assert [i.statement for i in state.intents] == ["docx intent"]

    res = await _upload_plan(client, sid, headers, "bad.exe", b"x")
    assert res.status_code == 415
    res = await _upload_plan(client, sid, headers, "big.md", b"x" * (10 * 1024 * 1024 + 1))
    assert res.status_code == 413


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_sandbox_zip_safety(monkeypatch):
    monkeypatch.setattr(parser, "MAX_ZIP_TOTAL_UNCOMPRESSED", 32)
    bomb = parser.parse_upload("bomb.zip", _zip({"large.md": b"x" * 64}), artifact_id="a")
    assert bomb.status is ArtifactIngestStatus.SKIPPED_TOO_LARGE

    traversal = parser.parse_upload("evil.zip", _zip({"../evil.txt": b"bad"}), artifact_id="a")
    assert traversal.status is ArtifactIngestStatus.BLOCKED_UNSAFE

    monkeypatch.setattr(parser, "MAX_ZIP_TOTAL_UNCOMPRESSED", 1024)
    nested = parser.parse_upload("nested.zip", _zip({"inner.zip": _zip({"a.md": b"hi"})}), artifact_id="a")
    assert nested.status is ArtifactIngestStatus.SKIPPED_UNSUPPORTED
    assert "중첩 zip" in nested.note_text

    binary = parser.parse_upload("bin.zip", _zip({"bin.dat": b"abc\x00def"}), artifact_id="a")
    assert binary.status is ArtifactIngestStatus.SKIPPED_UNSUPPORTED

    normal = parser.parse_upload("ok.zip", _zip({"readme.md": b"hello", "src/app.py": b"print('x')"}), artifact_id="a")
    assert normal.status is ArtifactIngestStatus.PARSED
    assert {f.path for f in normal.files} == {"readme.md", "src/app.py"}
