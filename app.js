const PLAYERS = ["Ana", "Brandon", "Daniel"];

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
const CENTER_INDEX = 12;
const STORAGE_KEY = "family-reunion-bingo-v3";

let state = loadState();
let confettiAnimating = false;

const els = {
  playerTabs: document.getElementById("player-tabs"),
  playerBadge: document.getElementById("player-badge"),
  boardContainer: document.getElementById("board-container"),
  resetBtn: document.getElementById("reset-btn"),
  bingoModal: document.getElementById("bingo-modal"),
  bingoMessage: document.getElementById("bingo-message"),
  closeBingoBtn: document.getElementById("close-bingo-btn"),
  confettiCanvas: document.getElementById("confetti-canvas"),
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return { players: {}, activePlayer: "Ana" };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  const items = PLAYER_ITEMS[playerName];
  const pool = items.flatMap((item) => [item, item, item]);
  const board = shuffle(pool);
  board.splice(CENTER_INDEX, 0, FREE_SPACE);
  return {
    items: board,
    marked: Array(25).fill(false).map((_, i) => i === CENTER_INDEX),
    hasWon: false,
    createdAt: Date.now(),
  };
}

function boardUsesPlayerItems(data, playerName) {
  if (!data || !Array.isArray(data.items) || data.items.length !== 25) return false;
  const allowed = new Set(PLAYER_ITEMS[playerName]);
  return data.items
    .filter((item) => item !== FREE_SPACE)
    .every((item) => allowed.has(item));
}

function normalizePlayer(data, playerName) {
  if (!boardUsesPlayerItems(data, playerName)) {
    return createBoard(playerName);
  }
  if (!Array.isArray(data.marked) || data.marked.length !== 25) {
    data.marked = Array(25).fill(false).map((_, i) => i === CENTER_INDEX);
  }
  data.marked[CENTER_INDEX] = true;
  if (typeof data.hasWon !== "boolean") data.hasWon = false;
  return data;
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

function renderPlayerTabs() {
  const active = getActivePlayerName();
  els.playerTabs.innerHTML = "";

  PLAYERS.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "player-tab" + (name === active ? " active" : "");
    btn.textContent = name;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(name === active));
    btn.addEventListener("click", () => selectPlayer(name));
    els.playerTabs.appendChild(btn);
  });
}

function renderPlayerBadge() {
  els.playerBadge.textContent = "8 moments";
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
  renderPlayerBadge();
  renderBoard();
}

function selectPlayer(name) {
  if (!PLAYERS.includes(name)) return;
  state.activePlayer = name;
  saveState();
  renderUI();
}

function toggleCell(index) {
  const name = getActivePlayerName();
  const player = state.players[name];
  if (player.hasWon) return;

  player.marked[index] = !player.marked[index];
  saveState();
  renderBoard();

  if (checkBingo(player.marked) && !player.hasWon) {
    player.hasWon = true;
    saveState();
    showBingo(name);
  }
}

const WIN_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

function checkBingo(marked) {
  return WIN_LINES.some((line) => line.every((i) => marked[i]));
}

function showBingo(playerName) {
  els.bingoMessage.textContent = `${playerName} got a BINGO! 🎉`;
  els.bingoModal.classList.remove("hidden");
  startConfetti();
}

function hideBingo() {
  els.bingoModal.classList.add("hidden");
  stopConfetti();
}

function resetMyCard() {
  const name = getActivePlayerName();
  if (!confirm(`Reset ${name}'s card and clear all marked squares?`)) return;

  state.players[name] = createBoard(name);
  saveState();
  renderBoard();
}

// Confetti
const confettiCtx = els.confettiCanvas.getContext("2d");
let confettiPieces = [];
let confettiFrame = null;

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
  confettiCtx.clearRect(0, 0, els.confettiCanvas.width, els.confettiCanvas.height);
  confettiPieces = [];
}

function animateConfetti() {
  if (!confettiAnimating) return;

  confettiCtx.clearRect(0, 0, els.confettiCanvas.width, els.confettiCanvas.height);

  confettiPieces.forEach((p) => {
    p.y += p.speedY;
    p.x += p.speedX;
    p.rotation += p.rotationSpeed;

    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate((p.rotation * Math.PI) / 180);
    confettiCtx.globalAlpha = p.opacity;
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.restore();
  });

  confettiPieces = confettiPieces.filter((p) => p.y < els.confettiCanvas.height + 20);

  while (confettiPieces.length < 150 && confettiAnimating) {
    confettiPieces.push(createConfettiPiece());
  }

  confettiFrame = requestAnimationFrame(animateConfetti);
}

els.resetBtn.addEventListener("click", resetMyCard);
els.closeBingoBtn.addEventListener("click", hideBingo);
els.bingoModal.querySelector(".modal-backdrop").addEventListener("click", hideBingo);
window.addEventListener("resize", () => {
  if (confettiAnimating) resizeConfettiCanvas();
  fitAllCellText();
});

ensureAllPlayers();
saveState();
renderUI();
