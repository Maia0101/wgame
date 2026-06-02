const WGAME_CONFIG = {
  supabaseUrl: "https://xqeooqbknzblrxavjljs.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZW9vcWJrbnpibHJ4YXZqbGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NzI2NjYsImV4cCI6MjA4NTU0ODY2Nn0.WV6uob6xa1NGQTffkGrBgAXvlTQTLl_VWoOG-pAavys",
};

const PLAYERS = ["Ana", "Brandon", "Daniel"];

const PLAYER_TEAMS = {
  Ana: { team: "Real Madrid", logo: "assets/teams/ana.png" },
  Brandon: { team: "Barcelona", logo: "assets/teams/brandon.png" },
  Daniel: { team: "Flamengo", logo: "assets/teams/daniel.png" },
};

const PLAYER_ITEMS = {
  Ana: [
    "Someone talks about Brandon and Ana having a baby",
    "Aunt Elma asks Uncle Dale for permission for something",
    "Aunt Elma gives Emily something from her house",
    "Someone suggests a suitor for Grandma",
    "Grandma makes a disgusted face when offered unhealthy food",
    "Half of the people go for a walk with Vózinha",
    "Juliana scolds Eudes",
    "Pastor Edma asks for a time of worship",
  ],
  Brandon: [
    "Someone talks about how Emily and Brandon were kids and are now married",
    "Isabella gets jealous of Samuel and says something about it",
    "Isabella makes a video about the birthday or another event",
    "Uncle Dale gets a headache and leaves",
    "Pastor Darren makes a joke about Dale or Eudes being overweight",
    "Pastor Darren talks about the house renovation or spending too much money",
    "Pastor Darren gets rejected by Pastor Edma when trying to show physical affection",
    "Someone tells a story about the White House",
  ],
  Daniel: [
    "Someone mentions Daniel and Emily's honeymoon",
    "Darren fights Daniel",
    "The Calvin Klein story is mentioned",
    "Eudes cries during a speech",
    "A sex joke is made",
    "Trump or immigration comes up in conversation",
    "Pastor Edma prays in tongues",
    "Isabella throws a tantrum because of the noise",
  ],
};

const FREE_SPACE = "FREE SPACE";
const BOARD_SIZE = 9;
const CENTER_INDEX = 4;
const STORAGE_KEY = "the-w-game-v5";
const SYNC_TIMEOUT_MS = 8000;

let supabaseClient = null;
let state = defaultState();
let confettiAnimating = false;
let syncingRemote = false;
let pushQueue = Promise.resolve();
let bingoShownFor = sessionStorage.getItem("wgame-bingo-shown") || "";

const els = {};

function cacheElements() {
  els.playerTabs = document.getElementById("player-tabs");
  els.playerBadge = document.getElementById("player-badge");
  els.progressRow = document.getElementById("progress-row");
  els.syncStatus = document.getElementById("sync-status");
  els.loading = document.getElementById("loading");
  els.boardContainer = document.getElementById("board-container");
  els.resetBtn = document.getElementById("reset-btn");
  els.bingoModal = document.getElementById("bingo-modal");
  els.bingoMessage = document.getElementById("bingo-message");
  els.closeBingoBtn = document.getElementById("close-bingo-btn");
  els.confettiCanvas = document.getElementById("confetti-canvas");
}

function defaultState() {
  return { players: {}, activePlayer: "Ana", gameWinner: null, updatedAt: 0 };
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createBoard(playerName) {
  const shuffled = shuffle([...PLAYER_ITEMS[playerName]]);
  const board = [];
  let itemIdx = 0;

  for (let i = 0; i < BOARD_SIZE; i++) {
    if (i === CENTER_INDEX) {
      board.push(FREE_SPACE);
    } else {
      board.push(shuffled[itemIdx++]);
    }
  }

  return {
    items: board,
    marked: Array(BOARD_SIZE).fill(false).map((_, i) => i === CENTER_INDEX),
    hasWon: false,
    createdAt: Date.now(),
  };
}

function boardUsesPlayerItems(data, playerName) {
  if (!data || !Array.isArray(data.items) || data.items.length !== BOARD_SIZE) return false;

  const allowed = new Set(PLAYER_ITEMS[playerName]);
  const nonFree = data.items.filter((item) => item !== FREE_SPACE);

  if (nonFree.length !== 8) return false;
  if (new Set(nonFree).size !== 8) return false;
  if (data.items[CENTER_INDEX] !== FREE_SPACE) return false;

  return nonFree.every((item) => allowed.has(item));
}

function normalizePlayer(data, playerName) {
  if (!boardUsesPlayerItems(data, playerName)) {
    return createBoard(playerName);
  }
  if (!Array.isArray(data.marked) || data.marked.length !== BOARD_SIZE) {
    data.marked = Array(BOARD_SIZE).fill(false).map((_, i) => i === CENTER_INDEX);
  }
  data.marked[CENTER_INDEX] = true;
  if (typeof data.hasWon !== "boolean") data.hasWon = false;
  return data;
}

function normalizeFullState(raw) {
  const next = defaultState();
  if (raw && typeof raw === "object") {
    next.activePlayer = PLAYERS.includes(raw.activePlayer) ? raw.activePlayer : "Ana";
    next.gameWinner = raw.gameWinner || null;
    next.updatedAt = raw.updatedAt || 0;
    if (raw.players && typeof raw.players === "object") {
      next.players = raw.players;
    }
  }
  PLAYERS.forEach((name) => {
    next.players[name] = normalizePlayer(next.players[name], name);
  });
  return next;
}

function ensureAllPlayers() {
  PLAYERS.forEach((name) => {
    state.players[name] = normalizePlayer(state.players[name], name);
  });
  if (!PLAYERS.includes(state.activePlayer)) {
    state.activePlayer = "Ana";
  }
}

function getActivePlayerName() {
  return PLAYERS.includes(state.activePlayer) ? state.activePlayer : "Ana";
}

function markedCount(playerName) {
  const player = state.players[playerName];
  if (!player) return 0;
  return player.marked.filter(Boolean).length;
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setSyncStatus(text, online) {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = text;
  els.syncStatus.className = "sync-pill" + (online ? " online" : online === false ? " offline" : "");
}

function queuePush() {
  state.updatedAt = Date.now();
  saveLocal();
  if (!supabaseClient) return;

  pushQueue = pushQueue.then(pushRemote).catch(() => {
    setSyncStatus("Offline — saved on this phone", false);
  });
}

async function pushRemote() {
  if (syncingRemote || !supabaseClient) return;

  setSyncStatus("Saving…", true);
  const { error } = await supabaseClient.from("wgame_state").upsert({
    id: 1,
    state,
    updated_at: new Date(state.updatedAt).toISOString(),
  });

  if (error) {
    setSyncStatus("Offline — saved on this phone", false);
    throw error;
  }

  setSyncStatus("Live — everyone sees updates", true);
}

function applyRemoteState(row, fromRealtime = false) {
  if (!row || !row.state) return;

  const remoteTime = new Date(row.updated_at).getTime();
  if (remoteTime < (state.updatedAt || 0)) return;

  const previousWinner = state.gameWinner;
  syncingRemote = true;
  state = normalizeFullState(row.state);
  state.updatedAt = remoteTime;
  saveLocal();
  renderUI();
  syncingRemote = false;

  if (state.gameWinner && state.gameWinner !== previousWinner) {
    maybeShowBingo(state.gameWinner, fromRealtime);
  }
}

function maybeShowBingo(winner, fromRemote) {
  if (!winner || bingoShownFor === winner) return;
  bingoShownFor = winner;
  sessionStorage.setItem("wgame-bingo-shown", winner);
  showBingo(winner, fromRemote);
}

function playerLabel(name) {
  const info = PLAYER_TEAMS[name];
  return info ? info.team : name;
}

function renderPlayerTabs() {
  if (!els.playerTabs) return;
  const active = getActivePlayerName();
  els.playerTabs.innerHTML = "";

  PLAYERS.forEach((name) => {
    const info = PLAYER_TEAMS[name];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "player-tab" + (name === active ? " active" : "");
    if (state.players[name]?.hasWon) btn.classList.add("finished");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(name === active));
    btn.setAttribute("aria-label", playerLabel(name));
    btn.innerHTML = `
      <img class="team-logo" src="${info.logo}" alt="${info.team}" width="40" height="40">
      <span class="team-club">${info.team}</span>`;
    btn.addEventListener("click", () => selectPlayer(name));
    els.playerTabs.appendChild(btn);
  });
}

function renderProgressRow() {
  if (!els.progressRow) return;
  els.progressRow.innerHTML = "";

  PLAYERS.forEach((name) => {
    const info = PLAYER_TEAMS[name];
    const count = markedCount(name);
    const pct = Math.round((count / BOARD_SIZE) * 100);
    const chip = document.createElement("div");
    chip.className = "progress-chip" + (name === getActivePlayerName() ? " active" : "");
    if (state.players[name]?.hasWon) chip.classList.add("finished");
    chip.innerHTML = `
      <div class="progress-chip-left">
        <img class="team-logo team-logo--sm" src="${info.logo}" alt="${info.team}" width="28" height="28">
        <strong>${info.team}</strong>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span>${count}/${BOARD_SIZE}</span>`;
    chip.addEventListener("click", () => selectPlayer(name));
    els.progressRow.appendChild(chip);
  });

  if (state.gameWinner) {
    const winner = document.createElement("p");
    winner.className = "game-winner";
    winner.textContent = `🏆 ${playerLabel(state.gameWinner)} finished first`;
    els.progressRow.appendChild(winner);
  }
}

function renderPlayerBadge() {
  if (!els.playerBadge) return;
  const name = getActivePlayerName();
  const info = PLAYER_TEAMS[name];
  els.playerBadge.innerHTML = `
    <img class="team-logo team-logo--md" src="${info.logo}" alt="${info.team}" width="32" height="32">
    <span>${info.team}</span>`;
}

function fitCellText(cell) {
  const textEl = cell.querySelector(".bingo-cell-text");
  if (!textEl) return;

  textEl.style.fontSize = "";
  let size = parseFloat(getComputedStyle(cell).fontSize);
  const minSize = 7;

  while (textEl.scrollHeight > cell.clientHeight - 2 && size > minSize) {
    size -= 0.5;
    textEl.style.fontSize = `${size}px`;
  }
}

function fitAllCellText() {
  els.boardContainer.querySelectorAll(".bingo-cell:not(.free-space)").forEach(fitCellText);
}

function renderBoard() {
  const name = getActivePlayerName();
  const player = state.players[name];
  if (!els.boardContainer || !player) return;

  els.boardContainer.innerHTML = "";

  player.items.forEach((item, index) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "bingo-cell";
    cell.setAttribute("aria-label", item);
    cell.dataset.index = index;

    const text = document.createElement("span");
    text.className = "bingo-cell-text";
    text.textContent = item;
    cell.appendChild(text);

    if (item === FREE_SPACE) {
      cell.classList.add("free-space", "marked");
      cell.setAttribute("aria-pressed", "true");
      cell.disabled = true;
    } else {
      if (player.marked[index]) cell.classList.add("marked");
      cell.setAttribute("aria-pressed", String(player.marked[index]));
      cell.addEventListener("click", () => toggleCell(index));
    }

    els.boardContainer.appendChild(cell);
  });

  requestAnimationFrame(fitAllCellText);
}

function renderUI() {
  renderPlayerTabs();
  renderProgressRow();
  renderPlayerBadge();
  renderBoard();
}

function selectPlayer(name) {
  if (!PLAYERS.includes(name)) return;
  state.activePlayer = name;
  queuePush();
  renderUI();
}

function toggleCell(index) {
  const name = getActivePlayerName();
  const player = state.players[name];
  if (player.hasWon) return;

  player.marked[index] = !player.marked[index];
  renderBoard();
  queuePush();

  if (checkBoardComplete(player.marked) && !player.hasWon) {
    player.hasWon = true;

    if (!state.gameWinner) {
      state.gameWinner = name;
      queuePush();
      maybeShowBingo(name, false);
    } else {
      queuePush();
    }

    renderProgressRow();
    renderPlayerTabs();
  }
}

function checkBoardComplete(marked) {
  return marked.length === BOARD_SIZE && marked.every(Boolean);
}

function showBingo(playerName, fromRemote) {
  const prefix = fromRemote ? "Everyone saw it — " : "";
  els.bingoMessage.textContent = `${prefix}${playerLabel(playerName)} finished first — BINGO! 🎉`;
  els.bingoModal.classList.remove("hidden");
  startConfetti();
}

function hideBingo() {
  els.bingoModal.classList.add("hidden");
  stopConfetti();
}

function resetMyCard() {
  const name = getActivePlayerName();
  if (!confirm(`Reset ${playerLabel(name)}'s card for everyone? All marked squares will clear.`)) return;

  if (state.gameWinner === name) {
    state.gameWinner = null;
    bingoShownFor = "";
    sessionStorage.removeItem("wgame-bingo-shown");
  }

  state.players[name] = createBoard(name);
  queuePush();
  renderUI();
}

async function loadCloudState() {
  const { data, error } = await supabaseClient
    .from("wgame_state")
    .select("state, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function seedCloudState() {
  ensureAllPlayers();
  state.updatedAt = Date.now();
  saveLocal();
  await pushRemote();
}

function subscribeRealtime() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("wgame-state")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "wgame_state", filter: "id=eq.1" },
      (payload) => {
        const row = payload.new;
        if (row) applyRemoteState(row, true);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSyncStatus("Live — everyone sees updates", true);
      }
    });
}

function initSupabase() {
  if (!window.supabase?.createClient) {
    return null;
  }
  return window.supabase.createClient(
    WGAME_CONFIG.supabaseUrl,
    WGAME_CONFIG.supabaseKey
  );
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function bootstrapLocal() {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) state = normalizeFullState(JSON.parse(local));
  } catch (_) {}

  ensureAllPlayers();
  saveLocal();
  if (els.loading) els.loading.classList.add("hidden");
  renderUI();
}

async function connectCloud() {
  supabaseClient = initSupabase();
  if (!supabaseClient) {
    setSyncStatus("Offline — using this phone only", false);
    return;
  }

  setSyncStatus("Connecting…", true);

  try {
    const cloud = await withTimeout(loadCloudState(), SYNC_TIMEOUT_MS);

    if (cloud) {
      applyRemoteState(cloud, false);
    } else {
      await withTimeout(seedCloudState(), SYNC_TIMEOUT_MS);
    }

    subscribeRealtime();
    setSyncStatus("Live — everyone sees updates", true);

    if (state.gameWinner) {
      maybeShowBingo(state.gameWinner, false);
    }
  } catch (_) {
    ensureAllPlayers();
    setSyncStatus("Offline — using this phone only", false);
    renderUI();
  }
}

// Confetti
let confettiCtx = null;
let confettiPieces = [];
let confettiFrame = null;

function getConfettiCtx() {
  if (!confettiCtx && els.confettiCanvas) {
    confettiCtx = els.confettiCanvas.getContext("2d");
  }
  return confettiCtx;
}

function resizeConfettiCanvas() {
  els.confettiCanvas.width = window.innerWidth;
  els.confettiCanvas.height = window.innerHeight;
}

function createConfettiPiece() {
  const colors = ["#6B4EAA", "#F5C842", "#FF6B9D", "#4ECB71", "#9B7FD4", "#FF8C42"];
  return {
    x: Math.random() * els.confettiCanvas.width,
    y: -20,
    w: Math.random() * 10 + 6,
    h: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 10,
    speedY: Math.random() * 3 + 2,
    speedX: (Math.random() - 0.5) * 3,
    opacity: 1,
  };
}

function startConfetti() {
  resizeConfettiCanvas();
  confettiAnimating = true;
  confettiPieces = Array.from({ length: 150 }, createConfettiPiece);
  animateConfetti();
}

function stopConfetti() {
  confettiAnimating = false;
  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  const ctx = getConfettiCtx();
  if (ctx && els.confettiCanvas) {
    ctx.clearRect(0, 0, els.confettiCanvas.width, els.confettiCanvas.height);
  }
  confettiPieces = [];
}

function animateConfetti() {
  if (!confettiAnimating) return;
  const ctx = getConfettiCtx();
  if (!ctx || !els.confettiCanvas) return;

  ctx.clearRect(0, 0, els.confettiCanvas.width, els.confettiCanvas.height);

  confettiPieces.forEach((p) => {
    p.y += p.speedY;
    p.x += p.speedX;
    p.rotation += p.rotationSpeed;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  });

  confettiPieces = confettiPieces.filter((p) => p.y < els.confettiCanvas.height + 20);

  while (confettiPieces.length < 150 && confettiAnimating) {
    confettiPieces.push(createConfettiPiece());
  }

  confettiFrame = requestAnimationFrame(animateConfetti);
}

function bindEvents() {
  els.resetBtn?.addEventListener("click", resetMyCard);
  els.closeBingoBtn?.addEventListener("click", hideBingo);
  els.bingoModal?.querySelector(".modal-backdrop")?.addEventListener("click", hideBingo);
  window.addEventListener("resize", () => {
    if (confettiAnimating) resizeConfettiCanvas();
    fitAllCellText();
  });
}

function startApp() {
  try {
    cacheElements();
    bindEvents();
    bootstrapLocal();
    connectCloud();
  } catch (error) {
    ensureAllPlayers();
    showStartupError("Something went wrong loading the game. Please refresh the page.");
    console.error(error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
