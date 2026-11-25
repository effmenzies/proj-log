import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { SessionProvider, useSession } from "./Session";
import logo from "../../assets/logo.png";
import { LandingPage } from "./LandingPage";

const plans = [
  { to: "/plans/current", label: "In progress" },
  { to: "/plans", label: "My plans" },
  { to: "/plans/new", label: "Create plan" },
];
const profile = [
  { to: "/profile", label: "View profile" },
  { to: "/profile/manage", label: "Manage profile" },
  { to: "/settings", label: "Settings" },
];

function Layout({ children }: { children: React.ReactNode }) {
  const { status, refresh, logout, loggingOut, logoutError } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdown = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!dropdown.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function logOut() {
    if (await logout()) {
      setOpen(false);
      navigate("/", { replace: true, state: null });
    }
  }

  return (
    <div className="layout">
        <header className="topbar">
          <Link to="/" aria-label="Project Log home" className="brand"><img src={logo} alt="" /></Link>
          <div className="profile-dropdown" ref={dropdown}>
            <button ref={trigger} className="avatar" aria-label="Profile menu" aria-expanded={open} aria-controls="profile-menu" onClick={() => setOpen(!open)}>
              <span aria-hidden="true">●</span>
            </button>
            {open && (
              <nav id="profile-menu" className="dropdown-menu" aria-label="Profile navigation">
                {status === "signed-out" && <>
                  <Link to="/login" onClick={() => setOpen(false)}>Log in</Link>
                  <Link to="/create-account" onClick={() => setOpen(false)}>Create account</Link>
                </>}
                {status === "signed-in" && <>
                  {profile.map(({ to, label }) => <NavLink key={to} end to={to} onClick={() => setOpen(false)}>{label}</NavLink>)}
                  <button className="nav-button" disabled={loggingOut} onClick={() => void logOut()}>Log out</button>
                </>}
                {status === "loading" && <span>Checking session…</span>}
                {status === "error" && <span>Session unavailable</span>}
              </nav>
            )}
          </div>
        </header>
      <aside className="sidebar">
        <nav aria-label="Main navigation">
          <NavLink end to="/">Home</NavLink>
          {status === "signed-in" && plans.map(({ to, label }) => <NavLink key={to} end to={to}>{label}</NavLink>)}
        </nav>
        <div className="sidebar-bottom">
          {status === "signed-out" && <NavLink to="/login">Log in</NavLink>}
          {status === "signed-in" && <>
            <NavLink end to="/profile">My profile</NavLink>
            <NavLink end to="/settings">Settings</NavLink>
            <button className="nav-button" disabled={loggingOut} onClick={() => void logOut()}>Log out</button>
          </>}
        </div>
      </aside>
      <div className="workspace">
        <main className="content">
          {logoutError && <p role="alert">{logoutError}</p>}
          {status === "error" && <p role="alert">Could not check your session. <button onClick={() => void refresh()}>Try again</button></p>}
          {children}
        </main>
      </div>
    </div>
  );
}

function Home() {
  const location = useLocation();
  const { status } = useSession();
  return (
    <section>
      <h1>Project Log</h1>
      <p>Welcome to Project Log.</p>
      {location.state?.welcome === true && (
        <div role="status">
          <p>Welcome to the site, I have your details now.</p>
          <p>Yum yum yum.</p>
        </div>
      )}
      {status === "signed-out" && (
        <nav className="home-actions" aria-label="Get started">
          <Link to="/login">Log in</Link>
          <Link to="/create-account">Create account</Link>
        </nav>
      )}
    </section>
  );
}

function ProtectedPage({ title }: { title: string }) {
  const { status } = useSession();
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (status !== "signed-in") return null;
  return <section><h1>{title}</h1><p>This page is coming soon.</p></section>;
}

function AccountForm({ create }: { create: boolean }) {
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      ...(create ? { firstName: form.get("firstName"), surname: form.get("surname") } : {}),
      email: form.get("email"),
      password: form.get("password"),
    };
    setError("");
    setPending(true);
    try {
      const response = await fetch(create ? "/api/accounts" : "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      await refresh();
      navigate("/", { replace: true, state: { welcome: true } });
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h1>{create ? "Create account" : "Log in"}</h1>
      <form onSubmit={submit}>
        {create && <>
          <label>First name<input name="firstName" autoComplete="given-name" required maxLength={100} /></label>
          <label>Surname<input name="surname" autoComplete="family-name" required maxLength={100} /></label>
        </>}
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
        <label>Password<input name="password" type="password" autoComplete={create ? "new-password" : "current-password"} required maxLength={1024} /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>{pending ? "Please wait…" : "Submit"}</button>
      </form>
      <Link to="/">Back to home</Link>
    </section>
  );
}

function Application() {
  return (
    <SessionProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-account" element={<AccountForm key="create" create />} />
          <Route path="/login" element={<AccountForm key="login" create={false} />} />
          {[...plans, ...profile].map(({ to, label }) =>
            <Route key={to} path={to} element={<ProtectedPage title={label} />} />)}
        </Routes>
      </Layout>
    </SessionProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/next-rep" element={<LandingPage />} />
      <Route path="/*" element={<Application />} />
    </Routes>
  );
}
