import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.SEATTLE_EVENTS_CONFIG || {};
if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY ||
    config.SUPABASE_URL.includes("YOUR_PROJECT_REF")) {
  document.body.innerHTML = `
    <main class="shell">
      <section class="auth-card">
        <h1>Configuration required</h1>
        <p>Create <code>config.js</code> and add your Supabase project URL and publishable key.</p>
      </section>
    </main>`;
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);

function diagnosticMessage(error, layer) {
  const raw = String((error && error.message) || error || "unknown error");
  const message = raw
    .replace(/eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)*/g, "[JWT]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[KEY]")
    .replace(/authorization:\s*bearer\s+\S+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/apikey[=:]\s*\S+/gi, "apikey=[REDACTED]");
  const status = Number(error && error.status);
  const statusText = Number.isFinite(status) && status > 0 ? `HTTP ${status}` : "no HTTP status";
  let host = "configured database";
  try {
    host = new URL(config.SUPABASE_URL).host;
  } catch (_error) {
    host = "configured database";
  }
  return `${layer} failed contacting ${host} (${statusText}): ${message}`;
}

const authView = $("auth-view");
const appView = $("app-view");
const authMessage = $("auth-message");

const interestedView = $("interested-view");
const reviewView = $("review-view");
const tableView = $("table-view");

const tabInterested = $("tab-interested");
const tabReview = $("tab-review");
const tabTable = $("tab-table");

let queue = [];
let currentEvent = null;
let reviewHistory = [];
let reviewBusy = false;
let reviewGeneration = 0;
let allEvents = [];

const UNLISTED_TIME = "Time not listed";

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function formatDateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(d);
}

function timeIsUnlisted(event) {
  return String((event && event.doors_time) || "").startsWith(UNLISTED_TIME);
}

function formatWhen(event) {
  if (!event) return "";
  if (timeIsUnlisted(event)) {
    const date = formatDateOnly(event.start_at);
    return date ? `${date} · ${event.doors_time}` : event.doors_time;
  }
  return formatDateTime(event.start_at);
}

export { formatWhen, timeIsUnlisted };

function formatShortDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(d);
}

function eventLink(event) {
  return event.event_url || "";
}

function supportText(event) {
  return event.support || "";
}

function setLink(element, href) {
  if (href) {
    element.href = href;
    element.hidden = false;
  } else {
    element.hidden = true;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  renderSession(session);
}

function renderSession(session) {
  const signedIn = Boolean(session);
  authView.hidden = signedIn;
  appView.hidden = !signedIn;

  if (signedIn) {
    $("user-line").textContent = session.user.email || "Signed in";
    showView("interested");
  }
}

$("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  authMessage.textContent = "Signing in…";
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  authMessage.textContent = error ? diagnosticMessage(error, "frontend-auth") : "";
});

$("magic-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("magic-email").value.trim();
  authMessage.textContent = "Sending link…";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.href
    }
  });
  authMessage.textContent = error ? diagnosticMessage(error, "frontend-auth") : "Check your email for the sign-in link.";
});

$("logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
});

supabase.auth.onAuthStateChange((_event, session) => {
  renderSession(session);
});

function showView(name) {
  interestedView.hidden = name !== "interested";
  reviewView.hidden = name !== "review";
  tableView.hidden = name !== "table";

  tabInterested.classList.toggle("active", name === "interested");
  tabReview.classList.toggle("active", name === "review");
  tabTable.classList.toggle("active", name === "table");

  if (name === "interested") loadInterested();
  if (name === "review") loadReviewQueue();
  if (name === "table") loadAllEvents();
}

tabInterested.addEventListener("click", () => showView("interested"));
tabReview.addEventListener("click", () => showView("review"));
tabTable.addEventListener("click", () => showView("table"));

async function loadInterested() {
  const now = new Date();
  const nowIso = now.toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("review_status", "interested")
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true });

  if (error) {
    $("interested-groups").innerHTML = "";
    $("interested-empty").hidden = false;
    $("interested-empty").innerHTML = `<h2>Could not load interested events</h2><p>${escapeHtml(diagnosticMessage(error, "frontend-events"))}</p>`;
    return;
  }

  const events = data || [];
  $("interested-count").textContent = String(events.length);
  $("interested-empty").hidden = events.length > 0;

  const soonCutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const futureCutoff = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const groups = [
    {
      key: "soon",
      title: "Soon",
      subtitle: "Next 30 days",
      events: events.filter((event) => new Date(event.start_at) <= soonCutoff)
    },
    {
      key: "future",
      title: "Future",
      subtitle: "31–90 days",
      events: events.filter((event) => {
        const start = new Date(event.start_at);
        return start > soonCutoff && start <= futureCutoff;
      })
    },
    {
      key: "far-future",
      title: "Far future",
      subtitle: "More than 90 days away",
      events: events.filter((event) => new Date(event.start_at) > futureCutoff)
    }
  ];

  $("interested-groups").innerHTML = groups.map(renderInterestedGroup).join("");
}

function renderInterestedGroup(group) {
  if (!group.events.length) {
    return `
      <section class="interest-group">
        <div class="interest-group-heading">
          <div>
            <h2>${escapeHtml(group.title)}</h2>
            <p class="muted">${escapeHtml(group.subtitle)}</p>
          </div>
          <span class="count-badge">0</span>
        </div>
        <p class="muted group-empty">No events in this period.</p>
      </section>`;
  }

  const rows = group.events.map((event) => {
    const links = [];
    if (event.event_url) {
      links.push(`<a href="${escapeAttr(event.event_url)}" target="_blank" rel="noopener">Event</a>`);
    }
    if (event.ticket_url) {
      links.push(`<a href="${escapeAttr(event.ticket_url)}" target="_blank" rel="noopener">Tickets</a>`);
    }

    return `
      <tr>
        <td>${escapeHtml(formatWhen(event))}</td>
        <td><div class="event-title">${escapeHtml(event.title || "(Untitled event)")}</div></td>
        <td>${escapeHtml(event.support || "")}</td>
        <td>${escapeHtml(event.venue || "")}</td>
        <td>${escapeHtml(event.age_restriction || "")}</td>
        <td>${links.join(" · ")}</td>
      </tr>`;
  }).join("");

  return `
    <section class="interest-group">
      <div class="interest-group-heading">
        <div>
          <h2>${escapeHtml(group.title)}</h2>
          <p class="muted">${escapeHtml(group.subtitle)}</p>
        </div>
        <span class="count-badge">${group.events.length}</span>
      </div>

      <div class="table-wrap">
        <table class="interested-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Event</th>
              <th>Support</th>
              <th>Venue</th>
              <th>Age</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

$("refresh-interested").addEventListener("click", loadInterested);

function setReviewBusy(busy) {
  reviewBusy = busy;
  $("interested").disabled = busy;
  $("dismiss").disabled = busy;
}

async function loadReviewQueue() {
  reviewGeneration += 1;
  const generation = reviewGeneration;
  reviewHistory = [];
  setReviewBusy(false);
  $("review-empty").hidden = true;
  $("event-card").hidden = true;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("review_status", "unreviewed")
    .gte("start_at", now)
    .order("start_at", { ascending: true });

  if (generation !== reviewGeneration) return;

  if (error) {
    $("review-empty").hidden = false;
    $("review-empty").innerHTML = `<h2>Could not load events</h2><p>${escapeHtml(diagnosticMessage(error, "frontend-events"))}</p>`;
    return;
  }

  queue = data || [];
  $("queue-count").textContent = String(queue.length);
  showNextCard();
}

function showNextCard() {
  currentEvent = queue[0] || null;
  $("queue-count").textContent = String(queue.length);

  if (!currentEvent) {
    const undoNote = reviewHistory.length
      ? "<p>Backspace restores the last event classified in this session.</p>"
      : "";
    $("review-empty").innerHTML = `
      <h2>Review queue is clear</h2>
      <p>No upcoming unreviewed events remain.</p>
      ${undoNote}`;
    $("event-card").hidden = true;
    $("review-empty").hidden = false;
    return;
  }

  $("review-empty").hidden = true;
  $("event-card").hidden = false;

  $("card-date").textContent = formatShortDate(currentEvent.start_at);
  $("card-venue").textContent = currentEvent.venue || "";
  $("card-title").textContent = currentEvent.title || "(Untitled event)";
  $("card-support").textContent = supportText(currentEvent);
  $("card-when").textContent = formatWhen(currentEvent);

  const showDoors = Boolean(currentEvent.doors_time) && !timeIsUnlisted(currentEvent);
  $("card-doors").textContent = showDoors ? currentEvent.doors_time : "";
  $("card-doors-row").hidden = !showDoors;

  $("card-age").textContent = currentEvent.age_restriction || "";
  $("card-age-row").hidden = !currentEvent.age_restriction;

  $("card-source").textContent = currentEvent.source || "";
  $("card-source-row").hidden = !currentEvent.source;

  setLink($("card-event-link"), eventLink(currentEvent));
  setLink($("card-ticket-link"), currentEvent.ticket_url || "");
}

async function classifyCurrent(status) {
  if (!currentEvent || reviewBusy) return;

  const generation = reviewGeneration;
  const event = currentEvent;
  const reviewedAt = new Date().toISOString();
  setReviewBusy(true);

  const { error } = await supabase
    .from("events")
    .update({
      review_status: status,
      reviewed_at: reviewedAt
    })
    .eq("id", event.id);

  if (generation !== reviewGeneration) return;

  setReviewBusy(false);

  if (error) {
    alert(diagnosticMessage(error, "frontend-review-update"));
    return;
  }

  event.review_status = status;
  event.reviewed_at = reviewedAt;
  if (queue[0] === event) queue.shift();
  reviewHistory.push(event);
  showNextCard();
}

async function undoLastClassification() {
  if (reviewBusy || reviewHistory.length === 0) return;

  const generation = reviewGeneration;
  const event = reviewHistory[reviewHistory.length - 1];
  setReviewBusy(true);

  const { error } = await supabase
    .from("events")
    .update({
      review_status: "unreviewed",
      reviewed_at: null
    })
    .eq("id", event.id);

  if (generation !== reviewGeneration) return;

  setReviewBusy(false);

  if (error) {
    alert(diagnosticMessage(error, "frontend-review-update"));
    return;
  }

  reviewHistory.pop();
  event.review_status = "unreviewed";
  event.reviewed_at = null;
  queue.unshift(event);
  showNextCard();
}

$("interested").addEventListener("click", () => classifyCurrent("interested"));
$("dismiss").addEventListener("click", () => classifyCurrent("not_interested"));
$("refresh-review").addEventListener("click", loadReviewQueue);

document.addEventListener("keydown", (e) => {
  if (reviewView.hidden) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;

  if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    undoLastClassification();
    return;
  }

  if (!currentEvent) return;

  if (e.key === "ArrowRight") {
    e.preventDefault();
    classifyCurrent("interested");
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    classifyCurrent("not_interested");
  }
});

async function loadAllEvents() {
  $("table-message").textContent = "Loading…";
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .gte("start_at", now)
    .order("start_at", { ascending: true });

  if (error) {
    $("table-message").textContent = diagnosticMessage(error, "frontend-events");
    return;
  }

  allEvents = data || [];
  $("table-message").textContent = `${allEvents.length} upcoming events`;
  renderTable();
}

function renderTable() {
  const q = $("search").value.trim().toLowerCase();
  const status = $("status-filter").value;

  const filtered = allEvents.filter((event) => {
    const haystack = [
      event.title,
      event.support,
      event.venue,
      event.source,
      event.promoter
    ].filter(Boolean).join(" ").toLowerCase();

    const matchesSearch = !q || haystack.includes(q);
    const matchesStatus = status === "all" || event.review_status === status;
    return matchesSearch && matchesStatus;
  });

  $("events-body").innerHTML = filtered.map((event) => {
    const links = [];
    if (event.event_url) links.push(`<a href="${escapeAttr(event.event_url)}" target="_blank" rel="noopener">Event</a>`);
    if (event.ticket_url) links.push(`<a href="${escapeAttr(event.ticket_url)}" target="_blank" rel="noopener">Tickets</a>`);

    return `
      <tr>
        <td>${escapeHtml(formatWhen(event))}</td>
        <td>
          <div class="event-title">${escapeHtml(event.title || "(Untitled event)")}</div>
          ${event.source ? `<div class="subtle">${escapeHtml(event.source)}</div>` : ""}
        </td>
        <td>${escapeHtml(event.support || "")}</td>
        <td>${escapeHtml(event.venue || "")}</td>
        <td>
          <select class="status-select" data-id="${escapeAttr(String(event.id))}">
            ${statusOption("unreviewed", event.review_status)}
            ${statusOption("interested", event.review_status)}
            ${statusOption("not_interested", event.review_status)}
          </select>
        </td>
        <td>${links.join(" · ")}</td>
      </tr>`;
  }).join("");

  document.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", updateStatusFromTable);
  });
}

function statusOption(value, current) {
  const label = value === "not_interested"
    ? "Not interested"
    : value[0].toUpperCase() + value.slice(1);
  return `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
}

async function updateStatusFromTable(e) {
  const select = e.currentTarget;
  const id = select.dataset.id;
  const review_status = select.value;
  select.disabled = true;

  const { error } = await supabase
    .from("events")
    .update({
      review_status,
      reviewed_at: review_status === "unreviewed" ? null : new Date().toISOString()
    })
    .eq("id", id);

  select.disabled = false;

  if (error) {
    alert(diagnosticMessage(error, "frontend-review-update"));
    await loadAllEvents();
    return;
  }

  const event = allEvents.find((x) => String(x.id) === String(id));
  if (event) {
    event.review_status = review_status;
    event.reviewed_at = review_status === "unreviewed" ? null : new Date().toISOString();
  }

  renderTable();
}

$("search").addEventListener("input", renderTable);
$("status-filter").addEventListener("change", renderTable);
$("refresh-table").addEventListener("click", loadAllEvents);

requireSession();
