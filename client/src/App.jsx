import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Database, Mail, Plus, RefreshCw, Search, Upload, Users, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

const POSITIONS = ["QB","RB","FB","WR","TE","OT","OG","C","DE","DT","NT","ILB","OLB","CB","FS","SS","K","P","LS","ATH"];
const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const emptyProfile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  gradYear: "2027",
  highSchool: "",
  city: "",
  state: "TX",
  position: "WR",
  jerseyNumber: "",
  height: "",
  weight: "",
  fortyYard: "",
  benchPress: "",
  squat: "",
  vertical: "",
  shuttle: "",
  gpaWeighted: "",
  gpaUnweighted: "",
  sat: "",
  act: "",
  hudlLink: "",
  additionalFilm: "",
  strengths: "",
  weaknesses: "",
  additionalNotes: ""
};

function api(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  }).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  });
}

function Field({ label, required, children, hint }) {
  return <label className="field"><span>{label}{required && <b>*</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function TextInput(props) {
  return <input className="input" {...props} onChange={e => props.onChange?.(e.target.value)} />;
}

function TextArea(props) {
  return <textarea className="input textarea" {...props} onChange={e => props.onChange?.(e.target.value)} />;
}

function Select({ value, onChange, options }) {
  return <select className="input" value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
}

function Section({ title, icon, children }) {
  return <section className="section"><h2>{icon}{title}</h2>{children}</section>;
}

function SchoolCard({ school, onSelect }) {
  return <button className="schoolCard" onClick={() => onSelect(school)}>
    <span className="schoolCardIcon"><Plus size={16}/></span>
    <span className="schoolCardMain">
      <strong>{school.name}</strong>
      <span>{[school.division, school.conference].filter(Boolean).join(" · ") || "Saved school"}</span>
    </span>
    {(school.city || school.state) && <span className="schoolLocation">{[school.city, school.state].filter(Boolean).join(", ")}</span>}
  </button>;
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return <button className="secondary small" onClick={copy}><Copy size={14}/>{copied ? "Copied" : label}</button>;
}

export default function App() {
  const [profile, setProfile] = useState(emptyProfile);
  const [schools, setSchools] = useState([]);
  const [databaseSchools, setDatabaseSchools] = useState([]);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [allowWebResearch, setAllowWebResearch] = useState(false);
  const [maxContacts, setMaxContacts] = useState(3);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [csv, setCsv] = useState("");
  const [adminMsg, setAdminMsg] = useState("");

  useEffect(() => {
    api("/api/health").then(setHealth).catch(() => setHealth(null));
    refreshStats();
    refreshSchools();
  }, []);

  async function refreshStats() {
    try { setStats(await api("/api/stats")); } catch { setStats(null); }
  }

  async function refreshSchools() {
    try {
      const data = await api("/api/schools");
      const loaded = data.schools || [];
      setDatabaseSchools(loaded);
    } catch {
      setDatabaseSchools([]);
    }
  }

  const filteredDatabaseSchools = useMemo(() => {
    const needle = schoolQuery.trim().toLowerCase();
    const available = databaseSchools.filter(s => !schools.some(selected => selected.id === s.id));
    if (!needle) return available;
    return available.filter(s => [s.name, s.shortName, s.division, s.conference, s.city, s.state]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle));
  }, [databaseSchools, schools, schoolQuery]);
  const visibleDatabaseSchools = filteredDatabaseSchools.slice(0, 12);

  const missing = useMemo(() => {
    const req = [
      ["First name", profile.firstName],
      ["Last name", profile.lastName],
      ["Email", profile.email],
      ["Position", profile.position],
      ["High school", profile.highSchool],
      ["GPA", profile.gpaWeighted],
      ["Hudl link", profile.hudlLink],
      ["Strengths", profile.strengths]
    ];
    const out = req.filter(([, v]) => !String(v || "").trim()).map(([k]) => k);
    if (schools.length === 0) out.push("At least one target school");
    return out;
  }, [profile, schools]);

  function up(field, value) {
    setProfile(prev => ({ ...prev, [field]: value }));
  }

  function addTargetSchool(school = visibleDatabaseSchools[0]) {
    if (!school) return;
    if (schools.some(s => s.id === school.id)) return;
    setSchools(prev => [...prev, school]);
    setSchoolQuery("");
  }

  async function generate() {
    setError("");
    if (missing.length) {
      setError(`Missing: ${missing.join(", ")}`);
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      const data = await api("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          profile,
          schools,
          options: { allowWebResearch, maxContacts }
        })
      });
      setResults(data.results || []);
      refreshStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function importCsv() {
    setAdminMsg("");
    if (!csv.trim()) return setAdminMsg("Paste CSV text first.");
    try {
      const data = await api("/api/admin/import-coaches", {
        method: "POST",
        body: JSON.stringify({ csvText: csv })
      });
      setAdminMsg(`Imported ${data.rows} rows. Inserted ${data.inserted}, updated ${data.updated}.`);
      setCsv("");
      refreshStats();
      refreshSchools();
    } catch (err) {
      setAdminMsg(err.message);
    }
  }

  return <main className="app">
    <header className="hero">
      <div className="brand"><div className="logo"><Mail size={22}/></div><div><h1>RecruitFlow</h1><p>Recruiting contact plans + AI-curated coach emails</p></div></div>
      <div className="statusPills">
        <span className={health?.draftProvider && health.draftProvider !== "local-template" ? "pill good" : "pill warn"}>Draft provider: {health?.draftProvider || "local"}</span>
        <span className="pill">{stats ? `${stats.schools} schools · ${stats.coaches} coaches` : "Loading database"}</span>
      </div>
    </header>

    <div className="grid">
      <div className="leftCol">
        <Section title="Athlete profile" icon={<Users size={18}/>}> 
          <div className="two"><Field label="First name" required><TextInput value={profile.firstName} onChange={v => up("firstName", v)} placeholder="Albert"/></Field><Field label="Last name" required><TextInput value={profile.lastName} onChange={v => up("lastName", v)} placeholder="Zhou"/></Field></div>
          <div className="two"><Field label="Email" required><TextInput value={profile.email} onChange={v => up("email", v)} placeholder="athlete@email.com"/></Field><Field label="Phone"><TextInput value={profile.phone} onChange={v => up("phone", v)} placeholder="(555) 123-4567"/></Field></div>
          <div className="four"><Field label="High school" required><TextInput value={profile.highSchool} onChange={v => up("highSchool", v)} placeholder="St. John's School"/></Field><Field label="City"><TextInput value={profile.city} onChange={v => up("city", v)} placeholder="Houston"/></Field><Field label="State"><Select value={profile.state} onChange={v => up("state", v)} options={STATES}/></Field><Field label="Grad year"><TextInput value={profile.gradYear} onChange={v => up("gradYear", v)} placeholder="2027"/></Field></div>
          <div className="four"><Field label="Position" required><Select value={profile.position} onChange={v => up("position", v)} options={POSITIONS}/></Field><Field label="Height"><TextInput value={profile.height} onChange={v => up("height", v)} placeholder={`6'0"`}/></Field><Field label="Weight"><TextInput value={profile.weight} onChange={v => up("weight", v)} placeholder="173"/></Field><Field label="40"><TextInput value={profile.fortyYard} onChange={v => up("fortyYard", v)} placeholder="4.65"/></Field></div>
          <div className="four"><Field label="Bench"><TextInput value={profile.benchPress} onChange={v => up("benchPress", v)} placeholder="225"/></Field><Field label="Squat"><TextInput value={profile.squat} onChange={v => up("squat", v)} placeholder="365"/></Field><Field label="Vertical"><TextInput value={profile.vertical} onChange={v => up("vertical", v)} placeholder="32"/></Field><Field label="Shuttle"><TextInput value={profile.shuttle} onChange={v => up("shuttle", v)} placeholder="4.25"/></Field></div>
          <div className="four"><Field label="Weighted GPA" required><TextInput value={profile.gpaWeighted} onChange={v => up("gpaWeighted", v)} placeholder="4.0"/></Field><Field label="UW GPA"><TextInput value={profile.gpaUnweighted} onChange={v => up("gpaUnweighted", v)} placeholder="3.9"/></Field><Field label="SAT"><TextInput value={profile.sat} onChange={v => up("sat", v)} placeholder="1560"/></Field><Field label="ACT"><TextInput value={profile.act} onChange={v => up("act", v)} placeholder=""/></Field></div>
          <Field label="Hudl / film link" required><TextInput value={profile.hudlLink} onChange={v => up("hudlLink", v)} placeholder="https://www.hudl.com/profile/..."/></Field>
          <Field label="Additional film"><TextInput value={profile.additionalFilm} onChange={v => up("additionalFilm", v)} placeholder="YouTube, MaxPreps, camp clips"/></Field>
          <Field label="Strengths" required><TextArea rows={3} value={profile.strengths} onChange={v => up("strengths", v)} placeholder="What makes you stand out? Position-specific traits, film highlights, captaincy, speed, route running, toughness..."/></Field>
          <Field label="Areas of growth"><TextArea rows={2} value={profile.weaknesses} onChange={v => up("weaknesses", v)} placeholder="What are you actively improving?"/></Field>
          <Field label="Extra context"><TextArea rows={2} value={profile.additionalNotes} onChange={v => up("additionalNotes", v)} placeholder="Academic interests, camps attended, coach relationship, visit plans..."/></Field>
        </Section>

        <Section title="Target schools" icon={<Search size={18}/>}> 
          <div className="schoolSearch">
            <Search size={17}/>
            <TextInput value={schoolQuery} onChange={setSchoolQuery} placeholder="Search by school, conference, city, or state" onKeyDown={e => e.key === "Enter" && addTargetSchool()}/>
          </div>
          <div className="schoolPicker">
            <div className="schoolPickerHeader">
              <span>{filteredDatabaseSchools.length ? `${filteredDatabaseSchools.length} available schools` : "No matching schools"}</span>
              {schoolQuery && <button className="textButton" onClick={() => setSchoolQuery("")}>Clear search</button>}
            </div>
            <div className="schoolList">
              {visibleDatabaseSchools.map(s => <SchoolCard key={s.id} school={s} onSelect={addTargetSchool}/>)}
              {filteredDatabaseSchools.length === 0 && <p className="emptyState">No saved schools match that search.</p>}
            </div>
          </div>
          <div className="selectedSchools">
            <div className="selectedHeader"><Check size={16}/><span>{schools.length ? `${schools.length} selected` : "No schools selected yet"}</span></div>
            <div className="chips">{schools.map(s => <button key={s.id} className="chip" onClick={() => setSchools(prev => prev.filter(x => x.id !== s.id))}>{s.name}<small>{s.division}</small><X size={14}/></button>)}</div>
            {schools.length === 0 && <p className="muted">Select at least one saved school before generating outreach.</p>}
          </div>
          <div className="options">
            <label className="check"><input type="checkbox" checked={allowWebResearch} onChange={e => setAllowWebResearch(e.target.checked)}/> Allow paid web research for missing schools</label>
            <Field label="Max contacts per school"><Select value={String(maxContacts)} onChange={v => setMaxContacts(Number(v))} options={["1","2","3","4"]}/></Field>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="generate" disabled={loading} onClick={generate}>{loading ? <RefreshCw className="spin" size={18}/> : <Mail size={18}/>} {loading ? "Generating..." : `Generate contact plans + AI emails`}</button>
        </Section>
      </div>

      <aside className="rightCol">
        <Section title="Database admin" icon={<Database size={18}/>}> 
          <div className="dbStats">
            <div><strong>{stats?.schools ?? "—"}</strong><span>schools</span></div>
            <div><strong>{stats?.coaches ?? "—"}</strong><span>coaches</span></div>
            <div><strong>{stats?.emailCoveragePct ?? "—"}%</strong><span>email coverage</span></div>
          </div>
          <p className="muted">Paste rows from the CSV template to add real staff contacts. This is the cost-saving moat.</p>
          <textarea className="input textarea mono" rows={8} value={csv} onChange={e => setCsv(e.target.value)} placeholder="Paste coach_import_template.csv rows here..." />
          <button className="secondary" onClick={importCsv}><Upload size={16}/>Import CSV</button>
          {adminMsg && <p className="muted">{adminMsg}</p>}
        </Section>

        <Section title="Cost model" icon={<Database size={18}/>}> 
          <ul className="bullets">
            <li>Database hit: no web search cost.</li>
            <li>Regenerate/rewrite: fresh draft text, same saved contact data.</li>
            <li>Missing school: optional paid enrichment only.</li>
            <li>No API key: local template drafts still work.</li>
          </ul>
        </Section>
      </aside>
    </div>

    <Results results={results} setResults={setResults} profile={profile}/>
  </main>;
}

function Results({ results, setResults, profile }) {
  const [rewritingKey, setRewritingKey] = useState("");
  if (!results.length) return null;

  function updateDraft(schoolIdx, draftIdx, field, value) {
    setResults(prev => prev.map((school, i) => i !== schoolIdx ? school : {
      ...school,
      drafts: school.drafts.map((d, j) => j !== draftIdx ? d : { ...d, [field]: value })
    }));
  }

  async function rewriteOne(schoolIdx, draftIdx, action) {
    const schoolResult = results[schoolIdx];
    const draft = schoolResult.drafts[draftIdx];
    const contact = schoolResult.contacts.find(c => c.id === draft.coach_id) || schoolResult.contacts[draftIdx] || null;
    const key = `${schoolIdx}-${draftIdx}-${action}`;
    setRewritingKey(key);
    try {
      const data = await api("/api/rewrite-draft", {
        method: "POST",
        body: JSON.stringify({ profile, school: schoolResult.school, contact, draft, action })
      });
      setResults(prev => prev.map((school, i) => i !== schoolIdx ? school : {
        ...school,
        dataQuality: { ...school.dataQuality, provider: data.provider || school.dataQuality.provider, draftCached: false },
        drafts: school.drafts.map((d, j) => j !== draftIdx ? d : { ...d, ...(data.draft || {}) })
      }));
    } catch (err) {
      alert(err.message);
    } finally {
      setRewritingKey("");
    }
  }

  const rewriteActions = [
    ["shorter", "Make shorter"],
    ["more_casual", "More casual"],
    ["more_confident", "More confident"],
    ["academic_focus", "Academic focus"],
    ["football_focus", "Football focus"],
    ["dm_version", "DM version"],
    ["follow_up", "Follow-up"]
  ];

  return <section className="results">
    <h2>Generated outreach</h2>
    <p className="muted">These emails are generated fresh by the configured AI provider and saved to history. Coach/school data is cached; email text is not reused as a hard cache.</p>
    {results.map((r, i) => <article className="resultCard" key={r.school.id || r.school.name}>
      <div className="resultHeader"><div><h3>{r.school.name}</h3><p>{r.school.division}{r.school.conference ? ` · ${r.school.conference}` : ""}</p></div><span className="pill">{r.dataQuality.provider}{r.dataQuality.draftCached ? " · cached" : " · fresh draft"}</span></div>
      <div className="quality"><span>{r.dataQuality.contactsInDatabase} DB contacts</span><span>{r.dataQuality.contactsWithEmails} selected emails</span><span>Confidence: {r.dataQuality.schoolConfidence}</span></div>
      {r.programSummary && <p className="summary">{r.programSummary}</p>}
      <h4>Recommended contact order</h4>
      <div className="contacts">{r.contacts.map(c => <div className="contact" key={c.id}><strong>{c.name}</strong><span>{c.title}</span><small>{c.recommendedReason}</small>{c.email ? <code>{c.email}</code> : <em>No email saved</em>}</div>)}</div>
      <h4>Drafts</h4>
      <div className="drafts">{(r.drafts || []).map((d, j) => {
        const full = `To: ${d.coach_email || "[find email]"}\nSubject: ${d.email_subject}\n\n${d.email_body}`;
        return <div className="draft" key={`${d.coach_id || j}`}>
          <div className="draftTop"><div><strong>{d.coach_name}</strong><span>{d.coach_title}</span>{d.coach_email ? <code>{d.coach_email}</code> : <em>{d.email_lookup_tip || "Find email manually"}</em>}</div><CopyButton text={full} label="Copy full"/></div>
          <div className="rewriteRow">
            {rewriteActions.map(([action, label]) => {
              const key = `${i}-${j}-${action}`;
              return <button key={action} className="secondary small" disabled={Boolean(rewritingKey)} onClick={() => rewriteOne(i, j, action)}>
                {rewritingKey === key ? <RefreshCw className="spin" size={13}/> : null}{label}
              </button>;
            })}
          </div>
          <Field label="Subject"><TextInput value={d.email_subject || ""} onChange={v => updateDraft(i, j, "email_subject", v)}/></Field>
          <Field label="Body"><TextArea rows={11} value={d.email_body || ""} onChange={v => updateDraft(i, j, "email_body", v)}/></Field>
        </div>;
      })}</div>
    </article>)}
  </section>;
}
