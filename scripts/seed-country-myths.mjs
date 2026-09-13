import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { slugify } from "./myth-catalog.mjs";
import { countryMyths } from "./country-myths.mjs";

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
    throw new Error(`Supabase ${path} failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

const categories = await rest("categories?select=id,slug");
const categoryIds = new Map(categories.map((row) => [row.slug, row.id]));
const existing = await rest("myths?select=slug&limit=2000");
const have = new Set((existing ?? []).map((row) => row.slug));

const rows = [];
for (const item of countryMyths) {
  const slug = slugify(item.title);
  if (!slug || have.has(slug)) continue;
  const categoryId = categoryIds.get(item.category);
  if (!categoryId) throw new Error(`Missing category ${item.category}`);
  have.add(slug);
  rows.push({
    title: item.title,
    slug,
    verdict: item.verdict,
    explanation: item.explanation,
    category_id: categoryId,
    status: "APPROVED",
    country_code: item.country,
  });
}

console.log(`Inserting ${rows.length} country-targeted myths.`);

const chunkSize = 50;
for (let index = 0; index < rows.length; index += chunkSize) {
  const chunk = rows.slice(index, index + chunkSize);
  await rest("myths", {
    method: "POST",
    prefer: "return=minimal,resolution=ignore-duplicates",
    body: JSON.stringify(chunk),
  });
  console.log(`Inserted ${Math.min(index + chunk.length, rows.length)}/${rows.length}`);
}

const check = await rest("myths?select=country_code&country_code=not.is.null&limit=1");
console.log(`Country column sample: ${check?.[0]?.country_code ?? "none yet"}`);
