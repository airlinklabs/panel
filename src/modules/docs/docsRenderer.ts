import { marked } from "marked";
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const DOCS_DIR = process.env.DOCS_DIR || join(process.cwd(), "docs");

export interface DocPage {
  slug: string;
  title: string;
  content: string;
  html: string;
  section: string;
  order: number;
}

export interface DocSection {
  name: string;
  slug: string;
  pages: { slug: string; title: string; order: number }[];
}

// Parse frontmatter-like title from first # heading
function extractTitle(md: string): string {
  const match = md.match(/^#\s+(.+)/m);
  return match?.[1]?.trim() ?? "Untitled";
}

// Convert filename to slug
function fileToSlug(file: string): string {
  return file.replace(/\.md$/, "").replace(/_/g, "-");
}

// Get section from path relative to docs dir
function getSection(filePath: string): string {
  const rel = relative(DOCS_DIR, filePath);
  const parts = rel.split("/");
  return parts.length > 1 ? (parts[0] ?? "root") : "root";
}

// Read all docs recursively
export async function loadDocs(): Promise<DocPage[]> {
  const pages: DocPage[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        const content = await readFile(fullPath, "utf-8");
        const slug = fileToSlug(entry.name);
        const section = getSection(fullPath);
        pages.push({
          slug: section === "root" ? slug : `${section}/${slug}`,
          title: extractTitle(content),
          content,
          html: (await marked.parse(content)) as string,
          section,
          order: 0,
        });
      }
    }
  }

  await walk(DOCS_DIR);
  return pages;
}

// Get organized sections
export async function getDocSections(): Promise<DocSection[]> {
  const pages = await loadDocs();
  const sectionMap = new Map<string, DocSection>();

  for (const page of pages) {
    if (!sectionMap.has(page.section)) {
      sectionMap.set(page.section, {
        name: page.section === "root" ? "Overview" : page.section,
        slug: page.section,
        pages: [],
      });
    }
    sectionMap.get(page.section)!.pages.push({
      slug: page.slug,
      title: page.title,
      order: page.order,
    });
  }

  return Array.from(sectionMap.values());
}

// Extract headings for TOC
export function extractHeadings(
  html: string,
): { id: string; text: string; level: number }[] {
  const headings: { id: string; text: string; level: number }[] = [];
  const regex = /<h([2-4])\s+id="([^"]+)"[^>]*>(.*?)<\/h\1>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1] ?? "2"),
      id: match[2] ?? "",
      text: (match[3] ?? "").replace(/<[^>]+>/g, ""),
    });
  }
  return headings;
}
