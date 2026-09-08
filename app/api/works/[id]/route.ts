// 작품 상세 API — T13. 계약은 docs/contract.md §4.
//
//   GET /api/works/{id}
//
// 상위·하위 작품을 함께 준다. §3.1 상 시즌·DLC 는 별개 작품이고 parent_work_id 는 그룹핑 전용이다.

import { NextResponse } from "next/server";
import { getWorkDetail } from "@/lib/catalog/search";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter(
    (name) => !process.env[name]
  );
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `환경변수가 비어 있습니다: ${missing.join(", ")}`, missingEnv: missing },
      { status: 503 }
    );
  }

  try {
    const work = await getWorkDetail(id);
    if (!work) return NextResponse.json({ error: "작품을 찾을 수 없습니다" }, { status: 404 });
    return NextResponse.json({ work });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
