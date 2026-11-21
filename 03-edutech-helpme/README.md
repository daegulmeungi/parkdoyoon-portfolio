# EduTech HelpMe — AI 기반 메타인지 학습 플랫폼
### 배운 내용을 3D 지식 그래프로 시각화하고, "설명할 수 있는지"로 진짜 이해도를 확인하는 서비스

| 항목 | 내용 |
|---|---|
| **기간** | 2025.11.20 ~ 2025.11.21 (에듀테크 해커톤) |
| **형태** | 팀 프로젝트 |
| **담당** | 온보딩 플로우 · Gemini API 통신 · **음성 기반 메타인지 기능** |
| **기술** | React 19 · TypeScript · Vite · Three.js · Tailwind CSS · Gemini API · OpenAI (GPT-4o · TTS) · Web Speech API · Supabase |

---

## 30초 요약

| 구분 | 내용 |
|---|---|
| **문제** | 노트 앱은 내용을 *기록*할 뿐, 내가 정말 이해했는지 *점검*해 주지 않습니다 |
| **해결** | 학습 내용을 **3D 지식 그래프**로 보여주고, 개념을 **직접 설명하게 해** AI가 이해도를 평가하는 메타인지 학습 서비스 |
| **내 역할** | **음성 기반 메타인지 기능**(STT · GPT-4o · TTS 음성 대화), 개인화 온보딩, Gemini API 연동 |
| **포인트** | "타이핑보다 말로 설명할 때 이해도가 더 솔직하게 드러난다"는 아이디어를 음성 대화 모달로 구현 (해커톤 2일) |
| **코드로 확인** | [`VoiceChatModal.tsx`](eduTech/src/components/VoiceChatModal.tsx) 음성 대화 · [`MetaCheckScreen.tsx`](eduTech/src/screens/MetaCheckScreen.tsx) 음성 입력 · [`OnboardingFlow.tsx`](eduTech/src/components/OnboardingFlow.tsx) 온보딩 |

## 1. 프로젝트 배경

공부를 하다 보면 <b>"안다고 생각하는 것"과 "실제로 아는 것"</b>이 다를 때가 많습니다.
학습 효과를 높이려면 내가 무엇을 알고 무엇을 모르는지 스스로 파악하는 **메타인지**가 중요합니다.
하지만 기존 노트 앱이나 학습 도구는 내용을 *기록*하는 데 그치고, 이해도를 *점검*해주지는 않습니다.

## 2. 목표

- 학습 내용을 AI가 분석해 핵심 개념을 뽑고, 개념 간 관계를 **3D 지식 그래프**로 시각화
- 개념마다 **이해 완료 / 애매함 / 모름**을 색으로 표시해 학습 상태를 한눈에 파악
- "**설명할 수 있어야 진짜 아는 것**"이라는 원칙으로, 사용자가 개념을 직접 설명하면 AI가 평가하고 피드백하는 메타인지 점검
- 퀴즈와 AI 챗봇으로 부족한 개념을 보완하는 학습 루프 제공

## 3. 서비스 흐름

```
 로그인 ─▶ 온보딩(사용 목적·관심 분야 선택) ─▶ 학습 내용 입력
                                                   │  Gemini 분석
                                                   ▼
          퀴즈 · 챗봇 ◀── 메타인지 점검(텍스트/음성 설명) ◀── 3D 지식 그래프
```

## 4. 담당 역할 및 구현 내용

### ① 음성 기반 메타인지 기능 — 메인 기여
> 타이핑보다 **말로 설명할 때** 이해도가 더 솔직하게 드러난다는 점에 착안했습니다.

- **음성 입력(STT)**: Web Speech API(`webkitSpeechRecognition`)로 메타인지 점검 화면에 음성 녹음 버튼을 추가하고, 실시간 받아쓰기 결과를 설명 입력란에 반영했습니다.
- **음성 대화 모달**: GPT-4o와 **OpenAI TTS**를 연동해 AI와 음성으로 질의응답하는 `VoiceChatModal`을 만들었습니다(329줄). 모델과 목소리 선택, 재생 중 다른 음성 중단, 오디오 리소스 해제(`revokeObjectURL`)까지 처리했습니다.
- 관련 파일: [`VoiceChatModal.tsx`](eduTech/src/components/VoiceChatModal.tsx), [`MetaCheckScreen.tsx`](eduTech/src/screens/MetaCheckScreen.tsx)

### ② 개인화 온보딩 플로우
- 2단계 온보딩을 구현했습니다. 사용 목적(업무용/개인용/학습용)을 고르면 직무 분야, 관심사, 학습 과정을 선택하게 했습니다(310줄).
- 관련 파일: [`OnboardingFlow.tsx`](eduTech/src/components/OnboardingFlow.tsx)

### ③ Gemini API 통신
- 학습 내용 분석과 개념 추출을 위한 Gemini API 연동 로직을 구현했습니다. 앱 화면 흐름(`App.tsx`)에도 연결했습니다.

> 3D 그래프, Supabase 인증·저장, 노드/폴더 관리 등 나머지 기능은 팀원이 담당했습니다.

## 5. 한계 및 개선 방향

- **API 키 보안**: 해커톤 시연을 위해 OpenAI API를 브라우저에서 직접 호출했습니다. 실제 서비스라면 <b>백엔드 프록시(서버리스 함수 등)</b>를 거쳐 키가 노출되지 않게 해야 합니다.
- **브라우저 호환성**: `webkitSpeechRecognition`은 Chromium 계열 브라우저에서만 동작합니다. Whisper 같은 서버 측 STT로 바꾸면 모든 환경을 지원할 수 있습니다.

## 6. 실행 방법

```bash
cd eduTech
npm install
cp .env.example .env   # Gemini · OpenAI · Supabase 키 입력
npm run dev            # http://localhost:3000
```

> 자세한 기술 문서(환경 변수, 폴더 구조, Supabase 설정)는 [`eduTech/README.md`](eduTech/README.md)를 참고하세요.
