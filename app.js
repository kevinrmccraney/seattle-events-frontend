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
let allEvents = [];

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
  authMessage.textContent = error ? error.message : "";
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
  authMessage.textContent = error ? error.message : "Check your email for the sign-in link.";
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
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("review_status", "interested")
    .gte("start_at", now)
    .order("start_at", { ascending: true });

  if (error) {
    $("interested-list").innerHTML = "";
    $("interested-empty").hidden = false;
    $("interested-empty").innerHTML = `<h2>Could not load interested events</h2><p>${escapeHtml(error.message)}</p>`;
    return;
  }

  const events = data || [];
  $("interested-count").textContent = String(events.length);
  $("interested-empty").hidden = events.length > 0;

  $("interested-list").innerHTML = events.map((event) => {
    const links = [];
    if (event.event_url) links.push(`<a href="${escapeAttr(event.event_url)}" target="_blank" rel="noopener">Event page</a>`);
    if (event.ticket_url) links.push(`<a href="${escapeAttr(event.ticket_url)}" target="_blank" rel="noopener">Tickets</a>`);

    return `
      <article class="interested-card">
        <div class="meta">${escapeHtml(formatDateTime(event.start_at))}${event.venue ? ` · ${escapeHtml(event.venue)}` : ""}</div>
        <h3>${escapeHtml(event.title || "(Untitled event)")}</h3>
        ${event.support ? `<p class="support">${escapeHtml(event.support)}</p>` : ""}
        ${event.age_restriction ? `<p class="subtle">${escapeHtml(event.age_restriction)}</p>` : ""}
        <div class="links">${links.join("")}</div>
      </article>`;
  }).join("");
}

$("refresh-interested").addEventListener("click", loadInterested);

async function loadReviewQueue() {
  $("review-empty").hidden = true;
  $("event-card").hidden = true;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("review_status", "unreviewed")
    .gte("start_at", now)
    .order("start_at", { ascending: true });

  if (error) {
    $("review-empty").hidden = false;
    $("review-empty").innerHTML = `<h2>Could not load events</h2><p>${escapeHtml(error.message)}</p>`;
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
  $("card-when").textContent = formatDateTime(currentEvent.start_at);

  $("card-doors").textContent = currentEvent.doors_time || "";
  $("card-doors-row").hidden = !currentEvent.doors_time;

  $("card-age").textContent = currentEvent.age_restriction || "";
  $("card-age-row").hidden = !currentEvent.age_restriction;

  $("card-source").textContent = currentEvent.source || "";
  $("card-source-row").hidden = !currentEvent.source;

  setLink($("card-event-link"), eventLink(currentEvent));
  setLink($("card-ticket-link"), currentEvent.ticket_url || "");
}

async function classifyCurrent(status) {
  if (!currentEvent) return;

  const eventId = currentEvent.id;
  $("interested").disabled = true;
  $("dismiss").disabled = true;

  const { error } = await supabase
    .from("events")
    .update({
      review_status: status,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", eventId);

  $("interested").disabled = false;
  $("dismiss").disabled = false;

  if (error) {
    alert(`Could not update event: ${error.message}`);
    return;
  }

  queue.shift();
  showNextCard();
}

$("interested").addEventListener("click", () => classifyCurrent("interested"));
$("dismiss").addEventListener("click", () => classifyCurrent("not_interested"));
$("refresh-review").addEventListener("click", loadReviewQueue);

document.addEventListener("keydown", (e) => {
  if (reviewView.hidden || !currentEvent) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

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
    $("table-message").textContent = error.message;
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
        <td>${escapeHtml(formatDateTime(event.start_at))}</td>
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
    alert(`Could not update event: ${error.message}`);
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
