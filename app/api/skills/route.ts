import { NextResponse } from "next/server";
import { listSkills } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skills bundled with the app (skills/<slug>/SKILL.md). */
export async function GET() {
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
