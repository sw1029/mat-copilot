"""상태/열거형 정의 — SCHEMA §3 과 1:1 대응."""

from enum import Enum


class SessionStatus(str, Enum):
    CREATED = "CREATED"
    INTERVIEWING = "INTERVIEWING"
    INTERVIEW_DONE = "INTERVIEW_DONE"
    ANALYZING = "ANALYZING"
    REPORT_READY = "REPORT_READY"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"


class InterviewStatus(str, Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class CompletedReason(str, Enum):
    THRESHOLD = "THRESHOLD"
    USER_EARLY = "USER_EARLY"
    WATCHDOG = "WATCHDOG"
    TIME_LIMIT = "TIME_LIMIT"


class QuestionKind(str, Enum):
    REQUIRED = "REQUIRED"
    OPTIONAL = "OPTIONAL"


class QuestionStatus(str, Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    ANSWERED = "ANSWERED"
    SKIPPED = "SKIPPED"


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class JobKind(str, Enum):
    PLAN_EXTRACTION = "PLAN_EXTRACTION"
    ANALYSIS = "ANALYSIS"


class JobStage(str, Enum):
    INGEST = "INGEST"
    NORMALIZE = "NORMALIZE"
    EVALUATE = "EVALUATE"
    DRIFT = "DRIFT"
    AGGREGATE = "AGGREGATE"
    REPORT = "REPORT"


ANALYSIS_STAGE_ORDER: list[JobStage] = [
    JobStage.INGEST,
    JobStage.NORMALIZE,
    JobStage.EVALUATE,
    JobStage.DRIFT,
    JobStage.AGGREGATE,
    JobStage.REPORT,
]


class ArtifactType(str, Enum):
    FILE = "FILE"
    LINK = "LINK"
    GITHUB = "GITHUB"


class ArtifactIngestStatus(str, Enum):
    PENDING = "PENDING"
    PARSED = "PARSED"
    SKIPPED_UNSUPPORTED = "SKIPPED_UNSUPPORTED"
    SKIPPED_TOO_LARGE = "SKIPPED_TOO_LARGE"
    BLOCKED_UNSAFE = "BLOCKED_UNSAFE"


class MetricStatus(str, Enum):
    GOOD = "GOOD"
    WARN = "WARN"
    BAD = "BAD"
    NA = "NA"


class ThemeType(str, Enum):
    REQUIREMENT_OMISSION = "REQUIREMENT_OMISSION"
    INTENT_DISTORTION = "INTENT_DISTORTION"
    HALLUCINATION = "HALLUCINATION"
    SCOPE_CREEP = "SCOPE_CREEP"
    DYNAMIC = "DYNAMIC"


# M1 코어 2종 (TRD §7.5, OQ-16 확정)
M1_CORE_THEMES: list[ThemeType] = [
    ThemeType.REQUIREMENT_OMISSION,
    ThemeType.INTENT_DISTORTION,
]


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class Confidence(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class IntentPhase(str, Enum):
    INITIAL = "INITIAL"
    REVISED = "REVISED"
