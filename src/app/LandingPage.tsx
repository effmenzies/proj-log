import { useRef } from "react";
import { Link } from "react-router-dom";
import { Ribbon } from "./Ribbon";
import "./landing.css";

export function LandingPage() {
  const page = useRef<HTMLElement>(null);
  return (
    <main className="landing" ref={page}>
      <Ribbon page={page} />
      <div className="landing-copy">
        <div className="landing-intro">
          <h1>Next Rep<span aria-hidden="true">.</span></h1>
        </div>
        <p>Life is a series of chance, choice, hard work, and habits.</p>
        <p>Create your habits by practising little repetitions.</p>
        <p>Plan your reps here.</p>
        <p>Work hard.</p>
        <p>Live life.</p>
        <div className="landing-finish">
          <Link className="landing-start" to="/">Get started <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </main>
  );
}
