# mat-copilot UI 컬러 시스템 조사 및 의사결정 보고서

## 1. 표지

| 항목 | 내용 |
| --- | --- |
| 보고서명 | mat-copilot UI 컬러 시스템 조사 및 의사결정 보고서 |
| 프로젝트명 | mat-copilot |
| 조사 기준일 | 2026-08-22 |
| 작성 목적 | 질문 중심 AI 인터뷰, PRD·TRD 비교, 분석 대시보드에 공통 적용할 접근 가능한 의미 기반 컬러 시스템 확정 |
| 적용 범위 | React 데스크톱 웹, 1440×900 기준, 최소 1280×720, Light/Dark |
| 목표 기준 | WCAG 2.1 AA 이상. 일반 텍스트 4.5:1, 큰 텍스트와 의미 있는 UI 경계 3:1 이상 |

> 이 문서의 경쟁 제품 색상은 공식 토큰 또는 공식 오픈소스 코드에서 확인된 경우에만 수치로 인용한다. 화면 관찰만 가능한 제품은 수치를 제시하지 않는다.

## 2. Executive Summary

### 핵심 결론

- **최종 권장 방향은 `Calm Indigo + Semantic Teal`**이다. 인디고는 브랜드와 주요 동작에만, 청록·황색·적색은 상태에만 사용해 의미 충돌을 줄인다.
- 캔버스와 문서 표면은 저채도 Slate 계열로 구성한다. 고채도 색이 차지하는 면적은 일반 화면 5% 이하, 대시보드 8% 이하를 목표로 한다.
- 비교 상태는 색상 외에 `=`, `~`, `!`, `−`, `+`, `?` 기호, 라벨, 선 형태를 항상 병행한다.
- 선택은 인디고 윤곽선, 키보드 포커스는 시안 외곽 링으로 표현한다. 따라서 상태 배경을 덮어쓰지 않는다.
- 차트의 범주형 색, 분석 상태색, 브랜드색은 서로 다른 토큰 네임스페이스로 운영한다. 점수 임계값은 백엔드 메타데이터가 제공하고 프론트엔드는 의미값만 매핑한다.

### 최종 권장 색상 방향

`Calm Indigo + Semantic Teal`

- 브랜드/주요 액션: Indigo
- 정보: Sky
- 성공/일치: Green
- 주의/부분 일치: Amber
- 위험/오류: Red
- 왜곡: Orange
- 누락: Magenta
- 추가: Sky
- 산정 불가: Zinc + 사선 패턴
- 키보드 포커스: Cyan

### 가장 중요한 설계 원칙 5개

1. 색은 의미의 **보조 수단**이다. 라벨, 아이콘, 기호, 선 또는 패턴을 반드시 함께 쓴다.
2. 브랜드색, 상태색, 비교색, 차트색을 분리한다.
3. `foreground/background/border/icon`을 한 쌍의 의미 토큰으로 배포하고 임의 조합을 금지한다.
4. `0`, 데이터 없음, 산정 불가, 오류를 각각 다른 데이터 상태로 취급한다.
5. hover, selection, focus는 상태색을 교체하지 않고 별도 시각 레이어로 합성한다.

### 주요 위험 3개

1. 모든 낮은 점수를 빨강으로 표시하면 AI 참고 지표가 확정적 실패 판정처럼 보인다.
2. PRD/TRD 정체성과 비교 상태를 각각 면 색으로 표현하면 한 요소에 두 의미가 충돌한다.
3. 8개 범주형 색만으로 식별을 강제하면 색각 이상과 작은 차트에서 오판 가능성이 커진다.

## 3. 프로젝트 및 사용자 경험 분석

| 화면 | 핵심 인지 과제 | 색상 설계 목표 | 주요 실패 위험 |
| --- | --- | --- | --- |
| 홈/첫 질문 | 질문을 읽고 답변 시작 | 질문과 제출 동작만 명확히 강조 | 브랜드색 과다로 입력보다 장식이 먼저 보임 |
| 연속 질의 마인드맵 | 현재·완료·처리·오류 노드 식별 | 상태, 시간 방향, 선택을 분리 | 노드 증가 시 색상 범례 기억 부담 증가 |
| 생성·분석 대기 | 현재 실행 단계와 생존 상태 확인 | 진행 단계만 움직임과 정보색으로 강조 | 정적 화면이 멈춘 서비스처럼 보임 |
| 문서 비교 | 대응 구간과 차이 종류 탐색 | 옅은 배경+기호+각주로 구분 | 적·녹 배경만으로 누락·추가를 오인 |
| 분석 대시보드 | 값, 방향성, 심각도, 신뢰도 해석 | 데이터색과 상태색 분리 | 높은 수치가 항상 좋은 값처럼 보임 |
| 상세 리포트 | 근거와 개선 제안 읽기 | 본문은 중립색, 핵심 근거만 강조 | 경고색 면적이 커져 위협적으로 보임 |

PM과 개발자는 문서 대응 관계를, 운영 담당자는 상태와 추이를, AI 도구 사용자는 산식과 신뢰도를 우선한다. 따라서 단일 “AI 느낌” 팔레트보다 **중립 표면 위에 역할별 의미색을 제한적으로 배치하는 방식**이 적합하다.

## 4. 경쟁 제품·디자인 시스템 사례 조사

| 사례 | 확인된 방식 | mat-copilot 적용점 | 그대로 적용하면 안 되는 점 |
| --- | --- | --- | --- |
| IBM Carbon / Carbon for AI | White·Gray10 및 Gray90·Gray100의 계층형 표면, 상태 토큰, Blue 포커스, AI 생성 영역의 빛/그라데이션 표식 | AI 생성 분석에 작은 AI 라벨과 제한적 glow 사용, 레이어별 다크 표면 채택 | AI 스타일을 장식으로 사용하거나 넓은 면에 glow 적용 금지 |
| Microsoft Fluent 2 | Neutral/Shared/Brand 분리, semantic color는 중요한 메시지에만 사용, 포커스 시 색 대신 stroke 두께 강화 | 브랜드·상태 분리와 두께 기반 포커스 보조 | 대형 표면에 브랜드색을 채우지 않음 |
| Material Design 3 | `container/on-container`처럼 배경과 전경 역할을 짝으로 관리 | 상태 배지의 fg/bg 페어를 토큰으로 고정 | 서로 다른 역할의 전경·배경을 임의 혼합하지 않음 |
| Atlassian Design System | 범주형 차트 토큰 순서 고정, 5~6개 초과 시 그룹화 권장, 차트 요소 사이 구분자 사용 | 8색은 상한으로 보고 6개 초과 시 패턴·직접 라벨·필터 병행 | 차트 색 위에 일반 텍스트를 직접 얹지 않음 |
| GitHub Primer | Light/Dark 의미 토큰, 추가·삭제·변경 전용 diff 색, raw HEX 직접 사용 금지 | 문서 비교의 옅은 상태 배경과 기호 병행, semantic token 강제 | 코드 diff의 적·녹 이분법을 모든 분석 상태에 확대하지 않음 |
| Grafana | 임계값을 데이터 설정으로 관리하고 선·영역·상태 타임라인을 함께 사용 | 백엔드 임계값 메타데이터와 상태 지속시간 표현 | 기본 `green → red` 규칙을 모든 지표에 고정하지 않음 |
| Sentry | 오픈소스 테마에서 중립 배경 계층과 강한 상태 accent 분리 | 운영 화면에서 표면과 상태를 분리하는 구조 참고 | vibrant 상태색을 넓은 배경에 그대로 사용하지 않음 |
| W3C/WCAG | 텍스트 4.5:1, 큰 텍스트·의미 있는 UI 3:1, 색상 단독 전달 금지 | 토큰 승인과 회귀 테스트의 정량 기준 | 디자인 툴의 반올림된 4.5 표시만 믿지 않음 |

ChatGPT, Claude, Microsoft Copilot과 같은 대화형 AI 제품은 저채도 표면과 한정된 강조색 사용을 관찰할 수 있으나, 공개 공식 토큰으로 검증되지 않은 화면 추출값은 이 보고서의 팔레트 근거로 사용하지 않았다.

## 5. 색상 전략 3안 비교

점수는 5점 만점이며, 높을수록 적합하거나 운영하기 쉽다. “상태색 충돌”은 **충돌이 적을수록 높은 점수**다.

| 평가 기준 | A. Blue/Cyan 신뢰형 | B. Violet/Indigo AI형 | C. Neutral/Teal 분석형 |
| --- | ---: | ---: | ---: |
| AI 에이전트 적합성 | 4 | 5 | 4 |
| 전문성과 신뢰감 | 5 | 4 | 5 |
| 질문 화면 친근함 | 4 | 5 | 4 |
| 모니터링 명확성 | 4 | 3 | 5 |
| 장시간 사용 피로도 | 4 | 3 | 5 |
| 차트 확장성 | 3 | 4 | 5 |
| 상태색 충돌 회피 | 2 | 4 | 5 |
| 접근성 | 4 | 4 | 5 |
| Light/Dark 확장성 | 4 | 5 | 5 |
| 구현·운영 용이성 | 4 | 4 | 4 |
| **합계** | **38** | **41** | **47** |

### A. Blue/Cyan 신뢰형

- 장점: 익숙하고 전문적이며 CTA 인지가 쉽다.
- 단점: 정보 상태, 추가 상태, 링크, 포커스와 브랜드 Blue가 충돌한다.
- 적용 위험: 대시보드 전체가 같은 파란 계열로 수렴해 우선순위가 약해진다.

### B. Violet/Indigo AI형

- 장점: AI 제품 정체성과 질문 화면의 친근함을 만들기 쉽다.
- 단점: 채도 높은 Violet을 넓게 쓰면 피로도가 높고 “AI 장식”이 정보보다 강해질 수 있다.
- 적용 위험: 왜곡·산정 불가에 Purple을 재사용하면 의미 충돌이 생긴다.

### C. Neutral/Teal 분석형

- 장점: 긴 문서와 고밀도 대시보드에 유리하고 상태·차트색의 가용 공간이 넓다.
- 단점: 잘못 구현하면 제품 인상이 지나치게 관제 도구처럼 차가워질 수 있다.
- 적용 위험: Teal을 브랜드와 success에 동시에 사용하면 충돌한다.

### 의사결정

C의 중립 표면 구조를 기본으로 하고 B의 Indigo를 브랜드/주요 동작에만 결합한 **Calm Indigo + Semantic Teal**을 권장한다. 순수 C안은 대안 방향으로 유지한다.

## 6. 최종 권장 방향 및 선정 근거

### 권장안: Calm Indigo + Semantic Teal

- Indigo는 “사용자가 조작할 수 있음”을 뜻한다.
- Green/Amber/Red/Sky는 상태를 뜻한다.
- Orange/Magenta/Sky는 문서 비교의 왜곡/누락/추가를 뜻한다.
- Cyan은 키보드 포커스에만 사용한다.
- Neutral Slate는 캔버스, 문서, 비활성, 축과 그리드를 담당한다.

### 대안안: Neutral/Teal

브랜드를 `#0F766E`(Light), `#5EEAD4`(Dark)로 바꾸는 안이다. 운영 도구의 전문성은 높지만 success Green과 근접하므로 CTA에는 사각형 채움, success에는 원형 아이콘과 라벨을 강제해야 한다. 마케팅/브랜드 차별성이 우선이면 권장안이 더 안전하다.

### 우선순위 합성 규칙

1. 상태 배경·아이콘·라벨을 먼저 렌더링한다.
2. hover는 중립 overlay 또는 elevation만 추가하며 상태색을 바꾸지 않는다.
3. selection은 2px Indigo 내부 윤곽선과 선택 아이콘을 추가한다.
4. keyboard focus는 2px Cyan 외부 링과 2px offset을 추가한다.
5. selected + focused이면 두 링을 모두 유지한다. 포커스가 최외곽이다.
6. disabled는 상호작용 레이어를 제거하되 기존 상태 라벨은 읽을 수 있게 유지한다.

## 7. 전체 컬러 팔레트

### Light

| 역할 | HEX |
| --- | --- |
| Canvas / Subtle | `#F8FAFC` / `#F1F5F9` |
| Surface / Raised / Selected | `#FFFFFF` / `#FFFFFF` / `#EEF2FF` |
| Text primary / secondary / disabled | `#0F172A` / `#475569` / `#64748B` |
| Border subtle / default / strong | `#CBD5E1` / `#64748B` / `#475569` |
| Brand default / hover / active | `#4F46E5` / `#4338CA` / `#3730A3` |
| Focus | `#0E7490` |

### Dark

| 역할 | HEX |
| --- | --- |
| Canvas / Subtle | `#0B1120` / `#111827` |
| Surface / Raised / Selected | `#172033` / `#1E293B` / `#312E81` |
| Text primary / secondary / disabled | `#F8FAFC` / `#CBD5E1` / `#94A3B8` |
| Border subtle / default / strong | `#334155` / `#64748B` / `#94A3B8` |
| Brand default / hover / active | `#A5B4FC` / `#C7D2FE` / `#818CF8` |
| Focus | `#22D3EE` |

### 상태색

각 셀의 값 순서는 `foreground / background / border / icon`이다.

| 상태 | Light HEX | Dark HEX | Light 대비 fg/bg · border/bg | Dark 대비 fg/bg · border/bg |
| --- | --- | --- | ---: | ---: |
| Info | `#075985 / #E0F2FE / #0284C7 / #0369A1` | `#7DD3FC / #082F49 / #38BDF8 / #7DD3FC` | 6.70 · 3.61 | 8.77 · 6.18 |
| Success | `#166534 / #DCFCE7 / #16A34A / #15803D` | `#86EFAC / #052E16 / #4ADE80 / #86EFAC` | 6.85 · 3.39 | 11.12 · 6.37 |
| Warning | `#854D0E / #FEF3C7 / #854D0E / #A16207` | `#FDE68A / #422006 / #FACC15 / #FDE68A` | 5.87 · 5.87 | 10.37 · 7.17 |
| Danger | `#991B1B / #FEE2E2 / #DC2626 / #B91C1C` | `#FCA5A5 / #450A0A / #F87171 / #FCA5A5` | 7.63 · 3.83 | 8.77 · 5.55 |
| Neutral | `#475569 / #F1F5F9 / #64748B / #475569` | `#CBD5E1 / #1E293B / #64748B / #CBD5E1` | 6.45 · 4.22 | 8.61 · 3.64 |
| Unavailable | `#52525B / #F4F4F5 / #71717A / #52525B` | `#D4D4D8 / #27272A / #71717A / #D4D4D8` | 7.08 · 4.27 | 9.02 · 3.85 |

모든 일반 텍스트 조합은 4.5:1 이상이고, 의미 있는 경계는 3:1 이상이다.

### 문서 비교색

| 의미 | Light 전경/배경 | Dark 전경/배경 | 기호·보조 표현 |
| --- | --- | --- | --- |
| Match | `#166534 / #DCFCE7` | `#86EFAC / #052E16` | `=` + 실선 |
| Partial | `#854D0E / #FEF3C7` | `#FDE68A / #422006` | `~` + 짧은 점선 |
| Distortion | `#9A3412 / #FFEDD5` | `#FDBA74 / #431407` | `!` + 물결 밑줄 |
| Missing | `#9D174D / #FCE7F3` | `#F9A8D4 / #500724` | `−` + 좌하향 사선 |
| Added | `#075985 / #E0F2FE` | `#7DD3FC / #082F49` | `+` + 점 패턴 |
| Selected | `#4338CA / #EEF2FF` | `#C7D2FE / #312E81` | 2px 내부 윤곽선 |
| Unavailable | `#52525B / #F4F4F5` | `#D4D4D8 / #27272A` | `?` + 양방향 사선 |

Light 대비는 Partial 5.87, Distortion 6.78, Missing 8.76, Added 6.70, Selected 7.19이며 Dark는 각각 10.37, 8.14, 8.49, 8.77, 7.98이다.

### 차트색

범주형 팔레트는 순서대로 사용한다.

| 순서 | Light | Dark | 기본 보조 패턴 |
| ---: | --- | --- | --- |
| 1 | `#2563EB` | `#60A5FA` | solid |
| 2 | `#D97706` | `#FBBF24` | diagonal |
| 3 | `#0F766E` | `#5EEAD4` | dots |
| 4 | `#9333EA` | `#C084FC` | cross |
| 5 | `#BE123C` | `#FB7185` | horizontal |
| 6 | `#0891B2` | `#67E8F9` | vertical |
| 7 | `#4D7C0F` | `#A3E635` | grid |
| 8 | `#A21CAF` | `#F0ABFC` | reverse diagonal |

범례는 항상 제공한다. 6개를 초과하면 필터·그룹화 또는 직접 라벨을 우선하며, 패턴은 색을 반복하거나 작은 인접 영역에서 혼동될 때 활성화한다.

## 8. 의미 기반 디자인 토큰 표

### 기본 UI 토큰

| 의미 토큰 | Light HEX | Dark HEX | 사용 위치 | 전경/배경 조합 | 대비율 | 사용 조건 | 금지 조건 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `background-canvas` | `#F8FAFC` | `#0B1120` | 앱 캔버스 | text-primary | 17.72 / 17.60 | 최하위 표면 | 카드 내부에 재사용 금지 |
| `background-subtle` | `#F1F5F9` | `#111827` | 보조 영역 | text-primary | 검증 완료, AA | 구획이 필요할 때 | 상태 배경 대체 금지 |
| `surface-default` | `#FFFFFF` | `#172033` | 카드·문서 | text-primary | 17.85 / 검증 완료, AA | 기본 콘텐츠 표면 | 중첩 카드 그림자 남용 금지 |
| `surface-raised` | `#FFFFFF` | `#1E293B` | 팝오버·모달 | text-primary | 17.85 / 검증 완료, AA | elevation 병행 | 선택 상태 대체 금지 |
| `surface-selected` | `#EEF2FF` | `#312E81` | 선택 보조면 | selected fg | 7.19 / 7.98 | 윤곽선·체크 병행 | 상태 배경 덮어쓰기 금지 |
| `border-subtle` | `#CBD5E1` | `#334155` | 장식 구분선 | 비의미 경계 | N/A | 표·섹션 구분 | 컨트롤 유일 경계 금지 |
| `border-default` | `#64748B` | `#64748B` | 입력·컨트롤 경계 | surface | 4.76 / 3.33 | 의미 있는 UI 경계 | 1px보다 얇게 사용 금지 |
| `border-strong` | `#475569` | `#94A3B8` | 활성 경계 | surface | 7.56 / 5.25 | 높은 구분 필요 | 본문 장식 남용 금지 |
| `text-primary` | `#0F172A` | `#F8FAFC` | 본문·제목 | canvas | 17.72 / 17.60 | 기본 텍스트 | 상태 의미 부여 금지 |
| `text-secondary` | `#475569` | `#CBD5E1` | 설명·메타 | canvas | 7.82 / 12.88 | 보조 정보 | 필수 오류 메시지 금지 |
| `text-disabled` | `#64748B` | `#94A3B8` | 비활성 텍스트 | canvas | 5.35 / 6.36 | disabled 속성 병행 | 데이터 없음 표현 금지 |
| `text-inverse` | `#FFFFFF` | `#111827` | 브랜드 버튼 | interactive-primary | 6.29 / 9.68 | 정해진 페어만 사용 | 다른 색 배경과 혼합 금지 |
| `interactive-primary` | `#4F46E5` | `#A5B4FC` | CTA·링크 | text-inverse | 6.29 / 9.68 | 사용자 동작에만 | 상태·차트색으로 사용 금지 |
| `interactive-primary-hover` | `#4338CA` | `#C7D2FE` | CTA hover | text-inverse | 8.72 / 12.36 | hover 가능 장치 | focus 대체 금지 |
| `interactive-primary-active` | `#3730A3` | `#818CF8` | CTA pressed | text-inverse | 12.99 / 6.74 | 누르는 동안 | selected 상태 대체 금지 |
| `focus-ring` | `#0E7490` | `#22D3EE` | 키보드 포커스 | canvas | 5.53 / 11.68 | 2px + 2px offset | hover에 표시 금지 |

### 상태 토큰

아래 접미사는 독립 토큰이다. HEX 순서는 `foreground`, `background`, `border`, `icon`이며 7장의 상태색 표 값과 동일하다.

| 의미 토큰 묶음 | 사용 위치 | 전경/배경 대비 | 사용 조건 | 금지 조건 |
| --- | --- | ---: | --- | --- |
| `status-info.{foreground,background,border,icon}` | 설명 알림, 실행 정보 | 6.70 / 8.77 | `i` 아이콘과 라벨 | 링크색만으로 대체 금지 |
| `status-success.{foreground,background,border,icon}` | 완료, 검증 통과 | 6.85 / 11.12 | check 아이콘과 라벨 | 점수 “양호” 전체 면 채움 금지 |
| `status-warning.{foreground,background,border,icon}` | 검토 필요 | 5.87 / 10.37 | triangle 아이콘과 라벨 | 진행 중에 사용 금지 |
| `status-danger.{foreground,background,border,icon}` | 오류, 치명 영향 | 7.63 / 8.77 | x/octagon 아이콘과 라벨 | 단순 낮은 점수에 자동 적용 금지 |
| `status-neutral.{foreground,background,border,icon}` | 대기, 데이터 없음 | 6.45 / 8.61 | clock/empty 아이콘 | 산정 불가와 같은 패턴 금지 |
| `status-unavailable.{foreground,background,border,icon}` | 산정 불가 | 7.08 / 9.02 | `N/A`, `?`, 사선 패턴 | 숫자 0 표시 금지 |

### 인터뷰 및 마인드맵 토큰

| 의미 토큰 | Light HEX | Dark HEX | 사용 위치 | 조합·대비 | 사용/금지 조건 |
| --- | --- | --- | --- | --- | --- |
| `question-active` | `#4F46E5` | `#A5B4FC` | 활성 노드 3px 상단선 | surface 대비 6.29 / 9.68 | `현재 질문` 라벨 필수 |
| `question-completed` | `#16A34A` | `#4ADE80` | check 아이콘·좌측선 | 상태 배경과 3.39 / 6.37 | 면 전체 채움 금지 |
| `question-processing` | `#0284C7` | `#38BDF8` | spinner·점선 연결선 | 상태 배경과 3.61 / 6.18 | 애니메이션 축소 설정 지원 |
| `question-error` | `#DC2626` | `#F87171` | 오류 아이콘·경계 | 상태 배경과 3.83 / 5.55 | 입력값 영역을 적색으로 채우지 않음 |
| `question-branch-line` | `#64748B` | `#94A3B8` | 노드 연결선 | surface 대비 4.76 / 5.25 | 방향 화살표 병행 |
| `question-selected` | `#4338CA` | `#C7D2FE` | 2px 내부 윤곽선 | selected 배경과 7.19 / 7.98 | 상태 배경 유지 |
| `answer-summary` | `#475569` | `#CBD5E1` | 완료 답변 요약 | canvas 대비 7.82 / 12.88 | 활성 질문 본문 금지 |
| `minimap-viewport` | `#0E7490` | `#22D3EE` | 미니맵 뷰포트 2px | canvas 대비 5.53 / 11.68 | 포커스 시 이중선 병행 |

### 문서 비교 토큰

| 의미 토큰 | Light HEX | Dark HEX | 사용 위치 | 대비율 | 사용/금지 조건 |
| --- | --- | --- | --- | ---: | --- |
| `comparison-match` | `#166534` | `#86EFAC` | `=` 아이콘·라벨 | 6.85 / 11.12 | success와 같은 의미일 때만 |
| `comparison-partial` | `#854D0E` | `#FDE68A` | `~` 아이콘·점선 | 5.87 / 10.37 | warning과 문구를 구분 |
| `comparison-distortion` | `#9A3412` | `#FDBA74` | `!`·물결 밑줄 | 6.78 / 8.14 | danger red로 대체 금지 |
| `comparison-missing` | `#9D174D` | `#F9A8D4` | `−`·사선 패턴 | 8.76 / 8.49 | 오류와 혼동 금지 |
| `comparison-added` | `#075985` | `#7DD3FC` | `+`·점 패턴 | 6.70 / 8.77 | info 라벨 병행 시 문구 명확화 |
| `comparison-selected` | `#4338CA` | `#C7D2FE` | 선택 윤곽선 | 7.19 / 7.98 | 비교 상태색 덮어쓰기 금지 |
| `comparison-unavailable` | `#52525B` | `#D4D4D8` | `?`·양방향 사선 | 7.08 / 9.02 | 0점 표시 금지 |
| `footnote-marker` | `#4F46E5` | `#A5B4FC` | 양 문서 각주 링크 | 6.29 / 9.68 | 같은 comparison ID는 같은 번호 |

PRD와 TRD는 면 색으로 구분하지 않는다. PRD는 `P` 라벨과 **실선 좌측 rail**, TRD는 `T` 라벨과 **이중선 좌측 rail**을 사용한다. 비교 상태 배경과 기호는 양쪽 문서에서 동일하게 유지한다. 각주 번호는 동일 comparison ID를 공유한다.

### 모니터링 및 차트 토큰

| 의미 토큰 | Light HEX | Dark HEX | 사용 위치 | 사용 조건 | 금지 조건 |
| --- | --- | --- | --- | --- | --- |
| `metric-good` | `#166534` | `#86EFAC` | 양호 라벨·아이콘 | 방향성 메타가 `higher_is_better`일 때 | 수치 자체의 시리즈색으로 고정 금지 |
| `metric-moderate` | `#075985` | `#7DD3FC` | 보통 | 라벨 병행 | warning 의미로 사용 금지 |
| `metric-warning` | `#854D0E` | `#FDE68A` | 주의 | 임계값 메타 기반 | 프론트 임계값 하드코딩 금지 |
| `metric-critical` | `#991B1B` | `#FCA5A5` | 위험 | 치명도 확인 시 | 낮은 신뢰도 값에 단독 사용 금지 |
| `metric-unavailable` | `#52525B` | `#D4D4D8` | 산정 불가 | hatch + `N/A` | 0 높이 막대로 표현 금지 |
| `chart-series-1..8` | 7장 팔레트 | 7장 팔레트 | 범주형 시리즈 | 번호 순서 고정 | 상태 의미 부여 금지 |
| `chart-grid` | `#CBD5E1` | `#334155` | 주요 grid | 필요 최소한만 | 모든 tick에 강한 선 금지 |
| `chart-axis` | `#475569` | `#CBD5E1` | 축·tick 텍스트 | canvas 대비 AA | chart fill 위 직접 배치 금지 |
| `chart-reference-line` | `#64748B` | `#94A3B8` | 기준선 | 2px dash + 라벨 | 데이터 시리즈처럼 범례화 금지 |
| `chart-selection` | `#4338CA` | `#C7D2FE` | 선택 outline | 2px + dim siblings | 원래 시리즈색 교체 금지 |
| `chart-hover` | `#0E7490` | `#22D3EE` | hover outline | tooltip 병행 | keyboard focus 대체 금지 |

## 9. 화면별 색상 배치 가이드

| 화면 | 중립/지배색 | 보조색 | 강조색 | 최초 주목 요소 | 배치 및 금지 규칙 |
| --- | ---: | ---: | ---: | --- | --- |
| 홈/첫 질문 | 82% | 13% | 5% | 질문 제목→입력→CTA | 브랜드색은 CTA와 활성 입력에만. 설명 본문·넓은 배경에는 사용 금지 |
| 마인드맵 | 72% | 20% | 8% | 현재 질문 노드 | 과거 노드는 중립+상태 아이콘. 모든 노드를 서로 다른 색으로 만들지 않음 |
| 생성·분석 대기 | 80% | 15% | 5% | 현재 진행 단계 | 완료는 check, 진행은 spinner+info, 대기는 neutral. 전체 progress bar 적색 금지 |
| PRD·TRD 비교 | 78% | 15% | 7% | 선택 각주와 대응 구간 | 본문은 중립. 상태색은 줄 배경 8~12% tint와 gutter에 한정 |
| 분석 대시보드 | 75% | 17% | 8% | 종합 지표 제목과 현재 선택 | 장식용 색 금지. 차트와 상태 배지는 다른 팔레트 사용 |
| 차이 상세 리포트 | 82% | 12% | 6% | 원인·영향·개선 제안 제목 | 긴 본문은 text-primary. 경고색은 아이콘·좌측 rail에 한정 |
| 오류·빈 상태·산정 불가 | 85% | 10% | 5% | 상태 제목과 복구 동작 | 오류만 danger. 빈 상태는 neutral, 산정 불가는 hatch+N/A |

- selection: 2px Indigo 내부 윤곽선과 선택 아이콘.
- hover: 중립 elevation 또는 8% overlay. 의미색 변화 없음.
- focus: 2px Cyan 외곽 링, 2px offset. Windows 고대비 모드에서는 `Highlight` 시스템색 사용.
- disabled: 색을 흐리기만 하지 않고 `disabled` 속성, 금지 아이콘 또는 설명을 제공한다.
- 적록 색각 이상: match/missing을 `=`/`−`와 패턴으로 구분한다.
- 과도한 경고 방지: 한 뷰에서 경고 면적 10%를 넘으면 요약 배지로 집계하고 상세에서 펼친다.

## 10. 상태 표현 매트릭스

| 상태 | 색상 | 아이콘 | 테두리/선 | 텍스트 라벨 | 패턴 또는 형태 | 예시 문구 |
| --- | --- | --- | --- | --- | --- | --- |
| 대기 | Neutral | clock | 1px solid | 대기 | 빈 원 | `TRD 생성을 기다리는 중` |
| 활성 | Brand | play/current | 3px top rail | 현재 질문 | 채운 상단선 | `현재 답변할 질문` |
| 진행 중 | Info | spinner | 2px dashed | 진행 중 | 회전 또는 점 이동 | `PRD를 생성하고 있습니다` |
| 완료 | Success | check | 1px solid | 완료 | 체크 원 | `분석 완료` |
| 정보 | Info | info | 1px solid | 정보 | 원형 | `산식 설명 보기` |
| 부분 일치 | Amber | tilde | dashed underline | 부분 일치 | `~` | `범위 일부만 대응합니다` |
| 왜곡 | Orange | alert | wavy underline | 왜곡 | `!` | `원래 의도가 변경되었습니다` |
| 누락 | Magenta | minus | solid left rail | 누락 | diagonal hatch | `TRD에 대응 항목이 없습니다` |
| 추가 | Sky | plus | dotted left rail | 추가 | dots | `TRD에 새 항목이 추가되었습니다` |
| 주의 | Warning | triangle | 1px solid | 주의 | 삼각형 | `검토가 필요합니다` |
| 오류 | Danger | x-circle | 2px solid | 오류 | 팔각형 | `질문 전송에 실패했습니다` |
| 위험 | Danger | octagon | 2px double | 위험 | 팔각형+`!` | `높은 영향이 예상됩니다` |
| 선택됨 | Brand outline | check-small | 2px inner | 선택됨 | 내부 윤곽 | `차이 12 선택됨` |
| 비활성 | Neutral | lock/ban | 1px dotted | 사용할 수 없음 | 낮은 채도 | `이 단계에서는 수정할 수 없습니다` |
| 연결 끊김 | Warning | plug-off | dashed | 연결 끊김 | 끊긴 선 | `연결을 복구하는 중` |
| 데이터 없음 | Neutral | empty-box | 1px solid | 데이터 없음 | 빈 윤곽 | `표시할 기록이 없습니다` |
| 산정 불가 | Unavailable | question | 1px double | N/A | 양방향 hatch | `근거가 부족해 산정할 수 없습니다` |

`0점`은 유효한 숫자 `0`과 해당 척도의 실제 상태 라벨을 표시한다. `데이터 없음`은 em dash와 빈 상태, `산정 불가`는 `N/A`와 hatch, `오류`는 danger와 복구 동작을 사용한다.

## 11. 차트 및 데이터 시각화 색상 규칙

### 범주형

- `chart-series-1..8`은 표에 정의된 순서로 배정한다.
- 동일 범주는 모든 차트에서 같은 번호를 유지한다.
- 범례, tooltip, direct label 중 최소 하나를 제공한다.
- 6개 초과는 우선 그룹화한다. 8개가 모두 필요하면 패턴과 필터를 함께 제공한다.
- 인접 막대·도넛 조각에는 2px canvas색 구분자를 둔다.

### 순서형

- 높은 값이 좋은 지표: Neutral → Sky → Teal → Green.
- 높은 값이 나쁜 지표: Neutral → Amber → Orange → Red.
- 토큰 효율처럼 목표 구간이 있는 값은 단방향 팔레트가 아니라 발산형을 사용한다.
- 산정 불가는 팔레트 최저색이 아니라 Neutral hatch로 표시한다.

### 발산형

- 중앙 기준 왼쪽은 Magenta/Orange, 중앙은 Neutral, 오른쪽은 Sky/Teal을 사용한다.
- “좋음/나쁨”이 아닌 “PRD 쪽/ TRD 쪽 편향”이면 양 끝 모두 같은 채도와 명도를 사용한다.
- 0 기준선은 2px dashed `chart-reference-line`과 `기준 0` 라벨로 표시한다.

### 차트 유형별 의미 보존

- 시계열: 시리즈 색은 범주만 나타낸다. 임계값은 별도 선·영역으로 표시한다.
- 막대: 막대색은 범주 또는 순서 중 하나만 인코딩한다.
- 도넛: 상태 분포에만 상태색을 쓰며, 일반 범주에는 범주형 팔레트를 쓴다.
- 게이지: 상태색은 채워진 구간이 아니라 임계값 band와 상태 라벨에 우선 사용한다.
- 히트맵: 단일 지표는 순서형 한 계열, 중앙점이 있을 때만 발산형을 쓴다.

## 12. 접근성 검증

### 대비율

- 보고서의 주요 fg/bg 조합은 WCAG 계산식으로 검증했다.
- 일반 텍스트는 4.5:1, 큰 텍스트와 의미 있는 UI 경계는 3:1 미만이면 배포를 차단한다.
- `border-subtle`은 장식 구분선 전용이다. 입력·선택 등 의미 있는 경계에는 사용하지 않는다.
- 반올림 전 값이 기준을 넘어야 한다.

### 색각 이상

- Protanopia, Deuteranopia, Tritanopia 시뮬레이션에서 상태 이름의 정확도 95% 이상을 목표로 한다.
- Match/Missing, Success/Danger, Partial/Warning은 아이콘·문구·패턴이 서로 달라야 한다.

### 비색상 표현

- 모든 상태 배지에 텍스트 라벨과 아이콘을 표시한다.
- 문서 비교 gutter에 `= ~ ! − + ?` 기호를 표시한다.
- 차트에는 범례 또는 직접 라벨과 tooltip을 제공한다.

### 고대비 모드

- `@media (forced-colors: active)`에서 배경 패턴을 유지하고 `Canvas`, `CanvasText`, `Highlight`, `HighlightText`를 사용한다.
- `forced-color-adjust: none`은 로고 등 필수 브랜드 자산 외에는 사용하지 않는다.

## 13. CSS 디자인 토큰 예시

```css
:root {
  color-scheme: light;
  --color-bg-canvas: #f8fafc;
  --color-bg-subtle: #f1f5f9;
  --color-surface-default: #ffffff;
  --color-surface-raised: #ffffff;
  --color-surface-selected: #eef2ff;
  --color-border-subtle: #cbd5e1;
  --color-border-default: #64748b;
  --color-border-strong: #475569;
  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-disabled: #64748b;
  --color-text-inverse: #ffffff;
  --color-interactive-primary: #4f46e5;
  --color-interactive-primary-hover: #4338ca;
  --color-interactive-primary-active: #3730a3;
  --color-focus-ring: #0e7490;

  --color-status-info-fg: #075985;
  --color-status-info-bg: #e0f2fe;
  --color-status-info-border: #0284c7;
  --color-status-success-fg: #166534;
  --color-status-success-bg: #dcfce7;
  --color-status-success-border: #16a34a;
  --color-status-warning-fg: #854d0e;
  --color-status-warning-bg: #fef3c7;
  --color-status-warning-border: #854d0e;
  --color-status-danger-fg: #991b1b;
  --color-status-danger-bg: #fee2e2;
  --color-status-danger-border: #dc2626;
  --color-status-neutral-fg: #475569;
  --color-status-neutral-bg: #f1f5f9;
  --color-status-neutral-border: #64748b;
  --color-status-unavailable-fg: #52525b;
  --color-status-unavailable-bg: #f4f4f5;
  --color-status-unavailable-border: #71717a;

  --color-comparison-match-fg: #166534;
  --color-comparison-match-bg: #dcfce7;
  --color-comparison-partial-fg: #854d0e;
  --color-comparison-partial-bg: #fef3c7;
  --color-comparison-distortion-fg: #9a3412;
  --color-comparison-distortion-bg: #ffedd5;
  --color-comparison-missing-fg: #9d174d;
  --color-comparison-missing-bg: #fce7f3;
  --color-comparison-added-fg: #075985;
  --color-comparison-added-bg: #e0f2fe;

  --color-chart-series-1: #2563eb;
  --color-chart-series-2: #d97706;
  --color-chart-series-3: #0f766e;
  --color-chart-series-4: #9333ea;
  --color-chart-series-5: #be123c;
  --color-chart-series-6: #0891b2;
  --color-chart-series-7: #4d7c0f;
  --color-chart-series-8: #a21caf;
}

[data-theme="dark"] {
  color-scheme: dark;
  --color-bg-canvas: #0b1120;
  --color-bg-subtle: #111827;
  --color-surface-default: #172033;
  --color-surface-raised: #1e293b;
  --color-surface-selected: #312e81;
  --color-border-subtle: #334155;
  --color-border-default: #64748b;
  --color-border-strong: #94a3b8;
  --color-text-primary: #f8fafc;
  --color-text-secondary: #cbd5e1;
  --color-text-disabled: #94a3b8;
  --color-text-inverse: #111827;
  --color-interactive-primary: #a5b4fc;
  --color-interactive-primary-hover: #c7d2fe;
  --color-interactive-primary-active: #818cf8;
  --color-focus-ring: #22d3ee;

  --color-status-info-fg: #7dd3fc;
  --color-status-info-bg: #082f49;
  --color-status-info-border: #38bdf8;
  --color-status-success-fg: #86efac;
  --color-status-success-bg: #052e16;
  --color-status-success-border: #4ade80;
  --color-status-warning-fg: #fde68a;
  --color-status-warning-bg: #422006;
  --color-status-warning-border: #facc15;
  --color-status-danger-fg: #fca5a5;
  --color-status-danger-bg: #450a0a;
  --color-status-danger-border: #f87171;
  --color-status-neutral-fg: #cbd5e1;
  --color-status-neutral-bg: #1e293b;
  --color-status-neutral-border: #64748b;
  --color-status-unavailable-fg: #d4d4d8;
  --color-status-unavailable-bg: #27272a;
  --color-status-unavailable-border: #71717a;

  --color-comparison-match-fg: #86efac;
  --color-comparison-match-bg: #052e16;
  --color-comparison-partial-fg: #fde68a;
  --color-comparison-partial-bg: #422006;
  --color-comparison-distortion-fg: #fdba74;
  --color-comparison-distortion-bg: #431407;
  --color-comparison-missing-fg: #f9a8d4;
  --color-comparison-missing-bg: #500724;
  --color-comparison-added-fg: #7dd3fc;
  --color-comparison-added-bg: #082f49;

  --color-chart-series-1: #60a5fa;
  --color-chart-series-2: #fbbf24;
  --color-chart-series-3: #5eead4;
  --color-chart-series-4: #c084fc;
  --color-chart-series-5: #fb7185;
  --color-chart-series-6: #67e8f9;
  --color-chart-series-7: #a3e635;
  --color-chart-series-8: #f0abfc;
}

:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

@media (forced-colors: active) {
  :focus-visible {
    outline-color: Highlight;
  }
}
```

컴포넌트 코드와 차트 옵션에는 HEX를 직접 쓰지 않고 위 의미 토큰만 참조한다.

## 14. 안티패턴과 금지 규칙

- 빨강/초록만으로 성공과 오류, 추가와 누락을 구분하지 않는다.
- 브랜드 Indigo를 info, selected, chart series의 공용색으로 무분별하게 재사용하지 않는다.
- 채도가 높은 색을 카드·문서·대시보드 전체 배경에 사용하지 않는다.
- 차트 fill 위에 대비가 검증되지 않은 텍스트를 직접 배치하지 않는다.
- 산정 불가를 `0`, 0% 막대, danger 색으로 표시하지 않는다.
- 낮은 AI 신뢰도나 낮은 점수를 자동으로 오류 처리하지 않는다.
- Light 팔레트를 단순 반전하여 Dark 팔레트를 만들지 않는다.
- hover가 상태색을 바꾸거나 selection이 비교 상태 배경을 지우게 하지 않는다.
- 동일 HEX를 서로 반대되는 의미 토큰에 alias하지 않는다.
- AI glow/gradient를 장식용으로 반복하지 않는다.

## 15. 적용 우선순위

### MVP 필수

1. 기본 UI, 상태, 비교, focus 토큰 구현
2. 상태 라벨·아이콘·문서 gutter 기호 구현
3. `0`/없음/N/A/오류 데이터 모델과 렌더링 분리
4. Light/Dark 및 forced-colors 기본 대응
5. 백엔드 임계값 메타데이터 기반 metric 매핑
6. PRD·TRD 정체성 rail과 comparison 상태의 분리

### MVP 이후 개선

1. 8개 범주형 차트 패턴과 인쇄 스타일
2. AI 생성 콘텐츠 표시 토큰과 미세한 glow
3. 색각 모드별 패턴 자동 강화
4. 사용자별 색상 테마 선호 저장

### 실사용 데이터 확보 후 조정

1. 경고 동시 노출 밀도와 집계 기준
2. 장시간 읽기 피로도에 따른 Dark 표면 명도
3. 실제 차트 범주 수에 따른 6색 그룹화 기준
4. 5초 인지 테스트 결과에 따른 비교 기호와 패턴

## 16. 검증 및 사용자 테스트 계획

| 테스트 | 방법 | 합격 기준 |
| --- | --- | --- |
| WCAG 대비 | 모든 의미 토큰 페어 자동 계산 | 일반 텍스트 4.5:1, 큰 텍스트·UI 3:1, 실패 0건 |
| 적·녹·청 색각 이상 | Protanopia/Deuteranopia/Tritanopia 시뮬레이션 | 색을 제외해도 상태 과업 정확도 95% 이상 |
| 흑백 화면 | grayscale 캡처와 실제 모니터 | 아이콘·패턴·라벨로 17개 상태 모두 식별 |
| 해상도 | 1280×720, 1440×900 | 의미 라벨 잘림 0건, focus ring clipping 0건 |
| Light/Dark | 동일 시나리오 회귀 | 의미 변경 0건, 대비 실패 0건 |
| 저품질·밝은 모니터 | 낮은 명암·밝기 환경 | 주요 경계와 현재 단계 식별률 95% 이상 |
| 키보드 focus | Tab/Shift+Tab/arrow 전 과정 | 모든 상호작용 요소에서 focus visible, 순서 오류 0건 |
| 긴 문서 선택 | 100페이지 상당 fixture | 양 문서 대응 구간을 5초 내 90% 이상 식별 |
| 8개 차트 시리즈 | 색각 시뮬레이션+범례 회상 | 인접 시리즈 식별 정확도 90% 이상 |
| 경고 다중 노출 | 10개 이상 warning fixture | danger·warning 우선순위 오인 5% 미만 |
| N/A와 0점 | 혼합 카드 20개 | 구분 정확도 100% |
| PRD·TRD 교차 강조 | 각주·차트·리포트 왕복 | 네 영역 동기화 성공률 100% |
| 5초 인지 | PM·개발·운영 각 3명 이상 | 현재 단계/선택 차이/가장 위험한 항목 정확도 90% 이상 |

## 17. 최종 의사결정 체크리스트

- [ ] 브랜드색이 사용자 동작 외 의미로 사용되지 않았는가?
- [ ] 모든 상태에 텍스트 라벨과 아이콘 또는 패턴이 있는가?
- [ ] 일반 텍스트 4.5:1, UI 경계 3:1을 실제 계산했는가?
- [ ] selection과 focus가 상태색을 보존하는가?
- [ ] PRD/TRD 정체성이 비교 상태색과 독립적인가?
- [ ] `0`, 데이터 없음, 산정 불가, 오류가 데이터 모델과 UI에서 구분되는가?
- [ ] 차트 범주와 상태가 서로 다른 팔레트를 사용하는가?
- [ ] `higher_is_better`, `lower_is_better`, `target_range`를 구분하는가?
- [ ] 임계값을 프론트엔드에 하드코딩하지 않았는가?
- [ ] Light/Dark/forced-colors에서 같은 의미가 유지되는가?
- [ ] 6개 초과 차트 범주에 그룹화·패턴·필터가 있는가?
- [ ] AI 생성 표시가 장식이 아니라 투명성 정보로만 쓰이는가?
- [ ] 컴포넌트 코드에 raw HEX가 없는가?
- [ ] 색각 시뮬레이션과 5초 인지 테스트를 통과했는가?

## 18. 참고문헌

1. W3C, Understanding SC 1.4.3 Contrast (Minimum): https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
2. W3C, Understanding SC 1.4.11 Non-text Contrast: https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
3. W3C, Understanding SC 1.4.1 Use of Color: https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
4. W3C, Understanding SC 2.4.7 Focus Visible: https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html
5. W3C, Understanding SC 2.4.11 Focus Appearance: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
6. IBM Carbon, Color tokens: https://carbondesignsystem.com/elements/color/tokens/
7. IBM Carbon, Color overview: https://carbondesignsystem.com/elements/color/overview/
8. IBM Carbon, Carbon for AI: https://carbondesignsystem.com/guidelines/carbon-for-ai/
9. IBM Carbon, Notification pattern: https://carbondesignsystem.com/patterns/notification-pattern/
10. IBM Carbon, Data visualization color palettes: https://carbondesignsystem.com/data-visualization/color-palettes/
11. Material Design 3, Color roles: https://m3.material.io/styles/color/roles
12. Material Design 3, Color system: https://m3.material.io/styles/color/system/how-the-system-works
13. Microsoft Fluent 2, Color: https://fluent2.microsoft.design/color
14. Atlassian Design System, Color: https://atlassian.design/foundations/color
15. Atlassian Design System, Data visualization color: https://atlassian.design/foundations/color/data-visualization-color
16. GitHub Primer, Color primitives: https://primer.style/product/primitives/color/
17. GitHub Primer light theme tokens: https://unpkg.com/@primer/primitives@11.10.0/dist/css/functional/themes/light.css
18. GitHub Primer dark theme tokens: https://unpkg.com/@primer/primitives@11.10.0/dist/css/functional/themes/dark.css
19. Grafana, Configure thresholds: https://grafana.com/docs/grafana/latest/panels-visualizations/configure-thresholds/
20. Grafana, State timeline: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/state-timeline/
21. Sentry open-source theme tokens: https://github.com/getsentry/sentry/tree/master/static/app/utils/theme

