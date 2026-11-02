import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const config = window.SEATTLE_EVENTS_CONFIG || {};
if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY || config.SUPABASE_URL.includes("YOUR_PROJECT_REF")) {
  document.body.innerHTML = `<main class="shell"><section class="auth-card"><h1>Configuration required</h1><p>Create <code>config.js</code> from <code>config.example.js</code> and add your Supabase project URL and publishable key.</p></section></main>`;
  throw new Error("Missing Supabase configuration");
}
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
let queue = [], currentEvent = null, allEvents = [];

function formatDateTime(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return v;return new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d)}
function formatShortDate(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return v;return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"}).format(d)}
function artistsText(e){for(const v of [e.artists,e.support,e.artist,e.lineup].filter(Boolean)){if(Array.isArray(v))return v.join(", ");if(typeof v==="object")return JSON.stringify(v);if(String(v).trim())return String(v)}return""}
function eventLink(e){return e.event_url||e.url||e.source_url||""}
function setLink(el,href){if(href){el.href=href;el.hidden=false}else el.hidden=true}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}

function renderSession(session){const signedIn=Boolean(session);$("auth-view").hidden=signedIn;$("app-view").hidden=!signedIn;if(signedIn){$("user-line").textContent=session.user.email||"Signed in";loadReviewQueue()}}
async function requireSession(){const {data:{session}}=await supabase.auth.getSession();renderSession(session)}
$("password-form").addEventListener("submit",async e=>{e.preventDefault();$("auth-message").textContent="Signing in…";const {error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});$("auth-message").textContent=error?error.message:""});
$("magic-form").addEventListener("submit",async e=>{e.preventDefault();$("auth-message").textContent="Sending link…";const {error}=await supabase.auth.signInWithOtp({email:$("magic-email").value.trim(),options:{emailRedirectTo:window.location.href}});$("auth-message").textContent=error?error.message:"Check your email for the sign-in link."});
$("logout").addEventListener("click",()=>supabase.auth.signOut());
supabase.auth.onAuthStateChange((_e,s)=>renderSession(s));

function showView(name){const review=name==="review";$("review-view").hidden=!review;$("table-view").hidden=review;$("tab-review").classList.toggle("active",review);$("tab-table").classList.toggle("active",!review);if(!review)loadAllEvents()}
$("tab-review").addEventListener("click",()=>showView("review"));$("tab-table").addEventListener("click",()=>showView("table"));

async function loadReviewQueue(){
  $("review-empty").hidden=true;$("event-card").hidden=true;
  const {data,error}=await supabase.from("events").select("*").eq("review_status","unreviewed").gte("event_start",new Date().toISOString()).order("event_start",{ascending:true});
  if(error){$("review-empty").hidden=false;$("review-empty").innerHTML=`<h2>Could not load events</h2><p>${esc(error.message)}</p>`;return}
  queue=data||[];$("queue-count").textContent=String(queue.length);showNextCard();
}
function showNextCard(){currentEvent=queue[0]||null;$("queue-count").textContent=String(queue.length);if(!currentEvent){$("event-card").hidden=true;$("review-empty").hidden=false;return}$("review-empty").hidden=true;$("event-card").hidden=false;$("card-date").textContent=formatShortDate(currentEvent.event_start);$("card-venue").textContent=currentEvent.venue||"";$("card-title").textContent=currentEvent.title||"(Untitled event)";$("card-artists").textContent=artistsText(currentEvent);$("card-when").textContent=formatDateTime(currentEvent.event_start);$("card-age").textContent=currentEvent.age_restriction||"";$("card-age-row").hidden=!currentEvent.age_restriction;$("card-source").textContent=currentEvent.source||"";$("card-source-row").hidden=!currentEvent.source;setLink($("card-event-link"),eventLink(currentEvent));setLink($("card-ticket-link"),currentEvent.ticket_url||"")}
async function classifyCurrent(status){if(!currentEvent)return;$("interested").disabled=$("dismiss").disabled=true;const {error}=await supabase.from("events").update({review_status:status,reviewed_at:new Date().toISOString()}).eq("id",currentEvent.id);$("interested").disabled=$("dismiss").disabled=false;if(error){alert(`Could not update event: ${error.message}`);return}queue.shift();showNextCard()}
$("interested").addEventListener("click",()=>classifyCurrent("interested"));$("dismiss").addEventListener("click",()=>classifyCurrent("not_interested"));$("refresh-review").addEventListener("click",loadReviewQueue);
document.addEventListener("keydown",e=>{if($("review-view").hidden||!currentEvent||["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;if(e.key==="ArrowRight"){e.preventDefault();classifyCurrent("interested")}else if(e.key==="ArrowLeft"){e.preventDefault();classifyCurrent("not_interested")}});

async function loadAllEvents(){$("table-message").textContent="Loading…";const {data,error}=await supabase.from("events").select("*").gte("event_start",new Date().toISOString()).order("event_start",{ascending:true});if(error){$("table-message").textContent=error.message;return}allEvents=data||[];$("table-message").textContent=`${allEvents.length} upcoming events`;renderTable()}
function option(v,current){const label=v==="not_interested"?"Not interested":v[0].toUpperCase()+v.slice(1);return `<option value="${v}" ${v===current?"selected":""}>${label}</option>`}
function renderTable(){const q=$("search").value.trim().toLowerCase(), status=$("status-filter").value;const rows=allEvents.filter(e=>{const h=[e.title,artistsText(e),e.venue,e.source].filter(Boolean).join(" ").toLowerCase();return(!q||h.includes(q))&&(status==="all"||e.review_status===status)});$("events-body").innerHTML=rows.map(e=>{const links=[];const u=eventLink(e);if(u)links.push(`<a href="${esc(u)}" target="_blank" rel="noopener">Event</a>`);if(e.ticket_url)links.push(`<a href="${esc(e.ticket_url)}" target="_blank" rel="noopener">Tickets</a>`);return `<tr><td>${esc(formatDateTime(e.event_start))}</td><td><div class="event-title">${esc(e.title||"(Untitled event)")}</div>${e.source?`<div class="subtle">${esc(e.source)}</div>`:""}</td><td>${esc(artistsText(e))}</td><td>${esc(e.venue||"")}</td><td><select class="status-select" data-id="${esc(String(e.id))}">${option("unreviewed",e.review_status)}${option("interested",e.review_status)}${option("not_interested",e.review_status)}</select></td><td>${links.join(" · ")}</td></tr>`}).join("");document.querySelectorAll(".status-select").forEach(s=>s.addEventListener("change",updateStatusFromTable))}
async function updateStatusFromTable(e){const s=e.currentTarget,id=s.dataset.id,review_status=s.value;s.disabled=true;const {error}=await supabase.from("events").update({review_status,reviewed_at:review_status==="unreviewed"?null:new Date().toISOString()}).eq("id",id);s.disabled=false;if(error){alert(`Could not update event: ${error.message}`);await loadAllEvents();return}const row=allEvents.find(x=>String(x.id)===String(id));if(row)row.review_status=review_status}
$("search").addEventListener("input",renderTable);$("status-filter").addEventListener("change",renderTable);$("refresh-table").addEventListener("click",loadAllEvents);
requireSession();
