// ═══════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════
const DAY_COLORS = ['#c8f560','#60c8f5','#f5a623','#f560c8','#60f5a6','#ff6b6b','#a660f5','#f5c860'];

// All projects stored in localStorage as { projects: [{id, name, days:[...]}] }
let db = { projects: [] };
let currentProjectId = null;
let supabaseClient = null;
let pendingLocation = null;
let pendingEditLocation = null;
let pendingModal = null;
let mapLayers = {};
let mapInitialized = false;
let mapInstance = null;
let pdfSelectedDays = new Set();

function currentProject() { return db.projects.find(p => p.id === currentProjectId); }
function activeDay() { const p = currentProject(); return p ? p.days[p.activeDay || 0] : null; }

// ═══════════════════════════════════════════════════
// PERSISTENCE — clé par utilisateur pour isoler les données
// ═══════════════════════════════════════════════════
function localKey() {
  return currentUser ? `tp_db_${currentUser.id}` : 'tp_db_anon';
}
function saveLocal() { localStorage.setItem(localKey(), JSON.stringify(db)); }
function loadLocal() {
  // On ne charge qu'après avoir un user — appelé depuis loadUserProjects
  try {
    const s = localStorage.getItem(localKey());
    if (s) db = JSON.parse(s);
    else db = { projects: [] };
  } catch(e) { db = { projects: [] }; }
}

async function saveToSupabase(proj) {
  if (!supabaseClient || !proj || !currentUser) return;
  try {
    const { error } = await supabaseClient.from('tournages').upsert(
      { id: proj.id, user_id: currentUser.id, nom: proj.name, data: proj },
      { onConflict: 'id' }
    );
    if (error) throw error;
    setStatus('Sauvegardé ✓');
  } catch(e) { setStatus('Erreur: ' + e.message); }
}



// ═══════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
}

function goToDashboard() {
  saveLocal();
  if (isAdmin()) {
    showView('admin');
    renderAdminDashboard();
  } else {
    showView('dashboard');
  }
}

function goToPlannerHub() {
  saveLocal();
  showView('planner-hub');
  renderDashboard();
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
// ── ADMIN ──────────────────────────────────────────────────────────────────
// Ton user_id admin — change-le si besoin (Supabase → Authentication → Users)
const ADMIN_USER_ID = '0695aade-966f-4166-a86e-4d0bf42092b7';

function isAdmin() {
  return currentUser && currentUser.id === ADMIN_USER_ID;
}

function showAppView() {
  document.querySelectorAll('.view, .view-login').forEach(v => v.classList.remove('active'));
  if (isAdmin()) {
    document.getElementById('view-admin').classList.add('active');
    renderAdminDashboard();
  } else {
    document.getElementById('view-dashboard').classList.add('active');
  }
}

let adminTab = 'projects';
let adminData = { projects: [], users: [] };

function switchAdminTab(tab) {
  adminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  renderAdminContent();
}

async function renderAdminDashboard() {
  if (!isAdmin()) return;
  // Update header
  const email = currentUser.email || '';
  document.getElementById('admin-avatar').textContent = email.substring(0,2).toUpperCase();
  document.getElementById('admin-email-label').textContent = email;

  // Load all data (admin bypasses RLS via service — but we use a separate admin query)
  // We fetch all tournages via admin policy + all users via auth.users
  try {
    // Projects — admin sees all (requires RLS policy for admin OR use service key on server)
    // For now: load from local + Supabase (filtered by user but admin has special policy)
    const { data: projs } = await supabaseClient.from('tournages').select('id, nom, user_id, updated_at, data');
    adminData.projects = projs || [];
  } catch(e) { adminData.projects = []; }

  renderAdminStats();
  renderAdminContent();
}

function renderAdminStats() {
  const stats = document.getElementById('admin-stats');
  const totalProjects = adminData.projects.length;
  const totalUsers = new Set(adminData.projects.map(p => p.user_id)).size;
  const totalSteps = adminData.projects.reduce((a, p) => {
    const data = p.data || {};
    const days = data.days || [];
    return a + days.reduce((b, d) => b + (d.steps || []).length, 0);
  }, 0);

  stats.innerHTML = `
    <div class="admin-stat">
      <div class="admin-stat-label">Projets</div>
      <div class="admin-stat-val">${totalProjects}</div>
    </div>
    <div class="admin-stat">
      <div class="admin-stat-label">Utilisateurs actifs</div>
      <div class="admin-stat-val">${totalUsers}</div>
    </div>
    <div class="admin-stat">
      <div class="admin-stat-label">Étapes total</div>
      <div class="admin-stat-val">${totalSteps}</div>
    </div>
  `;
}

function renderAdminContent() {
  const content = document.getElementById('admin-content');
  if (adminTab === 'projects') renderAdminProjects(content);
  else renderAdminUsers(content);
}

function renderAdminProjects(container) {
  if (!adminData.projects.length) {
    container.innerHTML = '<div class="admin-empty">Aucun projet trouvé.</div>';
    return;
  }
  const rows = adminData.projects.map(p => {
    const data = p.data || {};
    const days = data.days || [];
    const steps = days.reduce((a, d) => a + (d.steps || []).length, 0);
    const updated = p.updated_at ? new Date(p.updated_at).toLocaleDateString('fr-FR') : '—';
    return `<tr>
      <td style="font-weight:600">${p.nom || '—'}</td>
      <td><span class="admin-tag" style="background:var(--s2);color:var(--muted)">${(p.user_id||'').substring(0,8)}…</span></td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${days.length} jour${days.length!==1?'s':''} · ${steps} étapes</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${updated}</td>
      <td>
        <button class="btn" style="padding:3px 8px;font-size:10px" onclick="adminOpenProject('${p.id}')">Ouvrir</button>
        <button class="btn" style="padding:3px 8px;font-size:10px;color:var(--danger);border-color:var(--danger);margin-left:4px" onclick="adminDeleteProject('${p.id}')">Suppr.</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>Projet</th><th>Utilisateur</th><th>Contenu</th><th>Modifié</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderAdminUsers(container) {
  // Group projects by user
  const byUser = {};
  adminData.projects.forEach(p => {
    const uid = p.user_id || 'inconnu';
    if (!byUser[uid]) byUser[uid] = { projects: 0, steps: 0 };
    byUser[uid].projects++;
    const days = (p.data && p.data.days) || [];
    byUser[uid].steps += days.reduce((a, d) => a + (d.steps || []).length, 0);
  });

  const uids = Object.keys(byUser);
  if (!uids.length) {
    container.innerHTML = '<div class="admin-empty">Aucun utilisateur trouvé.</div>';
    return;
  }

  const rows = uids.map(uid => {
    const info = byUser[uid];
    const isMe = uid === ADMIN_USER_ID;
    return `<tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${uid.substring(0,16)}…${isMe ? ' <span class="admin-badge" style="font-size:8px">vous</span>' : ''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${info.projects} projet${info.projects!==1?'s':''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${info.steps} étapes</td>
      <td>
        ${!isMe ? `<button class="btn" style="padding:3px 8px;font-size:10px;color:var(--danger);border-color:var(--danger)" onclick="adminDeleteUser('${uid}')">Suppr. user</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>User ID</th><th>Projets</th><th>Étapes</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);margin-top:12px">
      Pour voir les emails, allez dans Supabase → Authentication → Users
    </div>`;
}

async function adminOpenProject(id) {
  // Load the project into local db and open it
  const proj = adminData.projects.find(p => p.id === id);
  if (!proj || !proj.data) return;
  const fullProj = { ...proj.data, id: proj.id };
  const idx = db.projects.findIndex(p => p.id === id);
  if (idx >= 0) db.projects[idx] = fullProj;
  else db.projects.push(fullProj);
  currentProjectId = id;
  document.getElementById('planner-proj-name').textContent = fullProj.name;
  showView('planner');
  initMap();
  render();
}

async function adminDeleteProject(id) {
  if (!confirm('Supprimer définitivement ce projet ?')) return;
  try {
    await supabaseClient.from('tournages').delete().eq('id', id);
    adminData.projects = adminData.projects.filter(p => p.id !== id);
    renderAdminStats();
    renderAdminContent();
  } catch(e) { alert('Erreur: ' + e.message); }
}

async function adminDeleteUser(uid) {
  if (!confirm('Supprimer tous les projets de cet utilisateur ? (Le compte Supabase reste actif, gérez-le dans le dashboard Supabase)')) return;
  try {
    await supabaseClient.from('tournages').delete().eq('user_id', uid);
    adminData.projects = adminData.projects.filter(p => p.user_id !== uid);
    renderAdminStats();
    renderAdminContent();
  } catch(e) { alert('Erreur: ' + e.message); }
}

function renderDashboard() {
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = '';

  db.projects.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'project-card';

    const totalSteps = proj.days.reduce((a, d) => a + d.steps.length, 0);
    const totalDist = proj.days.reduce((a, d) => a + d.steps.reduce((b, s) => b + (s.routeFrom ? s.routeFrom.distance : 0), 0), 0);

    const dotsHtml = proj.days.map((_, i) =>
      `<div class="pc-day-dot" style="background:${DAY_COLORS[i % DAY_COLORS.length]}"></div>`
    ).join('');

    card.innerHTML = `
      <button class="pc-edit-btn" onclick="event.stopPropagation();openEditProjModal('${proj.id}')" title="Modifier / Supprimer">✎</button>
      <div class="pc-name" style="padding-right:30px">${proj.name}</div>
      <div class="pc-days">${dotsHtml}</div>
      <div class="pc-meta">
        <span>${proj.days.length} jour${proj.days.length > 1 ? 's' : ''}</span>
        <span>${totalSteps} étape${totalSteps !== 1 ? 's' : ''}</span>
        ${totalDist > 0 ? `<span>${(totalDist/1000).toFixed(0)} km</span>` : ''}
      </div>
    `;
    card.onclick = () => openProject(proj.id);
    grid.appendChild(card);
  });

  // New project card
  const newCard = document.createElement('div');
  newCard.className = 'project-card new-card';
  newCard.innerHTML = `<div class="pc-plus">+</div><div class="pc-new-label">Nouveau projet</div>`;
  newCard.onclick = openNewProjModal;
  grid.appendChild(newCard);

}


function openProject(id) {
  currentProjectId = id;
  const proj = currentProject();
  if (!proj) return;
  if (!proj.activeDay) proj.activeDay = 0;
  document.getElementById('planner-proj-name').textContent = proj.name;
  showView('planner');
  initMap();
  render();
}

function deleteProject(id) {
  if (!confirm('Supprimer ce projet ? Cette action est irréversible.')) return;
  db.projects = db.projects.filter(p => p.id !== id);
  saveLocal();
  showView('planner-hub');
  renderDashboard();
}

let editingProjectId = null;
function openEditProjModal(id) {
  editingProjectId = id;
  const proj = db.projects.find(p => p.id === id);
  if (!proj) return;
  document.getElementById('edit-proj-name').value = proj.name;
  document.getElementById('edit-proj-sub').textContent = `${proj.days.length} jour${proj.days.length>1?'s':''} · ${proj.days.reduce((a,d)=>a+d.steps.length,0)} étapes`;
  document.getElementById('edit-proj-overlay').classList.add('show');
  setTimeout(() => { const el=document.getElementById('edit-proj-name'); el.focus(); el.select(); }, 50);
}
function closeEditProjModal() {
  document.getElementById('edit-proj-overlay').classList.remove('show');
  editingProjectId = null;
}
function saveEditProject() {
  const name = document.getElementById('edit-proj-name').value.trim();
  if (!name) { document.getElementById('edit-proj-name').focus(); return; }
  const proj = db.projects.find(p => p.id === editingProjectId);
  if (proj) { proj.name = name; saveLocal(); }
  closeEditProjModal();
  showView('planner-hub');
  renderDashboard();
}
function deleteCurrentEditProject() {
  if (!confirm('Supprimer ce projet définitivement ?')) return;
  db.projects = db.projects.filter(p => p.id !== editingProjectId);
  saveLocal();
  closeEditProjModal();
  showView('planner-hub');
  renderDashboard();
}
document.getElementById('edit-proj-name').addEventListener('keydown', e => { if (e.key==='Enter') saveEditProject(); if (e.key==='Escape') closeEditProjModal(); });

// ═══════════════════════════════════════════════════
// NEW PROJECT MODAL
// ═══════════════════════════════════════════════════
function openNewProjModal() {
  document.getElementById('new-proj-name').value = '';
  document.getElementById('new-proj-overlay').classList.add('show');
  setTimeout(() => document.getElementById('new-proj-name').focus(), 50);
}
function closeNewProjModal() { document.getElementById('new-proj-overlay').classList.remove('show'); }
function createProject() {
  const name = document.getElementById('new-proj-name').value.trim();
  if (!name) { document.getElementById('new-proj-name').focus(); return; }
  const proj = {
    id: Date.now().toString(),
    name,
    activeDay: 0,
    days: [{ id: Date.now().toString(), name: 'Jour 1', startHour: 8, startMin: 0, steps: [] }]
  };
  db.projects.push(proj);
  saveLocal();
  closeNewProjModal();
  openProject(proj.id);
}
document.getElementById('new-proj-name').addEventListener('keydown', e => { if (e.key === 'Enter') createProject(); });

// ═══════════════════════════════════════════════════
// MAP INIT (lazy)
// ═══════════════════════════════════════════════════
function initMap() {
  if (mapInitialized) { setTimeout(() => mapInstance.invalidateSize(), 100); return; }
  mapInstance = L.map('map', { center: [44.85, -0.58], zoom: 10, zoomControl: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CartoDB', maxZoom: 19 }).addTo(mapInstance);
  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
  mapInitialized = true;
}

// ═══════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════
function render() {
  const proj = currentProject();
  if (!proj) return;
  renderTabs(proj);
  syncTimeInputs(proj);
  renderSteps(proj);
  renderSummary(proj);
  renderMap(proj);
}

function renderTabs(proj) {
  const tabs = document.getElementById('days-tabs');
  tabs.innerHTML = '';
  proj.days.forEach((day, i) => {
    const c = DAY_COLORS[i % DAY_COLORS.length];
    const b = document.createElement('button');
    b.className = 'day-tab' + (i === proj.activeDay ? ' active' : '');
    b.textContent = day.name;
    if (i === proj.activeDay) { b.style.background = c; b.style.borderColor = c; b.style.color = '#0e0f0e'; }
    else { b.style.borderColor = c + '55'; b.style.color = c; }
    b.onclick = () => { proj.activeDay = i; render(); };
    tabs.appendChild(b);
  });
  const ab = document.createElement('button');
  ab.className = 'day-tab add-day'; ab.textContent = '+ Jour'; ab.onclick = addDay;
  tabs.appendChild(ab);
}

function syncTimeInputs(proj) {
  const day = proj.days[proj.activeDay];
  document.getElementById('t-hour').value = day.startHour ?? 8;
  document.getElementById('t-min').value = String(day.startMin ?? 0).padStart(2, '0');
}

function onTimeChange() {
  const proj = currentProject(); if (!proj) return;
  const day = proj.days[proj.activeDay];
  const h = Math.min(23, Math.max(0, parseInt(document.getElementById('t-hour').value) || 0));
  const m = Math.min(59, Math.max(0, parseInt(document.getElementById('t-min').value) || 0));
  day.startHour = h; day.startMin = m;
  renderSteps(proj); renderSummary(proj);
  saveLocal();
}
function stepTime(delta) {
  const proj = currentProject(); if (!proj) return;
  const day = proj.days[proj.activeDay];
  let total = (day.startHour ?? 8) * 60 + (day.startMin ?? 0) + delta * 15;
  total = Math.max(0, Math.min(23*60+59, total));
  day.startHour = Math.floor(total / 60);
  day.startMin = total % 60;
  document.getElementById('t-hour').value = day.startHour;
  document.getElementById('t-min').value = String(day.startMin).padStart(2,'0');
  renderSteps(proj); renderSummary(proj);
  saveLocal();
}

function renderSteps(proj) {
  const list = document.getElementById('steps-list');
  const day = proj.days[proj.activeDay];
  const c = DAY_COLORS[proj.activeDay % DAY_COLORS.length];

  if (!day.steps.length) {
    list.innerHTML = `<div style="padding:24px 12px;text-align:center;color:var(--muted);font-size:12px;font-family:'DM Mono',monospace;line-height:2">Aucune étape.<br>Ajoutez un lieu ci-dessous.</div>`;
    document.getElementById('day-end-hint').textContent = '';
    return;
  }

  list.innerHTML = '';
  let cursor = (day.startHour ?? 8) * 60 + (day.startMin ?? 0);

  day.steps.forEach((step, i) => {
    if (i > 0) {
      const sc = document.createElement('div'); sc.className = 'seg-connector';
      const sg = document.createElement('div'); sg.className = 'seg-line-gutter';
      const sl = document.createElement('div'); sl.className = 'seg-line-inner';
      sg.appendChild(sl);
      const sd = document.createElement('div'); sd.className = 'seg-data';
      if (step.routeFrom) {
        const tm = Math.round(step.routeFrom.duration / 60);
        sd.innerHTML = `<span class="seg-t">${fmtTime(step.routeFrom.duration)}</span><span class="seg-d">${fmtDist(step.routeFrom.distance)}</span><span class="seg-arr">${minsToTime(cursor)}</span>`;
        cursor += tm;
      } else {
        sd.innerHTML = `<span style="color:var(--border2)">— pas de route</span>`;
      }
      sc.appendChild(sg); sc.appendChild(sd);
      list.appendChild(sc);
    }

    const arrivalStr = minsToTime(cursor);
    const hasOnsite = step.onsiteMinutes > 0;
    const departStr = hasOnsite ? minsToTime(cursor + step.onsiteMinutes) : null;

    const row = document.createElement('div'); row.className = 'tl-item';
    row.dataset.stepIdx = i;
    row.draggable = true;

    // Poignée de drag
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.innerHTML = '⋮⋮';
    handle.title = 'Glisser pour réorganiser';
    row.appendChild(handle);

    const gut = document.createElement('div'); gut.className = 'tl-gutter';
    const node = document.createElement('div'); node.className = 'tl-node';
    node.style.background = c + '22'; node.style.color = c; node.style.border = `1px solid ${c}55`;
    node.textContent = i + 1;
    gut.appendChild(node);
    if (i < day.steps.length - 1) { const ln = document.createElement('div'); ln.className = 'tl-line'; gut.appendChild(ln); }

    const card = document.createElement('div'); card.className = 'step-card';
    card.onclick = e => { if (e.target.closest('.step-actions')) return; mapInstance.setView([step.lat, step.lng], 14); };

    const onsiteHtml = hasOnsite
      ? `<div class="step-onsite-badge" style="background:${c}20;color:${c}">⏱ ${fmtMins(step.onsiteMinutes)} · départ ${departStr}</div>`
      : '';
    const noteHtml = step.note ? `<div class="step-note-display">${step.note}</div>` : '';

    card.innerHTML = `
      <div class="step-card-body">
        <div class="step-name-text">${step.name}</div>
        <div class="step-addr-text">${step.address}</div>
        ${onsiteHtml}
        ${noteHtml}
      </div>
      <div class="step-right">
        <div class="step-clock" style="color:${c}">${arrivalStr}</div>
        <div class="step-actions">
          <button class="icon-btn edit" title="Modifier l'étape" onclick="editStep(${i})">✎</button>
          <button class="icon-btn" title="Supprimer" onclick="deleteStep(${i})">×</button>
        </div>
      </div>`;
    row.appendChild(gut); row.appendChild(card);

    // ── Drag & drop handlers ──
    row.addEventListener('dragstart', e => {
      dragSrcIdx = i;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(i)); } catch(_) {}
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('.tl-item.drop-before,.tl-item.drop-after').forEach(el => {
        el.classList.remove('drop-before','drop-after');
      });
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const above = (e.clientY - rect.top) < rect.height / 2;
      row.classList.toggle('drop-before', above);
      row.classList.toggle('drop-after', !above);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drop-before','drop-after');
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      const targetIdx = i;
      const above = row.classList.contains('drop-before');
      row.classList.remove('drop-before','drop-after');
      if (dragSrcIdx === null || dragSrcIdx === undefined) return;
      let insertAt = above ? targetIdx : targetIdx + 1;
      if (dragSrcIdx === targetIdx) return;
      if (dragSrcIdx < insertAt) insertAt -= 1; // ajustement après retrait
      if (insertAt === dragSrcIdx) return;
      await moveStep(dragSrcIdx, insertAt);
      dragSrcIdx = null;
    });

    list.appendChild(row);
    if (hasOnsite) cursor += step.onsiteMinutes;
  });

  document.getElementById('day-end-hint').textContent = (day.date ? `${day.date} · ` : '') + `→ fin ~${minsToTime(cursor)}`;
}

// Variable globale pour drag source
let dragSrcIdx = null;

// Déplacer une étape et recalculer toutes les routes du jour concerné
async function moveStep(fromIdx, toIdx) {
  const proj = currentProject(); if (!proj) return;
  const day = proj.days[proj.activeDay];
  if (fromIdx < 0 || fromIdx >= day.steps.length) return;
  if (toIdx < 0 || toIdx > day.steps.length - 1) toIdx = Math.max(0, Math.min(day.steps.length - 1, toIdx));
  if (fromIdx === toIdx) return;
  const [moved] = day.steps.splice(fromIdx, 1);
  day.steps.splice(toIdx, 0, moved);
  // Recalcul de toutes les routes du jour
  await recalcAllRoutes(day);
  saveLocal();
  render();
}

// Recalcule toutes les routes d'un jour
async function recalcAllRoutes(day) {
  if (!day || !day.steps.length) return;
  showLoading(true);
  try {
    // Le 1er n'a pas de routeFrom
    day.steps[0].routeFrom = null;
    day.steps[0].routeCoords = null;
    for (let k = 1; k < day.steps.length; k++) {
      try {
        const r = await getRoute(day.steps[k-1], day.steps[k]);
        day.steps[k].routeFrom = { duration: r.duration, distance: r.distance };
        day.steps[k].routeCoords = r.coords;
      } catch(e) {
        day.steps[k].routeFrom = null;
        day.steps[k].routeCoords = null;
      }
    }
  } finally {
    showLoading(false);
  }
}

function renderSummary(proj) {
  const day = proj.days[proj.activeDay];
  let travel = 0, dist = 0, onsite = 0;
  day.steps.forEach(s => {
    if (s.routeFrom) { travel += s.routeFrom.duration; dist += s.routeFrom.distance; }
    if (s.onsiteMinutes) onsite += s.onsiteMinutes * 60;
  });
  document.getElementById('total-time').textContent = day.steps.length > 1 ? fmtTime(travel) : '—';
  document.getElementById('total-onsite').textContent = onsite > 0 ? fmtTime(onsite) : '—';
  document.getElementById('total-dist').textContent = day.steps.length > 1 ? fmtDist(dist) : '—';
}

function renderMap(proj) {
  if (!mapInitialized) return;
  Object.values(mapLayers).forEach(l => { l.markers.forEach(m => mapInstance.removeLayer(m)); l.polylines.forEach(p => mapInstance.removeLayer(p)); });
  mapLayers = {};
  proj.days.forEach((day, di) => {
    const c = DAY_COLORS[di % DAY_COLORS.length];
    const active = di === proj.activeDay;
    const layers = { markers: [], polylines: [] };
    day.steps.forEach((step, si) => {
      const icon = L.divIcon({ html: `<div class="custom-marker" style="background:${c}"><span>${si+1}</span></div>`, iconSize:[28,28], iconAnchor:[14,28], className:'' });
      const m = L.marker([step.lat, step.lng], { icon }).bindPopup(`<strong>${step.name}</strong><br><small>${step.address}</small>`).addTo(mapInstance);
      if (!active) m.setOpacity(0.3);
      layers.markers.push(m);
      if (step.routeFrom && step.routeCoords) {
        const poly = L.polyline(step.routeCoords.map(c2=>[c2[1],c2[0]]), { color:c, weight:active?4:2, opacity:active?.85:.25, dashArray:active?null:'5,4' }).addTo(mapInstance);
        poly.on('mouseover', () => {
          const prev = day.steps[si-1];
          document.getElementById('tt-time').textContent = fmtTime(step.routeFrom.duration);
          document.getElementById('tt-dist').textContent = fmtDist(step.routeFrom.distance);
          document.getElementById('tt-route').textContent = `${prev?prev.name:'?'}\n→ ${step.name}`;
          document.getElementById('seg-tooltip').style.display = 'block';
        });
        poly.on('mousemove', e => { const t=document.getElementById('seg-tooltip'); t.style.left=(e.originalEvent.clientX+16)+'px'; t.style.top=(e.originalEvent.clientY-52)+'px'; });
        poly.on('mouseout', () => document.getElementById('seg-tooltip').style.display='none');
        layers.polylines.push(poly);
      }
    });
    mapLayers[di] = layers;
  });
  const steps = proj.days[proj.activeDay].steps;
  if (steps.length) mapInstance.fitBounds(L.latLngBounds(steps.map(s=>[s.lat,s.lng])), { padding:[50,50] });
}

// ═══════════════════════════════════════════════════
// GEOCODING
// ═══════════════════════════════════════════════════
const addressInput = document.getElementById('address-input');
const suggestionsEl = document.getElementById('suggestions');
let searchTimeout;

// ── Geocoding (partagé entre champ principal et modal édition) ──────────
async function geocodeSearch(q, onSelect, suggestEl, inputEl) {
  try {
    let url = 'https://nominatim.openstreetmap.org/search?q='
      + encodeURIComponent(q + ' Gironde France')
      + '&format=json&limit=6&addressdetails=1';
    let resp = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    let data = await resp.json();
    // Fallback sans filtre géographique si rien trouvé
    if (!data.length) {
      resp = await fetch(
        'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q)
        + '&format=json&limit=6&addressdetails=1',
        { headers: { 'Accept-Language': 'fr' } }
      );
      data = await resp.json();
    }
    if (!data.length) { suggestEl.style.display = 'none'; return; }
    suggestEl.innerHTML = '';
    data.forEach(function(item) {
      const main = item.display_name.split(',')[0].trim();
      const sub  = item.display_name.split(',').slice(1, 3).join(',').trim();
      const div  = document.createElement('div');
      div.className = 'suggestion-item';
      div.innerHTML = '<div class="s-main"></div><div class="s-sub"></div>';
      div.querySelector('.s-main').textContent = main;
      div.querySelector('.s-sub').textContent  = sub;
      div.onclick = function() {
        suggestEl.style.display = 'none';
        inputEl.value = item.display_name.split(',').slice(0, 2).join(', ').trim();
        onSelect({
          lat:     parseFloat(item.lat),
          lng:     parseFloat(item.lon),
          address: item.display_name.split(',').slice(0, 3).join(', ')
        });
      };
      suggestEl.appendChild(div);
    });
    suggestEl.style.display = 'block';
  } catch(e) {
    console.error('Geocode error:', e);
    suggestEl.style.display = 'none';
  }
}

async function getRoute(from, to) {
  const d = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)).json();
  if (d.code!=='Ok') throw new Error('Route introuvable');
  return { duration:d.routes[0].duration, distance:d.routes[0].distance, coords:d.routes[0].geometry.coordinates };
}

// ── Geocoding pour le champ principal ───────────────────────────────────
addressInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = addressInput.value.trim();
  if (q.length < 2) { suggestionsEl.style.display='none'; return; }
  searchTimeout = setTimeout(() => geocodeSearch(q, loc => { pendingLocation = loc; }, suggestionsEl, addressInput), 320);
});
addressInput.addEventListener('keydown', e => { if (e.key==='Escape') suggestionsEl.style.display='none'; if (e.key==='Enter') addStepFromInput(); });
document.getElementById('step-name-input').addEventListener('keydown', e => { if (e.key==='Enter') addressInput.focus(); });
document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) suggestionsEl.style.display='none'; });

// ── Geocoding pour le modal d'édition d'étape ───────────────────────────
let smpEditSearchTimeout = null;
const smpEditAddrInput = document.getElementById('smp-edit-addr');
const smpSuggestionsEl = document.getElementById('smp-suggestions');

if (smpEditAddrInput) {
  smpEditAddrInput.addEventListener('input', () => {
    clearTimeout(smpEditSearchTimeout);
    pendingEditLocation = null;
    const q = smpEditAddrInput.value.trim();
    if (q.length < 2) { smpSuggestionsEl.style.display = 'none'; return; }
    smpEditSearchTimeout = setTimeout(() => geocodeSearch(q, loc => { pendingEditLocation = loc; }, smpSuggestionsEl, smpEditAddrInput), 320);
  });
  smpEditAddrInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') smpSuggestionsEl.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.smp-search-wrap')) smpSuggestionsEl.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════════
// STEP MANAGEMENT
// ═══════════════════════════════════════════════════
async function addStepFromInput() {
  const proj = currentProject(); if (!proj) return;
  const nameVal = document.getElementById('step-name-input').value.trim();
  const addrVal = addressInput.value.trim();
  if (!addrVal && !pendingLocation) { setStatus('Entre une adresse'); return; }
  if (!pendingLocation) {
    setStatus('Recherche…');
    try {
      var gUrl = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addrVal + ' Gironde France') + '&format=json&limit=1&addressdetails=1';
      var gResp = await fetch(gUrl, { headers: { 'Accept-Language': 'fr' } });
      var d = await gResp.json();
      if (!d.length) { setStatus('Lieu introuvable.'); return; }
      pendingLocation = { lat:parseFloat(d[0].lat), lng:parseFloat(d[0].lon), address:d[0].display_name.split(',').slice(0,3).join(', ') };
    } catch(e) { setStatus('Erreur geocodage'); return; }
  }
  const step = { id:Date.now().toString(), name:nameVal||addrVal.split(',')[0]||'Lieu', address:pendingLocation.address, lat:pendingLocation.lat, lng:pendingLocation.lng, note:null, onsiteMinutes:null, routeFrom:null, routeCoords:null };
  const day = proj.days[proj.activeDay];
  const prev = day.steps[day.steps.length-1];
  if (prev) {
    showLoading(true); setStatus('Calcul itinéraire…');
    try { const r = await getRoute(prev, step); step.routeFrom={duration:r.duration,distance:r.distance}; step.routeCoords=r.coords; setStatus(`${fmtTime(r.duration)} — ${fmtDist(r.distance)}`); }
    catch(e) { setStatus('Route non calculée'); }
    showLoading(false);
  }
  pendingModal = { step, dayIdx:proj.activeDay, editMode:false };
  openStepModal(step);
  clearInputs();
}

function openStepModal(step) {
  const proj = currentProject();
  const c = DAY_COLORS[proj.activeDay % DAY_COLORS.length];
  const card = document.getElementById('step-modal-card');
  const isEdit = pendingModal && pendingModal.editMode;

  // Toggle classe pour afficher/masquer les champs d'édition
  card.classList.toggle('edit-mode', !!isEdit);

  document.getElementById('smp-dot').style.background = c;
  document.getElementById('smp-eyebrow-text').textContent = isEdit ? 'Modifier l\'étape' : 'Nouvelle étape ajoutée';
  document.getElementById('smp-name').textContent = step.name;
  document.getElementById('smp-addr').textContent = step.address;

  // Pré-remplissage des champs d'édition
  if (isEdit) {
    document.getElementById('smp-edit-name').value = step.name || '';
    document.getElementById('smp-edit-addr').value = step.address || '';
    // Reset pendingEditLocation à chaque ouverture
    pendingEditLocation = null;
    const sug = document.getElementById('smp-suggestions');
    if (sug) sug.style.display = 'none';
  }

  const rp = document.getElementById('smp-route-pill');
  if (step.routeFrom) { document.getElementById('smp-rt').textContent=fmtTime(step.routeFrom.duration); document.getElementById('smp-rd').textContent=fmtDist(step.routeFrom.distance); rp.style.display='inline-flex'; }
  else rp.style.display='none';
  const cur = step.onsiteMinutes || '';
  document.getElementById('custom-min').value = cur;
  document.querySelectorAll('.duration-chips .chip').forEach(ch => ch.classList.toggle('selected', parseInt(ch.dataset.min)===cur));
  document.getElementById('step-note').value = step.note || '';
  document.getElementById('step-modal-overlay').classList.add('show');
  setTimeout(() => document.getElementById('confirm-btn').focus(), 60);
}

function selectChip(el, mins) { document.querySelectorAll('.duration-chips .chip').forEach(c=>c.classList.remove('selected')); el.classList.add('selected'); document.getElementById('custom-min').value=mins; }
function onCustomDuration() { const v=parseInt(document.getElementById('custom-min').value); document.querySelectorAll('.duration-chips .chip').forEach(c=>c.classList.toggle('selected',parseInt(c.dataset.min)===v)); }
function clearDuration() { document.getElementById('custom-min').value=''; document.querySelectorAll('.duration-chips .chip').forEach(c=>c.classList.remove('selected')); }

async function confirmStep(save) {
  if (!pendingModal) return;
  const { step, dayIdx, editMode, editIdx } = pendingModal;
  const mins = parseInt(document.getElementById('custom-min').value);
  const v = (!isNaN(mins) && mins > 0) ? mins : null;
  const noteVal = document.getElementById('step-note').value.trim();
  const proj = currentProject();

  if (editMode) {
    if (save) {
      const editedStep = proj.days[dayIdx].steps[editIdx];
      editedStep.onsiteMinutes = v;
      editedStep.note = noteVal || null;

      // Récupérer le nouveau nom
      const newName = document.getElementById('smp-edit-name').value.trim();
      if (newName) editedStep.name = newName;

      // Si une nouvelle position a été choisie via suggestion, mettre à jour
      let positionChanged = false;
      if (pendingEditLocation) {
        editedStep.lat = pendingEditLocation.lat;
        editedStep.lng = pendingEditLocation.lng;
        editedStep.address = pendingEditLocation.address;
        positionChanged = true;
        pendingEditLocation = null;
      } else {
        // Sinon, l'utilisateur a peut-être juste tapé du texte sans sélectionner ;
        // on met à jour le champ adresse libre seulement s'il a été modifié
        const newAddr = document.getElementById('smp-edit-addr').value.trim();
        if (newAddr && newAddr !== editedStep.address) {
          editedStep.address = newAddr;
        }
      }

      // Recalcul des routes adjacentes si la position a changé
      pendingModal = null;
      document.getElementById('step-modal-overlay').classList.remove('show');
      if (positionChanged) {
        await recalcRoutesAround(dayIdx, editIdx);
      }
      render(); saveLocal();
      return;
    }
  } else {
    if (save) { step.onsiteMinutes = v; step.note = noteVal || null; }
    proj.days[dayIdx].steps.push(step);
  }

  pendingModal = null;
  document.getElementById('step-modal-overlay').classList.remove('show');
  render(); saveLocal();
}

// Édition complète d'une étape (nom + adresse + durée + note)
function editStep(idx) {
  const proj = currentProject();
  const step = proj.days[proj.activeDay].steps[idx];
  pendingModal = { step, dayIdx:proj.activeDay, editMode:true, editIdx:idx };
  openStepModal(step);
}


// Recalcul des routes autour d'une étape modifiée (entrée + sortie)
async function recalcRoutesAround(dayIdx, idx) {
  const proj = currentProject();
  const day = proj.days[dayIdx];
  showLoading(true);
  try {
    // Route entrante (si pas le premier)
    if (idx > 0) {
      try {
        const r = await getRoute(day.steps[idx-1], day.steps[idx]);
        day.steps[idx].routeFrom = { duration:r.duration, distance:r.distance };
        day.steps[idx].routeCoords = r.coords;
      } catch(e) {
        day.steps[idx].routeFrom = null;
        day.steps[idx].routeCoords = null;
      }
    } else {
      day.steps[idx].routeFrom = null;
      day.steps[idx].routeCoords = null;
    }
    // Route sortante (vers le suivant)
    if (idx < day.steps.length - 1) {
      try {
        const r = await getRoute(day.steps[idx], day.steps[idx+1]);
        day.steps[idx+1].routeFrom = { duration:r.duration, distance:r.distance };
        day.steps[idx+1].routeCoords = r.coords;
      } catch(e) {
        day.steps[idx+1].routeFrom = null;
        day.steps[idx+1].routeCoords = null;
      }
    }
  } finally {
    showLoading(false);
  }
}

function deleteStep(idx) {
  const proj = currentProject();
  const day = proj.days[proj.activeDay];
  day.steps.splice(idx, 1);
  if (idx < day.steps.length && idx > 0) recalcSegment(idx);
  else if (idx===0 && day.steps.length>0) { day.steps[0].routeFrom=null; day.steps[0].routeCoords=null; }
  render(); saveLocal();
}

async function recalcSegment(idx) {
  const proj = currentProject();
  const day = proj.days[proj.activeDay];
  if (idx===0) return;
  showLoading(true);
  try { const r=await getRoute(day.steps[idx-1],day.steps[idx]); day.steps[idx].routeFrom={duration:r.duration,distance:r.distance}; day.steps[idx].routeCoords=r.coords; }
  catch(e){}
  showLoading(false); render();
}

function addDay() {
  const proj = currentProject(); if (!proj) return;
  proj.days.push({ id:Date.now().toString(), name:`Jour ${proj.days.length+1}`, startHour:8, startMin:0, steps:[] });
  proj.activeDay = proj.days.length-1;
  render(); saveLocal();
}

function openDayEditModal() {
  const proj = currentProject(); if (!proj) return;
  const day = proj.days[proj.activeDay];
  document.getElementById('day-edit-name').value = day.name || '';
  document.getElementById('day-edit-date').value = day.date || '';
  document.getElementById('day-edit-overlay').classList.add('show');
  setTimeout(() => { const el=document.getElementById('day-edit-name'); el.focus(); el.select(); }, 50);
}

function closeDayEditModal() {
  document.getElementById('day-edit-overlay').classList.remove('show');
}

function saveDayEdit() {
  const proj = currentProject(); if (!proj) return;
  const day = proj.days[proj.activeDay];
  const newName = document.getElementById('day-edit-name').value.trim();
  const newDate = document.getElementById('day-edit-date').value.trim();
  if (!newName) { document.getElementById('day-edit-name').focus(); return; }
  day.name = newName;
  if (newDate) day.date = newDate;
  else delete day.date;
  closeDayEditModal();
  render();
  saveLocal();
}

document.getElementById('day-edit-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('day-edit-date').focus();
  if (e.key === 'Escape') closeDayEditModal();
});
document.getElementById('day-edit-date').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveDayEdit();
  if (e.key === 'Escape') closeDayEditModal();
});

function clearInputs() { document.getElementById('step-name-input').value=''; addressInput.value=''; suggestionsEl.style.display='none'; pendingLocation=null; }

async function saveProject() {
  saveLocal();
  const proj = currentProject();
  if (supabaseClient && currentUser) {
    await saveToSupabase(proj);
  } else {
    setStatus('Sauvegardé localement ✓');
  }
}

// ═══════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════
function openPdfModal() {
  const proj = currentProject(); if (!proj) return;
  pdfSelectedDays = new Set(proj.days.map((_, i) => i));
  renderPdfDayList(proj);
  document.getElementById('pdf-modal-overlay').classList.add('show');
}
function closePdfModal() { document.getElementById('pdf-modal-overlay').classList.remove('show'); }

function renderPdfDayList(proj) {
  const list = document.getElementById('pdf-day-list');
  list.innerHTML = '';
  proj.days.forEach((day, i) => {
    const c = DAY_COLORS[i % DAY_COLORS.length];
    const totalSteps = day.steps.length;
    let travelSec = 0, distM = 0;
    day.steps.forEach(s => { if (s.routeFrom) { travelSec += s.routeFrom.duration; distM += s.routeFrom.distance; } });
    const item = document.createElement('div');
    item.className = 'pdf-day-item' + (pdfSelectedDays.has(i) ? ' checked' : '');
    item.innerHTML = `
      <div class="pdf-day-check">${pdfSelectedDays.has(i) ? '✓' : ''}</div>
      <div class="pdf-day-dot" style="background:${c}"></div>
      <div class="pdf-day-name">${day.name}</div>
      <div class="pdf-day-meta">${totalSteps} étape${totalSteps!==1?'s':''} ${travelSec>0?'· '+fmtTime(travelSec):''} ${distM>0?'· '+fmtDist(distM):''}</div>
    `;
    item.onclick = () => {
      if (pdfSelectedDays.has(i)) pdfSelectedDays.delete(i); else pdfSelectedDays.add(i);
      renderPdfDayList(proj);
    };
    list.appendChild(item);
  });
}

function toggleSelectAllDays() {
  const proj = currentProject(); if (!proj) return;
  if (pdfSelectedDays.size === proj.days.length) pdfSelectedDays.clear();
  else proj.days.forEach((_, i) => pdfSelectedDays.add(i));
  renderPdfDayList(proj);
}

function openPdfModal() {
  const proj = currentProject(); if (!proj) return;
  pdfSelectedDays = new Set(proj.days.map((_, i) => i));
  renderPdfDayList(proj);
  document.getElementById('pdf-modal-overlay').classList.add('show');
}
function closePdfModal() { document.getElementById('pdf-modal-overlay').classList.remove('show'); }

function renderPdfDayList(proj) {
  const list = document.getElementById('pdf-day-list');
  list.innerHTML = '';
  proj.days.forEach((day, i) => {
    const c2 = DAY_COLORS[i % DAY_COLORS.length];
    const totalSteps = day.steps.length;
    let travelSec = 0, distM = 0;
    day.steps.forEach(s => { if (s.routeFrom) { travelSec += s.routeFrom.duration; distM += s.routeFrom.distance; } });
    const item = document.createElement('div');
    item.className = 'pdf-day-item' + (pdfSelectedDays.has(i) ? ' checked' : '');
    item.innerHTML = `<div class="pdf-day-check">${pdfSelectedDays.has(i) ? '✓' : ''}</div><div class="pdf-day-dot" style="background:${c2}"></div><div class="pdf-day-name">${day.name}</div><div class="pdf-day-meta">${totalSteps} étape${totalSteps!==1?'s':''} ${travelSec>0?'· '+fmtTime(travelSec):''} ${distM>0?'· '+fmtDist(distM):''}</div>`;
    item.onclick = () => {
      if (pdfSelectedDays.has(i)) pdfSelectedDays.delete(i); else pdfSelectedDays.add(i);
      renderPdfDayList(proj);
    };
    list.appendChild(item);
  });
}

function toggleSelectAllDays() {
  const proj = currentProject(); if (!proj) return;
  if (pdfSelectedDays.size === proj.days.length) pdfSelectedDays.clear();
  else proj.days.forEach((_, i) => pdfSelectedDays.add(i));
  renderPdfDayList(proj);
}

// Build the HTML/CSS string for the feuille de route (shared by preview + print)
// Helper d'échappement HTML — protège contre l'injection dans la feuille de route
function escapeHtmlSafe(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m];
  });
}

function buildRouteSheetHTML(proj, selectedDays) {
  const today = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  const totalSteps = selectedDays.reduce((a,d) => a + d.steps.length, 0);
  const projNameEsc = escapeHtmlSafe(proj.name);

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&family=DM+Serif+Display&family=Syne:wght@400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; color: #1a1a1a; background: #fff; padding: 68px 60px; }
    @page { size: A4 portrait; margin: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display:none !important; } }

    /* HEADER PROJET */
    .doc-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 16px; border-bottom: 1.5px solid #1a1a1a; margin-bottom: 26px; }
    .doc-brand { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; }
    .doc-title { font-family: 'DM Serif Display', serif; font-size: 38px; font-weight: 400; letter-spacing: -.01em; line-height: 1; color: #1a1a1a; }
    .doc-meta { font-family: 'DM Mono', monospace; font-size: 9.5px; color: #888; line-height: 1.8; text-align: right; letter-spacing: .04em; }
    .doc-meta strong { color: #1a1a1a; font-weight: 500; }

    /* SECTION JOUR */
    .day-section { margin-bottom: 24px; }
    .day-eyebrow-line { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .day-pill { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; padding: 3px 10px; border-radius: 14px; color: #1a1a1a; }
    .day-date { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: .04em; color: #888; }
    .day-title-serif { font-family: 'DM Serif Display', serif; font-size: 28px; font-weight: 400; line-height: 1.05; margin-bottom: 12px; color: #1a1a1a; }
    .day-stats-line { font-family: 'DM Mono', monospace; font-size: 10.5px; color: #888; letter-spacing: .03em; margin-bottom: 16px; }
    .day-stats-line strong { color: #1a1a1a; font-weight: 500; }
    .day-stats-line .sep { color: #ddd; margin: 0 10px; }

    /* CARTE */
    .map-block { width: 674px; height: 220px; background: #f3f2ee; border-radius: 6px; overflow: hidden; margin-bottom: 8px; position: relative; }
    .leaflet-container { border-radius: 6px; }
    .map-no-steps { display: flex; align-items: center; justify-content: center; height: 100%; font-family: 'DM Mono', monospace; font-size: 11px; color: #bbb; }

    /* LÉGENDE NUMÉROTÉE */
    .legend { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px 14px; padding: 10px 0 16px; border-bottom: 1px solid #ececec; margin-bottom: 16px; }
    .lg-item { display: flex; align-items: center; gap: 7px; font-family: 'DM Sans', sans-serif; font-size: 10.5px; color: #444; line-height: 1.3; }
    .lg-num { flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%; color: #1a1a1a; font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; display: flex; align-items: center; justify-content: center; }
    .lg-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* TIMELINE */
    .timeline { display: flex; flex-direction: column; }
    .tl-step { display: flex; gap: 14px; align-items: flex-start; padding: 7px 0; }
    .tl-time-col { width: 60px; flex-shrink: 0; text-align: right; padding-top: 1px; }
    .tl-arrival { font-family: 'DM Mono', monospace; font-size: 15px; font-weight: 500; color: #1a1a1a; line-height: 1.1; }
    .tl-depart { font-family: 'DM Mono', monospace; font-size: 9.5px; color: #bbb; margin-top: 3px; }
    .tl-body { flex: 1; min-width: 0; border-left-style: solid; border-left-width: 1.5px; padding-left: 16px; padding-bottom: 4px; position: relative; }
    .tl-dot { position: absolute; left: -8px; top: 4px; width: 13px; height: 13px; border-radius: 50%; box-shadow: 0 0 0 3px #fff; }
    .tl-name { font-family: 'DM Sans', sans-serif; font-size: 13.5px; font-weight: 500; color: #1a1a1a; line-height: 1.2; }
    .tl-addr { font-family: 'DM Mono', monospace; font-size: 9.5px; color: #999; margin-top: 2px; line-height: 1.4; letter-spacing: .01em; }
    .tl-onsite { display: inline-block; font-family: 'DM Mono', monospace; font-size: 9.5px; padding: 2px 8px; border-radius: 10px; margin-top: 5px; color: #1a1a1a; }
    .tl-note { background: #fffbea; border-left: 2.5px solid #f0c020; padding: 6px 10px; margin-top: 6px; font-family: 'DM Sans', sans-serif; font-size: 10.5px; color: #5c4a00; line-height: 1.5; font-style: italic; border-radius: 0 4px 4px 0; }
    .tl-note-label { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: .12em; color: #a08000; font-style: normal; display: block; margin-bottom: 2px; }

    .tl-segment { display: flex; align-items: center; padding: 3px 0; padding-left: 60px; }
    .tl-seg-line { width: 14px; border-top: 1px dashed #ddd; margin-left: 14px; margin-right: 8px; }
    .tl-seg-info { font-family: 'DM Mono', monospace; font-size: 9px; color: #bbb; letter-spacing: .04em; }

    /* TOTAUX JOUR */
    .day-totals { display: flex; gap: 0; background: #fafaf6; border-radius: 8px; padding: 12px 18px; margin-top: 14px; }
    .dt-block { flex: 1; }
    .dt-block + .dt-block { border-left: 1px solid #e8e8e0; padding-left: 18px; margin-left: 18px; }
    .dt-label { font-family: 'DM Mono', monospace; font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: #aaa; }
    .dt-val { font-family: 'DM Sans', sans-serif; font-size: 18px; font-weight: 500; color: #1a1a1a; margin-top: 3px; line-height: 1; }

    /* FOOTER DOCUMENT */
    .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e8e8e8; font-family: 'DM Mono', monospace; font-size: 9px; color: #bbb; display: flex; justify-content: space-between; letter-spacing: .04em; text-transform: uppercase; }
  `;

  // HEADER PROJET
  let body = `<div class="doc-header">
    <div>
      <div class="doc-brand">Tournage / planner · feuille de route</div>
      <div class="doc-title">${projNameEsc}</div>
    </div>
    <div class="doc-meta">
      <div><strong>${today}</strong></div>
      <div>${selectedDays.length} jour${selectedDays.length > 1 ? 's' : ''} · ${totalSteps} étape${totalSteps > 1 ? 's' : ''}</div>
      <div>OpenStreetMap</div>
    </div>
  </div>`;

  // CHAQUE JOUR
  selectedDays.forEach((day, di) => {
    const origIdx = proj.days.indexOf(day);
    const col = DAY_COLORS[origIdx % DAY_COLORS.length];
    let travelSec = 0, distM = 0, onsiteMin = 0;
    day.steps.forEach(s => {
      if (s.routeFrom) { travelSec += s.routeFrom.duration; distM += s.routeFrom.distance; }
      if (s.onsiteMinutes) onsiteMin += s.onsiteMinutes;
    });
    const dayNameEsc = escapeHtmlSafe(day.name);
    const dateBit = day.date ? `<span class="day-date">${escapeHtmlSafe(day.date)}</span>` : '';
    const startTime = `${String(day.startHour ?? 8).padStart(2,'0')}:${String(day.startMin ?? 0).padStart(2,'0')}`;

    let dayHtml = `<div class="day-section">
      <div class="day-eyebrow-line">
        <span class="day-pill" style="background:${col}">Jour ${origIdx + 1} / ${proj.days.length}</span>
        ${dateBit}
      </div>
      <h2 class="day-title-serif">${dayNameEsc}</h2>`;

    if (!day.steps.length) {
      dayHtml += `<div class="day-stats-line"><span>Aucune étape</span></div>
        <div class="map-block"><div class="map-no-steps">Aucune étape pour ce jour</div></div>
        </div>`;
      body += dayHtml;
      return;
    }

    // Calcul fin estimée
    let tempCursor = (day.startHour ?? 8) * 60 + (day.startMin ?? 0);
    day.steps.forEach((step, i) => {
      if (i > 0 && step.routeFrom) tempCursor += Math.round(step.routeFrom.duration / 60);
      if (step.onsiteMinutes > 0) tempCursor += step.onsiteMinutes;
    });
    const endTime = minsToTime(tempCursor);

    // Stats inline
    dayHtml += `<div class="day-stats-line">
      <span>Début</span> <strong>${startTime}</strong>
      <span class="sep">·</span>
      <span>Fin estimée</span> <strong>${endTime}</strong>
      <span class="sep">·</span>
      <span><strong>${day.steps.length}</strong> étape${day.steps.length > 1 ? 's' : ''}</span>
      ${travelSec > 0 ? `<span class="sep">·</span><span><strong>${fmtTime(travelSec)}</strong> trajet</span>` : ''}
      ${onsiteMin > 0 ? `<span class="sep">·</span><span><strong>${fmtMins(onsiteMin)}</strong> sur place</span>` : ''}
      ${distM > 0 ? `<span class="sep">·</span><span><strong>${fmtDist(distM)}</strong></span>` : ''}
    </div>`;

    // Carte Leaflet
    dayHtml += `<div class="map-block" id="pdf-map-${di}"><div style="width:674px;height:220px" id="pdfmap-inner-${di}"></div></div>`;

    // Légende numérotée
    const legendItems = day.steps.map((s, i) =>
      `<div class="lg-item"><span class="lg-num" style="background:${col}">${i+1}</span><span class="lg-name">${escapeHtmlSafe(s.name)}</span></div>`
    ).join('');
    dayHtml += `<div class="legend">${legendItems}</div>`;

    // Timeline
    let cursor = (day.startHour ?? 8) * 60 + (day.startMin ?? 0);
    dayHtml += `<div class="timeline">`;
    day.steps.forEach((step, i) => {
      // Connecteur de trajet (sauf 1ère étape)
      if (i > 0) {
        if (step.routeFrom) {
          const tm = Math.round(step.routeFrom.duration / 60);
          cursor += tm;
          dayHtml += `<div class="tl-segment"><div class="tl-seg-line"></div><div class="tl-seg-info">↓ ${fmtTime(step.routeFrom.duration)} · ${fmtDist(step.routeFrom.distance)}</div></div>`;
        } else {
          dayHtml += `<div class="tl-segment"><div class="tl-seg-line"></div><div class="tl-seg-info">↓ sur place</div></div>`;
        }
      }
      const arrivalStr = minsToTime(cursor);
      const hasOnsite = step.onsiteMinutes > 0;
      const departStr = hasOnsite ? minsToTime(cursor + step.onsiteMinutes) : '';
      const onsiteBg = col + '26';
      const stepNameEsc = escapeHtmlSafe(step.name);
      const stepAddrEsc = escapeHtmlSafe(step.address || '');
      const noteEsc = step.note ? escapeHtmlSafe(step.note) : null;

      dayHtml += `<div class="tl-step">
        <div class="tl-time-col">
          <div class="tl-arrival">${arrivalStr}</div>
          ${hasOnsite ? `<div class="tl-depart">→ ${departStr}</div>` : ''}
        </div>
        <div class="tl-body" style="border-left-color:${col}">
          <div class="tl-dot" style="background:${col}"></div>
          <div class="tl-name">${i+1} · ${stepNameEsc}</div>
          ${stepAddrEsc ? `<div class="tl-addr">${stepAddrEsc}</div>` : ''}
          ${hasOnsite ? `<span class="tl-onsite" style="background:${onsiteBg}">⏱ ${fmtMins(step.onsiteMinutes)} sur place</span>` : ''}
          ${noteEsc ? `<div class="tl-note"><span class="tl-note-label">Note de tournage</span>${noteEsc}</div>` : ''}
        </div>
      </div>`;
      if (hasOnsite) cursor += step.onsiteMinutes;
    });
    dayHtml += `</div>`;

    // Totaux jour
    if (travelSec > 0 || onsiteMin > 0 || distM > 0) {
      dayHtml += `<div class="day-totals">`;
      if (travelSec > 0) dayHtml += `<div class="dt-block"><div class="dt-label">Trajets</div><div class="dt-val">${fmtTime(travelSec)}</div></div>`;
      if (onsiteMin > 0) dayHtml += `<div class="dt-block"><div class="dt-label">Sur place</div><div class="dt-val">${fmtMins(onsiteMin)}</div></div>`;
      if (distM > 0) dayHtml += `<div class="dt-block"><div class="dt-label">Distance</div><div class="dt-val">${fmtDist(distM)}</div></div>`;
      dayHtml += `</div>`;
    }

    dayHtml += `</div>`; // .day-section
    body += dayHtml;
  });

  body += `<div class="footer"><span>Tournage / planner · Feuille de route</span><span>${projNameEsc} · ${today}</span></div>`;

  // Map script — pins numérotés UNIQUEMENT (pas de label, plus de chevauchement)
  const serializedDays = JSON.stringify(selectedDays.map((day, di) => ({
    di,
    color: DAY_COLORS[proj.days.indexOf(day) % DAY_COLORS.length],
    steps: day.steps.map(s => ({ lat: s.lat, lng: s.lng, name: s.name, routeCoords: s.routeCoords }))
  })));

  const mapScript = `<scr` + `ipt>
(function() {
  var daysData = ${serializedDays};
  function initMaps() {
    var maps = [];
    daysData.forEach(function(d) {
      var el = document.getElementById('pdfmap-inner-' + d.di);
      if (!el || !d.steps.length) return;
      el.style.width = '674px';
      el.style.height = '220px';
      el.style.display = 'block';
      var m = L.map(el, { zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, fadeAnimation:false, zoomAnimation:false, markerZoomAnimation:false, preferCanvas:true });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom:18 }).addTo(m);
      d.steps.forEach(function(s) {
        if (s.routeCoords && s.routeCoords.length) {
          L.polyline(s.routeCoords.map(function(co){return [co[1],co[0]];}), { color:d.color, weight:4, opacity:.92 }).addTo(m);
        }
      });
      var bounds = [];
      d.steps.forEach(function(s, si) {
        var pin = L.divIcon({ html:'<div style="background:'+d.color+';width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid rgba(0,0,0,.25);box-shadow:0 1px 3px rgba(0,0,0,.18)"><span style="transform:rotate(45deg);font-size:11px;font-weight:700;color:#0e0f0e;line-height:1;font-family:DM Mono,monospace">'+(si+1)+'</span></div>', iconSize:[24,24], iconAnchor:[12,24], className:'' });
        L.marker([s.lat,s.lng],{icon:pin}).addTo(m);
        bounds.push([s.lat,s.lng]);
      });
      m.invalidateSize(false);
      var lb = L.latLngBounds(bounds);
      m.fitBounds(lb, { padding:[30,30], maxZoom:13 });
      maps.push({m:m, bounds:lb});
    });
    return maps;
  }
  var maps = [];
  function refitAll() {
    maps.forEach(function(o) {
      try { o.m.invalidateSize(false); o.m.fitBounds(o.bounds, {padding:[30,30], maxZoom:13}); } catch(e){}
    });
  }
  if (document.readyState === 'complete') {
    maps = initMaps();
  } else {
    window.addEventListener('load', function() { maps = initMaps(); });
  }
  [200, 600, 1100].forEach(function(t) {
    setTimeout(refitAll, t);
  });
  // Exposition pour que le parent puisse forcer un re-fit avant la capture html2canvas
  window.__rsRefitMaps = function() {
    refitAll();
    return maps.length;
  };
  setTimeout(function() {
    try { window.parent.postMessage('maps-ready', '*'); } catch(e){}
  }, 1400);
})();
<\/script>`;

  const leafletCss = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>';
  const leafletJs = '<scr' + 'ipt src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/scr' + 'ipt>';

  return { styles, body, mapScript, leafletCss, leafletJs };
}

// ── Feuille de route modal (preview) ──────────────────────────────────────
function generatePDF() {
  const proj = currentProject(); if (!proj) return;
  if (pdfSelectedDays.size === 0) { alert('Sélectionnez au moins un jour.'); return; }
  const selectedDays = proj.days.filter((_, i) => pdfSelectedDays.has(i));
  closePdfModal();
  openRouteSheetModal(proj, selectedDays);
}

let _routeSheetWin = null;

function openRouteSheetModal(proj, selectedDays) {
  const { styles, body, mapScript, leafletCss, leafletJs } = buildRouteSheetHTML(proj, selectedDays);

  // Build full doc string — will be injected into iframe AND opened as print window
  const fullDoc = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>' + proj.name + ' — Feuille de route</title>' + leafletCss + '<style>' + styles + '</style>' + leafletJs + '</head><body>' + body + mapScript + '</body></html>';

  // Show modal with iframe preview
  const overlay = document.getElementById('route-sheet-overlay');
  const iframe = document.getElementById('route-sheet-iframe');
  overlay.classList.add('show');

  // Reset iframe height before injecting new content (sinon une ancienne hauteur peut subsister)
  iframe.style.height = '1123px';

  // Write into iframe
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(fullDoc);
  doc.close();

  overlay.dataset.projName = proj.name;

  // Auto-resize de l'iframe en hauteur pour épouser le contenu (pas de scrollbar interne).
  // Crucial : sans scrollbar interne, la largeur visible reste 794px exactement, identique
  // à celle utilisée par html2canvas. Pas de décalage de cadrage des cartes Leaflet.
  function resizeIframeToContent() {
    try {
      const b = iframe.contentDocument && iframe.contentDocument.body;
      if (b) {
        const h = Math.max(b.scrollHeight, b.offsetHeight, 1123);
        iframe.style.height = h + 'px';
      }
    } catch(e) {}
  }
  // Plusieurs tentatives pour attraper le moment où le layout + tuiles sont stables
  [80, 300, 800, 1500].forEach(t => setTimeout(resizeIframeToContent, t));

  // Show "ready" indicator when maps have settled
  const btn = document.getElementById('pdf-dl-btn');
  if (btn) { btn.textContent = 'Chargement carte…'; btn.disabled = true; }
  const onMsg = function(e) {
    if (e.data === 'maps-ready') {
      window.removeEventListener('message', onMsg);
      resizeIframeToContent(); // resize final après stabilisation des cartes
      if (btn) { btn.textContent = '↓ Télécharger PDF'; btn.disabled = false; }
    }
  };
  window.addEventListener('message', onMsg);
  // Fallback: re-enable after 3s even if message never comes
  setTimeout(function() {
    window.removeEventListener('message', onMsg);
    if (btn && btn.disabled) { btn.textContent = '↓ Télécharger PDF'; btn.disabled = false; }
  }, 3000);
}

function closeRouteSheetModal() {
  document.getElementById('route-sheet-overlay').classList.remove('show');
}

async function printRouteSheet() {
  const overlay = document.getElementById('route-sheet-overlay');
  const projName = overlay.dataset.projName || 'Tournage';
  const iframe = document.getElementById('route-sheet-iframe');
  const btn = document.getElementById('pdf-dl-btn');

  btn.textContent = 'Génération…';
  btn.disabled = true;

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const iframeWin = iframe.contentWindow;
    const body = iframeDoc.body;

    // Force un re-fit des cartes Leaflet juste avant la capture, pour
    // s'assurer que les bounds sont calculés sur la taille réelle du conteneur.
    if (iframeWin && typeof iframeWin.__rsRefitMaps === 'function') {
      try { iframeWin.__rsRefitMaps(); } catch(e) { console.warn('Refit warn:', e); }
      // Attente du repositionnement et du chargement éventuel des tuiles
      await new Promise(r => setTimeout(r, 700));
    }

    // Dimensions A4 à 96dpi : 794 x 1123. Capture en x2 pour la finesse.
    const A4_W = 794;
    const A4_H = 1123;
    const SCALE = 2;

    // Capture du body entier
    const canvas = await html2canvas(body, {
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: A4_W,
      windowWidth: A4_W,
      scrollX: 0,
      scrollY: 0,
      logging: false
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [A4_W, A4_H], compress: true });

    const totalH = canvas.height / SCALE;

    // ── Slicing intelligent ──
    // On essaie de caler les coupures de page sur le début de chaque jour.
    // Si la coupure naturelle (toutes les A4_H px) tombe au milieu d'un jour,
    // on remonte la coupure au début de ce jour, MAIS uniquement si la page
    // courante a déjà assez de contenu (>= 40% d'une page) pour ne pas créer
    // de page presque vide.
    const dayEls = iframeDoc.querySelectorAll('.day-section');
    const dayTops = Array.from(dayEls).map(el => el.offsetTop);
    const MIN_PAGE_FILL = A4_H * 0.4;

    const pageBoundaries = [0];
    let cur = 0;
    let safety = 0;
    while (cur < totalH && safety++ < 100) {
      let next = cur + A4_H;
      if (next >= totalH) {
        next = totalH;
      } else {
        for (let i = 0; i < dayTops.length; i++) {
          const dTop = dayTops[i];
          const dNext = (i + 1 < dayTops.length) ? dayTops[i + 1] : totalH;
          if (next > dTop && next < dNext) {
            // Snap au début du jour SEULEMENT si la page courante a assez de contenu
            if (dTop - cur >= MIN_PAGE_FILL) {
              next = dTop;
            }
            // Sinon : on coupe naturellement (un jour étalé sur 2 pages)
            break;
          }
        }
      }
      pageBoundaries.push(next);
      cur = next;
    }

    // ── Génération des pages PDF ──
    // CRUCIAL : on ne dessine QUE bottom-top px de contenu (pas A4_H).
    // Sinon les pages se chevauchent (bug de la version précédente : Jour 1 dupliqué).
    for (let p = 0; p < pageBoundaries.length - 1; p++) {
      if (p > 0) pdf.addPage();
      const top = pageBoundaries[p];
      const bottom = pageBoundaries[p + 1];
      const contentH = bottom - top;
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = A4_H * SCALE;
      const ctx = sliceCanvas.getContext('2d');
      // Fond blanc pour les pages partiellement remplies
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      // Crop strict de la zone [top, bottom] de la source
      ctx.drawImage(
        canvas,
        0, top * SCALE, canvas.width, contentH * SCALE,
        0, 0, canvas.width, contentH * SCALE
      );
      pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4_W, A4_H);
    }

    pdf.save(projName.replace(/\s+/g, '_') + '_feuille_de_route.pdf');

  } catch(e) {
    console.error('PDF error:', e);
    alert('Erreur lors de la génération : ' + e.message);
  } finally {
    btn.textContent = '↓ Télécharger PDF';
    btn.disabled = false;
  }
}


// ═══════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════

function updateSbUI(on) {
  const dot = document.getElementById('planner-sb-dot');
  const lbl = document.getElementById('planner-sb-label');
  if (dot) dot.classList.toggle('on', on);
  if (lbl) lbl.textContent = on ? 'Supabase' : 'local';
}

// ── AUTH SYSTEM ────────────────────────────────────────────────────────────
let currentUser = null;
let authMode = 'login'; // 'login' | 'signup'

function showLoginView() {
  document.querySelectorAll('.view, .view-login').forEach(v => v.classList.remove('active'));
  document.getElementById('view-login').classList.add('active');
}

// showAppView defined in admin section

function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
}



async function authForgotPassword() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { setAuthError('Entre ton email pour réinitialiser le mot de passe'); return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) setAuthError(error.message);
  else setAuthError('');
  // Show confirmation
  const sub = document.getElementById('login-sub');
  sub.textContent = 'Email envoyé ! Vérifie ta boîte mail.';
  sub.style.color = 'var(--accent)';
  setTimeout(() => { sub.textContent = 'Accédez à vos projets de tournage'; sub.style.color = ''; }, 5000);
}

async function authSubmit() {
  if (!supabaseClient) { setAuthError('BDD non configurée'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { setAuthError('Email et mot de passe requis'); return; }

  const btn = document.getElementById('auth-submit-btn');
  btn.textContent = '...'; btn.disabled = true;
  setAuthError('');

  try {
    let result;
    result = await supabaseClient.auth.signInWithPassword({ email, password });

    if (result.error) {
      const msg = result.error.message;
      if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
        setAuthError('Email ou mot de passe incorrect');
      } else if (msg.includes('Email not confirmed')) {
        setAuthError('Confirmez votre email avant de vous connecter');
      } else {
        setAuthError(msg);
      }
    }
    // If login OK, onAuthStateChange will handle redirect
  } catch(e) {
    setAuthError('Erreur: ' + e.message);
  } finally {
    btn.textContent = 'Se connecter';
    btn.disabled = false;
  }
}

async function authGoogle() {
  if (!supabaseClient) { setAuthError('BDD non configurée'); return; }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
  if (error) setAuthError(error.message);
}

async function authSignOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null;
  db = { projects: [] };
  // Reset surligneur state
  surDb = { projects: [] };
  surCurrentProjectId = null;
  surDirty = false;
  surTags = [];
  const surInput = document.getElementById('sur-textInput');
  if (surInput) surInput.value = '';
  surRenderTags();
  surRefreshSelect();
  showLoginView();
}

function updateUserUI(user) {
  if (!user) return;
  const email = user.email || '';
  const initials = email.substring(0, 2).toUpperCase();
  // Dashboard header avatar
  const dashAvatar = document.getElementById('user-avatar-dash');
  if (dashAvatar) dashAvatar.textContent = initials;
  // Legacy elements (kept for compat)
  const avatarEl = document.getElementById('user-avatar');
  const labelEl = document.getElementById('user-email-label');
  if (avatarEl) avatarEl.textContent = initials;
  if (labelEl) labelEl.textContent = email;
  // Admin header
  const adminAvatar = document.getElementById('admin-avatar');
  const adminLabel = document.getElementById('admin-email-label');
  if (adminAvatar) adminAvatar.textContent = initials;
  if (adminLabel) adminLabel.textContent = email;
}

async function loadUserProjects() {
  if (!currentUser) return;
  // 1. Réinitialise et charge le cache local propre à cet utilisateur
  db = { projects: [] };
  loadLocal();
  // 2. Fusionne avec Supabase (la source fait autorité)
  if (!supabaseClient) { renderDashboard(); return; }
  try {
    const { data, error } = await supabaseClient
      .from('tournages')
      .select('*')
      .eq('user_id', currentUser.id);
    if (error) throw error;
    if (data && data.length) {
      data.forEach(row => {
        if (!row.data) return;
        const proj = { ...row.data, id: row.id };
        const idx = db.projects.findIndex(p => p.id === row.id);
        if (idx >= 0) db.projects[idx] = proj;
        else db.projects.push(proj);
      });
      saveLocal();
    }
  } catch(e) { console.error('Load error:', e); }
  // Toujours re-rendre la grille après chargement (même en cas d'erreur Supabase, local est là)
  renderDashboard();
  // Mettre à jour l'avatar du planner-hub
  if (currentUser) {
    const email = currentUser.email || '';
    const initials = email.substring(0, 2).toUpperCase();
    const avatarHub = document.getElementById('user-avatar-planner');
    const emailHub = document.getElementById('user-email-planner');
    if (avatarHub) avatarHub.textContent = initials;
    if (emailHub) emailHub.textContent = email;
  }
  // Charger aussi les projets surligneur de l'utilisateur
  await surInitProjects();
}

function initAuth() {
  if (!supabaseClient) return;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      currentUser = session.user;
      updateSbUI(true);
      updateUserUI(currentUser);
      loadUserProjects().then(() => showAppView());
    } else {
      currentUser = null;
      showLoginView();
    }
  });

  // Check existing session
  supabaseClient.auth.getSession().then(({ data }) => {
    if (!data.session) showLoginView();
  });
}

// Allow Enter key on login form
document.getElementById('auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('auth-password').focus(); });
document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') authSubmit(); });

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════
function minsToTime(m) { const h=Math.floor(m/60)%24,min=m%60; return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`; }
function fmtTime(s) { const h=Math.floor(s/3600),m=Math.round((s%3600)/60); return h>0?`${h}h${String(m).padStart(2,'0')}`:`${m} min`; }
function fmtMins(m) { if(m>=60){const h=Math.floor(m/60),min=m%60; return min>0?`${h}h${String(min).padStart(2,'0')}`:`${h}h`;} return `${m} min`; }
function fmtDist(m) { return m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m'; }
function showLoading(v) { document.getElementById('loading').style.display=v?'block':'none'; }
function setStatus(m) { const el=document.getElementById('status-text'); if(el) el.textContent=m; }

// ═══════════════════════════════════════════════════
// SURLIGNEUR
// ═══════════════════════════════════════════════════
const SUR_PASTELS = [
  { bg: '#fde8e8', text: '#a04040', bar: '#f9c5c5' },
  { bg: '#fef3c7', text: '#8a5e00', bar: '#fde08a' },
  { bg: '#dbeafe', text: '#1d4fa8', bar: '#bdd3f8' },
  { bg: '#dcfce7', text: '#1a6e3c', bar: '#a7f0c0' },
  { bg: '#ede9fe', text: '#5b32b8', bar: '#cfc3f8' },
  { bg: '#fce7f3', text: '#a0306a', bar: '#f5b8d8' },
  { bg: '#ffedd5', text: '#924d00', bar: '#fed9a0' },
  { bg: '#d1fae5', text: '#065f46', bar: '#99e8c8' },
];
let surTags = [];
function surEscReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ═══════════════════════════════════════════════════
// SURLIGNEUR : SYSTÈME DE PROJETS
// ═══════════════════════════════════════════════════
let surDb = { projects: [] };          // { projects: [{id, name, text, tags, updatedAt}] }
let surCurrentProjectId = null;
let surDirty = false;                  // true si modifs non sauvées

function surLocalKey() {
  return currentUser ? `sur_db_${currentUser.id}` : 'sur_db_anon';
}
function surSaveLocal() {
  try { localStorage.setItem(surLocalKey(), JSON.stringify(surDb)); } catch(e) {}
}
function surLoadLocal() {
  try {
    const s = localStorage.getItem(surLocalKey());
    surDb = s ? JSON.parse(s) : { projects: [] };
    if (!surDb.projects) surDb.projects = [];
  } catch(e) { surDb = { projects: [] }; }
}

// Sauvegarde Supabase (table optionnelle "surligneur_projets")
// Si la table n'existe pas, on log silencieusement et on reste en local
async function surSaveToSupabase(proj) {
  if (!supabaseClient || !proj || !currentUser) return false;
  try {
    const { error } = await supabaseClient.from('surligneur_projets').upsert(
      { id: proj.id, user_id: currentUser.id, nom: proj.name, data: proj },
      { onConflict: 'id' }
    );
    if (error) {
      // Table manquante ? On reste en local sans bruit.
      console.warn('[surligneur] Sauvegarde Supabase indisponible (table manquante ?) :', error.message);
      return false;
    }
    return true;
  } catch(e) {
    console.warn('[surligneur] Erreur Supabase :', e.message);
    return false;
  }
}

async function surLoadFromSupabase() {
  if (!supabaseClient || !currentUser) return false;
  try {
    const { data, error } = await supabaseClient
      .from('surligneur_projets')
      .select('*')
      .eq('user_id', currentUser.id);
    if (error) {
      console.warn('[surligneur] Lecture Supabase indisponible :', error.message);
      return false;
    }
    if (data && data.length) {
      data.forEach(row => {
        if (!row.data) return;
        const proj = { ...row.data, id: row.id };
        const idx = surDb.projects.findIndex(p => p.id === row.id);
        if (idx >= 0) surDb.projects[idx] = proj;
        else surDb.projects.push(proj);
      });
      surSaveLocal();
    }
    return true;
  } catch(e) {
    console.warn('[surligneur] Erreur lecture Supabase :', e.message);
    return false;
  }
}

async function surDeleteFromSupabase(id) {
  if (!supabaseClient || !currentUser) return;
  try {
    await supabaseClient.from('surligneur_projets').delete().eq('id', id);
  } catch(e) {
    console.warn('[surligneur] Suppression Supabase échouée :', e.message);
  }
}

// Initialise/charge les projets surligneur (appelé après auth)
async function surInitProjects() {
  surDb = { projects: [] };
  surLoadLocal();
  const ok = await surLoadFromSupabase();
  surUpdateBackendStatus(ok);
  surRefreshSelect();
}

function surUpdateBackendStatus(supabaseOk) {
  const dot = document.getElementById('sur-pb-dot');
  const txt = document.getElementById('sur-pb-status-text');
  if (dot) dot.classList.toggle('on', !!supabaseOk);
  if (txt) txt.textContent = supabaseOk ? 'cloud' : 'local';
}

function surRefreshSelect() {
  const sel = document.getElementById('sur-pb-select');
  if (!sel) return;
  const cur = surCurrentProjectId;
  sel.innerHTML = '<option value="">— Aucun projet —</option>';
  surDb.projects
    .slice()
    .sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0))
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (surDirty && p.id === cur ? ' *' : '');
      sel.appendChild(opt);
    });
  sel.value = cur || '';
  surUpdateProjectButtons();
}

function surUpdateProjectButtons() {
  const has = !!surCurrentProjectId;
  const saveBtn = document.getElementById('sur-pb-save');
  const renameBtn = document.getElementById('sur-pb-rename');
  const delBtn = document.getElementById('sur-pb-delete');
  if (saveBtn) saveBtn.disabled = !has;
  if (renameBtn) renameBtn.disabled = !has;
  if (delBtn) delBtn.disabled = !has;
}

function surMarkDirty() {
  if (surCurrentProjectId && !surDirty) {
    surDirty = true;
    surRefreshSelect();
  }
}

function surOnSelectProject(id) {
  if (!id) {
    surCurrentProjectId = null;
    surDirty = false;
    surUpdateProjectButtons();
    surRefreshSelect();
    return;
  }
  if (surDirty && surCurrentProjectId) {
    if (!confirm('Vous avez des modifications non sauvegardées. Charger ce projet et perdre les modifs ?')) {
      // Remettre la sélection précédente
      const sel = document.getElementById('sur-pb-select');
      if (sel) sel.value = surCurrentProjectId;
      return;
    }
  }
  const proj = surDb.projects.find(p => p.id === id);
  if (!proj) return;
  surCurrentProjectId = proj.id;
  surTags = (proj.tags || []).slice();
  document.getElementById('sur-textInput').value = proj.text || '';
  surDirty = false;
  surRenderTags();
  surUpdateProjectButtons();
  surRefreshSelect();
}

function surOpenNewProjectModal() {
  document.getElementById('sur-new-name').value = '';
  document.getElementById('sur-new-overlay').classList.add('show');
  setTimeout(() => document.getElementById('sur-new-name').focus(), 50);
}
function surCloseNewProjectModal() {
  document.getElementById('sur-new-overlay').classList.remove('show');
}
async function surCreateProjectFromModal() {
  const name = document.getElementById('sur-new-name').value.trim();
  if (!name) { document.getElementById('sur-new-name').focus(); return; }
  const proj = {
    id: 'sur_' + Date.now().toString(),
    name,
    text: document.getElementById('sur-textInput').value || '',
    tags: surTags.slice(),
    updatedAt: Date.now()
  };
  surDb.projects.push(proj);
  surCurrentProjectId = proj.id;
  surDirty = false;
  surSaveLocal();
  const ok = await surSaveToSupabase(proj);
  surUpdateBackendStatus(ok);
  surCloseNewProjectModal();
  surRefreshSelect();
}

async function surSaveCurrentProject() {
  if (!surCurrentProjectId) return;
  const proj = surDb.projects.find(p => p.id === surCurrentProjectId);
  if (!proj) return;
  proj.text = document.getElementById('sur-textInput').value || '';
  proj.tags = surTags.slice();
  proj.updatedAt = Date.now();
  surSaveLocal();
  const ok = await surSaveToSupabase(proj);
  surUpdateBackendStatus(ok);
  surDirty = false;
  surRefreshSelect();
  // Petit feedback visuel
  const btn = document.getElementById('sur-pb-save');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Sauvegardé';
    setTimeout(() => { btn.textContent = orig; }, 1300);
  }
}

function surOpenRenameProjectModal() {
  if (!surCurrentProjectId) return;
  const proj = surDb.projects.find(p => p.id === surCurrentProjectId);
  if (!proj) return;
  document.getElementById('sur-rename-name').value = proj.name;
  document.getElementById('sur-rename-overlay').classList.add('show');
  setTimeout(() => { const el=document.getElementById('sur-rename-name'); el.focus(); el.select(); }, 50);
}
function surCloseRenameProjectModal() {
  document.getElementById('sur-rename-overlay').classList.remove('show');
}
async function surRenameProjectFromModal() {
  const name = document.getElementById('sur-rename-name').value.trim();
  if (!name) { document.getElementById('sur-rename-name').focus(); return; }
  const proj = surDb.projects.find(p => p.id === surCurrentProjectId);
  if (!proj) return;
  proj.name = name;
  proj.updatedAt = Date.now();
  surSaveLocal();
  await surSaveToSupabase(proj);
  surCloseRenameProjectModal();
  surRefreshSelect();
}

async function surDeleteCurrentProject() {
  if (!surCurrentProjectId) return;
  const proj = surDb.projects.find(p => p.id === surCurrentProjectId);
  if (!proj) return;
  if (!confirm(`Supprimer le projet "${proj.name}" ? Cette action est irréversible.`)) return;
  surDb.projects = surDb.projects.filter(p => p.id !== surCurrentProjectId);
  await surDeleteFromSupabase(surCurrentProjectId);
  surCurrentProjectId = null;
  surDirty = false;
  surSaveLocal();
  surRefreshSelect();
  surUpdateProjectButtons();
}

// Bouton "Tout effacer" sur les mots-clés
function surClearAllTags() {
  if (!surTags.length) return;
  if (!confirm('Supprimer tous les mots-clés ?')) return;
  surTags = [];
  surRenderTags();
  surMarkDirty();
}

// Raccourcis clavier sur les modales surligneur
(function() {
  const newInput = document.getElementById('sur-new-name');
  if (newInput) newInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') surCreateProjectFromModal();
    if (e.key === 'Escape') surCloseNewProjectModal();
  });
  const renameInput = document.getElementById('sur-rename-name');
  if (renameInput) renameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') surRenameProjectFromModal();
    if (e.key === 'Escape') surCloseRenameProjectModal();
  });
})();

function surRenderTags() {
  const box = document.getElementById('sur-tagBox');
  const input = document.getElementById('sur-tagInput');
  box.querySelectorAll('.sur-tag').forEach(t => t.remove());
  surTags.forEach((word, i) => {
    const c = SUR_PASTELS[i % SUR_PASTELS.length];
    const tag = document.createElement('span');
    tag.className = 'sur-tag';
    tag.style.cssText = `background:${c.bg};color:${c.text};`;
    tag.innerHTML = `${word}<button class="sur-tag-remove" onclick="surRemoveTag('${word}')" title="Supprimer">\u2715</button>`;
    box.insertBefore(tag, input);
  });
  // Activer/désactiver le bouton "Tout effacer"
  const clearBtn = document.getElementById('sur-clear-tags-btn');
  if (clearBtn) clearBtn.disabled = !surTags.length;
  surHighlight();
}

function surAddTag(val) {
  const word = val.trim().toLowerCase();
  if (word && !surTags.includes(word)) { surTags.push(word); surRenderTags(); surMarkDirty(); }
  document.getElementById('sur-tagInput').value = '';
}
function surRemoveTag(word) {
  surTags = surTags.filter(t => t !== word);
  surRenderTags();
  surMarkDirty();
}

document.getElementById('sur-tagInput').addEventListener('keydown', e => {
  const input = e.target;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (input.value.trim()) surAddTag(input.value);
  } else if (e.key === 'Backspace' && input.value === '' && surTags.length) {
    surRemoveTag(surTags[surTags.length - 1]);
  }
});
// Coller une liste de mots séparés par des espaces, virgules ou retours à la ligne
document.getElementById('sur-tagInput').addEventListener('paste', e => {
  e.preventDefault();
  const pasted = (e.clipboardData || window.clipboardData).getData('text');
  // Séparer sur espaces, virgules, points-virgules, retours à la ligne
  const words = pasted.split(/[\s,;]+/).map(w => w.trim()).filter(Boolean);
  if (words.length > 1) {
    words.forEach(w => surAddTag(w));
  } else if (words.length === 1) {
    // Un seul mot : l'insérer dans l'input pour que l'utilisateur valide
    const input = document.getElementById('sur-tagInput');
    input.value = words[0];
  }
});
document.getElementById('sur-tagInput').addEventListener('blur', e => {
  if (e.target.value.trim()) surAddTag(e.target.value);
});

// Debounce timer pour surHighlight (évite de re-calculer à chaque frappe)
let _surHighlightTimer = null;
function surHighlight() {
  clearTimeout(_surHighlightTimer);
  _surHighlightTimer = setTimeout(_surHighlightNow, 120);
}
function _surHighlightNow() {
  const text = document.getElementById('sur-textInput').value;
  const out  = document.getElementById('sur-output');
  const wl   = document.getElementById('sur-wordlist');
  const meta = document.getElementById('sur-total-count');
  const totalWords = document.getElementById('sur-total-words');
  const dlBtn = document.getElementById('sur-dl-btn');

  if (!text.trim() || !surTags.length) {
    out.innerHTML = text.trim()
      ? `<span style="font-family:'DM Sans',sans-serif;font-size:14.5px;line-height:1.9;color:#1a1814;white-space:pre-wrap;">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</span>`
      : '<span class="sur-empty">Le r\u00e9sultat appara\u00eEtra ici.</span>';
    wl.innerHTML = surTags.length
      ? surTags.map((w,i) => surWordRow(w, SUR_PASTELS[i % SUR_PASTELS.length], 0, 0)).join('')
      : '<span class="sur-wordlist-empty">Aucun mot ajout\u00e9.</span>';
    meta.textContent = '';
    if (totalWords) totalWords.textContent = '';
    if (dlBtn) dlBtn.disabled = true;
    return;
  }

  const counts = {};
  const colorMap = {};
  surTags.forEach((w, i) => { counts[w] = 0; colorMap[w] = SUR_PASTELS[i % SUR_PASTELS.length]; });

  // Compile la regex une seule fois (au lieu de deux)
  const WBND_STR = '(?<![\\wÀ-ÿ])(' + surTags.map(surEscReg).join('|') + ')(?![\\wÀ-ÿ])';
  const countRegex = new RegExp(WBND_STR, 'gi');
  let mx;
  while ((mx = countRegex.exec(text)) !== null) {
    const key = mx[1].toLowerCase();
    if (counts[key] !== undefined) counts[key]++;
  }

  // Réutilisation avec reset lastIndex pour le remplacement
  countRegex.lastIndex = 0;
  const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  // On doit recréer car replace() et exec() partagent lastIndex
  const replaceRegex = new RegExp(WBND_STR, 'gi');
  const html = escaped.replace(replaceRegex, (match, g1) => {
    const c = colorMap[g1.toLowerCase()];
    if (!c) return match;
    return `<mark style="background:${c.bg};color:${c.text};">${g1}</mark>`;
  }).replace(/\n/g, '<br>');
  out.innerHTML = html;

  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const maxCount = Math.max(...Object.values(counts), 1);
  const sorted = surTags.slice().sort((a,b) => counts[b] - counts[a]);
  wl.innerHTML = sorted.length
    ? sorted.map(w => surWordRow(w, colorMap[w], counts[w], maxCount)).join('')
    : '<span class="sur-wordlist-empty">Aucun mot ajout\u00e9.</span>';

  meta.textContent = total > 0 ? `${total} occurrence${total > 1 ? 's' : ''}` : '';
  if (totalWords) totalWords.textContent = `${sorted.length} mot${sorted.length > 1 ? 's' : ''}`;
  if (dlBtn) dlBtn.disabled = !(total > 0);
}

function surWordRow(word, c, count, max) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return `<div class="sur-word-row">
    <div class="sur-word-swatch" style="background:${c.bg};outline:1.5px solid ${c.bar};outline-offset:-1px;"></div>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:5px;">
        <span class="sur-word-name">${word}</span>
        <span class="sur-word-count" style="background:${c.bg};color:${c.text};">${count}</span>
      </div>
      ${max > 0 ? `<div class="sur-word-bar-wrap"><div class="sur-word-bar" style="width:${pct}%;background:${c.bar};"></div></div>` : ''}
    </div>
    <button class="sur-word-del" onclick="surRemoveTag('${word}')" title="Supprimer">\u2715</button>
  </div>`;
}

function surDownloadPDF() {
  const text = document.getElementById('sur-textInput').value;
  if (!text.trim() || !surTags.length) return;

  const counts = {};
  surTags.forEach(w => { counts[w] = 0; });
  const colorMap = {};
  surTags.forEach((w,i) => { colorMap[w] = SUR_PASTELS[i % SUR_PASTELS.length]; });
  const WBND = '(?<![\\wÀ-ÿ])(%s)(?![\\wÀ-ÿ])';
  const re2 = new RegExp(WBND.replace('%s', surTags.map(surEscReg).join('|')), 'gi');
  let mx;
  while ((mx = re2.exec(text)) !== null) {
    const key = mx[1].toLowerCase();
    if (counts[key] !== undefined) counts[key]++;
  }
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const maxCount = Math.max(...Object.values(counts), 1);
  const sorted = surTags.slice().sort((a,b) => counts[b] - counts[a]);

  const regex = new RegExp(WBND.replace('%s', surTags.map(surEscReg).join('|')), 'gi');
  const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const bodyHtml = escaped.replace(regex, (match, g1) => {
    const key = g1.toLowerCase();
    const c = colorMap[key];
    if (!c) return match;
    return `<mark style="background:${c.bg};color:${c.text};border-radius:3px;padding:1px 4px;font-weight:500;">${g1}</mark>`;
  }).replace(/\n/g,'<br>');

  const recapRows = sorted.map(w => {
    const c = colorMap[w];
    const pct = Math.round((counts[w] / maxCount) * 100);
    return `<tr>
      <td style="padding:7px 10px;vertical-align:middle;">
        <div style="width:10px;height:10px;border-radius:50%;background:${c.bg};outline:1.5px solid ${c.bar};"></div>
      </td>
      <td style="padding:7px 10px;font-size:13px;color:#1a1814;">${w}</td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:12px;">
        <span style="background:${c.bg};color:${c.text};padding:2px 8px;border-radius:20px;">${counts[w]}</span>
      </td>
      <td style="padding:7px 14px;width:120px;vertical-align:middle;">
        <div style="height:4px;background:#f0ece6;border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${c.bar};border-radius:2px;"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const pdfHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:DM Sans,sans-serif;background:#fff;color:#1a1814;padding:48px 52px;max-width:794px;margin:0 auto;}' +
    'h1{font-family:DM Serif Display,serif;font-size:26px;font-weight:400;color:#2d2926;margin-bottom:4px;}' +
    '.meta{font-family:monospace;font-size:10px;color:#c4bfb8;letter-spacing:.06em;text-transform:uppercase;margin-bottom:36px;}' +
    '.sl{font-family:monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#c4bfb8;margin-bottom:12px;}' +
    '.tb{font-size:14px;line-height:1.85;color:#1a1814;margin-bottom:40px;padding:20px 24px;border:1px solid #e8e4de;border-radius:10px;background:#fafaf8;}' +
    'table{width:100%;border-collapse:collapse;border:1px solid #e8e4de;}' +
    'th{font-family:monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#c4bfb8;padding:8px 10px;border-bottom:1px solid #e8e4de;text-align:left;background:#f9f7f4;}' +
    'td{border-bottom:1px solid #f0ece6;}tr:last-child td{border-bottom:none;}' +
    '@media print{body{padding:20px 24px;}}</style></head><body>' +
    '<h1>Analyse de texte</h1>' +
    `<div class="meta">${total} occurrence${total>1?'s':''} &middot; ${sorted.length} mot${sorted.length>1?'s':''} analys\u00e9${sorted.length>1?'s':''}</div>` +
    '<div class="sl">Texte surligné</div>' +
    `<div class="tb">${bodyHtml}</div>` +
    '<div class="sl">Récapitulatif des occurrences</div>' +
    '<table><thead><tr><th></th><th>Mot</th><th style="text-align:right">Occurrences</th><th>Fréquence relative</th></tr></thead>' +
    `<tbody>${recapRows}</tbody></table>` +
    '</body></html>';

  const win = window.open('', '_blank');
  if (!win) { alert('Autorisez les popups pour télécharger le PDF.'); return; }
  win.document.write(pdfHtml);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

document.getElementById('sur-textInput').addEventListener('input', () => { surHighlight(); surMarkDirty(); });

// ── INIT ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ztypuoyyvwjnsunsoeow.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0eXB1b3l5dndqbnN1bnNvZW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5OTg4OTcsImV4cCI6MjA4OTU3NDg5N30.MxOJOuiIAqCq7dvbTzRS6yhfpT3gDhyl104AvdEcHM8';
try {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  initAuth();
} catch(e) {
  console.error('Supabase init error:', e);
  showLoginView();
}
