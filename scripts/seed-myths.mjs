import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildCatalog } from "./myth-catalog.mjs";

function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cut = trimmed.indexOf("=");
    if (cut === -1) continue;
    const key = trimmed.slice(0, cut);
    const value = trimmed.slice(cut + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
}

async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "return=representation",
      ...options.headers,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${path} failed: ${response.status} ${text.slice(0, 400)}`);
  }

  return text ? JSON.parse(text) : null;
}

const categories = await rest("categories?select=id,slug");
const categoryIds = new Map(categories.map((row) => [row.slug, row.id]));

for (const slug of ["science", "health", "history", "technology", "culture"]) {
  if (!categoryIds.has(slug)) {
    throw new Error(`Missing category ${slug}`);
  }
}

const existing = await rest("myths?select=slug&limit=2000");
const have = new Set((existing ?? []).map((row) => row.slug));
const catalog = buildCatalog();
const rows = catalog
  .filter((item) => !have.has(item.slug))
  .map((item) => ({
    title: item.title,
    slug: item.slug,
    verdict: item.verdict,
    explanation: item.explanation,
    category_id: categoryIds.get(item.category),
    status: "APPROVED",
  }));

console.log(`Catalog ${catalog.length}. Already stored ${have.size}. Inserting ${rows.length}.`);

const chunkSize = 80;
let inserted = 0;

for (let index = 0; index < rows.length; index += chunkSize) {
  const chunk = rows.slice(index, index + chunkSize);
  const saved = await rest("myths", {
    method: "POST",
    prefer: "return=representation,resolution=ignore-duplicates",
    body: JSON.stringify(chunk),
  });
  inserted += saved?.length ?? chunk.length;
  console.log(`Inserted chunk ${Math.min(index + chunk.length, rows.length)}/${rows.length}`);
}

const totals = await rest("myths?select=status&limit=2000");
const approved = (totals ?? []).filter((row) => row.status === "APPROVED").length;
console.log(`Done. Approved myths now: ${approved}. New this run: ${inserted}.`);
