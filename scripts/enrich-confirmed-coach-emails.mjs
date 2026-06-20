import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const COACHES_PATH = path.join(ROOT, "server/data/coaches.json");
const SCHOOLS_PATH = path.join(ROOT, "server/data/schools.json");
const REPORT_DIR = "/tmp/recruitflow_email_enrichment";
const CACHE_DIR = path.join(REPORT_DIR, "pages");
const TODAY = new Date().toISOString().slice(0, 10);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SKIP_EMAIL_RE = /(privacy|tickets?|support|noreply|no-reply|webmaster|licensing|sales|info|athleticdirector|compliance|admissions?)@/i;

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const LIMIT_ARG = process.argv.find(arg => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : Infinity;

function decodeEntities(text) {
  return String(text || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeCfEmail(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4) return "";
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  }
  return out;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameVariants(name) {
  const normalized = normalizeName(name);
  const parts = normalized.split(" ").filter(Boolean);
  const variants = new Set([normalized]);
  if (parts.length >= 2) {
    variants.add(`${parts[0]} ${parts.at(-1)}`);
    if (parts.length >= 3) variants.add(`${parts[0]} ${parts[1]} ${parts.at(-1)}`);
  }
  return [...variants].filter(v => v.length >= 5);
}

function textForSearch(html) {
  const withCfEmails = String(html || "").replace(/data-cfemail=["']([0-9a-fA-F]+)["']/g, (_, hex) => decodeCfEmail(hex));
  return decodeEntities(withCfEmails)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function searchable(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._%+-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cleanEmail(email) {
  return String(email || "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/[.,;:)\]}>]+$/g, "")
    .toLowerCase();
}

function uniqueEmails(text) {
  return [...new Set((String(text || "").match(EMAIL_RE) || []).map(cleanEmail))]
    .filter(email => email && !SKIP_EMAIL_RE.test(email));
}

function emailLooksPersonalForCoach(email, coachName) {
  const local = cleanEmail(email).split("@")[0]?.replace(/[^a-z0-9]/g, "") || "";
  const parts = normalizeName(coachName)
    .split(" ")
    .filter(Boolean)
    .filter(part => !/^(jr|sr|ii|iii|iv|v)$/.test(part));
  if (parts.length < 2 || local.length < 3) return false;
  const first = parts[0];
  const rawLast = parts.at(-1);
  const middle = parts.slice(1, -1).map(part => part[0]).join("");
  const lastVariants = new Set([
    rawLast,
    rawLast.replace(/^o(?=[a-z]{4,})/, "")
  ].filter(Boolean));
  if (parts.length >= 2 && parts.at(-2) === "o") lastVariants.add(`o${rawLast}`);

  for (const last of lastVariants) {
    const directPatterns = new Set([
      last,
      `${first}${last}`,
      `${first[0]}${last}`,
      `${first}${last[0]}`,
      `${first[0]}${middle}${last}`,
      `${last}${first[0]}`
    ]);
    if (directPatterns.has(local)) return true;
    if (local.startsWith(last)) return true;
    if (local.startsWith(first[0]) && local.includes(last)) return true;
    if (local.startsWith(first) && local.includes(last)) return true;
  }
  return false;
}

function safeFilename(url) {
  return Buffer.from(url).toString("base64url").slice(0, 180);
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || "").matchAll(re)) {
    const href = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (!href) continue;
    const label = textForSearch(match[2]);
    links.push({ href, label });
  }
  return links;
}

async function fetchText(url) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${safeFilename(url)}.html`);
  try {
    return await fs.readFile(cachePath, "utf8");
  } catch {}

  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "RecruitFlow data verification (contact enrichment; official athletics pages)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  await fs.writeFile(cachePath, text);
  return text;
}

function findNamePositions(searchText, coachName) {
  const positions = [];
  for (const variant of nameVariants(coachName)) {
    let at = searchText.indexOf(variant);
    while (at !== -1) {
      positions.push({ at, variant });
      at = searchText.indexOf(variant, at + variant.length);
    }
  }
  return positions.sort((a, b) => a.at - b.at);
}

function emailMatchesNearName(page, coach) {
  const text = textForSearch(page.html);
  const searchText = searchable(text);
  const positions = findNamePositions(searchText, coach.name);
  if (!positions.length) return [];

  const matches = [];
  for (const pos of positions) {
    const start = Math.max(0, pos.at - 550);
    const end = Math.min(searchText.length, pos.at + 1300);
    const window = searchText.slice(start, end);
    const emails = uniqueEmails(window);
    for (const email of emails) {
      const emailAt = window.indexOf(email);
      if (emailAt === -1) continue;
      const absoluteEmailAt = start + emailAt;
      const distance = Math.abs(absoluteEmailAt - pos.at);
      const afterName = absoluteEmailAt >= pos.at;
      if (distance > 1150) continue;
      matches.push({
        email,
        url: page.url,
        distance,
        afterName,
        variant: pos.variant
      });
    }
  }
  return matches.sort((a, b) => {
    if (a.afterName !== b.afterName) return a.afterName ? -1 : 1;
    return a.distance - b.distance;
  });
}

function findProfileLinks(html, baseUrl, coachName) {
  const variants = nameVariants(coachName);
  return extractLinks(html, baseUrl)
    .filter(link => {
      const label = normalizeName(link.label);
      const href = normalizeName(safeDecodeURIComponent(link.href));
      return variants.some(v => label.includes(v) || href.includes(v.replace(/\s+/g, " ")));
    })
    .map(link => link.href)
    .filter((url, idx, arr) => arr.indexOf(url) === idx)
    .slice(0, 3);
}

function chooseBestMatch(matches, coach) {
  const existingEmail = coach.email || "";
  const cleanedExisting = cleanEmail(existingEmail);
  if (cleanedExisting) {
    const exact = matches.find(match => match.email === cleanedExisting);
    if (exact) return exact;
    return null;
  }

  const byEmail = new Map();
  for (const match of matches) {
    if (!emailLooksPersonalForCoach(match.email, coach.name)) continue;
    const current = byEmail.get(match.email);
    if (!current || match.distance < current.distance) byEmail.set(match.email, match);
  }
  const sorted = [...byEmail.values()].sort((a, b) => {
    if (a.afterName !== b.afterName) return a.afterName ? -1 : 1;
    return a.distance - b.distance;
  });
  if (!sorted.length) return null;
  const best = sorted[0];
  const second = sorted[1];
  if (second && best.distance > 250 && Math.abs(best.distance - second.distance) < 125) return null;
  return best;
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const [coachesRaw, schoolsRaw] = await Promise.all([
    fs.readFile(COACHES_PATH, "utf8"),
    fs.readFile(SCHOOLS_PATH, "utf8")
  ]);
  const coaches = JSON.parse(coachesRaw);
  const schools = JSON.parse(schoolsRaw);
  const schoolById = new Map(schools.map(s => [s.id, s]));

  const candidates = coaches
    .filter(coach => coach.active !== false && (!coach.email || coach.confidence !== "high"))
    .slice(0, LIMIT);
  const pages = new Map();
  const updates = [];
  const unresolved = [];
  const errors = [];

  async function pageFor(url) {
    if (!url) return null;
    if (pages.has(url)) return pages.get(url);
    try {
      const html = await fetchText(url);
      const page = { url, html };
      pages.set(url, page);
      return page;
    } catch (err) {
      errors.push({ url, error: err.message });
      pages.set(url, null);
      return null;
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const coach = candidates[i];
    const school = schoolById.get(coach.schoolId) || {};
    const schoolUrls = [
      coach.sourceUrl,
      school.staffPageUrl,
      school.sourceUrl
    ].filter(Boolean);
    const urls = [...new Set(schoolUrls)];
    const fetchedPages = [];

    for (const url of urls) {
      const page = await pageFor(url);
      if (page) fetchedPages.push(page);
    }

    for (const page of [...fetchedPages]) {
      const profileLinks = findProfileLinks(page.html, page.url, coach.name);
      for (const profileUrl of profileLinks) {
        const profilePage = await pageFor(profileUrl);
        if (profilePage) fetchedPages.push(profilePage);
      }
    }

    const matches = fetchedPages.flatMap(page => emailMatchesNearName(page, coach));
    const best = chooseBestMatch(matches, coach);

    if (best) {
      const previous = {
        email: coach.email || "",
        confidence: coach.confidence || "",
        sourceUrl: coach.sourceUrl || "",
        lastVerified: coach.lastVerified || "",
        notes: coach.notes || ""
      };
      coach.email = best.email;
      coach.confidence = "high";
      coach.sourceUrl = best.url;
      coach.lastVerified = TODAY;
      coach.notes = [
        `Official source verified email near coach name on ${TODAY}.`,
        previous.notes
      ].filter(Boolean).join(" ");
      updates.push({
        id: coach.id,
        schoolId: coach.schoolId,
        school: school.name || coach.schoolId,
        name: coach.name,
        title: coach.title,
        email: best.email,
        sourceUrl: best.url,
        previous
      });
    } else {
      unresolved.push({
        id: coach.id,
        schoolId: coach.schoolId,
        school: school.name || coach.schoolId,
        name: coach.name,
        title: coach.title,
        existingEmail: coach.email || "",
        urlsChecked: urls
      });
    }

    if ((i + 1) % 100 === 0 || i + 1 === candidates.length) {
      console.log(`checked ${i + 1}/${candidates.length}; updates=${updates.length}; unresolved=${unresolved.length}; fetchedPages=${pages.size}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    candidates: candidates.length,
    updates: updates.length,
    unresolved: unresolved.length,
    errors: errors.length,
    updated: updates,
    unresolvedRecords: unresolved,
    fetchErrors: errors
  };

  await fs.writeFile(path.join(REPORT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(REPORT_DIR, "updates.json"), JSON.stringify(updates, null, 2) + "\n");
  await fs.writeFile(path.join(REPORT_DIR, "unresolved.json"), JSON.stringify(unresolved, null, 2) + "\n");

  if (APPLY) {
    const backupPath = path.join(REPORT_DIR, `coaches.backup.${Date.now()}.json`);
    await fs.writeFile(backupPath, coachesRaw);
    await fs.writeFile(COACHES_PATH, JSON.stringify(coaches, null, 2) + "\n");
    console.log(`applied ${updates.length} updates; backup=${backupPath}`);
  } else {
    console.log(`dry run found ${updates.length} updates; rerun with --apply to write coaches.json`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
