import { promises as fs } from 'fs';
import path from 'path';

// ───────────────────────────────────────────────────────────────────────────
// Post registry — the SINGLE SOURCE OF TRUTH for "what posts exist".
//
// Everything (the compare search, the /post/[slug] page, the dashboard) reads
// from here, and the Add Post form writes here, so adding a post never means
// editing code.
//
// Persistence is deliberately isolated to the two functions below (readStore /
// writeStore). Today they use a local JSON file — perfect for local/dev and a
// single self-hosted server. To scale to a serverless deploy or a real backend,
// swap ONLY these two to point at Google Sheets (a "Posts" index tab) or a
// database (e.g. Supabase); nothing else in the app needs to change.
// ───────────────────────────────────────────────────────────────────────────

const STORE_PATH = path.join(process.cwd(), 'data', 'posts.json');

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStore(posts) {
  await fs.writeFile(STORE_PATH, JSON.stringify(posts, null, 2) + '\n', 'utf8');
}

// The detail-page URL for a post, organized by year/month to mirror the
// sidebar — e.g. { year: 2026, month: 'July', slug: 'poker2026' } ->
// "/2026/July/poker2026". Undated posts (no month) fall back to the flat route.
export function postHref(post) {
  if (post?.year && post?.month) {
    return `/${post.year}/${encodeURIComponent(post.month)}/${post.slug}`;
  }
  return `/post/${post?.slug}`;
}

// Title -> URL-safe slug ("Meet the 2026 Interns" -> "meet_the_2026_interns").
export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export async function getAllPosts() {
  return readStore();
}

export async function getPostByCode(code) {
  const posts = await readStore();
  return posts.find((p) => p.code === code) || null;
}

export async function getPostBySlug(slug) {
  const posts = await readStore();
  return posts.find((p) => p.slug === slug) || null;
}

// Append a new post. Generates a unique code/slug from the title, records the
// form-entered fields, and returns the created entry (so the caller can route
// straight to its new page).
export async function addPost(input) {
  const posts = await readStore();
  const base = slugify(input.title) || 'post';
  let slug = base;
  let n = 2;
  const taken = new Set(posts.map((p) => p.slug));
  while (taken.has(slug)) slug = `${base}_${n++}`;

  const posted = input.datePosted ? new Date(`${input.datePosted}T00:00:00`) : null;
  const entry = {
    code: slug,
    slug,
    title: input.title,
    month: posted ? posted.toLocaleDateString('en-US', { month: 'long' }) : (input.month || ''),
    year: posted ? posted.getFullYear() : (input.year || new Date().getFullYear()),
    datePosted: input.datePosted || null,
    link: (input.link || '').trim() || null,
    sheetTab: (input.sheetTab || '').trim() || null,
    createdAt: input.createdAt || null,
  };

  posts.push(entry);
  await writeStore(posts);
  return entry;
}

// Point a post at its Google Sheet tab (used after the tab is auto-created).
export async function setPostSheetTab(slug, sheetTab) {
  const posts = await readStore();
  const p = posts.find((x) => x.slug === slug);
  if (!p) return;
  p.sheetTab = sheetTab;
  await writeStore(posts);
}
