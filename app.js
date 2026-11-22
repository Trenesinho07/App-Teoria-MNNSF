
let BASE_QUESTIONS = [];
let TOPIC_MANIFEST = [];
const topicLoads = new Map();

const TOPICS_META = [
  { id: "T1", block: "FEM", name: "T1: Introducción y CG" },
  { id: "T2", block: "FEM", name: "T2: El MEF y Simetrías" },
  { id: "T3", block: "FEM", name: "T3: Tipos de Análisis" },
  { id: "T4", block: "FEM", name: "T4: Model Updating" },
  { id: "L1", block: "CFD", name: "L1: Conceptos Fundamentales" },
  { id: "L2", block: "CFD", name: "L2: Mallado e Implementación MVF" },
  { id: "L3", block: "CFD", name: "L3: Esquemas de Discretización" },
  { id: "L4", block: "CFD", name: "L4: Acoplamiento Presión-Velocidad" },
  { id: "L5", block: "CFD", name: "L5: Condiciones de Contorno" },
  { id: "L6", block: "CFD", name: "L6: Solvers y Flujo Transitorio" },
  { id: "L7", block: "CFD", name: "L7: Modelado de la Turbulencia" },
  { id: "L8", block: "CFD", name: "L8: Buenas Prácticas en CFD" }
];

const STORAGE_KEY = "mnssf_trainer_v2_state";
let state = loadState();
state.stats ||= {}; state.doubts ||= {}; state.schedule ||= {}; state.extraQuestions ||= []; state.examHistory ||= [];
let ALL_QUESTIONS = [...BASE_QUESTIONS, ...(state.extraQuestions || [])];
let selectedTopics = new Set(TOPICS_META.map(t => t.id));

// Practice state
let pList = [], pIdx = 0, pAnswered = {}, pOk = 0, pErr = 0;

// Exam state
let eList = [], eIdx = 0, eAnswers = {}, eTimer = null, eSeconds = 0;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { stats: {}, doubts: {}, schedule: {}, extraQuestions: [], examHistory: [] };
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn("No se pudo guardar el progreso local", e); }
}

async function loadTopics(ids) {
  const unique = [...new Set(ids)];
  await Promise.all(unique.map(id => {
    if (topicLoads.has(id)) return topicLoads.get(id);
    const task = fetch(`questions/${id}.json`).then(r => { if (!r.ok) throw new Error(`No se pudo cargar ${id}`); return r.json(); }).then(rows => {
      const known = new Set(BASE_QUESTIONS.map(q => q.id));
      rows.forEach(q => { if (!known.has(q.id)) { BASE_QUESTIONS.push(q); known.add(q.id); } });
      ALL_QUESTIONS = [...BASE_QUESTIONS, ...(state.extraQuestions || [])];
      return rows;
    }).catch(err => { topicLoads.delete(id); throw err; });
    topicLoads.set(id, task); return task;
  }));
  return ALL_QUESTIONS;
}
function topicIdsFor(block, topic) {
  if (topic !== "ALL") return [topic];
  return TOPIC_MANIFEST.filter(t => block === "ALL" || t.block === block).map(t => t.id);
}

function getQStatus(id) {
  const s = state.stats[id];
  if (!s) return "NEW";
  if (s.lastCorrect === false) return "WRONG";
  if (s.lastCorrect === true) return "OK";
  return "NEW";
}

function switchTab(tab) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("view-" + tab).classList.add("active");
  const idxMap = { config: 0, practice: 1, exam: 2, bank: 3, cheatsheet: 4, data: 5 };
  document.querySelectorAll(".tab-btn")[idxMap[tab]].classList.add("active");
  if (tab === "config") renderConfig();
  if (tab === "bank") renderBank();
}

// ===================== CONFIGURADOR =====================
function renderConfig() {
  const total = TOPIC_MANIFEST.reduce((n,t) => n + t.count, 0) + (state.extraQuestions || []).length;
  const entries = Object.values(state.stats || {});
  const seen = entries.length;
  const mastered = entries.filter(x => x.lastCorrect === true).length;
  const wrong = entries.filter(x => x.lastCorrect === false).length;
  const doubts = Object.keys(state.doubts || {}).length;
  const weakIds = new Set([...Object.keys(state.doubts || {}), ...Object.entries(state.stats || {}).filter(([,v]) => v.lastCorrect === false).map(([k]) => k)]); const weakCount = weakIds.size;
  document.getElementById("weak-count").textContent = weakCount;
  const dueCount = Object.values(state.schedule || {}).filter(x => !x.due || x.due <= Date.now()).length;
  const dueBadge = document.getElementById("due-count"); if (dueBadge) dueBadge.textContent = dueCount;
  const pct = total ? Math.round((mastered / total) * 100) : 0;
  const lastExam = state.examHistory.length ? state.examHistory[state.examHistory.length - 1].score2.toFixed(2) + " / 2,00" : "—";
  document.getElementById("global-stats").innerHTML = `
    <div class="stat-box"><div class="stat-label">Banco Total</div><div class="stat-val">${total}</div><div class="stat-sub">Carga por tema bajo demanda</div></div>
    <div class="stat-box"><div class="stat-label">Dominadas (último intento)</div><div class="stat-val" style="color:var(--ok)">${mastered} <span style="font-size:14px;">(${pct}%)</span></div><div class="stat-sub">Respondidas: ${seen}/${total}</div></div>
    <div class="stat-box"><div class="stat-label">Fallos / Dudas</div><div class="stat-val" style="color:var(--err)">${wrong} <span style="font-size:14px;color:var(--warn)">/ ${doubts}</span></div><div class="stat-sub">Pendientes: ${weakCount}</div></div>
    <div class="stat-box"><div class="stat-label">Repasos vencidos</div><div class="stat-val" style="color:#fcd34d">${dueCount}</div><div class="stat-sub">Último simulacro: ${lastExam}</div></div>`;
  ["FEM", "CFD"].forEach(blk => {
    const container = document.getElementById("topics-" + blk.toLowerCase()); container.innerHTML = "";
    TOPIC_MANIFEST.filter(t => t.block === blk).forEach(t => {
      const prefix = `${blk}-${t.id}-`;
      const stats = Object.entries(state.stats).filter(([id]) => id.startsWith(prefix));
      const ok = stats.filter(([,v]) => v.lastCorrect === true).length;
      const mpct = t.count ? Math.round((ok / t.count) * 100) : 0;
      const sel = selectedTopics.has(t.id);
      const el = document.createElement("div"); el.className = `topic-card ${sel ? "selected" : ""} ${blk.toLowerCase()}`;
      el.onclick = () => { if (selectedTopics.has(t.id)) selectedTopics.delete(t.id); else selectedTopics.add(t.id); renderConfig(); };
      el.innerHTML = `<div class="topic-top"><span class="topic-name">${t.name}</span><span>${sel ? "☑️" : "⬜"}</span></div><div class="topic-meta"><span>${t.count} preguntas</span><span>${mpct}% dominado</span></div><div class="bar"><div class="bar-fill" style="width:${mpct}%"></div></div>`;
      container.appendChild(el);
    });
  });
  updateSelectedCounter();
}
function updateSelectedCounter() {
  const onlyExam = document.getElementById("cfg-only-exam").checked;
  const pool = TOPIC_MANIFEST.filter(t => selectedTopics.has(t.id));
  const count = pool.reduce((n,t) => n + (onlyExam ? (t.examCount || 0) : t.count), 0);
  document.getElementById("sel-count").textContent = count;
}

function toggleBlock(blk) {
  const ids = TOPICS_META.filter(t => t.block === blk).map(t => t.id);
  const allSelected = ids.every(id => selectedTopics.has(id));
  ids.forEach(id => allSelected ? selectedTopics.delete(id) : selectedTopics.add(id));
  renderConfig();
}

function applyPreset(type) {
  document.getElementById("cfg-only-exam").checked = false;
  if (type === "all") selectedTopics = new Set(TOPICS_META.map(t => t.id));
  else if (type === "fem") selectedTopics = new Set(TOPICS_META.filter(t => t.block === "FEM").map(t => t.id));
  else if (type === "cfd") selectedTopics = new Set(TOPICS_META.filter(t => t.block === "CFD").map(t => t.id));
  else if (type === "none") selectedTopics = new Set();
  else if (type === "examOnly") {
    selectedTopics = new Set(TOPICS_META.map(t => t.id));
    document.getElementById("cfg-only-exam").checked = true;
    document.getElementById("cfg-limit").value = "all";
  } else if (type === "weak") {
    const ids = [...new Set([...Object.keys(state.doubts || {}), ...Object.entries(state.stats).filter(([,v]) => v.lastCorrect === false).map(([id]) => id)])];
    const topics = TOPIC_MANIFEST.filter(t => ids.some(id => id.startsWith(`${t.block}-${t.id}-`))).map(t => t.id);
    if (!ids.length) { alert("¡No tienes fallos ni dudas pendientes todavía!"); return; }
    loadTopics(topics).then(() => startPractice(shuffleArray(ALL_QUESTIONS.filter(q => ids.includes(q.id))))).catch(showLoadError);
    return;
  }
  renderConfig();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startPracticeFromConfig() {
  const onlyExam = document.getElementById("cfg-only-exam").checked;
  const doShuffle = document.getElementById("cfg-shuffle").checked;
  const limitVal = document.getElementById("cfg-limit").value;
  const ids = [...selectedTopics];
  if (!ids.length) { alert("Selecciona al menos un tema."); return; }
  showLoading("Cargando solo los temas seleccionados…");
  loadTopics(ids).then(() => {
    let pool = ALL_QUESTIONS.filter(q => selectedTopics.has(q.topic) && (!onlyExam || q.isExam));
    if (!pool.length) { alert("Selecciona al menos un tema con preguntas disponibles."); return; }
    if (doShuffle) pool = shuffleArray([...pool]);
    if (limitVal !== "all") pool = pool.slice(0, parseInt(limitVal, 10));
    startPractice(pool);
  }).catch(showLoadError);
}

// ===================== PRÁCTICA ACTIVA =====================
function startPractice(list) {
  pList = list; pIdx = 0; pAnswered = {}; pOk = 0; pErr = 0;
  document.getElementById("practice-summary").style.display = "none";
  document.getElementById("practice-empty").style.display = "none";
  document.getElementById("practice-box").style.display = "block";
  switchTab("practice");
  renderPracticeQuestion();
}

function renderPracticeQuestion() {
  if (!pList.length) {
    document.getElementById("practice-box").style.display = "none";
    document.getElementById("practice-empty").style.display = "block";
    return;
  }
  const q = pList[pIdx];
  document.getElementById("p-idx").textContent = pIdx + 1;
  document.getElementById("p-total").textContent = pList.length;
  document.getElementById("p-ok").textContent = pOk;
  document.getElementById("p-err").textContent = pErr;
  document.getElementById("p-progress").style.width = ((pIdx + 1) / pList.length * 100) + "%";

  const badges = [
    `<span class="block-tag ${q.block === 'FEM' ? 'tag-fem' : 'tag-cfd'}">${q.block} · ${q.topicName}</span>`,
    q.isExam ? `<span class="block-tag tag-exam">📄 Modelo Examen</span>` : ""
  ];
  document.getElementById("p-badges").innerHTML = badges.join("");
  document.getElementById("p-question").textContent = q.q;

  const btnV = document.getElementById("btn-v");
  const btnF = document.getElementById("btn-f");
  btnV.className = "vf-btn v-btn";
  btnF.className = "vf-btn f-btn";
  btnV.disabled = false; btnF.disabled = false;

  updateDoubtBtn(q.id);

  const fb = document.getElementById("p-feedback");
  if (pAnswered[q.id] !== undefined) {
    showPracticeFeedback(q, pAnswered[q.id]);
  } else {
    fb.style.display = "none";
  }
  document.getElementById("btn-next").innerHTML = (pIdx === pList.length - 1 ? "Ver Resumen ✔" : 'Siguiente → <span class="kbd">Enter</span>');
}

function updateDoubtBtn(id) {
  const b = document.getElementById("btn-doubt");
  if (state.doubts[id]) {
    b.className = "btn btn-sm btn-warn";
    b.innerHTML = '🚩 Marcada como dudosa <span class="kbd">D</span>';
  } else {
    b.className = "btn btn-sm";
    b.innerHTML = '🚩 Marcar como dudosa <span class="kbd">D</span>';
  }
}

function toggleCurrentDoubt() {
  if (!pList.length) return;
  const id = pList[pIdx].id;
  if (state.doubts[id]) delete state.doubts[id];
  else state.doubts[id] = true;
  saveState();
  updateDoubtBtn(id);
}

function answerPractice(val) {
  const q = pList[pIdx];
  if (pAnswered[q.id] !== undefined) return;
  pAnswered[q.id] = val;
  const correct = (val === q.a);
  if (correct) pOk++; else pErr++;

  const prev = state.stats[q.id] || { right: 0, wrong: 0 };
  if (correct) prev.right++; else prev.wrong++;
  prev.lastCorrect = correct;
  state.stats[q.id] = prev;
  saveState();

  document.getElementById("p-ok").textContent = pOk;
  document.getElementById("p-err").textContent = pErr;
  showPracticeFeedback(q, val);
}

function showPracticeFeedback(q, userVal) {
  const correct = (userVal === q.a);
  const btnV = document.getElementById("btn-v");
  const btnF = document.getElementById("btn-f");
  btnV.disabled = true; btnF.disabled = true;
  if (userVal === true) btnV.classList.add(correct ? "chosen-ok" : "chosen-err");
  else btnF.classList.add(correct ? "chosen-ok" : "chosen-err");
  if (!correct) (q.a ? btnV : btnF).classList.add("reveal-ok");

  const fb = document.getElementById("p-feedback");
  fb.className = "feedback " + (correct ? "ok" : "err");
  fb.style.display = "block";
  fb.innerHTML = `
    <div class="fb-head">
      <span style="color:${correct ? 'var(--ok)' : 'var(--err)'}">${correct ? '✔ ¡Correcto!' : '✖ Incorrecto'} — La afirmación es ${q.a ? 'VERDADERA' : 'FALSA'}</span>
    </div>
    <div class="fb-row">🎯 <strong>La trampa / Clave:</strong> ${q.trap}</div>
    <div class="fb-row">📘 <strong>Concepto real:</strong> ${q.concept}</div>
    <div class="fb-row">🧠 <strong>Regla rápida:</strong> ${q.anchor}</div>
    <div class="srs-panel"><strong>¿Cuándo quieres volver a verla?</strong><p class="subtitle">Valora tu recuerdo, no solo si has acertado.</p>
      <div class="srs-actions">
        <button class="btn btn-sm btn-err" onclick="rateRecall('${q.id}','again')">🔁 Otra vez · 10 min</button>
        <button class="btn btn-sm" onclick="rateRecall('${q.id}','hard')">😬 Difícil · 1 día</button>
        <button class="btn btn-sm btn-primary" onclick="rateRecall('${q.id}','good')">🙂 Bien · 3 días</button>
        <button class="btn btn-sm btn-ok" onclick="rateRecall('${q.id}','easy')">⚡ Fácil · 7 días</button>
      </div><div class="srs-next" id="srs-${q.id}">${state.schedule[q.id]?.due ? 'Próximo repaso: '+new Date(state.schedule[q.id].due).toLocaleString('es-ES') : 'Aún no has programado el siguiente repaso.'}</div>
    </div>
  `;
}
function rateRecall(id, rating) {
  const now = Date.now(); const mins = { again: 10, hard: 1440, good: 4320, easy: 10080 };
  const prev = state.schedule[id] || { repetitions: 0, interval: 0, ease: 2.5 };
  if (rating === 'again') { prev.repetitions = 0; prev.interval = 10; prev.ease = Math.max(1.3, prev.ease - .2); }
  else { prev.repetitions++; prev.ease = Math.max(1.3, prev.ease + (rating === 'easy' ? .15 : rating === 'hard' ? -.15 : 0));
    const base = mins[rating]; prev.interval = prev.repetitions <= 1 ? base : Math.round(Math.max(base, prev.interval * prev.ease)); }
  prev.due = now + prev.interval * 60000; prev.lastRating = rating; state.schedule[id] = prev; saveState();
  const el = document.getElementById(`srs-${id}`); if (el) el.textContent = `Guardado. Próximo repaso: ${new Date(prev.due).toLocaleString('es-ES')}`;
  renderConfig();
}

function prevPractice() { if (pIdx > 0) { pIdx--; renderPracticeQuestion(); } }
function nextPractice() {
  if (pIdx < pList.length - 1) { pIdx++; renderPracticeQuestion(); }
  else {
    document.getElementById("practice-box").style.display = "none";
    const sum = document.getElementById("practice-summary");
    sum.style.display = "block";
    const net = pOk - pErr;
    const score10 = Math.max(0, (net / pList.length) * 10).toFixed(2);
    const failed = pList.filter(q => pAnswered[q.id] !== undefined && pAnswered[q.id] !== q.a);
    sum.innerHTML = `
      <div class="card-title">🏁 Resumen de Práctica</div>
      <div class="stats-grid" style="margin-top:12px;">
        <div class="stat-box"><div class="stat-label">Aciertos</div><div class="stat-val" style="color:var(--ok)">${pOk}</div></div>
        <div class="stat-box"><div class="stat-label">Fallos</div><div class="stat-val" style="color:var(--err)">${pErr}</div></div>
        <div class="stat-box"><div class="stat-label">Puntuación neta (+1/-1)</div><div class="stat-val">${net} / ${pList.length}</div></div>
        <div class="stat-box"><div class="stat-label">Nota equiv. (/10)</div><div class="stat-val" style="color:#fcd34d">${score10}</div></div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px;">
        ${failed.length ? `<button class="btn btn-err" onclick="retryPracticeFailed()">🔥 Repasar solo los ${failed.length} fallos</button>` : ""}
        <button class="btn btn-primary" onclick="switchTab('config')">🎯 Nueva sesión</button>
      </div>
    `;
  }
}
function retryPracticeFailed() {
  const failed = pList.filter(q => pAnswered[q.id] !== undefined && pAnswered[q.id] !== q.a);
  if (failed.length) startPractice(shuffleArray([...failed]));
}

// Keyboard shortcuts in Practice
document.addEventListener("keydown", e => {
  if (!document.getElementById("view-practice").classList.contains("active")) return;
  if (document.getElementById("practice-box").style.display === "none") return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "v") answerPractice(true);
  else if (k === "f") answerPractice(false);
  else if (k === "d") toggleCurrentDoubt();
  else if (k === "enter" || k === "arrowright") nextPractice();
  else if (k === "arrowleft") prevPractice();
});

// ===================== SIMULACRO DE EXAMEN =====================
function startExamFromConfig() {
  switchTab("exam");
  document.getElementById("exam-source").value = "selected";
}

async function launchExam() {
  const src = document.getElementById("exam-source").value;
  const count = parseInt(document.getElementById("exam-num").value, 10) || 40;
  const mins = parseInt(document.getElementById("exam-mins").value, 10) || 25;
  let ids = TOPIC_MANIFEST.map(t => t.id);
  if (src === "fem") ids = TOPIC_MANIFEST.filter(t => t.block === "FEM").map(t => t.id);
  else if (src === "cfd") ids = TOPIC_MANIFEST.filter(t => t.block === "CFD").map(t => t.id);
  else if (src === "selected") ids = [...selectedTopics];
  showLoading("Preparando simulacro…");
  try { await loadTopics(ids); } catch(e) { showLoadError(e); return; }
  let pool = [];
  if (src === "official") pool = ALL_QUESTIONS.filter(q => q.isExam);
  else if (src === "fem") pool = ALL_QUESTIONS.filter(q => q.block === "FEM");
  else if (src === "cfd") pool = ALL_QUESTIONS.filter(q => q.block === "CFD");
  else if (src === "selected") pool = ALL_QUESTIONS.filter(q => selectedTopics.has(q.topic));
  else { const fem = shuffleArray(ALL_QUESTIONS.filter(q => q.block === "FEM")); const cfd = shuffleArray(ALL_QUESTIONS.filter(q => q.block === "CFD")); const half = Math.floor(count / 2); pool = [...fem.slice(0, half), ...cfd.slice(0, count-half)]; }
  if (!pool.length) { alert("No hay preguntas en la selección elegida."); return; }
  eList = shuffleArray([...pool]).slice(0, Math.min(count, pool.length)); eIdx = 0; eAnswers = {}; eSeconds = mins * 60;
  document.getElementById("exam-setup").style.display = "none"; document.getElementById("exam-result").style.display = "none"; document.getElementById("exam-active").style.display = "block"; document.getElementById("e-total").textContent = eList.length;
  clearInterval(eTimer); updateExamTimer(); eTimer = setInterval(() => { eSeconds--; updateExamTimer(); if (eSeconds <= 0) { clearInterval(eTimer); finishExam(); } }, 1000); renderExamQuestion();
}

function updateExamTimer() {
  const m = String(Math.floor(Math.max(0, eSeconds) / 60)).padStart(2, "0");
  const s = String(Math.max(0, eSeconds) % 60).padStart(2, "0");
  document.getElementById("e-timer").textContent = `${m}:${s}`;
}

function renderExamQuestion() {
  const q = eList[eIdx];
  document.getElementById("e-answered").textContent = Object.keys(eAnswers).length;
  document.getElementById("e-badges").innerHTML = `
    <span class="block-tag ${q.block === 'FEM' ? 'tag-fem' : 'tag-cfd'}">${q.block} · ${q.topicName}</span>
    <span class="block-tag" style="background:var(--bg-soft);">Pregunta ${eIdx + 1} / ${eList.length}</span>
  `;
  document.getElementById("e-question").textContent = q.q;

  const nav = document.getElementById("e-nav");
  nav.innerHTML = "";
  eList.forEach((item, i) => {
    const d = document.createElement("button");
    let cls = "exam-dot";
    if (i === eIdx) cls += " current";
    if (eAnswers[item.id] === true) cls += " ans-v";
    else if (eAnswers[item.id] === false) cls += " ans-f";
    d.className = cls;
    d.textContent = i + 1;
    d.onclick = () => { eIdx = i; renderExamQuestion(); };
    nav.appendChild(d);
  });

  const bv = document.getElementById("e-btn-v");
  const bf = document.getElementById("e-btn-f");
  bv.className = "vf-btn v-btn" + (eAnswers[q.id] === true ? " chosen-ok" : "");
  bf.className = "vf-btn f-btn" + (eAnswers[q.id] === false ? " chosen-err" : "");
}

function markExam(val) {
  eAnswers[eList[eIdx].id] = val;
  if (eIdx < eList.length - 1) eIdx++;
  renderExamQuestion();
}
function moveExam(delta) {
  eIdx = Math.max(0, Math.min(eList.length - 1, eIdx + delta));
  renderExamQuestion();
}

function finishExam() {
  clearInterval(eTimer);
  document.getElementById("exam-active").style.display = "none";
  const res = document.getElementById("exam-result");
  res.style.display = "block";

  let ok = 0, err = 0;
  let femOk = 0, femTot = 0, cfdOk = 0, cfdTot = 0;
  const wrongItems = [];

  eList.forEach(q => {
    // In real exam, leaving blank = False
    const userAns = (eAnswers[q.id] === undefined) ? false : eAnswers[q.id];
    const isOk = (userAns === q.a);
    if (isOk) ok++; else { err++; wrongItems.push({ q, userAns }); }
    if (q.block === "FEM") { femTot++; if (isOk) femOk++; }
    else { cfdTot++; if (isOk) cfdOk++; }

    const prev = state.stats[q.id] || { right: 0, wrong: 0 };
    if (isOk) prev.right++; else prev.wrong++;
    prev.lastCorrect = isOk;
    state.stats[q.id] = prev;
    const old = state.schedule[q.id] || { repetitions: 0, interval: 0, ease: 2.5 };
    if (!isOk) { old.repetitions = 0; old.interval = 10; } else { old.repetitions++; old.interval = old.repetitions === 1 ? 4320 : Math.round(Math.max(4320, old.interval * old.ease)); }
    old.due = Date.now() + old.interval * 60000; state.schedule[q.id] = old;
  });

  const net = ok - err;
  const score2 = Math.max(0, (net / eList.length) * 2);
  const score10 = Math.max(0, (net / eList.length) * 10);
  state.examHistory.push({ date: new Date().toISOString(), ok, err, total: eList.length, score2 });
  saveState();

  res.innerHTML = `
    <div class="card-title">📊 Resultados del Simulacro</div>
    <p class="subtitle">Recuerda: en el examen oficial las casillas sin marcar se corrigen como Falso.</p>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Nota Examen (/2,00)</div><div class="stat-val" style="color:${score2 >= 1 ? 'var(--ok)' : 'var(--err)'}">${score2.toFixed(2)}</div><div class="stat-sub">Equiv: ${score10.toFixed(2)} / 10</div></div>
      <div class="stat-box"><div class="stat-label">Aciertos / Fallos</div><div class="stat-val"><span style="color:var(--ok)">${ok}</span> / <span style="color:var(--err)">${err}</span></div><div class="stat-sub">Neto: ${net} de ${eList.length}</div></div>
      <div class="stat-box"><div class="stat-label">Bloque FEM</div><div class="stat-val" style="color:#c4b5fd">${femTot ? Math.round(femOk/femTot*100) + '%' : '—'}</div><div class="stat-sub">${femOk}/${femTot} aciertos</div></div>
      <div class="stat-box"><div class="stat-label">Bloque CFD</div><div class="stat-val" style="color:#67e8f9">${cfdTot ? Math.round(cfdOk/cfdTot*100) + '%' : '—'}</div><div class="stat-sub">${cfdOk}/${cfdTot} aciertos</div></div>
    </div>
    <div style="display:flex; gap:10px; margin-bottom:18px;">
      <button class="btn btn-primary" onclick="document.getElementById('exam-result').style.display='none'; document.getElementById('exam-setup').style.display='block';">🔄 Nuevo Simulacro</button>
      ${wrongItems.length ? `<button class="btn btn-err" onclick="practiceExamWrong()">🔥 Practicar los ${wrongItems.length} fallos</button>` : ""}
    </div>
    ${wrongItems.length ? `<div class="card-title" style="margin-top:10px;">❌ Revisión de Fallos (${wrongItems.length})</div>` : '<p style="color:var(--ok);font-weight:700;">¡Pleno absoluto! 0 fallos.</p>'}
    <div id="exam-wrong-list"></div>
  `;

  window._lastExamWrong = wrongItems.map(x => x.q);
  const wl = document.getElementById("exam-wrong-list");
  wrongItems.forEach(({ q, userAns }) => {
    wl.innerHTML += `
      <div class="bank-item open" style="border-color:rgba(239,68,68,.45);">
        <div class="q-badges">
          <span class="block-tag ${q.block === 'FEM' ? 'tag-fem' : 'tag-cfd'}">${q.topicName}</span>
          <span class="block-tag tag-err">Respondiste: ${userAns ? 'V' : 'F'} · Correcta: ${q.a ? 'VERDADERO' : 'FALSO'}</span>
        </div>
        <div class="bank-q">${q.q}</div>
        <div class="bank-detail">
          <div class="fb-row">🎯 <strong>Trampa:</strong> ${q.trap}</div>
          <div class="fb-row">📘 <strong>Concepto:</strong> ${q.concept}</div>
          <div class="fb-row">🧠 <strong>Anclaje:</strong> ${q.anchor}</div>
        </div>
      </div>
    `;
  });
}

function practiceExamWrong() {
  if (window._lastExamWrong && window._lastExamWrong.length) {
    startPractice(shuffleArray([...window._lastExamWrong]));
  }
}

// ===================== BANCO DE PREGUNTAS =====================
function populateBankTopicSelect() {
  const sel = document.getElementById("b-topic");
  TOPICS_META.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.block} · ${t.name}`;
    sel.appendChild(opt);
  });
}

function getFilteredBank() {
  const txt = document.getElementById("b-search").value.trim().toLowerCase();
  const blk = document.getElementById("b-block").value;
  const top = document.getElementById("b-topic").value;
  const st = document.getElementById("b-status").value;

  return ALL_QUESTIONS.filter(q => {
    if (blk !== "ALL" && q.block !== blk) return false;
    if (top !== "ALL" && q.topic !== top) return false;
    if (st === "EXAM" && !q.isExam) return false;
    if (st === "DOUBT" && !state.doubts[q.id]) return false;
    if (["WRONG", "OK", "NEW"].includes(st) && getQStatus(q.id) !== st) return false;
    if (txt && !(q.q + " " + q.concept + " " + q.trap + " " + q.topicName).toLowerCase().includes(txt)) return false;
    return true;
  });
}

async function renderBank() {
  const blk = document.getElementById("b-block").value, top = document.getElementById("b-topic").value;
  const ids = topicIdsFor(blk, top);
  const container = document.getElementById("bank-list");
  container.innerHTML = '<p class="subtitle">Cargando temas necesarios…</p>';
  try { await loadTopics(ids); } catch(e) { showLoadError(e); return; }
  const list = getFilteredBank();
  document.getElementById("b-count").textContent = list.length;
  if (!list.length) {
    container.innerHTML = `<p style="color:var(--muted); padding:16px 0;">No hay preguntas que coincidan con ese filtro.</p>`;
    return;
  }
  container.innerHTML = list.map(q => {
    const st = getQStatus(q.id);
    const stBadge = st === "OK" ? '<span class="block-tag tag-ok">✔ Dominada</span>'
      : st === "WRONG" ? '<span class="block-tag tag-err">✖ Fallada</span>' : '';
    const dBadge = state.doubts[q.id] ? '<span class="block-tag tag-warn">🚩 Dudosa</span>' : '';
    return `
      <div class="bank-item" onclick="this.classList.toggle('open')">
        <div class="bank-head">
          <div>
            <div class="q-badges">
              <span class="block-tag ${q.block === 'FEM' ? 'tag-fem' : 'tag-cfd'}">${q.topicName}</span>
              ${q.isExam ? '<span class="block-tag tag-exam">📄 Modelo Examen</span>' : ''}
              ${stBadge} ${dBadge}
            </div>
            <div class="bank-q">${q.q}</div>
          </div>
          <span style="color:var(--muted); font-size:12px; white-space:nowrap;">Ver ▾</span>
        </div>
        <div class="bank-detail" onclick="event.stopPropagation()">
          <div class="fb-row"><strong>Respuesta oficial:</strong> <span style="color:${q.a ? 'var(--ok)' : 'var(--err)'}; font-weight:800;">${q.a ? 'VERDADERO' : 'FALSO'}</span></div>
          <div class="fb-row">🎯 <strong>Trampa / Clave:</strong> ${q.trap}</div>
          <div class="fb-row">📘 <strong>Concepto real:</strong> ${q.concept}</div>
          <div class="fb-row">🧠 <strong>Regla rápida:</strong> ${q.anchor}</div>
          <button class="btn btn-sm" style="margin-top:6px;" onclick="toggleBankDoubt('${q.id}')">${state.doubts[q.id] ? 'Quitar duda 🚩' : 'Marcar dudosa 🚩'}</button>
        </div>
      </div>
    `;
  }).join("");
}

function toggleBankDoubt(id) {
  if (state.doubts[id]) delete state.doubts[id];
  else state.doubts[id] = true;
  saveState();
  renderBank();
}

async function practiceFilteredBank() {
  const blk = document.getElementById("b-block").value, top = document.getElementById("b-topic").value;
  try { await loadTopics(topicIdsFor(blk, top)); const list = getFilteredBank(); if (!list.length) { alert("No hay preguntas en el filtro actual."); return; } startPractice(shuffleArray([...list])); } catch(e) { showLoadError(e); }
}

// ===================== DATOS / JSON =====================
function exportProgress() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "progreso_mnssf.json";
  a.click();
}

function resetProgress() {
  if (!confirm("¿Seguro que quieres borrar todas tus estadísticas, fallos y dudas?")) return;
  state.stats = {}; state.doubts = {}; state.examHistory = [];
  saveState();
  renderConfig();
  alert("Progreso reiniciado.");
}

function importExtraJSON() {
  const msg = document.getElementById("import-msg");
  try {
    const arr = JSON.parse(document.getElementById("json-input").value);
    if (!Array.isArray(arr)) throw new Error("Debe ser un array JSON [...]");
    state.extraQuestions = [...(state.extraQuestions || []), ...arr];
    ALL_QUESTIONS = [...BASE_QUESTIONS, ...state.extraQuestions];
    saveState();
    renderConfig();
    msg.innerHTML = `<span style="color:var(--ok)">✔ Se han añadido ${arr.length} preguntas correctamente. Total: ${ALL_QUESTIONS.length}.</span>`;
    document.getElementById("json-input").value = "";
  } catch (e) {
    msg.innerHTML = `<span style="color:var(--err)">✖ Error en el JSON: ${e.message}</span>`;
  }
}

async function startDueReview() {
  const now = Date.now();
  const dueIds = Object.entries(state.schedule || {}).filter(([,v]) => !v.due || v.due <= now).map(([id]) => id);
  const weakIds = [...new Set([...Object.keys(state.doubts || {}), ...Object.entries(state.stats).filter(([,v]) => v.lastCorrect === false).map(([id]) => id)])];
  const targetIds = dueIds.length ? dueIds : weakIds;
  if (!targetIds.length) { alert("No tienes repasos vencidos. Haz una sesión nueva y programa la repetición al terminar cada pregunta."); return; }
  const topics = TOPIC_MANIFEST.filter(t => targetIds.some(id => id.startsWith(`${t.block}-${t.id}-`))).map(t => t.id);
  try { await loadTopics(topics); const qs = ALL_QUESTIONS.filter(q => targetIds.includes(q.id)); if (!qs.length) { alert("No se encontraron preguntas pendientes en el banco."); return; } startPractice(qs.sort((a,b) => (state.schedule[a.id]?.due || 0) - (state.schedule[b.id]?.due || 0))); } catch(e) { showLoadError(e); }
}

// Inicio ligero: solo descarga el índice. Los JSON de preguntas se solicitan
// cuando el usuario abre un tema, inicia una sesión o consulta el banco.
function showLoading(message) {
  const el = document.getElementById("global-stats");
  if (el) el.dataset.loading = message;
}
function showLoadError(error) {
  console.error(error);
  alert("No se pudieron cargar las preguntas. Comprueba la conexión o vuelve a intentarlo. " + (error?.message || ""));
}
async function loadQuestionBank() {
  const response = await fetch('questions/manifest.json');
  if (!response.ok) throw new Error('No se pudo cargar el índice de preguntas');
  TOPIC_MANIFEST = await response.json();
  TOPICS_META.splice(0, TOPICS_META.length, ...TOPIC_MANIFEST);
  ALL_QUESTIONS = [...(state.extraQuestions || [])];
  renderConfig();
  return true;
}
populateBankTopicSelect();
loadQuestionBank().catch(showLoadError);
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
