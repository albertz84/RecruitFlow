import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Copy, CreditCard, ExternalLink, Filter, History, LogOut, Mail, MapPin, Moon, Plus, RefreshCw, Search, Sun, Trash2, Users, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

const POSITIONS = ["QB","RB","FB","WR","TE","OT","OG","C","DE","DT","NT","ILB","OLB","CB","FS","SS","K","P","LS","ATH"];
const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const SCHOOL_PAGE_SIZE = 18;

const emptyProfile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  xHandle: "",
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
  athleticAwards: "",
  customInstructions: "",
  additionalNotes: ""
};

function api(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
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

function storedUser() {
  try { return JSON.parse(localStorage.getItem("recruitflow:gmailUser") || "null"); } catch { return null; }
}

function storedTheme() {
  try {
    return localStorage.getItem("recruitflow:theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function storedLegalAccepted() {
  try {
    return localStorage.getItem("recruitflow:legalAccepted") === "true";
  } catch {
    return false;
  }
}

function storedProfile(email = "") {
  const keys = email ? [`recruitflow:profile:${email}`, "recruitflow:profile"] : ["recruitflow:profile"];
  for (const key of keys) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || "null");
      if (data && typeof data === "object") return { ...emptyProfile, ...data };
    } catch {}
  }
  return emptyProfile;
}

function gmailWebComposeUrl({ to, subject, body, accountEmail }) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: to || "",
    su: subject || "",
    body: body || ""
  });
  if (accountEmail) params.set("authuser", accountEmail);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function openGmailCompose({ to, subject, body, accountEmail }) {
  const webUrl = gmailWebComposeUrl({ to, subject, body, accountEmail });
  window.open(webUrl, "_blank", "noopener,noreferrer");
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

function IntroPanel() {
  return <section className="introPanel" aria-labelledby="intro-title">
    <div className="introLead">
      <span className="introEyebrow">Football recruiting outreach assistant</span>
      <h2 id="intro-title">Turn your player profile into coach-ready outreach.</h2>
      <p>
        RecruitFlow helps athletes build a focused school list, find relevant football staff, and generate personalized email drafts that are ready to review and open in Gmail.
      </p>
      <div className="introStats">
        <span><Check size={15}/>Uses the private coach database</span>
        <span><History size={15}/>Tracks drafts and sent emails</span>
      </div>
    </div>
    <div className="introSteps" aria-label="How RecruitFlow works">
      <article>
        <span className="stepIcon"><Users size={17}/></span>
        <strong>1. Add your profile</strong>
        <p>Enter academics, film, position details, verified stats, and the story coaches should understand.</p>
      </article>
      <article>
        <span className="stepIcon"><Search size={17}/></span>
        <strong>2. Pick target schools</strong>
        <p>Search by school, state, conference, or level, then choose how many coaches to contact at each program.</p>
      </article>
      <article>
        <span className="stepIcon"><Mail size={17}/></span>
        <strong>3. Generate and send</strong>
        <p>Review the contact plan, polish each draft, open it in Gmail, and keep your outreach history organized.</p>
      </article>
    </div>
  </section>;
}

function SchoolResultRow({ school, onSelect }) {
  return <button className="schoolResultRow" onClick={() => onSelect(school)}>
    <span className="schoolResultMark"><Plus size={15}/></span>
    <span className="schoolResultMain">
      <strong>{school.name}</strong>
      <span>{[school.division, school.conference].filter(Boolean).join(" · ") || "Saved school"}</span>
    </span>
    <span className="schoolResultLocation">{[school.city, school.state].filter(Boolean).join(", ") || "Location TBD"}</span>
  </button>;
}

function TargetSchoolItem({ school, onRemove }) {
  return <article className="targetSchoolItem">
    <div>
      <strong>{school.name}</strong>
      <span>{[school.division, school.conference].filter(Boolean).join(" · ") || "Saved school"}</span>
      {(school.city || school.state) && <small>{[school.city, school.state].filter(Boolean).join(", ")}</small>}
    </div>
    <button className="iconButton" onClick={onRemove} aria-label={`Remove ${school.name}`}><X size={15}/></button>
  </article>;
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

function xUrlFromHandle(handle = "") {
  const cleanHandle = String(handle || "").trim().replace(/^@/, "");
  return cleanHandle ? `https://x.com/${cleanHandle}` : "";
}

function CoachXLink({ handle, url }) {
  const href = url || xUrlFromHandle(handle);
  const label = handle || (href ? `@${href.split("/").filter(Boolean).pop()}` : "");
  if (!href || !label) return null;
  return <a className="xLink" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/>{label}</a>;
}

function formatSeconds(seconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function estimateGenerationSeconds({ schoolCount, maxContacts, provider }) {
  const contacts = Math.max(1, schoolCount) * Math.max(1, maxContacts);
  const providerMultiplier = provider === "local-template" ? 0.3 : 1;
  const low = Math.ceil((6 + contacts * 3.2) * providerMultiplier);
  const high = Math.ceil((12 + contacts * 6.5) * providerMultiplier);
  return {
    low: Math.max(provider === "local-template" ? 3 : 12, low),
    high: Math.max(provider === "local-template" ? 8 : 25, high)
  };
}

function GenerationWait({ schoolCount, maxContacts, provider, elapsedSeconds }) {
  const estimate = estimateGenerationSeconds({ schoolCount, maxContacts, provider });
  const estimateMidpoint = (estimate.low + estimate.high) / 2;
  const progress = Math.min(94, Math.max(8, Math.round((elapsedSeconds / estimateMidpoint) * 82)));
  const totalDrafts = schoolCount * maxContacts;
  const message = elapsedSeconds < 4
    ? "Preparing coach contact plans"
    : elapsedSeconds < estimate.low
      ? "Writing personalized email drafts"
      : "Still working through the selected schools";

  return <div className="generationWait" role="status" aria-live="polite">
    <div className="waitTop">
      <div className="waitSpinner"><RefreshCw className="spin" size={20}/></div>
      <div>
        <strong>{message}</strong>
        <span>{schoolCount} school{schoolCount === 1 ? "" : "s"} · up to {totalDrafts} email{totalDrafts === 1 ? "" : "s"}</span>
      </div>
    </div>
    <div className="waitBar"><span style={{ width: `${progress}%` }} /></div>
    <div className="waitMeta">
      <span><Clock size={14}/>Elapsed {formatSeconds(elapsedSeconds)}</span>
      <span>Typical range {formatSeconds(estimate.low)}-{formatSeconds(estimate.high)}</span>
    </div>
  </div>;
}

export default function App() {
  const [theme, setTheme] = useState(() => storedTheme());
  const [profile, setProfile] = useState(() => storedProfile());
  const [schools, setSchools] = useState([]);
  const [databaseSchools, setDatabaseSchools] = useState([]);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolDivision, setSchoolDivision] = useState("All");
  const [schoolStateFilter, setSchoolStateFilter] = useState("All");
  const [visibleSchoolCount, setVisibleSchoolCount] = useState(SCHOOL_PAGE_SIZE);
  const [maxContacts, setMaxContacts] = useState(3);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loadingStartedAt, setLoadingStartedAt] = useState(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);
  const [view, setView] = useState("compose");
  const [connectedUser, setConnectedUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [googleAuthConfigured, setGoogleAuthConfigured] = useState(true);
  const [legalAccepted, setLegalAccepted] = useState(() => storedLegalAccepted());
  const [gmailMsg, setGmailMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [billingConfig, setBillingConfig] = useState({ enabled: false, packs: [] });
  const [checkoutLoading, setCheckoutLoading] = useState("");

  useEffect(() => {
    loadSession();
    api("/api/health").then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (connectedUser?.email) {
      refreshSchools();
    } else {
      setDatabaseSchools([]);
    }
  }, [authReady, connectedUser?.email]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("recruitflow:theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("recruitflow:legalAccepted", legalAccepted ? "true" : "false");
  }, [legalAccepted]);

  useEffect(() => {
    if (connectedUser?.email) refreshHistory();
  }, [connectedUser?.email]);

  useEffect(() => {
    if (connectedUser?.email) {
      refreshBillingConfig();
    } else {
      setBillingConfig({ enabled: false, packs: [] });
    }
  }, [connectedUser?.email]);

  useEffect(() => {
    localStorage.setItem("recruitflow:profile", JSON.stringify(profile));
    if (connectedUser?.email) {
      localStorage.setItem(`recruitflow:profile:${connectedUser.email}`, JSON.stringify(profile));
    }
  }, [profile, connectedUser?.email]);

  useEffect(() => {
    if (!authReady || !connectedUser?.email) return;
    const timeout = setTimeout(() => {
      api("/api/user-profile", {
        method: "PATCH",
        body: JSON.stringify({ profileSnapshot: profile })
      }).catch(err => setGmailMsg(err.message));
    }, 700);
    return () => clearTimeout(timeout);
  }, [profile, connectedUser?.email, authReady]);

  useEffect(() => {
    setVisibleSchoolCount(SCHOOL_PAGE_SIZE);
  }, [schoolQuery, schoolDivision, schoolStateFilter]);

  useEffect(() => {
    if (!loading || !loadingStartedAt) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - loadingStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, loadingStartedAt]);

  async function refreshBillingConfig() {
    try {
      setBillingConfig(await api("/api/billing/config"));
    } catch {
      setBillingConfig({ enabled: false, packs: [] });
    }
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

  async function loadSession() {
    setGmailMsg("");
    try {
      const data = await api("/api/auth/me");
      setGoogleAuthConfigured(data.configured !== false);
      if (data.user) {
        setConnectedUser(data.user);
        localStorage.setItem("recruitflow:gmailUser", JSON.stringify(data.user));
        const savedProfile = data.user.profileSnapshot || storedProfile(data.user.email);
        if (savedProfile) {
          setProfile(prev => ({ ...prev, ...savedProfile }));
          localStorage.setItem(`recruitflow:profile:${data.user.email}`, JSON.stringify({ ...profile, ...savedProfile }));
        }
      } else {
        setConnectedUser(null);
        localStorage.removeItem("recruitflow:gmailUser");
      }
    } catch (err) {
      setGmailMsg(err.message);
    } finally {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "success") setGmailMsg("Signed in with Google.");
      if (params.get("auth") === "error") setGmailMsg(params.get("message") || "Google sign-in failed.");
      if (params.get("checkout") === "success") setGmailMsg("Payment complete. Credits may take a moment to appear after Stripe confirms the purchase.");
      if (params.get("checkout") === "canceled") setGmailMsg("Checkout canceled. No credits were added.");
      if (params.has("auth") || params.has("checkout")) {
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash || ""}`);
      }
      setAuthReady(true);
    }
  }

  function updateConnectedUser(updates) {
    setConnectedUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      localStorage.setItem("recruitflow:gmailUser", JSON.stringify(next));
      return next;
    });
  }

  function connectGmail() {
    if (!googleAuthConfigured) {
      setGmailMsg("Google login is not configured on the server yet.");
      return;
    }
    if (!legalAccepted) {
      setGmailMsg("Confirm that you are at least 13 and agree to the Privacy Policy and Terms before signing in.");
      return;
    }
    localStorage.setItem("recruitflow:profile", JSON.stringify(profile));
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  async function disconnectGmail() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    localStorage.removeItem("recruitflow:gmailUser");
    setConnectedUser(null);
    setHistory([]);
    setGmailMsg("");
  }

  async function buyCredits(packId) {
    if (!connectedUser?.email) {
      setGmailMsg("Sign in with Google before buying credits.");
      return;
    }
    setCheckoutLoading(packId);
    setGmailMsg("");
    try {
      const data = await api("/api/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ packId })
      });
      window.location.href = data.url;
    } catch (err) {
      setGmailMsg(err.message);
      setCheckoutLoading("");
    }
  }

  async function refreshHistory() {
    if (!connectedUser?.email) return;
    setHistoryLoading(true);
    try {
      const data = await api("/api/email-history");
      setHistory(data.history || []);
    } catch (err) {
      setGmailMsg(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function updateHistoryItem(id, updates) {
    if (!connectedUser?.email) return null;
    const data = await api(`/api/email-history/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates)
    });
    setHistory(prev => prev.map(item => item.id === id ? data.item : item));
    return data.item;
  }

  async function deleteHistoryItem(id) {
    if (!connectedUser?.email) return;
    await api(`/api/email-history/${id}`, { method: "DELETE" });
    setHistory(prev => prev.filter(item => item.id !== id));
  }

  function openGmailDraft({ draft, school }) {
    if (!connectedUser?.email) {
      setGmailMsg("Sign in with Google first so this draft is saved to your history.");
      return;
    }
    openGmailCompose({
      to: draft.coach_email || "",
      subject: draft.email_subject || "",
      body: draft.email_body || "",
      accountEmail: connectedUser.email
    });
    if (draft.historyId) {
      updateHistoryItem(draft.historyId, {
        status: "opened_gmail",
        email_subject: draft.email_subject || "",
        email_body: draft.email_body || ""
      }).catch(err => setGmailMsg(err.message));
    }
    if (!draft.coach_email) {
      setGmailMsg(`Opened Gmail for ${school.name}. Add the coach email manually before sending.`);
    }
  }

  function openHistoryInGmail(item) {
    openGmailCompose({
      to: item.coach?.email || "",
      subject: item.email_subject || "",
      body: item.email_body || "",
      accountEmail: connectedUser?.email || item.userEmail || ""
    });
    updateHistoryItem(item.id, { status: "opened_gmail" }).catch(err => setGmailMsg(err.message));
  }

  const availableSchools = useMemo(() => (
    databaseSchools.filter(s => !schools.some(selected => selected.id === s.id))
  ), [databaseSchools, schools]);

  const divisionOptions = useMemo(() => {
    const order = ["D1 FBS", "D1 FCS", "D2", "D3"];
    const found = [...new Set(databaseSchools.map(s => s.division).filter(Boolean))];
    return ["All", ...order.filter(item => found.includes(item)), ...found.filter(item => !order.includes(item)).sort()];
  }, [databaseSchools]);

  const stateOptions = useMemo(() => {
    const found = [...new Set(databaseSchools.map(s => s.state).filter(Boolean))].sort();
    return ["All", ...found];
  }, [databaseSchools]);

  const filteredDatabaseSchools = useMemo(() => {
    const needle = schoolQuery.trim().toLowerCase();
    return availableSchools.filter(s => {
      if (schoolDivision !== "All" && s.division !== schoolDivision) return false;
      if (schoolStateFilter !== "All" && s.state !== schoolStateFilter) return false;
      if (!needle) return true;
      return [s.name, s.shortName, s.division, s.conference, s.city, s.state]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
    });
  }, [availableSchools, schoolDivision, schoolQuery, schoolStateFilter]);

  const visibleDatabaseSchools = filteredDatabaseSchools.slice(0, visibleSchoolCount);

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

  function addTargetSchool(school = filteredDatabaseSchools[0]) {
    if (!school) return;
    if (schools.some(s => s.id === school.id)) return;
    setSchools(prev => [...prev, school]);
  }

  async function generate() {
    setError("");
    if (!connectedUser?.email) {
      setError("Sign in with Google before generating emails.");
      return;
    }
    if (missing.length) {
      setError(`Missing: ${missing.join(", ")}`);
      return;
    }
    setLoading(true);
    setLoadingStartedAt(Date.now());
    setElapsedSeconds(0);
    setResults([]);
    try {
      const data = await api("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          profile,
          schools,
          options: { maxContacts }
        })
      });
      setResults(data.results || []);
      if (typeof data.creditsRemaining === "number") {
        updateConnectedUser({ creditsRemaining: data.creditsRemaining });
      }
      if (connectedUser?.email) refreshHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStartedAt(null);
    }
  }

  return <main className="app">
    <header className="hero">
      <div className="brand"><div className="logo"><Mail size={22}/></div><div><h1>RecruitFlow</h1><p>Recruiting contact plans + AI-curated coach emails</p></div></div>
      <div className="statusPills">
        <button className="themeToggle" onClick={() => setTheme(prev => prev === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
          {theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
    </header>

    <IntroPanel/>

    <div className="workspaceBar">
      <div className="viewTabs">
        <button className={view === "compose" ? "tab active" : "tab"} onClick={() => setView("compose")}><Mail size={16}/>Compose</button>
        <button className={view === "history" ? "tab active" : "tab"} onClick={() => setView("history")}><History size={16}/>Email history</button>
      </div>
      <div className="gmailConnect">
        {connectedUser ? <>
          <span className="connectedUser"><Check size={15}/>{connectedUser.email}</span>
          <span className="creditBadge">{connectedUser.creditsRemaining ?? 15} credits</span>
          <button className="secondary small" onClick={disconnectGmail}><LogOut size={14}/>Disconnect</button>
        </> : <>
          <button className="primary smallBtn" onClick={connectGmail} disabled={!authReady || !googleAuthConfigured}><Mail size={15}/>{!authReady ? "Checking login..." : googleAuthConfigured ? "Sign in with Google" : "Google login not configured"}</button>
          <label className="legalConfirm">
            <input type="checkbox" checked={legalAccepted} onChange={e => setLegalAccepted(e.target.checked)} />
            <span>I am at least 13 and agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
          </label>
        </>}
      </div>
    </div>
    {gmailMsg && <p className="inlineNotice">{gmailMsg}</p>}
    {connectedUser && billingConfig.enabled && <CreditPanel
      credits={connectedUser.creditsRemaining ?? 15}
      packs={billingConfig.packs || []}
      loadingPack={checkoutLoading}
      onBuy={buyCredits}
    />}

    {view === "history" ? <HistoryPage
      user={connectedUser}
      history={history}
      loading={historyLoading}
      onRefresh={() => refreshHistory()}
      onDelete={deleteHistoryItem}
      onOpen={openHistoryInGmail}
      onSave={updateHistoryItem}
      onMarkSent={item => updateHistoryItem(item.id, { status: "sent" })}
    /> : <>
    <div className="grid">
      <div className="leftCol">
        <Section title="Athlete profile" icon={<Users size={18}/>}> 
          <div className="two"><Field label="First name" required><TextInput value={profile.firstName} onChange={v => up("firstName", v)}/></Field><Field label="Last name" required><TextInput value={profile.lastName} onChange={v => up("lastName", v)}/></Field></div>
          <div className="three"><Field label="Email" required><TextInput value={profile.email} onChange={v => up("email", v)}/></Field><Field label="Phone"><TextInput value={profile.phone} onChange={v => up("phone", v)}/></Field><Field label="X / Twitter"><TextInput value={profile.xHandle} onChange={v => up("xHandle", v)}/></Field></div>
          <div className="four"><Field label="High school" required><TextInput value={profile.highSchool} onChange={v => up("highSchool", v)}/></Field><Field label="City"><TextInput value={profile.city} onChange={v => up("city", v)}/></Field><Field label="State"><Select value={profile.state} onChange={v => up("state", v)} options={STATES}/></Field><Field label="Grad year"><TextInput value={profile.gradYear} onChange={v => up("gradYear", v)}/></Field></div>
          <div className="four"><Field label="Position" required><Select value={profile.position} onChange={v => up("position", v)} options={POSITIONS}/></Field><Field label="Height"><TextInput value={profile.height} onChange={v => up("height", v)}/></Field><Field label="Weight"><TextInput value={profile.weight} onChange={v => up("weight", v)}/></Field><Field label="40"><TextInput value={profile.fortyYard} onChange={v => up("fortyYard", v)}/></Field></div>
          <div className="four"><Field label="Bench"><TextInput value={profile.benchPress} onChange={v => up("benchPress", v)}/></Field><Field label="Squat"><TextInput value={profile.squat} onChange={v => up("squat", v)}/></Field><Field label="Vertical"><TextInput value={profile.vertical} onChange={v => up("vertical", v)}/></Field><Field label="Shuttle"><TextInput value={profile.shuttle} onChange={v => up("shuttle", v)}/></Field></div>
          <div className="four"><Field label="Weighted GPA" required><TextInput value={profile.gpaWeighted} onChange={v => up("gpaWeighted", v)}/></Field><Field label="UW GPA"><TextInput value={profile.gpaUnweighted} onChange={v => up("gpaUnweighted", v)}/></Field><Field label="SAT"><TextInput value={profile.sat} onChange={v => up("sat", v)}/></Field><Field label="ACT"><TextInput value={profile.act} onChange={v => up("act", v)}/></Field></div>
          <Field label="Hudl / film link" required><TextInput value={profile.hudlLink} onChange={v => up("hudlLink", v)}/></Field>
          <Field label="Additional film"><TextInput value={profile.additionalFilm} onChange={v => up("additionalFilm", v)}/></Field>
          <Field label="Strengths" required><TextArea rows={3} value={profile.strengths} onChange={v => up("strengths", v)} placeholder="What makes you stand out? Position-specific traits, film highlights, captaincy, speed, route running, toughness..."/></Field>
          <Field label="Areas of growth"><TextArea rows={2} value={profile.weaknesses} onChange={v => up("weaknesses", v)} placeholder="What are you actively improving?"/></Field>
          <div className="profileBuilderPanel">
            <div className="profileBuilderHeader">
              <strong>Profile builder</strong>
              <span>Honors, stats, awards, leadership, camps, and verified football notes</span>
            </div>
            <Field label="Athletic awards"><TextArea rows={3} value={profile.athleticAwards} onChange={v => up("athleticAwards", v)} placeholder="All-district, team captain, varsity starter, camp MVP, all-conference, academic all-state, verified season stats..."/></Field>
          </div>
          <div className="customInstructionsPanel">
            <div className="customInstructionsHeader">
              <strong>Custom email instructions</strong>
              <span>Personal story, injury comeback, special request, or details you want included</span>
            </div>
            <TextArea rows={4} value={profile.customInstructions} onChange={v => up("customInstructions", v)} placeholder="Example: Mention that I missed part of junior year with a shoulder injury, came back for the final 4 games, and would like feedback on whether I should attend their summer camp."/>
          </div>
          <Field label="Extra context"><TextArea rows={2} value={profile.additionalNotes} onChange={v => up("additionalNotes", v)} placeholder="Academic interests, camps attended, coach relationship, visit plans..."/></Field>
        </Section>
      </div>

      <div className="targetCol">
        <Section title="Target schools" icon={<Search size={18}/>}> 
          <div className="targetBuilder">
            <div className="targetBuilderHeader">
              <div>
                <strong>Build your outreach list</strong>
                <span>Pick the schools you want emails for. Selected schools stay here while you search.</span>
              </div>
              <div className="targetCounter">
                <strong>{schools.length}</strong>
                <span>selected</span>
              </div>
            </div>

            <div className={schools.length ? "targetSelection hasItems" : "targetSelection"}>
              {schools.length ? schools.map(s => <TargetSchoolItem key={s.id} school={s} onRemove={() => setSchools(prev => prev.filter(x => x.id !== s.id))}/>) : <div className="targetEmpty">
                <Check size={18}/>
                <span>No target schools selected yet</span>
              </div>}
            </div>

            <div className="schoolFinderPanel">
              <div className="finderTopline">
                <div className="finderSearch">
                  <Search size={17}/>
                  <TextInput value={schoolQuery} onChange={setSchoolQuery} placeholder="Search schools, conferences, cities, or states" onKeyDown={e => e.key === "Enter" && addTargetSchool()}/>
                </div>
                <label className="finderState">
                  <MapPin size={15}/>
                  <select value={schoolStateFilter} onChange={e => setSchoolStateFilter(e.target.value)}>
                    {stateOptions.map(state => <option key={state} value={state}>{state === "All" ? "All states" : state}</option>)}
                  </select>
                </label>
              </div>

              <div className="finderFilters">
                <span><Filter size={14}/>Level</span>
                <div className="finderPills">
                  {divisionOptions.map(division => <button key={division} className={schoolDivision === division ? "finderPill active" : "finderPill"} onClick={() => setSchoolDivision(division)}>{division}</button>)}
                </div>
                {(schoolQuery || schoolDivision !== "All" || schoolStateFilter !== "All") && <button className="clearFinder" onClick={() => { setSchoolQuery(""); setSchoolDivision("All"); setSchoolStateFilter("All"); }}>Clear</button>}
              </div>

              <div className="schoolResultsHeader">
                <strong>{filteredDatabaseSchools.length ? `${filteredDatabaseSchools.length} matches` : "No matches"}</strong>
                <span>{filteredDatabaseSchools.length ? `Showing ${visibleDatabaseSchools.length}` : "Try a different search or filter"}</span>
              </div>
              <div className="schoolResultList">
                {visibleDatabaseSchools.map(s => <SchoolResultRow key={s.id} school={s} onSelect={addTargetSchool}/>)}
                {filteredDatabaseSchools.length === 0 && <p className="emptyState">No saved schools match those filters.</p>}
              </div>
              {visibleDatabaseSchools.length < filteredDatabaseSchools.length && <button className="showMoreSchools" onClick={() => setVisibleSchoolCount(count => count + SCHOOL_PAGE_SIZE)}>Show {Math.min(SCHOOL_PAGE_SIZE, filteredDatabaseSchools.length - visibleDatabaseSchools.length)} more</button>}
            </div>
          </div>
          <div className="options">
            <Field label="Max contacts per school"><Select value={String(maxContacts)} onChange={v => setMaxContacts(Number(v))} options={["1","2","3","4"]}/></Field>
          </div>
          {error && <p className="error">{error}</p>}
          {loading && <GenerationWait schoolCount={schools.length} maxContacts={maxContacts} provider={health?.draftProvider || "local-template"} elapsedSeconds={elapsedSeconds}/>}
          <button className="generate" disabled={loading} onClick={generate}>{loading ? <RefreshCw className="spin" size={18}/> : <Mail size={18}/>} {loading ? "Generating..." : `Generate contact plans + AI emails`}</button>
        </Section>
      </div>
    </div>

    <Results results={results} setResults={setResults} profile={profile} connectedUser={connectedUser} onOpenGmail={openGmailDraft} onCreditsChange={credits => updateConnectedUser({ creditsRemaining: credits })}/>
    </>}
    <footer className="appFooter">
      <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
      <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      <span>Users must be at least 13.</span>
    </footer>
  </main>;
}

function CreditPanel({ credits, packs, loadingPack, onBuy }) {
  if (!packs.length) return null;
  return <section className="creditPanel">
    <div>
      <strong><CreditCard size={17}/>Credits</strong>
      <span>{credits} remaining. Each generated draft or rewrite uses 1 credit.</span>
    </div>
    <div className="creditPackButtons">
      {packs.map(pack => <button key={pack.id} className="secondary small" disabled={Boolean(loadingPack)} onClick={() => onBuy(pack.id)}>
        {loadingPack === pack.id ? <RefreshCw className="spin" size={14}/> : <Plus size={14}/>}
        Buy {pack.label}{pack.priceLabel ? ` - ${pack.priceLabel}` : ""}
      </button>)}
    </div>
  </section>;
}

function historyStatus(item) {
  return item.status === "sent" ? "sent" : "draft";
}

function HistoryPage({ user, history, loading, onRefresh, onDelete, onOpen, onSave, onMarkSent }) {
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState("");
  const [draftEdit, setDraftEdit] = useState({ email_subject: "", email_body: "" });
  const [savingId, setSavingId] = useState("");

  if (!user) {
    return <section className="section historyPage">
      <h2><History size={18}/>Email history</h2>
      <p className="muted">Sign in with Google to save generated emails to your history dashboard.</p>
    </section>;
  }

  const sentCount = history.filter(item => historyStatus(item) === "sent").length;
  const draftCount = history.length - sentCount;
  const visibleHistory = history.filter(item => {
    if (filter === "drafts") return historyStatus(item) === "draft";
    if (filter === "sent") return historyStatus(item) === "sent";
    return true;
  });

  function startEditing(item) {
    setEditingId(item.id);
    setDraftEdit({
      email_subject: item.email_subject || "",
      email_body: item.email_body || ""
    });
  }

  async function saveEdit(item) {
    setSavingId(item.id);
    try {
      await onSave(item.id, draftEdit);
      setEditingId("");
    } finally {
      setSavingId("");
    }
  }

  return <section className="section historyPage">
    <div className="historyTop">
      <div>
        <h2><History size={18}/>Email history</h2>
        <p className="muted">Tracked for {user.email}. Drafts stay editable here. To actually send, open the draft in Gmail and send it there, then mark it sent here.</p>
      </div>
      <button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? <RefreshCw className="spin" size={16}/> : <RefreshCw size={16}/>}Refresh</button>
    </div>
    <div className="historySummary">
      <button className={filter === "all" ? "historyMetric active" : "historyMetric"} onClick={() => setFilter("all")}><strong>{history.length}</strong><span>All emails</span></button>
      <button className={filter === "drafts" ? "historyMetric active" : "historyMetric"} onClick={() => setFilter("drafts")}><strong>{draftCount}</strong><span>Drafts</span></button>
      <button className={filter === "sent" ? "historyMetric active" : "historyMetric"} onClick={() => setFilter("sent")}><strong>{sentCount}</strong><span>Marked sent</span></button>
    </div>
    {!history.length && <div className="emptyHistory">
      <Mail size={28}/>
      <strong>No generated emails yet</strong>
      <span>Generate outreach from the Compose page and it will appear here.</span>
    </div>}
    {history.length > 0 && visibleHistory.length === 0 && <div className="emptyHistory compact">
      <Mail size={24}/>
      <strong>No emails in this view</strong>
      <span>Switch filters to see the rest of your history.</span>
    </div>}
    <div className="historyList">
      {visibleHistory.map(item => {
        const status = historyStatus(item);
        const isEditing = editingId === item.id;
        return <article className="historyItem" key={item.id}>
          <div className="historyMain">
            <div className="historyTitle">
              <strong>{item.school?.name || "Unknown school"}</strong>
              <span className={`statusTag ${status}`}>{status}</span>
            </div>
            <div className="historyMetaGrid">
              <span><b>Coach</b>{item.coach?.name || "Coach"}{item.coach?.title ? ` · ${item.coach.title}` : ""}</span>
              <span><b>To</b>{item.coach?.email || item.email_lookup_tip || "No coach email saved"}<CoachXLink handle={item.coach?.xHandle} url={item.coach?.xUrl}/></span>
              <span><b>School</b>{[item.school?.division, item.school?.conference].filter(Boolean).join(" · ") || "Saved school"}</span>
            </div>
            {item.status === "opened_gmail" && status === "draft" && <p className="historyNote">Opened in Gmail, but still tracked as a draft until you mark it sent.</p>}
            {isEditing ? <div className="historyEditor">
              <Field label="Subject"><TextInput value={draftEdit.email_subject} onChange={v => setDraftEdit(prev => ({ ...prev, email_subject: v }))}/></Field>
              <Field label="Body"><TextArea rows={9} value={draftEdit.email_body} onChange={v => setDraftEdit(prev => ({ ...prev, email_body: v }))}/></Field>
            </div> : <>
              <h3>{item.email_subject}</h3>
              <p className="historyBody">{item.email_body}</p>
            </>}
            <small>Generated {new Date(item.createdAt).toLocaleString()}{item.sentAt ? ` · Marked sent ${new Date(item.sentAt).toLocaleString()}` : ""}</small>
          </div>
          <div className="historyActions">
            <button className="primary smallBtn" onClick={() => onOpen(item)}><ExternalLink size={14}/>Open in Gmail</button>
            {status === "draft" && (isEditing ? <>
              <button className="secondary small" onClick={() => saveEdit(item)} disabled={savingId === item.id}>{savingId === item.id ? <RefreshCw className="spin" size={14}/> : <Check size={14}/>}Save edits</button>
              <button className="secondary small" onClick={() => setEditingId("")}>Cancel</button>
            </> : <button className="secondary small" onClick={() => startEditing(item)}><Copy size={14}/>Edit draft</button>)}
            <button className="secondary small" onClick={() => onMarkSent(item)} disabled={status === "sent"}><Check size={14}/>{status === "sent" ? "Sent" : "Mark as sent"}</button>
            {status === "draft" && <small className="actionHint">Tracker only. Send from Gmail first.</small>}
            <button className="danger small" onClick={() => onDelete(item.id)}><Trash2 size={14}/>Delete</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function Results({ results, setResults, profile, connectedUser, onOpenGmail, onCreditsChange }) {
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
        dataQuality: { ...school.dataQuality, draftCached: false },
        drafts: school.drafts.map((d, j) => j !== draftIdx ? d : { ...d, ...(data.draft || {}) })
      }));
      if (typeof data.creditsRemaining === "number") onCreditsChange?.(data.creditsRemaining);
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
    <p className="muted">Review and edit each draft before opening it in Gmail. Generated emails are saved to your history.</p>
    {results.map((r, i) => <article className="resultCard" key={r.school.id || r.school.name}>
      <div className="resultHeader"><div><h3>{r.school.name}</h3><p>{r.school.division}{r.school.conference ? ` · ${r.school.conference}` : ""}</p></div></div>
      <div className="quality"><span>{r.dataQuality.contactsInDatabase} DB contacts</span><span>{r.dataQuality.contactsWithEmails} selected emails</span><span>Confidence: {r.dataQuality.schoolConfidence}</span></div>
      {r.programSummary && <p className="summary">{r.programSummary}</p>}
      <h4>Recommended contact order</h4>
      <div className="contacts">{r.contacts.map(c => <div className="contact" key={c.id}><strong>{c.name}</strong><span>{c.title}</span><small>{c.recommendedReason}</small><span className="contactMeta">{c.email ? <code>{c.email}</code> : <em>No email saved</em>}<CoachXLink handle={c.xHandle} url={c.xUrl}/></span></div>)}</div>
      <h4>Drafts</h4>
      <div className="drafts">{(r.drafts || []).map((d, j) => {
        const full = `To: ${d.coach_email || "[find email]"}\nSubject: ${d.email_subject}\n\n${d.email_body}`;
        return <div className="draft" key={`${d.coach_id || j}`}>
          <div className="draftTop"><div><strong>{d.coach_name}</strong><span>{d.coach_title}</span><span className="contactMeta">{d.coach_email ? <code>{d.coach_email}</code> : <em>{d.email_lookup_tip || "Find email manually"}</em>}<CoachXLink handle={d.coach_x_handle} url={d.coach_x_url}/></span></div><div className="draftActions"><button className="primary smallBtn" onClick={() => onOpenGmail?.({ draft: d, school: r.school })}><ExternalLink size={14}/>Open in Gmail</button><CopyButton text={full} label="Copy full"/></div></div>
          {!connectedUser && <p className="muted compactNotice">Sign in with Google first if you want this email saved to your history.</p>}
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
