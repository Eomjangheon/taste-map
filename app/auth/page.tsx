"use client";

// T25: 가입·로그인 (§6.1 '계정 없이 시작' 2/3)
// 인증은 직접 만들지 않는다 — Supabase Auth(관리형)의 이메일+비밀번호만 사용.
// 성공 시 identify()로 게스트 익명 ID를 계정과 병합한다 (T10 규약).
// 로컬 기록의 서버 업로드(동기화)는 T45 — 이 이슈 범위가 아님.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { identify } from "@/lib/analytics";

type Mode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setSessionEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <main className="mx-auto w-full max-w-sm p-6 sm:p-8">
        <p className="text-sm text-red-600">
          환경변수가 설정되지 않아 로그인을 사용할 수 없습니다.
        </p>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase!.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(
            error.message === "Invalid login credentials"
              ? "이메일 또는 비밀번호가 맞지 않아요."
              : error.message
          );
          return;
        }
        identify(data.user.id); // 게스트 이벤트를 계정과 병합 (T10)
        router.push("/records");
      } else {
        const { data, error } = await supabase!.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) {
          setError(
            error.message.includes("already registered")
              ? "이미 가입된 이메일이에요 — 로그인해 주세요."
              : error.message
          );
          return;
        }
        if (data.session) {
          // 이메일 확인이 꺼진 환경 — 바로 로그인됨
          identify(data.user!.id);
          router.push("/records");
        } else {
          // 이메일 확인이 켜진 환경 — 메일의 링크를 눌러야 완료
          setNotice("확인 메일을 보냈어요. 메일함에서 링크를 눌러 완료해 주세요.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-sm p-6 sm:p-8">
      <h1 className="text-2xl font-bold">
        {sessionEmail ? "내 계정" : mode === "login" ? "로그인" : "가입하기"}
      </h1>

      {sessionEmail ? (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-200 p-4 text-sm">
          <p>
            <span data-testid="session-email" className="font-medium">
              {sessionEmail}
            </span>
            <span className="text-gray-500"> 로 로그인돼 있어요.</span>
          </p>
          <p className="text-xs text-gray-400">
            로컬 기록의 서버 보관(동기화)은 준비 중이에요 — 지금은 이
            브라우저에만 저장됩니다.
          </p>
          <div className="flex gap-3">
            <a href="/records" className="text-blue-600">
              내 기록으로 →
            </a>
            <button
              onClick={() => supabase!.auth.signOut()}
              className="text-gray-400 underline hover:text-red-600"
              data-testid="logout-button"
            >
              로그아웃
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-gray-500">
            가입하면 기록을 서버에 안전하게 보관할 준비가 돼요. (기록 업로드는
            곧 열립니다)
          </p>

          <div className="mt-5 flex gap-1 self-start rounded-lg bg-gray-100 p-1">
            {(
              [
                ["login", "로그인"],
                ["signup", "가입"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                data-testid={`auth-tab-${m}`}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  mode === m ? "bg-white shadow-sm" : "text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              autoComplete="email"
              data-testid="auth-email"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 (8자 이상)"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              data-testid="auth-password"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={busy}
              data-testid="auth-submit"
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-600" data-testid="auth-error">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-3 text-sm text-green-700" data-testid="auth-notice">
              {notice}
            </p>
          )}

          <p className="mt-6 text-xs text-gray-400">
            계정 없이도 계속 쓸 수 있어요 —{" "}
            <a href="/records" className="text-blue-600">
              그냥 기록하러 가기 →
            </a>
          </p>
        </>
      )}
    </main>
  );
}
