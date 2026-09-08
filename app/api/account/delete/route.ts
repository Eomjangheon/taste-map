import { NextRequest, NextResponse } from "next/server";
import { hasAdminCredentials, supabaseAdmin } from "@/lib/supabase-admin";

// 계정 삭제 = 데이터 완전 삭제 (T45, §6.4 신뢰 요건)
// 유저 삭제는 관리자 키가 필요해 서버 라우트로만 수행한다.
// auth.users 행이 지워지면 records·user_badges는 FK cascade로 함께 삭제되고(0002),
// events.user_id는 null로 풀린다(익명 통계만 남음).
// 오류 형태는 계약 §4 규약(error / missingEnv)을 따른다.

export async function POST(req: NextRequest) {
  if (!hasAdminCredentials()) {
    return NextResponse.json(
      { error: "서버에 삭제 권한 키가 없습니다", missingEnv: ["SUPABASE_SECRET_KEY"] },
      { status: 503 }
    );
  }

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) {
    return NextResponse.json({ error: "세션이 유효하지 않습니다" }, { status: 401 });
  }

  const { error: delError } = await admin.auth.admin.deleteUser(data.user.id);
  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
