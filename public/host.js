const socket = io();

let currentRoomCode = null;
let latestState = null;

const els = {
  serverStatus: document.getElementById("serverStatus"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  roomCode: document.getElementById("roomCode"),
  joinUrl: document.getElementById("joinUrl"),
  qrImage: document.getElementById("qrImage"),
  qrPlaceholder: document.getElementById("qrPlaceholder"),
  timeLeft: document.getElementById("timeLeft"),
  score: document.getElementById("score"),
  gameStatus: document.getElementById("gameStatus"),
  collisions: document.getElementById("collisions"),
  arena: document.getElementById("arena"),
  safeZone: document.getElementById("safeZone"),
  missionResult: document.getElementById("missionResult"),
  obstacleLayer: document.getElementById("obstacleLayer"),
  enemyLayer: document.getElementById("enemyLayer"),
  barrelLayer: document.getElementById("barrelLayer"),
  playerLayer: document.getElementById("playerLayer"),
  playerCards: document.getElementById("playerCards"),
  eventLog: document.getElementById("eventLog"),
  hostLayout: document.querySelector(".host-layout"),
};

socket.on("connect", () => {
  els.serverStatus.textContent = "SERVER: ONLINE";
  els.serverStatus.classList.add("online");
});

socket.on("disconnect", () => {
  els.serverStatus.textContent = "SERVER: OFFLINE";
  els.serverStatus.classList.remove("online");
});

els.createRoomBtn.addEventListener("click", () => {
  socket.emit("host:create_room", { host: window.location.host });
});

els.startBtn.addEventListener("click", () => {
  if (!currentRoomCode) return;
  socket.emit("host:start", { roomCode: currentRoomCode });
});

els.resetBtn.addEventListener("click", () => {
  if (!currentRoomCode) return;
  socket.emit("host:reset", { roomCode: currentRoomCode });
});

socket.on("host:room_created", ({ code, joinUrl, qrUrl }) => {
  currentRoomCode = code;
  els.roomCode.textContent = code;
  els.joinUrl.textContent = joinUrl;
  els.qrImage.src = qrUrl;
  els.qrImage.hidden = false;
  els.qrPlaceholder.hidden = true;
  els.startBtn.disabled = false;
  els.resetBtn.disabled = false;
});

socket.on("game_state", (state) => {
  latestState = state;
  renderState(state);
});

socket.on("room:closed", () => {
  currentRoomCode = null;
  els.roomCode.textContent = "----";
  els.joinUrl.textContent = "Host disconnected";
});

function renderState(state) {
  renderHud(state);
  renderMissionResult(state);
  renderArena(state);
  renderPlayers(state.players);
  renderLog(state.events, state.missionLog || []);
}

function renderHud(state) {
  els.timeLeft.textContent = formatTime(state.timeLeft);
  els.score.textContent = `${state.score}/${state.target}`;
  els.gameStatus.textContent = statusLabel(state.status);
  els.collisions.textContent = String(Math.floor(state.collisions));
  
  // Toggle fullscreen mode based on game status
  if (state.status === "playing") {
    els.hostLayout.classList.add("fullscreen");
  } else {
    els.hostLayout.classList.remove("fullscreen");
  }
}

function renderArena(state) {
  const sx = els.arena.clientWidth / 900;
  const sy = els.arena.clientHeight / 480;

  setBox(els.safeZone, state.safeZone, sx, sy);

  els.obstacleLayer.innerHTML = state.obstacles
    .map((obstacle) => {
      const box = scaleBox(obstacle, sx, sy);
      const active = state.hazardPulse?.obstacleId === obstacle.id;
      return `<div class="obstacle ${active ? "hazard-active" : ""}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px">${escapeHtml(obstacle.kind)}</div>`;
    })
    .join("");

  els.enemyLayer.innerHTML = (state.enemies || [])
    .map((enemy) => {
      const x = enemy.x * sx;
      const y = enemy.y * sy;
      return `<div class="enemy-drone" style="transform:translate(${x}px, ${y}px)">${escapeHtml(enemy.label)}</div>`;
    })
    .join("");

  els.barrelLayer.innerHTML = state.barrels
    .map((barrel) => {
      const large = barrel.type === "large";
      const x = barrel.x * sx;
      const y = barrel.y * sy;
      return `<div class="barrel ${large ? "large" : ""} ${barrel.delivered ? "delivered" : ""}" style="transform:translate(${x}px, ${y}px)">${large ? "☢☢" : "☢"}</div>`;
    })
    .join("");

  els.playerLayer.innerHTML = state.players
    .filter((player) => player.connected)
    .map((player) => {
      const x = player.x * sx;
      const y = player.y * sy;
      return `<div class="robot-sprite" style="color:${player.color};transform:translate(${x}px, ${y}px)">${player.label}</div>`;
    })
    .join("");
}

function renderPlayers(players) {
  const connectedPlayers = players.filter((player) => player.connected);
  if (!connectedPlayers.length) {
    els.playerCards.innerHTML =
      '<div class="subtitle">WAITING FOR PILOTS...</div>';
    return;
  }

  els.playerCards.innerHTML = connectedPlayers
    .map((player) => {
      const battery = Math.round(player.battery);
      const status = player.connected ? "ONLINE" : "WAITING";
      const cargo = player.carrying ? player.carrying.toUpperCase() : "EMPTY";
      return `
        <article class="player-card" style="border-color:${player.color}">
          <header><span>${escapeHtml(player.label)} ${escapeHtml(player.name)}</span><strong>${status}</strong></header>
          <div class="battery-bar"><span style="width:${battery}%;background:${battery <= 15 ? "var(--red)" : player.color}"></span></div>
          <div class="subtitle">BAT ${battery}% · CARGO ${cargo} · LINK ${player.linked ? "YES" : "NO"}</div>
        </article>
      `;
    })
    .join("");
}

function renderMissionResult(state) {
  if (state.status !== "complete" && state.status !== "failed") {
    els.missionResult.hidden = true;
    els.missionResult.className = "mission-result";
    els.missionResult.textContent = "";
    return;
  }

  els.missionResult.hidden = false;
  els.missionResult.textContent =
    state.status === "complete" ? "MISSION COMPLETE" : "MISSION FAILED";
  els.missionResult.className = `mission-result ${state.status}`;
}

function statusLabel(status) {
  if (status === "complete") return "MISSION COMPLETE";
  if (status === "failed") return "MISSION FAILED";
  return status.toUpperCase();
}

function renderLog(events, missionLog) {
  const logItems = events.map((event) => `▶ ${escapeHtml(event)}`);
  missionLog.slice(-3).forEach((entry) => {
    const playerStatus = entry.players
      .map((player) => `${player.label}:${player.battery}%`)
      .join(" ");
    logItems.push(
      `LOG T-${formatTime(entry.timeLeft)} STATUS:${statusLabel(entry.missionStatus)} ${playerStatus}`,
    );
  });
  els.eventLog.innerHTML = logItems.map((item) => `<li>${item}</li>`).join("");
}

function setBox(element, box, sx, sy) {
  const scaled = scaleBox(box, sx, sy);
  element.style.left = `${scaled.x}px`;
  element.style.top = `${scaled.y}px`;
  element.style.width = `${scaled.w}px`;
  element.style.height = `${scaled.h}px`;
}

function scaleBox(box, sx, sy) {
  return {
    x: box.x * sx,
    y: box.y * sy,
    w: box.w * sx,
    h: box.h * sy,
  };
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("resize", () => {
  if (latestState) renderArena(latestState);
});
