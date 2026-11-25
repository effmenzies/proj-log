import { fireEvent, render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { ribbonCenterline, ribbonGeometry } from "../../src/app/Ribbon";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Next Rep landing page", () => {
  it("renders standalone copy without navigation or session requests", () => {
    const fetch = vi.spyOn(window, "fetch");
    render(<MemoryRouter initialEntries={["/next-rep"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Next Rep");
    const paragraphs = screen.getByRole("main").querySelectorAll("p");
    expect(Array.from(paragraphs, (p) => p.textContent)).toEqual([
      "Life is a series of chance, choice, hard work, and habits.",
      "Create your habits by practising little repetitions.",
      "Plan your reps here.", "Work hard.", "Live life.",
    ]);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Profile menu" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("links to the app with signed-out account buttons", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({ authenticated: false })));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/next-rep"]}><App /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Get started" });
    expect(link).toHaveAttribute("href", "/");
    await user.click(link);
    const actions = await screen.findByRole("navigation", { name: "Get started" });
    expect(within(actions).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(within(actions).getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/create-account");
  });

  it("changes ribbon geometry as scrolling progresses and clamps its range", () => {
    expect(ribbonGeometry(0)).not.toEqual(ribbonGeometry(.5));
    expect(ribbonGeometry(.5)).not.toEqual(ribbonGeometry(1));
    expect(ribbonGeometry(-1)).toEqual(ribbonGeometry(0));
    expect(ribbonGeometry(2)).toEqual(ribbonGeometry(1));
  });

  it("uses fine sections and ends as an edge-to-edge ribbon with a gentle sag", () => {
    const straight = ribbonGeometry(1);
    expect(straight).toHaveLength(384);
    const xCoordinates = straight.flatMap((segment) =>
      segment.polygon.split(" ").map((point) => Number(point.split(",")[0])));
    expect(Math.min(...xCoordinates)).toBeLessThan(2);
    expect(Math.max(...xCoordinates)).toBeGreaterThan(1398);
    for (const segment of straight) {
      const yCoordinates = segment.polygon.split(" ").map((point) => Number(point.split(",")[1]));
      expect(Math.min(...yCoordinates)).toBeGreaterThan(420);
      expect(Math.max(...yCoordinates)).toBeLessThan(496);
      expect(segment.depth).toBe(0);
    }
    const firstY = Number(straight[0].edge.split(" ")[0].split(",")[1]);
    const middleY = Number(straight[192].edge.split(" ")[0].split(",")[1]);
    expect(middleY - firstY).toBeGreaterThan(10);
  });

  it("rotates the loop before tension releases it, keeping crossing strands apart", () => {
    const initial = ribbonCenterline(0);
    const turning = ribbonCenterline(.325);
    // Halfway through the turn, positions along the screen's horizontal axis
    // have not been pulled apart yet; the loop has moved into depth instead.
    expect(turning.map((point) => point.x)).toEqual(initial.map((point) => point.x));
    expect(turning[192].z).toBeLessThan(-300);
    expect(initial[192].z).toBeCloseTo(0);
    for (const progress of [0, .15, .325, .5, .65, .8, 1]) {
      const points = ribbonCenterline(progress);
      const distanceAlong = [0];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        distanceAlong[i] = distanceAlong[i - 1] + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      }
      // Non-neighboring ribbon portions must not intersect in 3D.
      for (let i = 0; i < points.length; i += 4) {
        for (let j = i + 4; j < points.length; j += 4) {
          if (distanceAlong[j] - distanceAlong[i] <= 112) continue;
          const a = points[i], b = points[j];
          expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(56);
        }
      }
    }
  });

  it("keeps a constant rope width throughout rotation", () => {
    for (const progress of [0, .15, .325, .5, .65, .8, 1]) {
      for (const segment of ribbonGeometry(progress)) {
        const corners = segment.polygon.split(" ").map((point) => point.split(",").map(Number));
        const [left, right] = [corners[1], corners[2]];
        expect(Math.hypot(left[0] - right[0], left[1] - right[1])).toBeCloseTo(56);
      }
    }
  });

  it("does not restore account buttons for a logged-in visitor", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({ authenticated: true })));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/next-rep"]}><App /></MemoryRouter>);
    await user.click(screen.getByRole("link", { name: "Get started" }));
    expect(await screen.findByRole("link", { name: "My plans" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Get started" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
  });

  it("updates the ribbon on scroll and reverses when scrolling back", async () => {
    render(<MemoryRouter initialEntries={["/next-rep"]}><App /></MemoryRouter>);
    const page = screen.getByRole("main");
    const svg = document.querySelector(".landing-art svg")!;
    const initial = svg.innerHTML;
    const bounds = vi.spyOn(page, "getBoundingClientRect");
    bounds.mockReturnValue({ top: -2000, height: 3000 } as DOMRect);
    await act(async () => {
      fireEvent.scroll(window);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(svg.innerHTML).not.toBe(initial);
    bounds.mockReturnValue({ top: 0, height: 3000 } as DOMRect);
    await act(async () => {
      fireEvent.scroll(window);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(svg.innerHTML).toBe(initial);
  });

  it("keeps the reduced-motion ribbon static when scrolling", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
    render(<MemoryRouter initialEntries={["/next-rep"]}><App /></MemoryRouter>);
    const svg = document.querySelector(".landing-art svg")!;
    const initial = svg.innerHTML;
    await act(async () => {
      fireEvent.scroll(window);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(svg.innerHTML).toBe(initial);
  });
});
