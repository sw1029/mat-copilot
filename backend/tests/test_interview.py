"""TC-02/03/04/14 — 인터뷰 엔진 (TRD §6, §11)."""

from __future__ import annotations

from datetime import timedelta

import httpx
import pytest

from app.main import create_app
from app.models.domain import IntentItem, utcnow
from app.models.enums import IntentPhase, SessionStatus
from tests.conftest import create_session, make_settings


async def _start(client, sid, headers):
    res = await client.post(f"/api/v1/sessions/{sid}/interview/start", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["question"]


async def _answer(client, sid, headers, qid, value, **extra):
    res = await client.post(
        f"/api/v1/sessions/{sid}/interview/answers",
        headers=headers,
        json={"questionId": qid, "value": value, **extra},
    )
    assert res.status_code == 200, res.text
    return res.json()


async def test_tc02_start_expand_tree_and_idempotent_answer(client):
    sid, headers = await create_session(client)
    first = await _start(client, sid, headers)
    assert first["status"] == "ACTIVE"

    tree = (await client.get(f"/api/v1/sessions/{sid}/interview/tree", headers=headers)).json()
    assert tree["stats"]["totalQuestions"] == 3

    high = await _answer(client, sid, headers, first["questionId"], "모호함 @a=0.9 @i=0.9 @c=0.0")
    assert high["assessment"]["confusedScore"] == 0.7
    assert high["expanded"] is True
    assert high["nextQuestion"]["parentId"] == first["questionId"]
    total_after = high["stats"]["totalQuestions"]

    low = await _answer(client, sid, headers, high["nextQuestion"]["questionId"], "명확함 @a=0.1 @i=0.1 @c=0.0")
    assert low["expanded"] is False

    idem = await _answer(client, sid, headers, first["questionId"], "다른 답변 @a=0.9")
    assert idem["answeredQuestionId"] == first["questionId"]
    tree = (await client.get(f"/api/v1/sessions/{sid}/interview/tree", headers=headers)).json()
    assert tree["stats"]["totalQuestions"] == total_after
    assert set(tree) >= {"nodes", "answers", "stats", "interviewStatus", "activeQuestionId", "remainingQuestions"}
    assert tree["stats"]["answered"] == 2


async def test_tc03_threshold_required_depth_request_deeper_and_watchdog(client):
    sid, headers = await create_session(client, {"confuseThreshold": 0.4, "timeLimitSec": 600})
    first = await _start(client, sid, headers)

    exact = await _answer(client, sid, headers, first["questionId"], "경계값 @a=0.5 @i=0.5 @c=0.0")
    assert exact["assessment"]["confusedScore"] == 0.4
    assert exact["expanded"] is False

    required = await _answer(client, sid, headers, exact["nextQuestion"]["questionId"], "필수 @a=0.1 @i=0.1 @c=0.0 @required")
    assert required["expanded"] is True
    assert required["nextQuestion"]["kind"] == "REQUIRED"

    current = required["nextQuestion"]
    depth1 = await _answer(client, sid, headers, current["questionId"], "깊이1 @a=0.9 @i=0.9 @c=0.0 @required")
    depth2 = depth1["nextQuestion"]
    assert depth2["depth"] == 2
    no_depth3 = await _answer(client, sid, headers, depth2["questionId"], "깊이2 @a=0.9 @i=0.9 @c=0.0")
    assert no_depth3["expanded"] is False

    # requestDeeper는 해당 노드에 한해 깊이 +1을 1회 허용한다.
    target = no_depth3["nextQuestion"]
    if target["depth"] < 2:
        target = (await _answer(client, sid, headers, target["questionId"], "추가 @a=0.9 @i=0.9 @c=0.0"))["nextQuestion"]
    deeper = await _answer(
        client,
        sid,
        headers,
        target["questionId"],
        "깊이 보너스 @a=0.1 @i=0.1 @c=0.0",
        requestFlag=True,
    )
    assert deeper["expanded"] is True
    assert deeper["stats"]["maxDepthReached"] <= 3

    while deeper["interviewStatus"] == "ACTIVE" and deeper["stats"]["totalQuestions"] < 15:
        deeper = await _answer(client, sid, headers, deeper["nextQuestion"]["questionId"], "계속 @a=0.9 @i=0.9 @c=0.0")
    tree = (await client.get(f"/api/v1/sessions/{sid}/interview/tree", headers=headers)).json()
    assert tree["stats"]["totalQuestions"] <= 15


async def test_tc04_revised_phase_and_implicit_intent(client):
    sid, headers = await create_session(client)
    first = await _start(client, sid, headers)
    revised = await _answer(client, sid, headers, first["questionId"], "방향 변경 @a=0.9 @i=0.9 @c=0.8")
    assert revised["nextQuestion"]["intentPhase"] == "REVISED"
    await _answer(client, sid, headers, revised["nextQuestion"]["questionId"], "무의식 신호 @implicit @a=0.1 @i=0.1 @c=0.0")

    res = await client.post(f"/api/v1/sessions/{sid}/interview/complete", headers=headers, json={"confirm": True})
    assert res.status_code == 200, res.text
    state = client.app.state.store._states[sid]
    assert any(i.phase is IntentPhase.REVISED for i in state.intents)
    assert any(i.implicit for i in state.intents)


async def test_tc14_complete_rules(client):
    sid, headers = await create_session(client)
    first = await _start(client, sid, headers)
    ans = await _answer(client, sid, headers, first["questionId"], "필수 후속 @required @a=0.1 @i=0.1 @c=0.0")
    assert ans["nextQuestion"]["kind"] == "REQUIRED"

    res = await client.post(f"/api/v1/sessions/{sid}/interview/complete", headers=headers, json={"confirm": False})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "REQUIRED_QUESTIONS_PENDING"
    assert "pendingQuestionIds" in res.json()["error"]["details"]

    res = await client.post(f"/api/v1/sessions/{sid}/interview/complete", headers=headers, json={"confirm": True})
    assert res.status_code == 200
    assert res.json() == {
        "interviewStatus": "COMPLETED",
        "completedReason": "USER_EARLY",
        "earlyCompleted": True,
    }
    assert client.app.state.store._states[sid].status is SessionStatus.INTERVIEW_DONE
    res2 = await client.post(f"/api/v1/sessions/{sid}/interview/complete", headers=headers, json={"confirm": False})
    assert res2.status_code == 200
    assert res2.json() == res.json()

    sid2, headers2 = await create_session(client)
    client.app.state.store._states[sid2].intents.append(IntentItem(statement="기획안 의도"))
    res = await client.post(f"/api/v1/sessions/{sid2}/interview/complete", headers=headers2, json={})
    assert res.status_code == 200
    assert res.json()["completedReason"] is None
    assert res.json()["earlyCompleted"] is False

    sid3, headers3 = await create_session(client)
    res = await client.post(f"/api/v1/sessions/{sid3}/interview/complete", headers=headers3, json={})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "INTERVIEW_NOT_ACTIVE"


async def test_fallback_null_runtime_start_answer_and_complete():
    app = create_app(settings=make_settings(llm_mode="disabled"))
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            client.app = app
            sid, headers = await create_session(client)
            first = await _start(client, sid, headers)
            assert first["aiGenerated"] is False
            res = await _answer(client, sid, headers, first["questionId"], "폴백 답변")
            assert res["assessment"]["fallback"] is True
            assert res["nextQuestion"]["aiGenerated"] is False
            res = await client.post(f"/api/v1/sessions/{sid}/interview/complete", headers=headers, json={"confirm": True})
            assert res.status_code == 200
            assert app.state.store._states[sid].intents


async def test_time_limit_auto_completion(client):
    sid, headers = await create_session(client, {"confuseThreshold": 0.3, "timeLimitSec": 60})
    first = await _start(client, sid, headers)
    client.app.state.store._states[sid].interview_started_at = utcnow() - timedelta(seconds=61)
    res = await _answer(client, sid, headers, first["questionId"], "시간 초과 @a=0.9 @i=0.9 @c=0.0")
    assert res["interviewStatus"] == "COMPLETED"
    assert res["completedReason"] == "TIME_LIMIT"
    assert client.app.state.store._states[sid].early_completed is True


async def test_api05_start_idempotent_returns_active_question(client):
    """SCHEMA API-05 멱등: 이미 시작 시 현재 활성 질문 반환."""
    sid, headers = await create_session(client)
    first = await _start(client, sid, headers)
    again = await _start(client, sid, headers)
    assert again["questionId"] == first["questionId"]
    tree = (await client.get(f"/api/v1/sessions/{sid}/interview/tree", headers=headers)).json()
    assert tree["stats"]["totalQuestions"] == 3
