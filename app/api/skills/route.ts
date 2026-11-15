import { NextResponse } from "next/server";
import { listSkills, loadSkill } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skills bundled with the app (skills/<slug>/SKILL.md). */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");

  if (slug) {
    try {
      const body = await loadSkill(slug);
      return NextResponse.json({ ok: true, body });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 200 },
      );
    }
  }

  try {
    const skills = await listSkills();
    return NextResponse.json({ ok: true, skills });
  } catch (error) {
    return NextResponse.json(
      { ok: false, skills: [], error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
    );
  }
}
