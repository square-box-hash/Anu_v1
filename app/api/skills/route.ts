import { NextResponse } from "next/server";
import { listSkills, loadSkill, readSkillFile } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skills bundled with the app (skills/<slug>/SKILL.md). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug");
  const file = params.get("file");

  if (slug && file) {
    try {
      const body = await readSkillFile(slug, file);
      return NextResponse.json({ ok: true, body });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 200 },
      );
    }
  }

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
