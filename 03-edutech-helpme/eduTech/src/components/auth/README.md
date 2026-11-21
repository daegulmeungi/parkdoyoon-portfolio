# Auth Components

인증 관련 모듈화된 컴포넌트들입니다.

## 구조

```
auth/
├── index.ts              # Barrel export
├── AuthButton.tsx        # 재사용 가능한 버튼
├── AuthForm.tsx          # 로그인/회원가입 폼
├── AuthInput.tsx         # 재사용 가능한 입력 필드
├── AuthMessage.tsx       # 에러/성공 메시지
└── AuthTabs.tsx          # 로그인/회원가입 탭 전환
```

## 컴포넌트

### AuthButton
재사용 가능한 버튼 컴포넌트

**Props:**
- `variant`: 'primary' | 'secondary'
- `loading`: boolean
- `disabled`: boolean
- `icon`: LucideIcon (optional)
- `children`: ReactNode

**사용 예시:**
```tsx
<AuthButton variant="primary" loading={isLoading} icon={ArrowRight}>
  로그인
</AuthButton>
```

### AuthInput
아이콘이 포함된 입력 필드 컴포넌트

**Props:**
- `label`: string
- `type`: string
- `value`: string
- `onChange`: (value: string) => void
- `placeholder`: string
- `icon`: LucideIcon
- `disabled`: boolean (optional)

**사용 예시:**
```tsx
<AuthInput
  label="이메일"
  type="email"
  value={email}
  onChange={setEmail}
  placeholder="your@email.com"
  icon={Mail}
/>
```

### AuthMessage
에러/성공 메시지 표시 컴포넌트

**Props:**
- `type`: 'error' | 'success'
- `message`: string

**사용 예시:**
```tsx
<AuthMessage type="error" message="로그인에 실패했습니다." />
```

### AuthForm
로그인/회원가입 폼 컴포넌트

**Props:**
- `isSignUp`: boolean
- `onSubmit`: (email: string, password: string) => Promise<{success: boolean, error?: string}>
- `loading`: boolean (optional)

**사용 예시:**
```tsx
<AuthForm 
  isSignUp={false}
  onSubmit={handleLogin}
  loading={isLoading}
/>
```

### AuthTabs
로그인/회원가입 탭 전환 컴포넌트

**Props:**
- `isSignUp`: boolean
- `onToggle`: (isSignUp: boolean) => void
- `disabled`: boolean (optional)

**사용 예시:**
```tsx
<AuthTabs 
  isSignUp={isSignUp}
  onToggle={setIsSignUp}
/>
```

## 사용 방법

```tsx
import { AuthTabs, AuthForm, AuthButton } from '@/components/auth';

function MyAuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);

  return (
    <div>
      <AuthTabs isSignUp={isSignUp} onToggle={setIsSignUp} />
      <AuthForm isSignUp={isSignUp} onSubmit={handleSubmit} />
      <AuthButton variant="secondary" icon={User}>
        익명으로 시작하기
      </AuthButton>
    </div>
  );
}
```

## 디자인 시스템

모든 컴포넌트는 일관된 디자인 시스템을 사용합니다:

- **색상**: Indigo/Purple 그라디언트
- **배경**: Slate 계열
- **테두리**: Rounded-xl (12px)
- **전환**: Smooth transitions
- **상태**: Hover, Focus, Disabled

## 확장 가능성

각 컴포넌트는 독립적으로 사용 가능하며, 다른 화면에서도 재사용할 수 있습니다.
