import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";

afterEach(() => vi.restoreAllMocks());

function mockApi(initial = false) {
  let authenticated = initial;
  return vi.spyOn(window, "fetch").mockImplementation(async (url) => {
    if (url === "/api/session") return new Response(JSON.stringify({ authenticated }), { status: 200 });
    if (url === "/api/logout") { authenticated = false; return new Response(null, { status: 204 }); }
    if (url === "/api/login" || url === "/api/accounts") { authenticated = true; return new Response(null, { status: url === "/api/login" ? 204 : 201 }); }
    return new Response(null, { status: 404 });
  });
}

describe("navigation", () => {
  it("shows signed-out sidebar and dropdown links", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    const sidebar = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(sidebar).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("navigation", { name: "Get started" })).toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: "My plans" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    const menu = screen.getByRole("navigation", { name: "Profile navigation" });
    expect(within(menu).getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/create-account");
    expect(within(menu).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Profile navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profile menu" })).toHaveFocus();
  });

  it.each([
    { path: "/create-account", title: "Create account", create: true },
    { path: "/login", title: "Log in", create: false },
  ])("$title signs in and shows the welcome message", async ({ path, title, create }) => {
    mockApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    if (create) {
      await user.type(screen.getByLabelText("First name"), "Ada");
      await user.type(screen.getByLabelText("Surname"), "Lovelace");
    }
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Welcome to the site, I have your details now.");
    expect(screen.getByRole("status")).toHaveTextContent("Yum yum yum.");
    expect(await screen.findByRole("link", { name: "My plans" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it.each([
    ["/plans/current", "In progress"], ["/plans", "My plans"], ["/plans/new", "Create plan"],
    ["/profile", "View profile"], ["/profile/manage", "Manage profile"], ["/settings", "Settings"],
  ])("protects %s and renders it for a signed-in user", async (path, title) => {
    mockApi(true);
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: title })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("redirects signed-out protected route visits to login", async () => {
    mockApi();
    render(<MemoryRouter initialEntries={["/plans/new"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create plan" })).not.toBeInTheDocument();
  });

  it("shows profile and settings above logout only when signed in", async () => {
    mockApi(true);
    render(<MemoryRouter><App /></MemoryRouter>);
    const logout = await screen.findByRole("button", { name: "Log out" });
    const container = logout.parentElement!;
    expect(within(container).getByRole("link", { name: "My profile" })).toHaveAttribute("href", "/profile");
    expect(within(container).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(Array.from(container.children).map((item) => item.textContent)).toEqual(["My profile", "Settings", "Log out"]);
  });

  it.each(["sidebar", "profile"])("logs out through the %s control", async (control) => {
    const fetchSpy = mockApi(true);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/plans"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "My plans" })).toBeInTheDocument();
    if (control === "profile") {
      await user.click(screen.getByRole("button", { name: "Profile menu" }));
      const menu = screen.getByRole("navigation", { name: "Profile navigation" });
      expect(within(menu).getByRole("link", { name: "Settings" })).toBeInTheDocument();
      await user.click(within(menu).getByRole("button", { name: "Log out" }));
    } else {
      await user.click(screen.getByRole("button", { name: "Log out" }));
    }
    expect(fetchSpy).toHaveBeenCalledWith("/api/logout", expect.objectContaining({ method: "POST" }));
    expect(await screen.findByRole("heading", { name: "Project Log" })).toBeInTheDocument();
    expect(await screen.findByRole("navigation", { name: "Get started" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My plans" })).not.toBeInTheDocument();
  });

  it("preserves signed-in state and shows an error if logout fails", async () => {
    mockApi(true).mockImplementation(async (url) => url === "/api/session"
      ? new Response(JSON.stringify({ authenticated: true }))
      : new Response(null, { status: 500 }));
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not log out");
    expect(screen.getByRole("link", { name: "My plans" })).toBeInTheDocument();
  });

  it("offers retry when the session check fails", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(new Response(JSON.stringify({ authenticated: false })));
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "Get started" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
