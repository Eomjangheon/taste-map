import { createClient } from "@supabase/supabase-js";

// 키는 환경변수로만 주입한다 (AGENTS.md 금지 규칙 2)
// 로컬·프리뷰·CI = dev 프로젝트 키 / 프로덕션 = prod 프로젝트 키 (Vercel 환경별 설정)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
