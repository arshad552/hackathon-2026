
import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical, LayoutDashboard, Search, CalendarDays,
  ShieldCheck, Sparkles, Cpu, Printer, CircuitBoard,
  Monitor, Activity, ArrowUpRight, CheckCircle2,
  XCircle, Clock3, Menu, X, ChevronRight, Zap,
  AlertTriangle, BookOpen, CalendarClock, Lightbulb,
  TrendingUp, Target, ChevronLeft, LogOut, UserRound, Settings2
} from "lucide-react";
import "./App.css";
import { addDays, CAMPUS_TIME_ZONE, currentTime, HOURS, isSlotOccupied, recommend, recommendEquipmentWithReasons, today, overlaps } from "./scheduling";
import AuthDialog from "./components/AuthDialog";
import { auth, firebaseConfigured } from "./services/firebase";
import { observeAuth, signOutUser } from "./services/auth";
import { createBookingRequest, ensureRole, recommendProjectEquipment, reviewBooking, seedEquipment as seedCloudEquipment, setUserRole, watchBookings, watchEquipment, rescheduleBooking } from "./services/cloud";

const EQUIPMENT = [
  { id: "jetson", name: "NVIDIA Jetson Nano", dept: "AI & Robotics", category: "AI Computing", location: "Innovation Lab · A-204", icon: Cpu, color: "mint", description: "Edge AI development, computer vision and autonomous systems.", specs: ["4 GB edge compute", "CUDA-enabled", "On-site induction"], keywords: ["edge ai", "computer vision", "robotics", "autonomous", "machine learning"] },
  { id: "printer", name: "Ultimaker 3D Printer", dept: "Mechanical", category: "Fabrication", location: "Maker Space · B-102", icon: Printer, color: "violet", description: "High-precision prototyping and additive manufacturing.", specs: ["Dual extrusion", "Build volume 215 mm", "PLA / PETG"], keywords: ["3d printing", "prototyping", "fabrication", "mechanical"] },
  { id: "pi", name: "Raspberry Pi 5 Kit", dept: "Computer Science", category: "IoT & Embedded", location: "IoT Studio · C-301", icon: CircuitBoard, color: "blue", description: "Embedded systems, sensors and connected device projects.", specs: ["8 GB RAM", "GPIO sensor pack", "Power supply included"], keywords: ["iot", "embedded", "sensors", "connected device", "raspberry pi"] },
  { id: "gpu", name: "RTX GPU Workstation", dept: "AI & Robotics", category: "AI Computing", location: "Compute Lab · A-208", icon: Monitor, color: "orange", description: "Deep learning experiments and accelerated model training.", specs: ["24 GB VRAM", "CUDA toolkit", "Linux workstation"], keywords: ["deep learning", "computer vision", "model training", "gpu", "machine learning", "ai"] },
  { id: "scope", name: "Digital Oscilloscope", dept: "Electronics", category: "Measurement", location: "Electronics Lab · D-105", icon: Activity, color: "blue", description: "Electronic signal analysis, testing and circuit debugging.", specs: ["4-channel, 100 MHz", "Probe set included", "Electronics induction"], keywords: ["electronics", "signal", "circuit", "measurement", "debugging"] },
  { id: "arduino", name: "Arduino Sensor Kit", dept: "Electronics", category: "IoT & Embedded", location: "Innovation Lab · C-303", icon: CircuitBoard, color: "violet", description: "Sensor integration, microcontrollers and rapid IoT prototyping.", specs: ["Arduino-compatible", "12 sensor modules", "USB-C connection"], keywords: ["sensors", "microcontroller", "iot", "embedded", "prototyping"] }
];

const STORAGE_KEY = "lablink-demo-v1";
const safeRead = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

function addEquipmentVisuals(items) {
  return items.map(item => {
    const visual = EQUIPMENT.find(equipment => equipment.id === item.id);
    return {
      ...visual,
      ...item,
      icon: visual?.icon || Cpu,
      color: visual?.color || "mint",
      specs: Array.isArray(item.specs) ? item.specs : [],
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
    };
  });
}

function errorMessage(error) {
  return error?.message || "Unexpected error. Please try again.";
}

export default function App() {
  const [page, setPage] = useState("overview");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [bookings, setBookings] = useState(safeRead);
  const [equipment, setEquipment] = useState(EQUIPMENT);
  const [selected, setSelected] = useState(null);
  const [project, setProject] = useState("");
  const [student, setStudent] = useState("");
  const [date, setDate] = useState(addDays(1));
  const [deadline, setDeadline] = useState(addDays(7));
  const [time, setTime] = useState("09:00");
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const [calendarStart, setCalendarStart] = useState(today());
  const [calendarEquipment, setCalendarEquipment] = useState(EQUIPMENT[0].id);
  const [projectAnalysis, setProjectAnalysis] = useState("");
  const [projectRecommendations, setProjectRecommendations] = useState([]);
  const [recommendationSource, setRecommendationSource] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [role, setRole] = useState("student");
  const [authLoading, setAuthLoading] = useState(firebaseConfigured);
  const [authDialog, setAuthDialog] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [adminUid, setAdminUid] = useState("");
  const [adminRole, setAdminRole] = useState("faculty");
  const canReviewLive = role === "admin" || (role === "faculty" && authUser?.emailVerified === true);

  useEffect(() => {
    if (!authUser && !authLoading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    }
  }, [bookings, authUser, authLoading]);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      return undefined;
    }
    let active = true;
    const unsubscribe = observeAuth(user => {
      if (!active) return;
      if (!user) {
        setAuthUser(null);
        setRole("student");
        setBookings(safeRead());
        setEquipment(EQUIPMENT);
        setBookingLoading(false);
        setEquipmentLoading(false);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      setBookings([]);
      setEquipment([]);
      setBookingLoading(true);
      setEquipmentLoading(true);
      (async () => {
        try {
          let token = await user.getIdTokenResult();
          if (!["student", "faculty", "admin"].includes(token.claims.role)) {
            await ensureRole();
            await user.getIdToken(true);
            token = await user.getIdTokenResult();
          }
          if (!active) return;
          setRole(["student", "faculty", "admin"].includes(token.claims.role) ? token.claims.role : "student");
          setAuthUser(user);
          setAuthLoading(false);
        } catch (error) {
          if (!active) return;
          setRole("student");
          setAuthUser(user);
          setAuthLoading(false);
          setNotice(`Signed in with the student role, but role setup could not be verified: ${errorMessage(error)}`);
        }
      })();
    }, error => {
      if (!active) return;
      setAuthLoading(false);
      setNotice(`Firebase Authentication failed: ${errorMessage(error)}`);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser || authLoading) return undefined;
    let active = true;
    let stopEquipment;
    let stopBookings;

    try {
      stopEquipment = watchEquipment(items => {
        if (!active) return;
        setEquipment(addEquipmentVisuals(items));
        setEquipmentLoading(false);
      }, error => {
        if (!active) return;
        setEquipmentLoading(false);
        setNotice(`Equipment could not be loaded from Firestore: ${errorMessage(error)}`);
      });
      stopBookings = watchBookings(authUser, canReviewLive ? role : "student", items => {
        if (!active) return;
        setBookings(items);
        setBookingLoading(false);
      }, error => {
        if (!active) return;
        setBookingLoading(false);
        setNotice(`Booking history could not be loaded: ${errorMessage(error)}`);
      });
    } catch (error) {
      queueMicrotask(() => {
        if (!active) return;
        setEquipmentLoading(false);
        setBookingLoading(false);
        setNotice(`Firebase services are unavailable: ${errorMessage(error)}`);
      });
    }

    return () => {
      active = false;
      stopEquipment?.();
      stopBookings?.();
    };
  }, [authUser, authLoading, role, canReviewLive]);

  const categories = ["All", ...new Set(equipment.map(e => e.category))];
  const filtered = useMemo(() => equipment.filter(e =>
    (category === "All" || e.category === category) &&
    `${e.name} ${e.dept} ${e.category} ${e.location} ${e.description} ${e.specs.join(" ")} ${e.keywords.join(" ")}`.toLowerCase().includes(search.toLowerCase())
  ), [search, category, equipment]);

  const approved = bookings.filter(b => b.status === "approved").length;
  const pending = bookings.filter(b => b.status === "pending").length;
  const conflicts = bookings.filter(b => b.status === "conflict").length;
  const upcomingApproved = bookings.filter(b =>
    b.status === "approved" && b.date >= today() && b.date <= addDays(6)
  );
  const departmentUsage = [...new Set(equipment.map(item => item.dept))].map(dept => {
    const departmentEquipment = equipment.filter(item => item.dept === dept);
    const reservations = upcomingApproved.filter(booking => departmentEquipment.some(item => item.id === booking.equipmentId)).length;
    return { dept, percent: Math.round(reservations / Math.max(1, departmentEquipment.length * HOURS.length * 7) * 100), reservations };
  });
  const utilization = Math.round(upcomingApproved.length / Math.max(1, equipment.length * HOURS.length * 7) * 100);
  const activeCalendarEquipment = equipment.some(item => item.id === calendarEquipment)
    ? calendarEquipment
    : equipment[0]?.id || calendarEquipment;

  function openBooking(equipment) {
    setSelected(equipment);
    setNotice("");
  }

  async function findProjectEquipment() {
    const description = project.trim();
    if (!description || recommendationLoading) return;
    setProjectAnalysis(description);
    setRecommendationLoading(true);
    setNotice("");

    if (!authUser) {
      setProjectRecommendations(recommendEquipmentWithReasons(description, equipment));
      setRecommendationSource("rule-based");
      setRecommendationLoading(false);
      return;
    }

    try {
      const result = await recommendProjectEquipment(description);
      setProjectRecommendations(addEquipmentVisuals(result.recommendations));
      setRecommendationSource("gemini");
    } catch (error) {
      setProjectRecommendations(recommendEquipmentWithReasons(description, equipment));
      setRecommendationSource("fallback");
      setNotice(`Gemini recommendations are unavailable; showing rule-based matches instead. ${errorMessage(error)}`);
    } finally {
      setRecommendationLoading(false);
    }
  }

  function openCalendarBooking(equipmentId, bookingDate, bookingTime) {
    const item = equipment.find(resource => resource.id === equipmentId);
    if (!item) return;
    setDate(bookingDate);
    setTime(bookingTime);
    setDeadline(bookingDate > deadline ? addDays(7, bookingDate) : deadline);
    setSelected(item);
    setNotice("");
  }

  async function submitBooking(e) {
    e.preventDefault();
    if (!selected || !project.trim() || (!authUser && !student.trim())) return;
    if (date < today() || deadline < date) {
      setNotice("Choose a valid date and a deadline on or after the booking date.");
      return;
    }
    if (date === today() && time <= currentTime()) {
      setNotice("Please choose a future time.");
      return;
    }

    setBookingSaving(true);
    try {
      if (authUser) {
        const result = await createBookingRequest({
          equipmentId: selected.id,
          project: project.trim(),
          date,
          time,
          deadline,
        });
        setNotice(result.status === "conflict"
          ? "Slot already reserved. Open Smart Scheduler for available alternatives."
          : "Request submitted securely. Awaiting faculty approval.");
      } else {
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
        setNotice(result.conflict
          ? "Scheduling conflict detected. Open AI Scheduler for alternatives."
          : "Demo request saved in this browser. Sign in for a shared faculty review.");
      }
      setSelected(null);
      setProject("");
      setPage("bookings");
    } catch (error) {
      setNotice(`Request could not be submitted: ${errorMessage(error)}`);
    } finally {
      setBookingSaving(false);
    }
  }

  async function updateStatus(id, status) {
    if (authUser) {
      if (!canReviewLive) {
        setNotice("Only verified faculty can review live booking requests.");
        return;
      }
      setReviewingId(id);
      try {
        const result = await reviewBooking(id, status);
        setNotice(result.status === "conflict"
          ? "Another request reserved that slot first. The student can choose an alternative in Smart Scheduler."
          : `Request ${status}. Booking status will update for all connected users.`);
      } catch (error) {
        setNotice(`Request could not be reviewed: ${errorMessage(error)}`);
      } finally {
        setReviewingId("");
      }
      return;
    }

    const target = bookings.find(b => b.id === id);
    if (!target) return;
    if (status === "approved") {
      if (bookings.some(b => b.id !== id && b.status === "approved" && overlaps(target, b))) {
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

  async function applyAlternative(id, alternative) {
    if (authUser) {
      try {
        const result = await rescheduleBooking(id, alternative.date, alternative.time);
        setNotice(result.status === "conflict"
          ? "That alternative was just reserved. Choose another available time."
          : "Alternative saved. Faculty approval is required.");
      } catch (error) {
        setNotice(`Alternative could not be saved: ${errorMessage(error)}`);
      }
      return;
    }
    setBookings(prev => prev.map(b => b.id === id ? { ...b, date: alternative.date, time: alternative.time, status: "pending" } : b));
    setNotice("Alternative slot selected. Faculty approval is required.");
  }

  async function handleSignOut() {
    try {
      await signOutUser();
      setNotice("Signed out. Demo mode is active; demo bookings remain separate from Firestore.");
    } catch (error) {
      setNotice(`Could not sign out: ${errorMessage(error)}`);
    }
  }

  async function handleSeedEquipment() {
    setRoleSaving(true);
    try {
      const result = await seedCloudEquipment();
      setNotice(`${result.created} equipment records added. Existing catalog entries were preserved.`);
    } catch (error) {
      setNotice(`Equipment catalog could not be initialized: ${errorMessage(error)}`);
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleSetRole(event) {
    event.preventDefault();
    if (!adminUid.trim()) return;
    setRoleSaving(true);
    try {
      await setUserRole(adminUid.trim(), adminRole);
      setAdminUid("");
      setNotice(`Role updated to ${adminRole}. The user must sign out and back in to refresh their role.`);
    } catch (error) {
      setNotice(`Role could not be updated: ${errorMessage(error)}`);
    } finally {
      setRoleSaving(false);
    }
  }

  const nav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "equipment", label: "Equipment Explorer", icon: Search },
    { id: "calendar", label: "Availability", icon: CalendarClock },
    { id: "bookings", label: "My Bookings", icon: CalendarDays },
    { id: "projects", label: "Project Studio", icon: Lightbulb },
    { id: "scheduler", label: "AI Scheduler", icon: Sparkles },
    { id: "faculty", label: "Faculty Console", icon: ShieldCheck }
  ];

  return (
    <div className="app">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="logo"><div className="logo-mark"><FlaskConical size={23}/></div><span>lablink<span className="accent">.</span><small>AI</small></span></div>
        <div className="side-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(n => <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} aria-current={page === n.id ? "page" : undefined}
            onClick={() => { setPage(n.id); setMenu(false); setNotice(""); }}>
            <n.icon size={19}/><span>{n.label}</span>{page === n.id && <span className="nav-indicator"/>}
          </button>)}
        </nav>
        <div className="sidebar-footer">
          <div className="online-dot"/> {authUser ? "FIRESTORE WORKSPACE" : "DEMO ENVIRONMENT"}
          <p>{authUser ? "Authenticated bookings sync to the campus network." : "No login required. Demo data stays in this browser."}</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMenu(!menu)} aria-label="Toggle navigation"><Menu size={22}/></button>
          <div className="breadcrumb">CAMPUS NETWORK <ChevronRight size={13}/> <strong>{nav.find(n => n.id === page)?.label}</strong></div>
          <div className="top-right">
            <span className="live-pill"><span className="online-dot"/>{authLoading ? "CONNECTING" : authUser ? role === "faculty" && !authUser.emailVerified ? "VERIFY EMAIL · CLOUD" : `${role.toUpperCase()} · CLOUD` : "DEMO · LOCAL"}</span>
            {authUser
              ? <><span className="user-pill"><UserRound size={15}/>{authUser.displayName || authUser.email}</span><button className="auth-action" onClick={handleSignOut} aria-label="Sign out"><LogOut size={17}/></button></>
              : <button className="auth-action sign-in-action" onClick={() => setAuthDialog(true)}>Sign in <ArrowUpRight size={15}/></button>}
          </div>
        </header>

        <div className="content">
          {notice && <div className="notice" role="status"><Zap size={17}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16}/></button></div>}
          {authLoading && <div className="loading-banner" role="status"><span className="loading-spinner"/> Checking your secure LabLink session…</div>}

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
              <Stat icon={Cpu} label="LAB RESOURCES" value={equipmentLoading ? "—" : equipment.length} sub={authUser ? "Live campus catalog" : "Across campus"} color="mint"/>
              <Stat icon={CalendarDays} label="TOTAL REQUESTS" value={bookings.length} sub={`${pending} awaiting approval`} color="blue"/>
              <Stat icon={CheckCircle2} label="APPROVED SLOTS" value={approved} sub="Confirmed reservations" color="violet"/>
              <Stat icon={AlertTriangle} label="CONFLICTS" value={conflicts} sub="Need resolution" color="orange"/>
            </div>

            <section className="insights-grid" aria-label="Campus insights">
              <article className="insight-panel">
                <div className="panel-heading"><div><div className="eyebrow">NEXT 7 DAYS</div><h2>Campus utilization</h2></div><span className="insight-value">{utilization}%</span></div>
                <div className="utilization-track" role="img" aria-label={`${utilization}% of equipment slots approved in the next seven days`}><span style={{ width: `${utilization}%` }}/></div>
                <p>{upcomingApproved.length} confirmed sessions across {equipment.length * HOURS.length * 7} bookable slots</p>
                <div className="department-bars">{departmentUsage.map(item => <div className="department-row" key={item.dept}><span>{item.dept}</span><div className="department-track"><span style={{ width: `${item.percent}%` }}/></div><strong>{item.reservations}</strong></div>)}</div>
              </article>
              <article className="insight-panel activity-panel">
                <div className="panel-heading"><div><div className="eyebrow">LIVE FEED</div><h2>Recent activity</h2></div><Activity size={19}/></div>
                {bookings.slice(0, 3).length ? bookings.slice(0, 3).map(booking => <div className="activity-row" key={booking.id}><span className={`activity-dot ${booking.status}`}/><div><strong>{booking.equipmentName}</strong><small>{booking.student} · {booking.date} at {booking.time}</small></div><span className={`tag ${booking.status === "approved" ? "mint" : booking.status === "conflict" ? "orange" : "blue"}`}>{booking.status}</span></div>) : <div className="activity-empty"><Target size={20}/><span>Booking activity will appear here.</span></div>}
                <button className="text-link" onClick={() => setPage("bookings")}>See all requests <ArrowUpRight size={16}/></button>
              </article>
            </section>

            <div className="section-head"><div><div className="eyebrow">EXPLORE THE NETWORK</div><h2>Featured resources</h2></div><button className="text-link" onClick={() => setPage("equipment")}>View all equipment <ArrowUpRight size={17}/></button></div>
            {equipmentLoading ? <LoadingState label="Loading campus equipment…"/> : equipment.length
              ? <EquipmentGrid items={equipment.slice(0,3)} onBook={openBooking}/>
              : <EmptyCatalog onSeed={authUser && role === "admin" ? handleSeedEquipment : null}/>}
            <div className="insight-banner"><Sparkles size={23}/><div><strong>Smarter scheduling, fairer access.</strong><p>LabLink analyzes availability and project deadlines to suggest feasible booking alternatives.</p></div><button onClick={() => setPage("scheduler")}>Try Scheduler <ArrowUpRight size={16}/></button></div>
          </>}

          {page === "equipment" && <>
            <PageHeader eyebrow="RESOURCE DISCOVERY" title="Equipment Explorer" description="Discover specialized equipment across every department."/>
            <div className="search-wrap"><Search size={20}/><input aria-label="Search equipment" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search equipment, department or capabilities..."/></div>
            <div className="filters">{categories.map(c => <button key={c} className={category === c ? "filter selected" : "filter"} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
            <div className="results-count">{filtered.length} RESOURCES FOUND</div>
            {equipmentLoading ? <LoadingState label="Loading equipment catalog…"/> : filtered.length
              ? <EquipmentGrid items={filtered} onBook={openBooking}/>
              : authUser && equipment.length === 0
                ? <EmptyCatalog onSeed={role === "admin" ? handleSeedEquipment : null}/>
                : <div className="empty">No matching resources. Try another search.</div>}
          </>}

          {page === "calendar" && <>
            <PageHeader eyebrow="LIVE AVAILABILITY" title="Booking calendar" description="Choose a resource and see approved reservations alongside open two-hour sessions."/>
            {equipmentLoading ? <LoadingState label="Loading availability…"/> : equipment.length === 0
              ? <EmptyCatalog onSeed={authUser && role === "admin" ? handleSeedEquipment : null}/>
              : <><div className="calendar-toolbar"><label>Equipment<select value={activeCalendarEquipment} onChange={event => setCalendarEquipment(event.target.value)}>{equipment.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="calendar-week-controls"><button className="secondary-btn" aria-label="Previous week" onClick={() => setCalendarStart(addDays(-7, calendarStart))}><ChevronLeft size={17}/></button><strong>{calendarStart} — {addDays(6, calendarStart)}</strong><button className="secondary-btn" aria-label="Next week" onClick={() => setCalendarStart(addDays(7, calendarStart))}><ChevronRight size={17}/></button></div></div>
              <div className="calendar-legend"><span><i className="slot-dot open"/> Available</span><span><i className="slot-dot occupied"/> Approved</span><span>Pending requests do not reserve a slot until approval.</span></div>
              <div className="calendar-scroll"><div className="calendar-grid" role="grid" aria-label="Equipment availability by day and time">
              <div className="calendar-corner">CAMPUS TIME · {CAMPUS_TIME_ZONE}</div>
              {Array.from({ length: 7 }, (_, index) => {
                const day = addDays(index, calendarStart);
                return <div className="calendar-day" role="columnheader" key={day}><small>{new Date(`${day}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: CAMPUS_TIME_ZONE })}</small><strong>{day.slice(5)}</strong></div>;
              })}
              {HOURS.map(hour => <div className="calendar-time-row" role="row" key={hour}><div className="calendar-hour">{hour}</div>{Array.from({ length: 7 }, (_, index) => {
                const day = addDays(index, calendarStart);
                const occupied = isSlotOccupied(activeCalendarEquipment, day, hour, bookings);
                const unavailable = day < today() || (day === today() && hour <= currentTime());
                const reservation = bookings.find(booking => booking.equipmentId === activeCalendarEquipment && booking.date === day && booking.time === hour && booking.status === "approved");
                return <button key={`${day}-${hour}`} role="gridcell" className={`calendar-slot ${occupied ? "occupied" : unavailable ? "unavailable" : "open"}`} disabled={occupied || unavailable} aria-label={`${day} at ${hour}: ${occupied ? `approved reservation for ${reservation?.student || "a student"}` : unavailable ? "in the past" : "available, request this slot"}`} onClick={() => openCalendarBooking(activeCalendarEquipment, day, hour)}>{occupied ? "Reserved" : unavailable ? "Past" : "Book slot"}</button>;
              })}</div>)}
              </div></div></>}
          </>}

          {page === "bookings" && <>
            <PageHeader eyebrow="YOUR PROJECTS" title="Booking Requests" description="Track requests, approvals and equipment access."/>
            <div className="section-head"><h2>All requests</h2><button className="secondary-btn" onClick={() => setPage("equipment")}>+ New request</button></div>
            <BookingList bookings={bookings} loading={bookingLoading}/>
          </>}

          {page === "projects" && <>
            <PageHeader eyebrow="PROJECT INTELLIGENCE" title="From idea to equipment" description="Describe what you are building. Signed-in students can get Gemini recommendations grounded in the campus catalog; the transparent rule-based matcher remains available in demo mode and as a fallback."/>
            <section className="project-workspace">
              <div className="project-prompt"><div className="prompt-icon"><Sparkles size={21}/></div><div><h2>Tell us about your project</h2><p>Include the techniques, materials or hardware you plan to use for more relevant matches.</p></div></div>
              <label className="project-label" htmlFor="project-description">Project description</label>
              <textarea id="project-description" value={project} onChange={event => setProject(event.target.value)} maxLength={1000} placeholder="e.g. I'm building a computer vision model for identifying plant disease using a camera and edge device."/>
              <div className="project-prompt-footer"><span>{project.length}/1000 characters · {authUser ? "Gemini sends your description and listed equipment details to Google; it is not saved by LabLink." : "Demo mode keeps your description in this browser and uses rule-based matching."}</span><button className="primary-btn" disabled={!project.trim() || recommendationLoading || authLoading} onClick={findProjectEquipment}>{recommendationLoading ? "Finding matches…" : authUser ? "Ask Gemini" : "Find equipment"} <Sparkles size={17}/></button></div>
            </section>
            {projectAnalysis && <section className="project-results" aria-live="polite"><div className="section-head"><div><div className="eyebrow">PROJECT RECOMMENDATIONS</div><h2>Recommended resources</h2></div><span className="match-label"><Target size={16}/> {recommendationSource === "gemini" ? "Gemini · catalog-grounded" : recommendationSource === "fallback" ? "Rule-based fallback" : "Transparent, rule-based demo"}</span></div>
              {recommendationLoading ? <LoadingState label="Matching your project to campus equipment…"/> : projectRecommendations.length ? <><p className="project-explanation"><TrendingUp size={17}/>{recommendationSource === "gemini" ? "Gemini ranked active campus equipment and explains each match. Availability and booking approval are checked separately." : "Matches are ranked deterministically from overlapping project terms and listed equipment capabilities."}</p><EquipmentGrid items={projectRecommendations} onBook={openBooking}/></> : <div className="empty"><Lightbulb size={28}/><h3>No direct match yet</h3><p>Try naming a technique or tool, such as computer vision, sensors, 3D printing or circuit testing.</p></div>}
            </section>}
            {!projectAnalysis && <div className="prompt-examples"><span>Try a starting point</span>{["computer vision prototype", "IoT sensor network", "3D printed enclosure"].map(example => <button key={example} onClick={() => setProject(example)}>{example}<ArrowUpRight size={14}/></button>)}</div>}
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
            <PageHeader eyebrow="RESOURCE GOVERNANCE" title="Faculty Console" description={authUser ? "Review shared requests with server-verified faculty permissions." : "Demo approval workspace. Live approval is available only to verified faculty."}/>
            {!authUser
              ? <div className="faculty-warning"><ShieldCheck size={20}/> DEMO MODE — These approvals affect local sample data only. They do not grant real faculty permissions.</div>
              : !canReviewLive
                ? <div className="faculty-warning"><ShieldCheck size={20}/> ACCESS RESTRICTED — {role === "faculty" ? "Verify your email and sign in again to activate faculty access." : "Your account has the student role. Faculty access must be granted by a LabLink administrator."}</div>
                : <div className="faculty-live"><ShieldCheck size={18}/> VERIFIED {role.toUpperCase()} · Actions are authorized by Cloud Functions.</div>}
            {authUser && role === "admin" && <section className="admin-tools">
              <div><div className="eyebrow">ADMINISTRATION</div><h2>Manage campus access</h2><p>Only administrators can change roles or initialize the equipment catalog.</p></div>
              <form className="role-form" onSubmit={handleSetRole}>
                <label>Firebase Auth user ID<input value={adminUid} onChange={event => setAdminUid(event.target.value)} required placeholder="Paste the user's UID"/></label>
                <label>Assign role<select value={adminRole} onChange={event => setAdminRole(event.target.value)}><option value="faculty">Faculty</option><option value="student">Student</option></select></label>
                <button className="secondary-btn" type="submit" disabled={roleSaving}>Update role</button>
                <button className="secondary-btn" type="button" onClick={handleSeedEquipment} disabled={roleSaving}><Settings2 size={16}/> Seed missing equipment</button>
              </form>
            </section>}
            {(!authUser || canReviewLive) && <>
            <div className="stats compact">
              <Stat icon={Clock3} label="PENDING" value={pending} sub="Awaiting review" color="orange"/>
              <Stat icon={CheckCircle2} label="APPROVED" value={approved} sub="Confirmed" color="mint"/>
              <Stat icon={XCircle} label="REJECTED" value={bookings.filter(b => b.status === "rejected").length} sub="Declined requests" color="violet"/>
            </div>
            <div className="section-head"><h2>Approval queue</h2></div>
            {bookingLoading ? <LoadingState label="Loading approval queue…"/> : bookings.filter(b => ["pending","conflict"].includes(b.status)).length === 0
              ? <div className="empty"><BookOpen size={30}/><h3>All caught up</h3><p>New equipment requests will appear here.</p></div>
              : bookings.filter(b => ["pending","conflict"].includes(b.status)).map(b => <div className="approval-row" key={b.id}>
                <div><span className={`tag ${b.status === "conflict" ? "orange" : "blue"}`}>{b.status.toUpperCase()}</span><h3>{b.equipmentName}</h3><p>{b.student} · {b.project}</p><small>{b.date} at {b.time} · Deadline: {b.deadline}</small></div>
                <div className="approval-actions"><button className="reject-btn" disabled={reviewingId === b.id} onClick={() => updateStatus(b.id,"rejected")}><XCircle size={16}/> Reject</button><button className="approve-btn" disabled={reviewingId === b.id} onClick={() => updateStatus(b.id,"approved")}><CheckCircle2 size={16}/> Approve</button></div>
              </div>)}
            </>}
          </>}
        </div>
      </main>

      {selected && <div className="modal-overlay" onMouseDown={e => { if(e.target === e.currentTarget) setSelected(null); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
          <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X size={20}/></button>
          <div className="eyebrow">REQUEST LAB ACCESS</div><h2 id="booking-title">{selected.name}</h2><p className="modal-subtitle">Submit a project-based request for faculty review.</p>
          <form onSubmit={submitBooking}>
            {authUser
              ? <div className="form-note"><UserRound size={16}/> Requesting as {authUser.displayName || authUser.email} · {role}</div>
              : <label>Student name<input required maxLength={80} value={student} onChange={e => setStudent(e.target.value)} placeholder="Your full name"/></label>}
            <label>Project title<input required maxLength={120} value={project} onChange={e => setProject(e.target.value)} placeholder="e.g. Autonomous Navigation"/></label>
            <div className="form-grid"><label>Booking date<input required type="date" min={today()} value={date} onChange={e => setDate(e.target.value)}/></label><label>Project deadline<input required type="date" min={date} value={deadline} onChange={e => setDeadline(e.target.value)}/></label></div>
            <label>Preferred time slot<select value={time} onChange={e => setTime(e.target.value)}>{HOURS.map(h => <option key={h} value={h}>{h} — {String(Number(h.slice(0,2))+2).padStart(2,"0")}:00</option>)}</select></label>
            <div className="form-note"><Clock3 size={16}/> Each booking is a two-hour session. Faculty approval is required.</div>
            <button type="submit" className="primary-btn full" disabled={bookingSaving}>{bookingSaving ? "Submitting securely…" : authUser ? "Submit secure request" : "Submit demo request"} <ArrowUpRight size={18}/></button>
          </form>
        </div>
      </div>}
      {authDialog && <AuthDialog onClose={() => setAuthDialog(false)} onNotice={setNotice}/>}
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
    <div className="equipment-dept">{e.dept} <span>· {e.category}</span></div><h3>{e.name}</h3><p>{e.description}</p>
    {e.explanation && <p className="recommendation-reason">{e.explanation}</p>}
    <div className="spec-list">{e.specs.map(spec => <span key={spec}>{spec}</span>)}</div>
    <div className="equipment-bottom"><span>{e.location}</span><button onClick={() => onBook(e)} aria-label={`Request ${e.name}`}><ArrowUpRight size={19}/></button></div>
  </article>)}</div>;
}
function BookingList({ bookings, loading }) {
  if (loading) return <LoadingState label="Loading booking history…"/>;
  if (!bookings.length) return <div className="empty"><CalendarDays size={30}/><h3>No bookings yet</h3><p>Explore equipment and submit your first project request.</p></div>;
  return <div className="booking-list">{bookings.map(b => <div className="booking-row" key={b.id}><div className="booking-icon"><CalendarDays size={22}/></div><div className="booking-info"><h3>{b.equipmentName}</h3><p>{b.project} · {b.student}</p><small>{b.date} at {b.time} · Deadline {b.deadline}</small></div><span className={`tag ${b.status === "approved" ? "mint" : b.status === "conflict" ? "orange" : b.status === "rejected" ? "red" : "blue"}`}>{b.status.toUpperCase()}</span></div>)}</div>;
}

function LoadingState({ label }) {
  return <div className="loading-state" role="status"><span className="loading-spinner"/>{label}</div>;
}

function EmptyCatalog({ onSeed }) {
  return <div className="empty"><Cpu size={30}/><h3>No equipment has been published</h3><p>{onSeed ? "Initialize the starter catalog for your campus." : "Ask your LabLink administrator to publish the equipment catalog."}</p>{onSeed && <button className="secondary-btn" onClick={onSeed}>Seed starter equipment</button>}</div>;
}
