function clean(value, fallback = "") {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function measurementLine(profile) {
  const parts = [];
  if (profile.height) parts.push(profile.height);
  if (profile.weight) parts.push(`${profile.weight} lbs`);
  if (profile.fortyYard) parts.push(`${profile.fortyYard} 40`);
  if (profile.vertical) parts.push(`${profile.vertical}\" vertical`);
  if (profile.sat) parts.push(`${profile.sat} SAT`);
  if (profile.gpaWeighted) parts.push(`${profile.gpaWeighted} GPA`);
  return parts.join(", ");
}

function xUrl(handle = "") {
  const cleanHandle = String(handle || "").trim().replace(/^@/, "");
  return cleanHandle ? `https://x.com/${cleanHandle}` : "";
}

export function buildLocalDraft({ profile, school, coach, programSummary }) {
  const first = clean(profile.firstName, "");
  const last = clean(profile.lastName, "");
  const name = clean(`${first} ${last}`.trim(), "Prospect");
  const position = clean(profile.position, "ATH");
  const gradYear = clean(profile.gradYear, "2027");
  const coachName = coach?.name && coach.name !== "Coach" ? `Coach ${coach.name.split(" ").slice(-1)[0]}` : "Coach";
  const schoolName = clean(school?.name, "your program");
  const measurable = measurementLine(profile);
  const strengths = clean(profile.strengths, "I compete hard, learn quickly, and take coaching seriously");
  const growth = profile.weaknesses ? ` I am also actively working on ${profile.weaknesses}.` : "";
  const academics = [profile.gpaWeighted && `${profile.gpaWeighted} weighted GPA`, profile.sat && `${profile.sat} SAT`, profile.act && `${profile.act} ACT`].filter(Boolean).join(" and ");
  const schoolContext = programSummary || school?.programSummary || `I am interested in ${schoolName} because of the football program and academic environment.`;
  const hudl = clean(profile.hudlLink, "[Hudl link]");
  const contactLine = [profile.email, profile.phone, profile.xHandle].filter(Boolean).join(" | ");

  const subject = `${gradYear} ${position} ${name} — ${clean(profile.highSchool, "High School")}`;
  const body = `Hi ${coachName},\n\nMy name is ${name}, and I am a Class of ${gradYear} ${position} at ${clean(profile.highSchool, "my high school")}${profile.city || profile.state ? ` in ${[profile.city, profile.state].filter(Boolean).join(", ")}` : ""}. I wanted to reach out because I am very interested in ${schoolName}. ${schoolContext}\n\nAs a player, ${strengths}.${growth}${measurable ? ` My current profile is ${measurable}.` : ""}${academics ? ` Academically, I have a ${academics}.` : ""}\n\nHere is my film: ${hudl}\n\nI would really appreciate it if you could take a look at my film and let me know where I stand as a potential fit for your program. I would also be grateful for any feedback about what you would like to see from me this offseason.\n\nThank you for your time,\n${name}\n${contactLine}`;

  return {
    coach_id: coach?.id || null,
    coach_name: coach?.name || "Coach",
    coach_title: coach?.title || "Football Staff",
    coach_email: coach?.email || null,
    coach_x_handle: coach?.xHandle || "",
    coach_x_url: xUrl(coach?.xHandle),
    email_lookup_tip: coach?.email ? "" : (school?.staffPageUrl || school?.questionnaireUrl || "Check the school's football staff directory and recruiting questionnaire."),
    email_subject: subject,
    email_body: body,
    draft_source: "local-template"
  };
}

function shortName(profile) {
  return clean(`${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(), "Prospect");
}

function coachGreeting(coach) {
  return coach?.name && coach.name !== "Coach" ? `Coach ${coach.name.split(" ").slice(-1)[0]}` : "Coach";
}

export function buildLocalRewrite({ profile, school, coach, draft, action }) {
  const base = draft || buildLocalDraft({ profile, school, coach, programSummary: school?.programSummary });
  const name = shortName(profile);
  const position = clean(profile?.position, "ATH");
  const gradYear = clean(profile?.gradYear, "2027");
  const schoolName = clean(school?.name, "your program");
  const hudl = clean(profile?.hudlLink, "[Hudl link]");
  const contactLine = [profile?.email, profile?.phone, profile?.xHandle].filter(Boolean).join(" | ");
  const greeting = coachGreeting(coach || { name: base.coach_name });
  const academics = [profile?.gpaWeighted && `${profile.gpaWeighted} GPA`, profile?.sat && `${profile.sat} SAT`, profile?.act && `${profile.act} ACT`].filter(Boolean).join(" | ");
  const strengths = clean(profile?.strengths, "I compete hard, learn quickly, and take coaching seriously");

  if (action === "dm_version") {
    return {
      ...base,
      email_subject: `DM: ${gradYear} ${position} ${name}`,
      email_body: `Hi ${greeting}, I’m ${name}, a ${gradYear} ${position} at ${clean(profile?.highSchool, "my high school")} in ${[profile?.city, profile?.state].filter(Boolean).join(", ")}. I’m interested in ${schoolName} and would really appreciate it if you could take a look at my film: ${hudl}`,
      draft_source: "local-rewrite:dm_version"
    };
  }

  if (action === "follow_up") {
    return {
      ...base,
      email_subject: `Following up — ${gradYear} ${position} ${name}`,
      email_body: `Hi ${greeting},\n\nI wanted to quickly follow up on the email I sent about my interest in ${schoolName}. I’m a Class of ${gradYear} ${position} at ${clean(profile?.highSchool, "my high school")}, and I would be grateful if you had a chance to review my film.\n\nFilm: ${hudl}\n\n${academics ? `Academics: ${academics}\n\n` : ""}Thank you again for your time. I would appreciate any feedback or next steps you think would be helpful.\n\n${name}\n${contactLine}`,
      draft_source: "local-rewrite:follow_up"
    };
  }

  if (action === "shorter") {
    return {
      ...base,
      email_subject: base.email_subject || `${gradYear} ${position} ${name}`,
      email_body: `Hi ${greeting},\n\nMy name is ${name}, and I’m a Class of ${gradYear} ${position} at ${clean(profile?.highSchool, "my high school")}${profile?.city || profile?.state ? ` in ${[profile?.city, profile?.state].filter(Boolean).join(", ")}` : ""}. I’m very interested in ${schoolName} and wanted to send over my film.\n\n${strengths}.${academics ? ` Academically, I have ${academics}.` : ""}\n\nFilm: ${hudl}\n\nI would really appreciate it if you could review my film and let me know where I stand as a potential fit for your program.\n\nThank you,\n${name}\n${contactLine}`,
      draft_source: "local-rewrite:shorter"
    };
  }

  // For tone changes in local mode, keep the content stable instead of trying
  // to fake stylistic intelligence. A configured draft model will do this much better.
  return {
    ...base,
    email_body: base.email_body,
    draft_source: `local-rewrite:${action || "unchanged"}`
  };
}
