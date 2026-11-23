
import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical, LayoutDashboard, Search, CalendarDays,
  ShieldCheck, Sparkles, Cpu, Printer, CircuitBoard,
  Monitor, Activity, ArrowUpRight, CheckCircle2,
  XCircle, Clock3, Menu, X, ChevronRight, Zap,
  AlertTriangle, BookOpen, RotateCcw
} from "lucide-react";
import "./App.css";

const EQUIPMENT = [
  { id: "jetson", name: "NVIDIA Jetson Nano", dept: "AI & Robotics", category: "AI Computing", location: "Innovation Lab · A-204", icon: Cpu, color: "mint", description: "Edge AI development, computer vision and autonomous systems." },
  { id: "printer", name: "Ultimaker 3D Printer", dept: "Mechanical", category: "Fabrication", location: "Maker Space · B-102", icon: Printer, color: "violet", description: "High-precision prototyping and additive manufacturing." },
  { id: "pi", name: "Raspberry Pi 5 Kit", dept: "Computer Science", category: "IoT & Embedded", location: "IoT Studio · C-301", icon: CircuitBoard, color: "blue", description: "Embedded systems, sensors and connected device projects." },
  { id: "gpu", name: "RTX GPU Workstation", dept: "AI & Robotics", category: "AI Computing", location: "Compute Lab · A-208", icon: Monitor, color: "orange", description: "Deep learning experiments and accelerated model training." },
  { id: "scope", name: "Digital Oscilloscope", dept: "Electronics", category: "Measurement", location: "Electronics Lab · D-105", icon: Activity, color: "blue", description: "Electronic signal analysis, testing and circuit debugging." },
  { id: "arduino", name: "Arduino Sensor Kit", dept: "Electronics", category: "IoT & Embedded", location: "Innovation Lab · C-303", icon: CircuitBoard, color: "violet", description: "Sensor integration, microcontrollers and rapid IoT prototyping." }
];

const HOURS = ["09:00", "11:00", "13:00", "15:00"];
const STORAGE_KEY = "lablink-demo-v1";
const dateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const today = () => dateKey(new Date());
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
const safeRead = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};
const overlaps = (a, b) =>
  a.equipmentId === b.equipmentId &&
  a.date === b.date &&
  a.time === b.time &&
  a.status === "approved";

function recommend(request, bookings) {
  const occupied = bookings.filter(b =>
    b.equipmentId === request.equipmentId &&
    b.status === "approved"
  );
  const conflict = occupied.some(b =>
    b.date === request.date && b.time === request.time
  );
  const alternatives = [];
  const start = new Date(`${request.date}T12:00:00`);
  for (let day = 0; day < 7 && alternatives.length < 3; day++) {
    const d = new Date(start);
    d.setDate(d.getDate() + day);
    const date = dateKey(d);
    if (date > request.deadline) continue;
    for (const time of HOURS) {
      if (date === request.date && time === request.time) continue;
      if (date === today() && time <= new Date().toTimeString().slice(0,5)) continue;
      if (!occupied.some(b => b.date === date && b.time === time)) {
        alternatives.push({ date, time });
      }
      if (alternatives.length >= 3) break;
    }
  }
  return { conflict, alternatives };
}

export default function App() {
  const [page, setPage] = useState("overview");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [bookings, setBookings] = useState(safeRead);
  const [selected, setSelected] = useState(null);
  const [project, setProject] = useState("");
  const [student, setStudent] = useState("");
  const [date, setDate] = useState(addDays(1));
  const [deadline, setDeadline] = useState(addDays(7));
  const [time, setTime] = useState("09:00");
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  }, [bookings]);

  const categories = ["All", ...new Set(EQUIPMENT.map(e => e.category))];
  const filtered = useMemo(() => EQUIPMENT.filter(e =>
    (category === "All" || e.category === category) &&
    `${e.name} ${e.dept} ${e.description}`.toLowerCase().includes(search.toLowerCase())
  ), [search, category]);

  const approved = bookings.filter(b => b.status === "approved").length;
  const pending = bookings.filter(b => b.status === "pending").length;
  const conflicts = bookings.filter(b => b.status === "conflict").length;

  function openBooking(equipment) {
    setSelected(equipment);
    setNotice("");
  }

  function submitBooking(e) {
    e.preventDefault();
    if (!selected || !project.trim() || !student.trim()) return;
    if (date < today() || deadline < date) {
      setNotice("Choose a valid date and a deadline on or after the booking date.");
      return;
    }
    if (date === today() && time <= new Date().toTimeString().slice(0,5)) {
      setNotice("Please choose a future time.");
      return;
    }

    const request = {
      id: crypto.randomUUID(),
      equipmentId: selected.id,
      equipmentName: selected.name,
      project: project.trim(),
      student: student.trim(),
      date, time, deadline,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const result = recommend(request, bookings);
    if (result.conflict) request.status = "conflict";
    setBookings(prev => [request, ...prev]);
    setSelected(null);
    setProject("");
    setNotice(result.conflict
      ? "Scheduling conflict detected. Open AI Scheduler for alternatives."
      : "Request submitted! Awaiting faculty approval.");
    setPage("bookings");
  }

  function updateStatus(id, status) {
    const target = bookings.find(b => b.id === id);
    if (!target) return;
    if (status === "approved") {
      if (bookings.some(b => b.id !== id && overlaps(target, b))) {
        setNotice("Approval blocked: this equipment slot is already reserved.");
        return;
      }
      if (target.date < today()) {
        setNotice("Past bookings cannot be approved.");
        return;
      }
    }
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    setNotice(`Request ${status}.`);
  }

  function applyAlternative(id, alternative) {
    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, date: alternative.date, time: alternative.time, status: "pending" }
      : b
    ));
    setNotice("Alternative slot selected. Faculty approval is required.");
  }

  const nav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "equipment", label: "Equipment Explorer", icon: Search },
    { id: "bookings", label: "My Bookings", icon: CalendarDays },
    { id: "scheduler", label: "AI Scheduler", icon: Sparkles },
    { id: "faculty", label: "Faculty Console", icon: ShieldCheck }
  ];

  return (
    <div className="app">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="logo"><div className="logo-mark"><FlaskConical size={23}/></div><span>lablink<span className="accent">.</span><small>AI</small></span></div>
        <div className="side-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(n => <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`}
            onClick={() => { setPage(n.id); setMenu(false); setNotice(""); }}>
            <n.icon size={19}/><span>{n.label}</span>{page === n.id && <span className="nav-indicator"/>}
          </button>)}
        </nav>
        <div className="sidebar-footer">
          <div className="online-dot"/> DEMO ENVIRONMENT
          <p>Explore every feature without login. Data stays in this browser.</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMenu(!menu)} aria-label="Toggle navigation"><Menu size={22}/></button>
          <div className="breadcrumb">CAMPUS NETWORK <ChevronRight size={13}/> <strong>{nav.find(n => n.id === page)?.label}</strong></div>
          <div className="top-right"><span className="live-pill"><span className="online-dot"/> SYSTEM ONLINE</span><span className="avatar">LL</span></div>
        </header>

        <div className="content">
          {notice && <div className="notice" role="status"><Zap size={17}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16}/></button></div>}

          {page === "overview" && <>
            <section className="hero">
              <div className="hero-lines"/>
              <div className="hero-text">
                <div className="eyebrow"><span className="online-dot"/> THE FUTURE OF CAMPUS INNOVATION</div>
                <h1>Great ideas need<br/><em>room to grow.</em></h1>
                <p>One intelligent network connecting students, laboratories and the equipment that powers tomorrow's breakthroughs.</p>
                <button className="primary-btn" onClick={() => setPage("equipment")}>Explore resources <ArrowUpRight size={18}/></button>
              </div>
              <div className="hero-art" aria-hidden="true"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orbit orbit-c"/><FlaskConical size={94} strokeWidth={1}/><span className="orbital-dot"/></div>
            </section>

            <div className="stats">
              <Stat icon={Cpu} label="LAB RESOURCES" value={EQUIPMENT.length} sub="Across campus" color="mint"/>
              <Stat icon={CalendarDays} label="TOTAL REQUESTS" value={bookings.length} sub={`${pending} awaiting approval`} color="blue"/>
              <Stat icon={CheckCircle2} label="APPROVED SLOTS" value={approved} sub="Confirmed reservations" color="violet"/>
              <Stat icon={AlertTriangle} label="CONFLICTS" value={conflicts} sub="Need resolution" color="orange"/>
            </div>

            <div className="section-head"><div><div className="eyebrow">EXPLORE THE NETWORK</div><h2>Featured resources</h2></div><button className="text-link" onClick={() => setPage("equipment")}>View all equipment <ArrowUpRight size={17}/></button></div>
            <EquipmentGrid items={EQUIPMENT.slice(0,3)} onBook={openBooking}/>
            <div className="insight-banner"><Sparkles size={23}/><div><strong>Smarter scheduling, fairer access.</strong><p>LabLink analyzes availability and project deadlines to suggest feasible booking alternatives.</p></div><button onClick={() => setPage("scheduler")}>Try Scheduler <ArrowUpRight size={16}/></button></div>
          </>}

          {page === "equipment" && <>
            <PageHeader eyebrow="RESOURCE DISCOVERY" title="Equipment Explorer" description="Discover specialized equipment across every department."/>
            <div className="search-wrap"><Search size={20}/><input aria-label="Search equipment" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search equipment, department or capabilities..."/></div>
            <div className="filters">{categories.map(c => <button key={c} className={category === c ? "filter selected" : "filter"} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
            <div className="results-count">{filtered.length} RESOURCES FOUND</div>
            <EquipmentGrid items={filtered} onBook={openBooking}/>
            {!filtered.length && <div className="empty">No matching resources. Try another search.</div>}
          </>}

          {page === "bookings" && <>
            <PageHeader eyebrow="YOUR PROJECTS" title="Booking Requests" description="Track requests, approvals and equipment access."/>
            <div className="section-head"><h2>All requests</h2><button className="secondary-btn" onClick={() => setPage("equipment")}>+ New request</button></div>
            <BookingList bookings={bookings}/>
          </>}

          {page === "scheduler" && <>
            <PageHeader eyebrow="INTELLIGENT ALLOCATION" title="Smart Scheduler" description="Transparent, rule-based conflict resolution that considers availability and project deadlines."/>
            <div className="scheduler-intro"><Sparkles size={25}/><div><h3>Fair access. Better outcomes.</h3><p>Confirmed slots are protected. Conflicting requests receive alternative available times before their deadlines. Faculty review remains required.</p></div></div>
            {bookings.filter(b => b.status === "conflict").length === 0
              ? <div className="empty"><CheckCircle2 size={30}/><h3>No unresolved conflicts</h3><p>Try booking an already approved slot to demonstrate conflict resolution.</p></div>
              : bookings.filter(b => b.status === "conflict").map(b => {
                const r = recommend(b, bookings.filter(x => x.id !== b.id));
                return <div className="conflict-card" key={b.id}>
                  <div className="conflict-top"><span className="tag orange"><AlertTriangle size={14}/> CONFLICT DETECTED</span><span>{b.date} · {b.time}</span></div>
                  <h3>{b.equipmentName}</h3><p>{b.project} · {b.student}</p>
                  <div className="reason"><Sparkles size={18}/><span>This slot is occupied by an approved reservation. Choose a free alternative before the project deadline ({b.deadline}).</span></div>
                  <div className="alternative-list">
                    {r.alternatives.length ? r.alternatives.map((a,i) => <button key={`${a.date}-${a.time}`} onClick={() => applyAlternative(b.id,a)}><CalendarDays size={17}/><span>{a.date} · {a.time}</span>{i === 0 && <span className="recommended">RECOMMENDED</span>}<ArrowUpRight size={16}/></button>) : <p>No alternative found within the next seven days and before the deadline.</p>}
                  </div>
                </div>;
              })}
          </>}

          {page === "faculty" && <>
            <PageHeader eyebrow="RESOURCE GOVERNANCE" title="Faculty Console" description="Demo approval workspace. In production, only verified faculty will be authorized to approve requests."/>
            <div className="faculty-warning"><ShieldCheck size={20}/> DEMO MODE — These approvals affect local sample data only. They do not grant real faculty permissions.</div>
            <div className="stats compact">
              <Stat icon={Clock3} label="PENDING" value={pending} sub="Awaiting review" color="orange"/>
              <Stat icon={CheckCircle2} label="APPROVED" value={approved} sub="Confirmed" color="mint"/>
              <Stat icon={XCircle} label="REJECTED" value={bookings.filter(b => b.status === "rejected").length} sub="Declined requests" color="violet"/>
            </div>
            <div className="section-head"><h2>Approval queue</h2></div>
            {bookings.filter(b => ["pending","conflict"].includes(b.status)).length === 0
              ? <div className="empty"><BookOpen size={30}/><h3>All caught up</h3><p>New equipment requests will appear here.</p></div>
              : bookings.filter(b => ["pending","conflict"].includes(b.status)).map(b => <div className="approval-row" key={b.id}>
                <div><span className={`tag ${b.status === "conflict" ? "orange" : "blue"}`}>{b.status.toUpperCase()}</span><h3>{b.equipmentName}</h3><p>{b.student} · {b.project}</p><small>{b.date} at {b.time} · Deadline: {b.deadline}</small></div>
                <div className="approval-actions"><button className="reject-btn" onClick={() => updateStatus(b.id,"rejected")}><XCircle size={16}/> Reject</button><button className="approve-btn" onClick={() => updateStatus(b.id,"approved")}><CheckCircle2 size={16}/> Approve</button></div>
              </div>)}
          </>}
        </div>
      </main>

      {selected && <div className="modal-overlay" onMouseDown={e => { if(e.target === e.currentTarget) setSelected(null); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
          <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X size={20}/></button>
          <div className="eyebrow">REQUEST LAB ACCESS</div><h2 id="booking-title">{selected.name}</h2><p className="modal-subtitle">Submit a project-based request for faculty review.</p>
          <form onSubmit={submitBooking}>
            <label>Student name<input required maxLength={80} value={student} onChange={e => setStudent(e.target.value)} placeholder="Your full name"/></label>
            <label>Project title<input required maxLength={120} value={project} onChange={e => setProject(e.target.value)} placeholder="e.g. Autonomous Navigation"/></label>
            <div className="form-grid"><label>Booking date<input required type="date" min={today()} value={date} onChange={e => setDate(e.target.value)}/></label><label>Project deadline<input required type="date" min={date} value={deadline} onChange={e => setDeadline(e.target.value)}/></label></div>
            <label>Preferred time slot<select value={time} onChange={e => setTime(e.target.value)}>{HOURS.map(h => <option key={h} value={h}>{h} — {String(Number(h.slice(0,2))+2).padStart(2,"0")}:00</option>)}</select></label>
            <div className="form-note"><Clock3 size={16}/> Each booking is a two-hour session. Faculty approval is required.</div>
            <button type="submit" className="primary-btn full">Submit access request <ArrowUpRight size={18}/></button>
          </form>
        </div>
      </div>}
    </div>
  );
}

function PageHeader({ eyebrow, title, description }) {
  return <div className="page-header"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>;
}
function Stat({ icon: Icon, label, value, sub, color }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${color}`}><Icon size={20}/></div></div><strong>{value}</strong><small>{sub}</small></div>;
}
function EquipmentGrid({ items, onBook }) {
  return <div className="equipment-grid">{items.map(e => <article className="equipment-card" key={e.id}>
    <div className="equipment-card-top"><div className={`equipment-icon ${e.color}`}><e.icon size={31} strokeWidth={1.6}/></div><span className="available"><span className="online-dot"/> LISTED</span></div>
    <div className="equipment-dept">{e.dept}</div><h3>{e.name}</h3><p>{e.description}</p>
    <div className="equipment-bottom"><span>{e.location}</span><button onClick={() => onBook(e)} aria-label={`Request ${e.name}`}><ArrowUpRight size={19}/></button></div>
  </article>)}</div>;
}
function BookingList({ bookings }) {
  if (!bookings.length) return <div className="empty"><CalendarDays size={30}/><h3>No bookings yet</h3><p>Explore equipment and submit your first project request.</p></div>;
  return <div className="booking-list">{bookings.map(b => <div className="booking-row" key={b.id}><div className="booking-icon"><CalendarDays size={22}/></div><div className="booking-info"><h3>{b.equipmentName}</h3><p>{b.project} · {b.student}</p><small>{b.date} at {b.time} · Deadline {b.deadline}</small></div><span className={`tag ${b.status === "approved" ? "mint" : b.status === "conflict" ? "orange" : b.status === "rejected" ? "red" : "blue"}`}>{b.status.toUpperCase()}</span></div>)}</div>;
}
