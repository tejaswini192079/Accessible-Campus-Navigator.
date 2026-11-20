/* Accessible Campus Navigator – demo logic
   Sample campus data. Replace with your real campus map later. */

const places = {
  gate:   "Main Gate",
  recep:  "Reception",
  lib:    "Library",
  cafe:   "Cafeteria",
  a0:     "Block A – Classroom 101 (Ground floor)",
  a1:     "Block A – Classroom 204 (First floor)",
  b:      "Block B"
};

/* minutes, stepFree, liftId (optional), instruction text (a -> b); reverse text is generic */
const edges = [
  { a:"gate",  b:"recep", min:2, sf:true,  text:"Enter through the Main Gate and follow the ramp to the Reception desk." },
  { a:"recep", b:"lib",   min:3, sf:true,  text:"From Reception, take the wide corridor on your left to the Library entrance." },
  { a:"recep", b:"cafe",  min:2, sf:true,  text:"From Reception, go straight past the notice board to the Cafeteria." },
  { a:"recep", b:"a0",    min:3, sf:true,  text:"From Reception, go right to Block A and enter Classroom 101 on the ground floor." },
  { a:"a0",    b:"a1",    min:1, sf:true,  lift:"liftA", text:"Use the Block A lift to go up to the first floor." },
  { a:"a0",    b:"a1",    min:1, sf:false, text:"Take the staircase next to Classroom 101 up to the first floor." },
  { a:"cafe",  b:"b",     min:4, sf:true,  text:"From the Cafeteria, follow the covered path to Block B." },
  { a:"b",     b:"a1",    min:2, sf:true,  text:"In Block B, cross the first-floor bridge to Block A, first floor." },
  { a:"lib",   b:"b",     min:2, sf:false, text:"From the Library, take the outdoor steps down to Block B." }
];

/* ---------- Lift status (saved in the browser) ---------- */
let lift = { status: "working" }; // working | pending | broken
try { const s = JSON.parse(localStorage.getItem("acn-lift")); if (s && s.status) lift = s; } catch(e){}
const saveLift = () => { try { localStorage.setItem("acn-lift", JSON.stringify(lift)); } catch(e){} };

/* ---------- Routing (Dijkstra) ---------- */
function usable(edge, mode){
  if (mode === "stepfree" && !edge.sf) return false;
  if (edge.lift && lift.status === "broken") return false; // only verified reports block the lift
  return true;
}

function findRoute(from, to, mode){
  const dist = {}, prev = {}, done = new Set();
  Object.keys(places).forEach(k => dist[k] = Infinity);
  dist[from] = 0;
  while (true){
    let u = null;
    for (const k in dist) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null || dist[u] === Infinity) break;
    if (u === to) break;
    done.add(u);
    for (const e of edges){
      if (!usable(e, mode)) continue;
      let v = null;
      if (e.a === u) v = e.b; else if (e.b === u) v = e.a;
      if (!v) continue;
      if (dist[u] + e.min < dist[v]){ dist[v] = dist[u] + e.min; prev[v] = { node:u, edge:e }; }
    }
  }
  if (dist[to] === Infinity) return null;
  const steps = []; let cur = to;
  while (cur !== from){ const p = prev[cur]; steps.unshift({ from:p.node, to:cur, edge:p.edge }); cur = p.node; }
  return { minutes: dist[to], steps };
}

function describe(step){
  const e = step.edge;
  if (e.a === step.from) return e.text;
  // reverse direction
  if (e.lift) return "Use the Block A lift to go down to the ground floor.";
  if (!e.sf && e.a === "a0") return "Take the staircase down to the ground floor.";
  return `Walk from ${places[step.from]} to ${places[step.to]}.`;
}

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
const fromSel = $("from"), toSel = $("to"), result = $("result");
let lastSpeech = "";

Object.entries(places).forEach(([k, v]) => {
  fromSel.add(new Option(v, k));
  toSel.add(new Option(v, k));
});
fromSel.value = "gate"; toSel.value = "a1";

function render(){
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const from = fromSel.value, to = toSel.value;
  if (from === to){
    result.innerHTML = "<p>You are already at your destination.</p>";
    lastSpeech = "You are already at your destination.";
    return;
  }
  const r = findRoute(from, to, mode);
  if (!r){
    result.innerHTML = `<p><span class="tag bad">No route</span> There is no ${mode === "stepfree" ? "step-free " : ""}route right now. Please ask campus staff for help.</p>`;
    lastSpeech = "No route is available right now. Please ask campus staff for help.";
    return;
  }
  const usesStairs = r.steps.some(s => !s.edge.sf);
  const rerouted = lift.status === "broken" && r.steps.every(s => !s.edge.lift);
  const items = r.steps.map(s => `<li>${describe(s)}</li>`).join("");
  const arrive = `You have arrived at ${places[to]}.`;
  result.innerHTML = `
    <p>
      <span class="tag">${mode === "stepfree" ? "Step-free route" : "Fastest route"}</span>
      <span class="tag ${usesStairs ? "bad" : "ok"}">${usesStairs ? "Includes stairs" : "No stairs"}</span>
      <strong>About ${r.minutes} min</strong>
    </p>
    ${lift.status === "broken" ? '<p class="status-bad">The Block A lift is out of service. Route updated.</p>' : ""}
    ${lift.status === "pending" ? '<p class="status-pending">A lift problem was reported and is waiting to be verified. Route not changed yet.</p>' : ""}
    <ol>${items}</ol>
    <p><strong>${arrive}</strong></p>`;
  lastSpeech = `${mode === "stepfree" ? "Step-free" : "Fastest"} route, about ${r.minutes} minutes. ` +
    r.steps.map((s, i) => `Step ${i + 1}. ${describe(s)}`).join(" ") + " " + arrive;
}

function renderLift(){
  const el = $("liftStatus");
  const map = {
    working: '<span class="status-ok">● Working</span>',
    pending: '<span class="status-pending">● Reported broken – waiting for verification</span>',
    broken:  '<span class="status-bad">● Out of service (verified)</span>'
  };
  el.innerHTML = map[lift.status];
  $("verifyBtn").disabled = lift.status !== "pending";
  $("reportBtn").disabled = lift.status !== "working";
  $("fixBtn").disabled = lift.status === "working";
}

function speak(){
  if (!("speechSynthesis" in window)){ alert("Voice is not supported in this browser."); return; }
  speechSynthesis.cancel();
  if (!lastSpeech) render();
  const u = new SpeechSynthesisUtterance(lastSpeech);
  u.lang = "en-IN"; u.rate = 0.95;
  speechSynthesis.speak(u);
}

$("routeForm").addEventListener("submit", e => { e.preventDefault(); render(); });
$("speakBtn").addEventListener("click", () => { render(); speak(); });
$("stopBtn").addEventListener("click", () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); });

$("reportBtn").addEventListener("click", () => { lift.status = "pending"; saveLift(); renderLift(); render(); });
$("verifyBtn").addEventListener("click", () => { lift.status = "broken"; saveLift(); renderLift(); render(); });
$("fixBtn").addEventListener("click", () => { lift.status = "working"; saveLift(); renderLift(); render(); });

/* ---------- Accessibility tools ---------- */
$("contrastBtn").addEventListener("click", e => {
  const on = document.body.classList.toggle("hc");
  e.currentTarget.setAttribute("aria-pressed", on);
});
let size = 100;
$("fontBtn").addEventListener("click", () => {
  size = size >= 130 ? 100 : size + 10;
  document.documentElement.style.setProperty("--fs", size + "%");
});

renderLift();
render();
