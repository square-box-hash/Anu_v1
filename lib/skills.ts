import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@google/genai";
import type { FunctionDeclaration } from "@google/genai";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export interface SkillMeta {
  slug: string;
  name: string;
  description: string;
  files: string[];
}

export interface ToolOutcome {
  ok: boolean;
  content: string;
  error?: string;
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw.trim() };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) data[key] = value;
  }
  return { data, body: raw.slice(match[0].length).trim() };
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), relative)));
    else if (entry.name !== "SKILL.md") files.push(relative);
  }
  return files;
}

export async function listSkills(): Promise<SkillMeta[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(SKILLS_DIR, entry.name);
    try {
      const raw = await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
      const { data } = parseFrontmatter(raw);
      skills.push({
        slug: entry.name,
        name: data.name || entry.name,
        description: data.description || "",
        files: await listFiles(dir),
      });
    } catch {
      /* folder without a SKILL.md — skip */
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveInside(base: string, relative: string): string | null {
  const target = path.resolve(base, relative);
  const root = path.resolve(base);
  return target === root || target.startsWith(`${root}${path.sep}`) ? target : null;
}

export async function loadSkill(slug: string): Promise<string> {
  const dir = resolveInside(SKILLS_DIR, slug);
  if (!dir) throw new Error("Invalid skill name");
  const raw = await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
  return parseFrontmatter(raw).body;
}

export async function readSkillFile(slug: string, relative: string): Promise<string> {
  const dir = resolveInside(SKILLS_DIR, slug);
  if (!dir) throw new Error("Invalid skill name");
  const file = resolveInside(dir, relative);
  if (!file) throw new Error("Invalid path");
  return fs.readFile(file, "utf8");
}

/** Built-in tools the model can call to discover and load skills on demand. */
export const SKILL_TOOL_NAMES = ["list_skills", "load_skill", "read_skill_file"] as const;
export type SkillToolName = (typeof SKILL_TOOL_NAMES)[number];

export const SKILL_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_skills",
    description:
      "List the skills available in this workspace with their one-line descriptions. Call this when a task might match a skill.",
  },
  {
    name: "load_skill",
    description:
      "Load the full instructions of a skill by its name. Use it before doing work the skill covers.",
    parameters: {
      type: Type.OBJECT,
      properties: { name: { type: Type.STRING, description: "Skill name, as returned by list_skills" } },
      required: ["name"],
    },
  },
  {
    name: "read_skill_file",
    description:
      "Read a supporting file that belongs to a skill, such as references/checklist.md.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        skill: { type: Type.STRING, description: "Skill name" },
        path: { type: Type.STRING, description: "File path inside the skill, e.g. references/checklist.md" },
      },
      required: ["skill", "path"],
    },
  },
];

export async function runSkillTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    if (name === "list_skills") {
      const skills = await listSkills();
      if (!skills.length) return { ok: true, content: "No skills are installed in this workspace." };
      return {
        ok: true,
        content: skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n"),
      };
    }

    if (name === "load_skill") {
      const slug = String(args.name ?? "").trim();
      const skills = await listSkills();
      const match = skills.find((skill) => skill.slug === slug || skill.name.toLowerCase() === slug.toLowerCase());
      if (!match) return { ok: false, content: "", error: `Unknown skill "${slug}".` };
      const body = await loadSkill(match.slug);
      const fileList = match.files.length ? `\n\nSupporting files: ${match.files.join(", ")}` : "";
      return { ok: true, content: `${body}${fileList}` };
    }

    if (name === "read_skill_file") {
      const slug = String(args.skill ?? "").trim();
      const relative = String(args.path ?? "").trim();
      const skills = await listSkills();
      const match = skills.find((skill) => skill.slug === slug || skill.name.toLowerCase() === slug.toLowerCase());
      if (!match) return { ok: false, content: "", error: `Unknown skill "${slug}".` };
      const content = await readSkillFile(match.slug, relative);
      return { ok: true, content };
    }

    return { ok: false, content: "", error: `Unknown skill tool "${name}".` };
  } catch (error) {
    return { ok: false, content: "", error: error instanceof Error ? error.message : String(error) };
  }
}
