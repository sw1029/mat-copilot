from __future__ import annotations

from app.models.domain import EvidenceLocation, EvidenceRef, Finding, IntentItem
from app.models.enums import Confidence, IntentPhase, SessionStatus, Severity, ThemeType
from app.services.jobs.pipeline import sanitize_findings
from app.agents.interfaces import ParsedArtifactView
from tests.conftest import create_session, wait_job


async def _setup(client, plan: bytes, artifact: bytes):
    sid, headers = await create_session(client)
    pr = await client.post(f"/api/v1/sessions/{sid}/plan", headers=headers, files={"file": ("plan.md", plan)})
    assert pr.status_code == 202, pr.text
    await wait_job(client, sid, headers, pr.json()["jobId"])
    ar = await client.post(f"/api/v1/sessions/{sid}/artifacts", headers=headers, files={"file": ("artifact.md", artifact)})
    assert ar.status_code == 201, ar.text
    return sid, headers


async def _run_analysis(client, sid, headers):
    res = await client.post(f"/api/v1/sessions/{sid}/analysis", headers=headers)
    assert res.status_code == 202, res.text
    return await wait_job(client, sid, headers, res.json()["jobId"])


async def test_analysis_quant_report_charts_etag_and_schema_lock(client):
    plan = "- alpha feature works\n- beta dashboard works\n- gamma export works\n".encode()
    artifact = "alpha feature works in UI\nbeta dashboard works clearly\nDISTORT: beta dashboard removes filters\n".encode()
    sid, headers = await _setup(client, plan, artifact)
    job = await _run_analysis(client, sid, headers)
    assert job["status"] == "SUCCEEDED"
    assert job["completedStages"] == ["INGEST", "NORMALIZE", "EVALUATE", "DRIFT", "AGGREGATE", "REPORT"]

    report = (await client.get(f"/api/v1/sessions/{sid}/report", headers=headers)).json()
    assert report["quantStats"]["totalIntents"] == 3
    assert report["quantStats"]["coveredIntents"] == 2
    assert report["quantStats"]["driftCount"] == 2
    assert any(f["theme"] == "INTENT_DISTORTION" and f["evidence"][0]["quote"] in artifact.decode() for f in report["findings"])
    coverage_metric = next(m for m in report["metrics"] if m["metricId"] == "intent-coverage")
    assert coverage_metric["value"] == round(2 / 3 * 100)
    assert "[intent:" not in report["intentDoc"]["markdown"]
    block_ids = {b["blockId"] for b in report["intentDoc"]["blocks"]}
    all_intents = {i for b in report["intentDoc"]["blocks"] for i in b["intentIds"]}
    assert len(all_intents) == 3
    assert all(set(f["intentBlockIds"]).issubset(block_ids) for f in report["findings"])

    charts = (await client.get(f"/api/v1/sessions/{sid}/report/charts", headers=headers)).json()["charts"]
    counts = sum(int(line.split(",")[1]) for line in charts[0]["csv"].splitlines()[1:] if line)
    assert counts == report["quantStats"]["driftCount"]

    state = client.app.state.store._states[sid]
    schema_id = state.normalization_schema.schema_id
    second = await _run_analysis(client, sid, headers)
    assert second["status"] == "SUCCEEDED"
    assert state.normalization_schema.schema_id == schema_id

    res = await client.get(f"/api/v1/sessions/{sid}/jobs/{second['jobId']}", headers=headers)
    etag = res.headers["ETag"]
    res2 = await client.get(f"/api/v1/sessions/{sid}/jobs/{second['jobId']}", headers={**headers, "If-None-Match": etag})
    assert res2.status_code == 304


def test_verify_quote_removes_fake_evidence_and_lowers_confidence():
    intent = IntentItem(statement="fake quote test", phase=IntentPhase.INITIAL)
    finding = Finding(theme=ThemeType.INTENT_DISTORTION, related_intent_ids=[intent.intent_id], summary="s", detail="d", evidence=[EvidenceRef(artifact_id="a1", location=EvidenceLocation(kind="file", path="a.md"), quote="not in text")], severity=Severity.MEDIUM, confidence=Confidence.HIGH)
    [clean] = sanitize_findings([finding], [ParsedArtifactView(artifact_id="a1", name="a.md", kind="file", texts=[("a.md", "real text")])], [intent])
    assert clean.evidence == []
    assert clean.confidence is Confidence.LOW


async def test_preconditions_and_links(client):
    sid, headers = await create_session(client)
    res = await client.post(f"/api/v1/sessions/{sid}/analysis", headers=headers)
    assert res.status_code == 409

    state = client.app.state.store._states[sid]
    state.intents = [IntentItem(statement="x")]
    res = await client.post(f"/api/v1/sessions/{sid}/analysis", headers=headers)
    assert res.status_code == 409

    state.status = SessionStatus.INTERVIEWING
    res = await client.post(f"/api/v1/sessions/{sid}/analysis", headers=headers)
    assert res.status_code == 409
    state.status = SessionStatus.CREATED

    assert (await client.post(f"/api/v1/sessions/{sid}/artifacts", headers=headers, json={"type": "LINK", "url": "http://example.com"})).status_code == 400
    assert (await client.post(f"/api/v1/sessions/{sid}/artifacts", headers=headers, json={"type": "LINK", "url": "https://127.0.0.1/a"})).status_code == 400
    ok = await client.post(f"/api/v1/sessions/{sid}/artifacts", headers=headers, json={"type": "LINK", "url": "https://example.com/a"})
    assert ok.status_code == 201
    assert ok.json()["ingestStatus"] == "SKIPPED_UNSUPPORTED"


async def test_cancel_and_retry_contract(client):
    sid, headers = await _setup(client, b"- alpha feature works", b"alpha feature works")
    res = await client.post(f"/api/v1/sessions/{sid}/analysis", headers=headers)
    assert res.status_code == 202
    job_id = res.json()["jobId"]
    cancel = await client.post(f"/api/v1/sessions/{sid}/jobs/{job_id}/cancel", headers=headers)
    assert cancel.status_code in (200, 409)
    final = await wait_job(client, sid, headers, job_id)
    if final["status"] == "SUCCEEDED":
        assert (await client.post(f"/api/v1/sessions/{sid}/jobs/{job_id}/cancel", headers=headers)).status_code == 409
        assert (await client.post(f"/api/v1/sessions/{sid}/jobs/{job_id}/retry", headers=headers)).status_code == 409
    else:
        assert final["status"] == "CANCELLED"
        assert client.app.state.store._states[sid].status is SessionStatus.INTERVIEW_DONE


async def test_demo_path_llm_disabled(client):
    plan = open("samples/sample_plan.md", "rb").read()
    artifact = open("samples/sample_artifact.md", "rb").read()
    sid, headers = await _setup(client, plan, artifact)
    job = await _run_analysis(client, sid, headers)
    assert job["status"] == "SUCCEEDED"
    state = client.app.state.store._states[sid]
    assert state.status is SessionStatus.REPORT_READY
    report = (await client.get(f"/api/v1/sessions/{sid}/report", headers=headers)).json()
    assert report["quantStats"]["driftCount"] == 2
