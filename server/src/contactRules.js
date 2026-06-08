const POSITION_TO_GROUPS = {
  QB: ["QB", "Quarterbacks", "Offensive Coordinator", "Pass Game Coordinator"],
  RB: ["RB", "Running Backs", "Offensive Coordinator", "Run Game Coordinator"],
  FB: ["RB", "Running Backs", "Tight Ends", "Offensive Coordinator"],
  WR: ["WR", "Wide Receivers", "Pass Game Coordinator", "Offensive Coordinator"],
  TE: ["TE", "Tight Ends", "Offensive Coordinator", "Pass Game Coordinator"],
  OT: ["OL", "Offensive Line", "Run Game Coordinator", "Offensive Coordinator"],
  OG: ["OL", "Offensive Line", "Run Game Coordinator", "Offensive Coordinator"],
  C: ["OL", "Offensive Line", "Run Game Coordinator", "Offensive Coordinator"],
  DE: ["DL", "Defensive Line", "Edge", "Defensive Coordinator"],
  DT: ["DL", "Defensive Line", "Defensive Coordinator"],
  NT: ["DL", "Defensive Line", "Defensive Coordinator"],
  ILB: ["LB", "Linebackers", "Defensive Coordinator"],
  OLB: ["LB", "Linebackers", "Edge", "Defensive Coordinator"],
  CB: ["DB", "Defensive Backs", "Cornerbacks", "Defensive Coordinator"],
  FS: ["DB", "Defensive Backs", "Safeties", "Defensive Coordinator"],
  SS: ["DB", "Defensive Backs", "Safeties", "Defensive Coordinator"],
  K: ["Special Teams", "Kickers", "Recruiting Coordinator"],
  P: ["Special Teams", "Punters", "Recruiting Coordinator"],
  LS: ["Special Teams", "Long Snappers", "Recruiting Coordinator"],
  ATH: ["Recruiting Coordinator", "Director of Player Personnel", "Offensive Coordinator", "Defensive Coordinator"]
};

const TITLE_SYNONYMS = {
  headCoach: ["head coach"],
  recruiting: ["recruiting", "player personnel", "director of personnel", "director of recruiting"],
  offensiveCoordinator: ["offensive coordinator", "oc", "pass game coordinator", "run game coordinator"],
  defensiveCoordinator: ["defensive coordinator", "dc"],
  specialTeams: ["special teams", "kickers", "punters", "long snappers"],
  positionCoach: [
    "quarterbacks", "running backs", "wide receivers", "receivers", "tight ends",
    "offensive line", "defensive line", "linebackers", "defensive backs",
    "cornerbacks", "safeties", "edge"
  ]
};

function lc(value = "") {
  return String(value).toLowerCase();
}

function includesAny(text, words) {
  const hay = lc(text);
  return words.some(w => hay.includes(lc(w)));
}

function positionScore(position, coach) {
  const groups = POSITION_TO_GROUPS[position] || [];
  const title = coach.title || "";
  const groupText = [...(coach.positionGroups || []), title].join(" ");
  let score = 0;

  for (const group of groups) {
    if (includesAny(groupText, [group])) score += 35;
  }

  if (position === "WR" && includesAny(groupText, ["receiver", "wide receiver", "pass game"])) score += 30;
  if (["OT", "OG", "C"].includes(position) && includesAny(groupText, ["offensive line", "run game"])) score += 30;
  if (["CB", "FS", "SS"].includes(position) && includesAny(groupText, ["defensive back", "corner", "safet"])) score += 30;
  if (["K", "P", "LS"].includes(position) && includesAny(groupText, ["special teams", "kicker", "punter", "long snapper"])) score += 35;

  return score;
}

function roleScore(coach) {
  const title = coach.title || "";
  let score = 0;
  if (includesAny(title, TITLE_SYNONYMS.recruiting)) score += 24;
  if (includesAny(title, TITLE_SYNONYMS.positionCoach)) score += 18;
  if (includesAny(title, TITLE_SYNONYMS.offensiveCoordinator)) score += 14;
  if (includesAny(title, TITLE_SYNONYMS.defensiveCoordinator)) score += 14;
  if (includesAny(title, TITLE_SYNONYMS.specialTeams)) score += 18;
  if (includesAny(title, TITLE_SYNONYMS.headCoach)) score += 8;
  return score;
}

function regionScore(profile, coach) {
  const states = (coach.recruitingStates || []).map(s => s.toUpperCase());
  const athleteState = (profile.state || "").toUpperCase();
  if (!athleteState || states.length === 0) return 0;
  if (states.includes(athleteState)) return 28;
  if (states.includes("NATIONAL") || states.includes("ALL")) return 8;
  return 0;
}

function qualityScore(coach) {
  let score = 0;
  if (coach.email) score += 20;
  if (coach.xHandle) score += 5;
  if (coach.phone) score += 3;
  if (coach.confidence === "high") score += 8;
  if (coach.confidence === "medium") score += 4;
  return score;
}

function reasonFor(profile, coach) {
  const position = profile.position || "ATH";
  const reasons = [];
  const title = coach.title || "coach";
  const groups = POSITION_TO_GROUPS[position] || [];
  const groupText = [...(coach.positionGroups || []), title].join(" ").toLowerCase();

  if (groups.some(g => groupText.includes(g.toLowerCase()))) reasons.push(`best position fit for ${position}`);
  if (includesAny(title, TITLE_SYNONYMS.recruiting)) reasons.push("handles recruiting or player personnel");
  if (regionScore(profile, coach) > 0) reasons.push(`listed for ${profile.state || "your area"} recruiting`);
  if (!coach.email) reasons.push("email missing; use staff page or DM as backup");
  if (reasons.length === 0) reasons.push("useful staff contact based on title");
  return reasons.join("; ");
}

export function recommendContacts({ profile, school, coaches, maxContacts = 3 }) {
  const active = coaches.filter(c => c.active !== false);
  const scored = active.map(coach => {
    const score = positionScore(profile.position, coach) + roleScore(coach) + regionScore(profile, coach) + qualityScore(coach);
    return { ...coach, score, recommendedReason: reasonFor(profile, coach) };
  }).sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));

  const selected = [];
  const seenRoles = new Set();

  for (const coach of scored) {
    const roleBucket = roleBucketFor(coach);
    if (selected.length === 0 || !seenRoles.has(roleBucket) || selected.length < 2) {
      selected.push(coach);
      seenRoles.add(roleBucket);
    }
    if (selected.length >= maxContacts) break;
  }

  if (selected.length === 0 && school) {
    selected.push({
      id: `fallback-${school.id || school.name}`,
      schoolId: school.id,
      name: "Coach",
      title: "Football Staff",
      email: "",
      positionGroups: [],
      recruitingStates: [],
      confidence: "low",
      sourceUrl: school.staffPageUrl || school.sourceUrl || "",
      recommendedReason: "No coach record found yet; use the staff directory or recruiting questionnaire as fallback",
      score: 0
    });
  }

  return selected;
}

function roleBucketFor(coach) {
  const title = lc(coach.title);
  if (includesAny(title, TITLE_SYNONYMS.recruiting)) return "recruiting";
  if (includesAny(title, TITLE_SYNONYMS.headCoach)) return "head";
  if (includesAny(title, TITLE_SYNONYMS.offensiveCoordinator)) return "offense";
  if (includesAny(title, TITLE_SYNONYMS.defensiveCoordinator)) return "defense";
  if (includesAny(title, TITLE_SYNONYMS.specialTeams)) return "specialTeams";
  return "position";
}

export function contactPlanSummary(profile, contacts) {
  const position = profile.position || "ATH";
  const lines = contacts.map((c, i) => `${i + 1}. ${c.name} — ${c.title || "Football Staff"}: ${c.recommendedReason}`);
  return `For a ${position}, contact these people in this order:\n${lines.join("\n")}`;
}
