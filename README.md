# JARGEMA

**졸면 전시된다**

JARGEMA는 웹캠으로 얼굴을 실시간 분석해 졸음 징후를 JDS(JARGEMA Drowsiness Score)로 표시하고, 사용자가 명시적으로 동의한 경우 스냅샷을 공개 피드에 올리는 웹앱입니다. 노트북, iPad, 휴대폰 브라우저에서 카메라 권한만 있으면 동작하도록 설계했습니다.

## 구현 범위

- Next.js App Router 단일앱
- MediaPipe Face Mesh 기반 브라우저 감지
- EAR, PERCLOS, 깜빡임, MAR, 머리 자세 근사값 기반 JDS
- 반응형 대시보드, 공개 피드, 설정
- 가입/로그인 쿠키 세션
- Kahoot 스타일 클래스 방 코드 생성/참가/라이브보드
- 자동 스냅샷 업로드 기본 OFF
- Prisma Postgres 스키마 포함

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 열고 카메라 권한을 허용하세요.

## 배포 메모

현재 MVP API는 Vercel preview에서 바로 확인할 수 있도록 메모리 저장소를 사용합니다. 서버리스 인스턴스가 재시작되면 계정, 클래스, 피드 데이터가 초기화됩니다. 영구 저장은 `prisma/schema.prisma`를 기준으로 Postgres 저장소 계층을 연결하면 됩니다.

필수 환경변수:

```env
JWT_SECRET="replace-with-at-least-32-chars"
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_OLLAMA_URL="http://localhost:11434"
STORAGE_PROVIDER="demo"
```

## PRD

원문 요구사항 기준 문서는 [docs/PRD.md](docs/PRD.md)에 저장했습니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
