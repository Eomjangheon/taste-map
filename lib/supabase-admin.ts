// service_role 클라이언트 — **서버 전용** (AGENTS.md 금지 규칙 5).
// works 는 RLS 가 켜져 있고 읽기 정책만 있으므로(마이그레이션 0001), 카탈로그 적재는 이 클라이언트로만 한다.
// NEXT_PUBLIC_ 접두사를 붙이지 않는다 — 붙는 순간 클라이언트 번들에 노출된다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function hasAdminCredentials() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin 은 서버에서만 사용한다 (AGENTS.md 금지 규칙 5)");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다");
  }
  if (!client) {
    client = createClient(url, secretKey, { auth: { persistSession: false } });
  }
  return client;
}
