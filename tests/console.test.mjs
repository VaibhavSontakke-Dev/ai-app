/**
 * Browser tests of the console against the real API with mock upstreams.
 * Needs `npm ci` in ../ai-api, `npm run build` here, ports 4000, 4100, 4200, 4300 and 3100 free, and Chrome or Edge.
 */
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { after, afterEach, before, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const APP = fileURLToPath(new URL("..", import.meta.url));
const API = fileURLToPath(new URL("../../ai-api", import.meta.url));
const URL_ = "http://localhost:3100";
const MOCK = "http://localhost:4200";
const started = [];
let browser;
let serverLog = "";
const problems = [];

function start(cwd, args, env = {}) {
  const p = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  started.push(p);
  return p;
}
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`${url} did not start`);
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** One MCP session, as the copilot would make it. */
async function propose(tool, args, user = "sam.support") {
  const { stdout } = await promisify(execFile)(process.execPath, ["mcp/call.ts", "--user", user, tool, JSON.stringify(args)], { cwd: API });
  return JSON.parse(stdout.split("\n").find((l) => l.startsWith("{")));
}

before(async () => {
  for (const port of [3100, 4000, 4100, 4200, 4300]) {
    const busy = await fetch(`http://localhost:${port}/`).then(() => true, () => false);
    if (busy) throw new Error(`Port ${port} is in use. Stop the running stack first.`);
  }
  start(API, ["src/dev.ts"], { LOG_LEVEL: "error" });
  const next = start(APP, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3100"]);
  next.stdout.on("data", (d) => { serverLog += d; });
  next.stderr.on("data", (d) => { serverLog += d; });
  await waitFor("http://localhost:4000/healthz");
  await waitFor(URL_);
  for (const channel of ["chrome", "msedge"]) {
    browser ??= await chromium.launch({ channel, headless: true }).catch(() => undefined);
  }
  assert.ok(browser, "Chrome or Edge is needed");
});
after(async () => {
  await browser?.close();
  for (const p of started) p.kill();
});
afterEach(async () => { await post(`${MOCK}/__reset`, {}); });

async function signIn(user, options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`${page.url()}: ${m.text()}`); });
  await page.goto(URL_);
  await page.getByRole("button", { name: user }).click();
  await page.getByRole("heading", { name: "Cases" }).waitFor();
  return { context, page };
}
const open = (page, path) => page.goto(`${URL_}${path}`);
const rows = (page) => page.locator("tbody tr");

describe("cases", () => {
  it("answers the sample question and shows that sources disagree", async () => {
    const { context, page } = await signIn("sam.support");
    await page.getByRole("link", { name: "Renewal risk" }).click();
    await page.waitForURL(/renewalWithinDays=90/);
    await rows(page).nth(4).waitFor({ state: "detached" }); // the fifth row of the unfiltered list
    assert.deepEqual(await rows(page).locator("td:first-child").allInnerTexts(), ["CS-10231", "CS-10260", "CS-10240", "CS-10275"]);
    assert.equal(await page.getByText("Sources disagree").count(), 1);
    await context.close();
  });
  it("adds two comments in a row, each once", async () => {
    const { context, page } = await signIn("sam.support");
    await open(page, "/cases/CS-10231");
    for (const body of ["First comment", "Second comment"]) {
      await page.getByLabel("Add a comment").fill(body);
      await page.getByRole("button", { name: "Add comment" }).click();
      await page.locator("li p", { hasText: body }).waitFor();
    }
    await page.reload();
    await page.locator("li p", { hasText: "Second comment" }).waitFor();
    assert.equal(await page.locator("li p", { hasText: "First comment" }).count(), 1);
    assert.equal(await page.locator("li p", { hasText: "Second comment" }).count(), 1);
    await context.close();
  });
  it("escalates, then offers the next level", async () => {
    const { context, page } = await signIn("sam.support");
    await open(page, "/cases/CS-10231");
    await page.getByLabel("Note").fill("Customer is blocked for weeks");
    await page.getByRole("button", { name: "Escalate to L2" }).click();
    await page.getByText("L2, customer impact").waitFor();
    await page.getByRole("button", { name: "Escalate to L3" }).waitFor();
    await context.close();
  });
  it("names the broken rule and gives a reference", async () => {
    const { context, page } = await signIn("sam.support");
    await open(page, "/cases/CS-10291");
    await page.getByLabel("Note").fill("Please escalate this one");
    await page.getByRole("button", { name: "Escalate to L2" }).click();
    await page.getByText(/Only P1 and P2 can be escalated.*Reference [0-9a-f-]{36}/).waitFor();
    await context.close();
  });
  it("refuses to escalate from an old page, shows the new state, and then works", async () => {
    const { context, page } = await signIn("sam.support");
    await open(page, "/cases/CS-10240");
    await page.getByRole("button", { name: "Escalate to L2" }).waitFor();
    const other = await context.newPage();
    await open(other, "/cases/CS-10240");
    await other.getByLabel("Add a comment").fill("News from a colleague");
    await other.getByRole("button", { name: "Add comment" }).click();
    await other.getByText("Comment added.").waitFor();
    const escalate = async () => {
      await page.getByLabel("Note").fill("Restore is stuck for days");
      await page.getByRole("button", { name: "Escalate to L2" }).click();
    };
    await escalate();
    await page.getByText(/Read it again and retry/).waitFor();
    await page.locator("li p", { hasText: "News from a colleague" }).waitFor();
    await escalate();
    await page.getByText("L2, customer impact").waitFor();
    await context.close();
  });
});

describe("approvals", () => {
  it("approves one proposal, rejects another, and shows text as text", async () => {
    const { context, page } = await signIn("sam.support");
    const a = await propose("escalate_case", { case_id: "CS-10260", case_version: 1, level: "L2", reason: "sla_breach_risk", note: "Three days without an answer" });
    await propose("add_case_comment", { case_id: "CS-10240", body: "<img src=x onerror=alert(1)> proposed" });
    assert.equal(a.status, "waiting_for_human_approval");
    await page.getByRole("link", { name: "Approvals" }).click();
    const item = (name) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
    await item(/Add a comment on CS-10240/).getByText("<img src=x onerror=alert(1)> proposed").waitFor();
    await item(/Add a comment on CS-10240/).getByRole("button", { name: "Reject" }).click();
    await item(/Add a comment on CS-10240/).getByText("rejected by sam.support").waitFor();
    await item(/Escalate to L2 on CS-10260/).getByRole("button", { name: "Approve and run" }).click();
    await item(/Escalate to L2 on CS-10260/).getByText("executed by sam.support").waitFor();
    await open(page, "/cases/CS-10260");
    await page.getByText(/via agent:support-copilot-mcp, approved by sam.support/).waitFor();
    await context.close();
  });
});

describe("roles", () => {
  it("shows ARR to Finance and no forms", async () => {
    const { context, page } = await signIn("fiona.finance");
    await open(page, "/customers/ACC-007");
    await page.getByText("$480,000").waitFor();
    await open(page, "/cases/CS-10231");
    await page.getByText("Investigating").waitFor();
    assert.equal(await page.getByRole("button", { name: /Add comment|Escalate/ }).count(), 0);
    await context.close();
  });
  it("hides other accounts from a CSM, and pages a role may not use", async () => {
    const { context, page } = await signIn("carl.csm");
    await open(page, "/customers/ACC-019");
    await page.getByRole("alert").filter({ hasText: "Not found" }).waitFor();
    assert.equal(await page.getByRole("link", { name: /Audit|Webhooks/ }).count(), 0);
    for (const path of ["/audit", "/webhooks"]) {
      await open(page, path);
      await page.getByRole("alert").filter({ hasText: "Missing permission" }).waitFor();
    }
    await context.close();
  });
  it("says when a source is down", async () => {
    const { context, page } = await signIn("sam.support");
    await post(`${MOCK}/__faults`, { target: "warehouse", mode: "error" });
    await open(page, "/customers/ACC-088");
    await page.getByText("Incomplete data: usage unavailable").waitFor();
    await page.getByRole("heading", { name: "Vandelay Imports" }).waitFor();
    await context.close();
  });
});

describe("audit and webhooks", () => {
  it("pages the trail without gaps and filters it", async () => {
    const { context, page } = await signIn("lena.lead");
    const token = (await (await post("http://localhost:4100/dev/login", { user: "lena.lead" })).json()).access_token;
    for (let i = 0; i < 60; i++) await fetch("http://localhost:4000/v1/action-requests", { headers: { authorization: `Bearer ${token}` } });
    await open(page, "/audit");
    await page.getByText("Hash chain is valid. Whole trail last checked").waitFor();
    const seqs = async () => (await rows(page).locator("td:first-child").allInnerTexts()).map(Number);
    const first = await seqs();
    assert.equal(first.length, 50);
    await page.getByRole("link", { name: "Older" }).click();
    await page.waitForURL(/beforeSeq/);
    await page.getByRole("link", { name: "Newest" }).waitFor();
    assert.equal((await seqs())[0], first.at(-1) - 1);
    await page.getByRole("link", { name: "webhook", exact: true }).click();
    await page.waitForURL(/kind=webhook/);
    await page.locator("tbody").getByText("webhook").first().waitFor();
    await context.close();
  });
  it("subscribes, replaces the secret, refuses internal targets, deletes", async () => {
    const { context, page } = await signIn("lena.lead");
    await page.getByRole("link", { name: "Webhooks" }).click();
    const target = page.getByLabel("Send escalations to");
    await target.fill("https://169.254.169.254/latest");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await page.getByText(/public addresses only/).waitFor();
    await target.fill("http://localhost:4300/second");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await page.locator("code", { hasText: "whsec_" }).waitFor();
    const secret = await page.locator("code").innerText();
    const item = page.getByRole("listitem").filter({ hasText: "http://localhost:4300/second" });
    await item.getByRole("button", { name: "Replace secret" }).click();
    await item.locator("code").waitFor();
    assert.notEqual(await item.locator("code").innerText(), secret);
    await page.reload();
    await item.waitFor();
    assert.equal(await page.locator("code").count(), 0, "shown once");
    page.on("dialog", (d) => d.accept());
    await item.getByRole("button", { name: "Delete" }).click();
    await item.waitFor({ state: "detached" });
    await context.close();
  });
});

describe("session", () => {
  const named = async (context, name) => (await context.cookies()).find((c) => c.name === name);

  it("keeps tokens away from scripts and out of the page", async () => {
    const { context, page } = await signIn("sam.support");
    assert.equal(await page.evaluate(() => document.cookie), "");
    const html = await page.content();
    for (const name of ["console_session", "console_refresh"]) {
      const c = await named(context, name);
      assert.ok(c.httpOnly && c.sameSite === "Strict");
      assert.ok(!html.includes(c.value));
    }
    await context.close();
  });
  it("renews an ended access token without a new sign-in, also for a form", async () => {
    const { context, page } = await signIn("sam.support");
    const old = (await named(context, "console_session")).value;
    await context.clearCookies({ name: "console_session" });
    await open(page, "/cases/CS-10231");
    await page.getByText("Investigating").waitFor();
    assert.notEqual((await named(context, "console_session")).value, old);
    await context.clearCookies({ name: "console_session" });
    await page.getByLabel("Add a comment").fill("After renewal");
    await page.getByRole("button", { name: "Add comment" }).click();
    await page.getByText("Comment added.").waitFor();
    await context.close();
  });
  it("after sign-out the refresh token is dead, even if it was copied", async () => {
    const { context, page } = await signIn("sam.support");
    const stolen = await named(context, "console_refresh");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    await context.addCookies([stolen]);
    await open(page, "/");
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    assert.equal(await named(context, "console_refresh"), undefined);
    await context.close();
  });
});

describe("appearance", () => {
  /** WCAG contrast of the text tokens on their backgrounds. */
  const contrast = (page) => page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const lum = (hex) => {
      const full = hex.trim().replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3"); // minified CSS
      const [r, g, b] = full.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(css.getPropertyValue(a)), lum(css.getPropertyValue(b))].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    return [["--foreground", "--background"], ["--muted", "--background"], ["--muted", "--subtle"], ["--danger", "--background"], ["--ok", "--background"], ["--warn", "--warn-bg"], ["--warn", "--background"]]
      .map(([a, b]) => ({ pair: `${a} on ${b}`, ratio: ratio(a, b) }));
  });
  for (const colorScheme of ["light", "dark"]) {
    it(`text is readable in ${colorScheme} mode`, async () => {
      const { context, page } = await signIn("sam.support", { colorScheme });
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(background, colorScheme === "dark" ? "rgb(16, 21, 27)" : "rgb(255, 255, 255)");
      for (const { pair, ratio } of await contrast(page)) assert.ok(ratio >= 4.5, `${pair}: ${ratio.toFixed(2)}`);
      await context.close();
    });
  }
  it("fits a phone without sideways scrolling", async () => {
    const { context, page } = await signIn("lena.lead", { viewport: { width: 375, height: 812 } });
    for (const path of ["/", "/cases/CS-10260", "/customers/ACC-031", "/approvals", "/audit", "/webhooks"]) {
      await open(page, path);
      await page.locator("h1").waitFor();
      await page.getByText("Loading", { exact: true }).waitFor({ state: "detached" });
      const [content, view] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert.ok(content <= view, `${path}: ${content} > ${view}`);
    }
    await context.close();
  });
});

it("there were no browser errors and no server errors", () => {
  assert.deepEqual(problems, []);
  assert.doesNotMatch(serverLog, /error/i, serverLog.slice(0, 2000));
});
