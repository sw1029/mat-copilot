from __future__ import annotations

from app.models.domain import IntentItem
from app.services.jobs import demo
from app.store.state import SessionState


async def run_plan_extraction(state: SessionState, runtime) -> list[IntentItem]:
    if state.plan is None:
        return []
    if demo.is_demo_plan(state.plan.text):
        plan_intents = demo.demo_intents()
    else:
        drafts = await runtime.pipeline.extract_plan_intents(state.plan.text)
        plan_intents = [
            IntentItem(
                phase=d.phase or IntentPhase.INITIAL,
                statement=d.statement,
                implicit=d.implicit,
                source_question_ids=d.source_question_ids,
            )
            for d in drafts
        ]
    return plan_intents
