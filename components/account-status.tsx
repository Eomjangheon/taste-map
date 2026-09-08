"use client";

// 계정 상태 위젯 (T25) — 로그인 전: /auth 링크, 로그인 후: 이메일 + 로그아웃
// /records·/library 상단에서 공용으로 쓴다. 세션은 supabase-js가 localStorage로 유지.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** 현재 세션 이메일 훅 — null = 확인 전, "" = 비로그인 (T45에서 문구 분기용으로 분리) */
export function useSessionEmail(): string | null {
  const [email, setEmail] = useState<string | null>(supabase ? null : "");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setEmail(data.session?.user.email ?? ""));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? "");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return email;
}

export default function AccountStatus() {
  const email = useSessionEmail();

  if (email === null || !supabase) return null;

  if (email === "") {
    return (
      <a
        href="/auth"
        className="text-xs font-medium text-gray-500 hover:text-blue-600"
        data-testid="login-link"
      >
        로그인
      </a>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs text-gray-500">
      <span data-testid="account-email">{email}</span>
      <button
        onClick={() => supabase!.auth.signOut()}
        className="text-gray-400 underline hover:text-red-600"
        data-testid="logout-button"
      >
        로그아웃
      </button>
    </span>
  );
}
