# JARGEMA Product Requirements Document v1.0

**"졸면 전시된다"**  
작성일: 2026-05-20 | 작성: JARGEMA Team

이 문서는 사용자가 제공한 JARGEMA PRD v1.0을 프로젝트 안에 보존하기 위한 구현 기준 문서다.

## 1. Product

JARGEMA는 노트북, iPad, 휴대폰 등 카메라가 있는 브라우저에서 얼굴을 실시간 분석하여 졸음 징후를 감지하고, 사용자가 명시적으로 동의한 경우 스냅샷을 공개 또는 클래스 피드에 업로드하는 졸음 감지 및 사회적 각성 서비스다.

핵심 기능:

- MediaPipe Face Mesh 기반 웹캠 얼굴 분석
- EAR, PERCLOS, 깜빡임, 하품, 머리 자세 근사값 기반 JDS 점수화
- 점수별 화면/소리 경고
- 자동 업로드 기본 OFF
- 가입/로그인, 클래스 방 생성, 코드 참가, 클래스 라이브 보드
- 공개 피드와 반응 기능
- Ollama는 선택 기능이며 실패 시 템플릿 캡션 사용

## 2. JDS Algorithm

- EAR: 왼쪽 눈 `33, 160, 158, 133, 153, 144`, 오른쪽 눈 `362, 385, 387, 263, 373, 380`
- 눈 감김 기준: `EAR < 0.20`
- PERCLOS: 최근 30초 중 눈 감김 프레임 비율
- MAR: `61, 185, 40, 39, 291, 375, 321, 405`
- 하품 기준: `MAR > 0.6`이 1500ms 이상 지속
- 머리 자세는 브라우저 MVP에서 코/눈/입 랜드마크 상대 위치 기반으로 근사

JDS 점수:

- PERCLOS 최대 35점
- 깜빡임 빈도 최대 20점
- 깜빡임 지속시간 최대 15점
- 하품 최대 15점
- 고개 자세 최대 10점
- 연속 눈 감김 최대 5점

등급:

- `0-19`: AWAKE, `#00FF88`
- `20-39`: DROWSY_LOW, `#FFD700`
- `40-59`: DROWSY_MED, `#FF8C00`
- `60-79`: DROWSY_HIGH, `#FF4500`
- `80-100`: ASLEEP, `#FF0000`

## 3. MVP Architecture

- Next.js App Router 단일앱
- 브라우저 클라이언트에서 MediaPipe 실행
- API Routes로 인증, 클래스, 감지 이벤트, 스냅샷, 피드 제공
- Prisma schema는 Postgres 배포용으로 포함
- Vercel 임시배포는 폴링 기반 라이브 보드 사용

## 4. Privacy Defaults

- 스냅샷 자동 업로드 기본값은 OFF
- 얼굴 랜드마크 좌표는 서버로 전송하지 않음
- 스냅샷 공개 여부는 사용자가 켜야 함
- 클래스 피드와 전체 공개 피드를 분리

## 5. Deployment Variables

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="replace-with-at-least-32-chars"
NEXT_PUBLIC_OLLAMA_URL="http://localhost:11434"
STORAGE_PROVIDER="demo"
```

원본 PRD의 상세 알고리즘, API, UI 요구사항은 이 구현의 기준으로 반영되었다.
