# EduTech HelpMe - AI 기반 학습 지식 그래프

메타인지를 활용한 개인화 학습 플랫폼입니다. AI가 학습 내용을 분석하고, 지식 그래프로 시각화하며, Supabase를 통해 모든 데이터를 안전하게 저장합니다.

## 주요 기능

- **AI 학습 분석** - Gemini API로 학습 내용 자동 분석
- **3D 지식 그래프** - Three.js 기반 인터랙티브 시각화
- **Supabase 연동** - 실시간 데이터 저장 및 동기화
- **노트 자동 저장** - 3초마다 자동으로 저장
- **AI 챗봇** - 학습 도우미 챗봇
- **메타인지 평가** - 학습 이해도 자가 진단

## 빠른 시작

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정

템플릿을 복사한 뒤 값을 채우세요:

```bash
cp .env.example .env
```

| 변수 | 용도 |
|---|---|
| `VITE_GEMINI_API_KEY` | 학습 내용 분석 · 퀴즈 · 메타인지 평가 |
| `GEMINI_API_KEY` | 챗봇 (`vite.config.ts`에서 주입) |
| `VITE_GPT_API_KEY` | 음성 대화 모달 (GPT-4o · TTS) |
| `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` | 로그인 · 데이터 저장 |

**Supabase 설정 방법:**
1. [Supabase](https://supabase.com) 프로젝트 생성
2. Settings > API에서 URL과 anon key 복사
3. SQL Editor에서 앱이 쓰는 테이블 생성: `nodes`, `links`, `node_contents`, `chat_messages`, `meta_results` (컬럼은 `src/services/supabaseService.ts` 참고)

### 3. 개발 서버 실행
```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 (`vite.config.ts`의 `server.port`)

## 문서

- **[.env.example](./.env.example)** - 환경 변수 템플릿

## 기술 스택

- **Frontend**: React 19, TypeScript, Vite
- **3D Graphics**: Three.js
- **AI**: Google Gemini API
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## 프로젝트 구조

```
eduTech/
├── src/
│   ├── components/       # React 컴포넌트
│   │   ├── NodePage.tsx  # 노트 편집 페이지 (Supabase 연동)
│   │   ├── ThreeGraph.tsx # 3D 그래프 시각화
│   │   └── Chatbot.tsx   # AI 챗봇
│   ├── services/         # API 서비스 레이어
│   │   ├── supabaseClient.ts  # Supabase 클라이언트
│   │   └── supabaseService.ts # 데이터베이스 작업 함수
│   ├── hooks/            # Custom React Hooks
│   │   ├── useAuth.ts    # 인증 관리
│   │   └── useGraphData.ts # 그래프 데이터 관리
│   ├── screens/          # 화면 컴포넌트
│   └── utils/            # 유틸리티 함수
├── .env.example          # 환경 변수 템플릿
└── .env                  # 실제 환경 변수 (gitignore)
```

## 주요 기능 상세

### 1. 노드 페이지 자동 저장
- 편집 모드에서 3초마다 자동 저장
- 저장 상태 실시간 표시 (저장 중, 성공, 에러)
- Supabase에 안전하게 저장

### 2. 지식 그래프
- 3D 인터랙티브 시각화
- 노드 클릭으로 상세 페이지 이동
- 카테고리별 색상 구분
- 학습 상태 표시 (known, fuzzy, unknown, new)

### 3. AI 분석
- 학습 내용 자동 분석
- 개념 추출 및 분류
- 선수 지식 파악
- 맞춤형 퀴즈 생성

## 보안

- Row Level Security (RLS) 적용
- 사용자별 데이터 격리
- 환경 변수로 API 키 관리
- `.env` 파일 gitignore 처리

## 문제 해결

### "로그인이 필요합니다" 에러
익명 로그인을 먼저 실행하세요:
```typescript
import { signInAnonymously } from './services/supabaseService';
await signInAnonymously();
```

### Supabase 연결 오류
1. `.env` 파일의 URL과 키 확인
2. 개발 서버 재시작
3. Supabase 대시보드에서 프로젝트 상태 확인

## 라이선스

MIT License

## 기여

이슈와 PR은 언제나 환영합니다!
