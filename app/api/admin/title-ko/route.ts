// 한국어 제목 보정 — 운영자(개발자) 전용 내부 경로. T14
//
// ⚠ 인증이 없다. MVP 단계의 내부 도구이며, 소프트 런칭(T30) 전에
//   접근 제한을 붙이거나 경로를 제거해야 한다. works 쓰기 소유는 A(계약 §1).

import { NextResponse } from "next/server";
import { listMissingTitleKo, setTitleKo } from "@/lib/catalog/title-ko";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

function envGuard() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length === 0) return null;
  return NextResponse.json(
    { error: `환경변수가 비어 있습니다: ${missing.join(", ")}`, missingEnv: missing },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  const blocked = envGuard();
  if (blocked) return blocked;

  const mediaType = new URL(request.url).searchParams.get("media") ?? undefined;
  try {
    const works = await listMissingTitleKo(mediaType || undefined);
    return NextResponse.json({ works });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const blocked = envGuard();
  if (blocked) return blocked;

  let body: { workId?: string; titleKo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다" }, { status: 400 });
  }
  if (!body.workId || typeof body.titleKo !== "string") {
    return NextResponse.json({ error: "workId 와 titleKo 가 필요합니다" }, { status: 400 });
  }

  try {
    return NextResponse.json({ work: await setTitleKo(body.workId, body.titleKo) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
