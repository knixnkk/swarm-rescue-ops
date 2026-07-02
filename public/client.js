const params = new URLSearchParams(window.location.search);

let roomCode = (params.get("room") || "").toUpperCase();
let playerId = null;
let playerColor = "#00ff88";
let inputLoop = null;
const inputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  boost: false,
};

const els = {
  playerName: document.getElementById("playerName"),
  roomBadge: document.getElementById("roomBadge"),
  pilotBadge: document.getElementById("pilotBadge"),
  joinPanel: document.getElementById("joinPanel"),
  controllerPanel: document.getElementById("controllerPanel"),
  roomInput: document.getElementById("roomInput"),
  nameInput: document.getElementById("nameInput"),
  joinBtn: document.getElementById("joinBtn"),
  joinError: document.getElementById("joinError"),
  clientResult: document.getElementById("clientResult"),
  batteryText: document.getElementById("batteryText"),
  batteryFill: document.getElementById("batteryFill"),
  cargoText: document.getElementById("cargoText"),
  grabBtn: document.getElementById("grabBtn"),
  transferBtn: document.getElementById("transferBtn"),
};

if (roomCode) {
  els.roomInput.value = roomCode;
  els.roomBadge.textContent = `ROOM ${roomCode}`;
}

els.joinBtn.addEventListener("click", joinRoom);
els.roomInput.addEventListener("input", () => {
  els.roomInput.value = els.roomInput.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
});
els.nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoom();
});
els.roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoom();
});

els.grabBtn.addEventListener("click", () => sendAction("grab"));
els.transferBtn.addEventListener("click", () => sendAction("transfer"));

socket.on("connect", () => {
  els.pilotBadge.textContent = "CONNECTED";
});

socket.on("disconnect", () => {
  els.pilotBadge.textContent = "OFFLINE";
});

socket.on("client:error", (message) => {
  els.joinError.textContent = message;
});

socket.on(
  "client:joined",
  ({ roomCode: joinedRoom, playerId: joinedPlayer, label, color, name }) => {
    roomCode = joinedRoom;
    playerId = joinedPlayer;
    playerColor = color;
    if (els.joinPanel) {
      els.joinPanel.remove();
      els.joinPanel = null;
    }
    els.controllerPanel.hidden = false;
    els.playerName.textContent = `${label} ${name}`;
    els.playerName.style.color = color;
    els.roomBadge.textContent = `ROOM ${roomCode}`;
    els.pilotBadge.textContent = "PILOT ONLINE";
    document.documentElement.style.setProperty("--green", color);
    startInputLoop();
  },
);

socket.on("game_state", (state) => {
  if (!playerId) return;
  const me = state.players.find((player) => player.id === playerId);
  if (!me) return;
  const battery = Math.round(me.battery);
  els.batteryText.textContent = `${battery}%`;
  els.batteryFill.style.width = `${battery}%`;
  els.batteryFill.style.background = battery <= 15 ? "var(--red)" : playerColor;
  els.cargoText.textContent = me.carrying ? me.carrying.toUpperCase() : "EMPTY";
  if (state.status === "lobby") {
    els.pilotBadge.textContent = "WAITING HOST START";
  } else if (state.status === "running") {
    els.pilotBadge.textContent = "MISSION RUNNING";
  }
  renderMissionResult(state.status);
});

function renderMissionResult(status) {
  if (status !== "complete" && status !== "failed") {
    els.clientResult.hidden = true;
    els.clientResult.className = "client-result";
    els.clientResult.textContent = "";
    return;
  }

  clearInput();
  if (inputLoop) {
    window.clearInterval(inputLoop);
    inputLoop = null;
  }
  els.clientResult.hidden = false;
  els.clientResult.textContent =
    status === "complete" ? "MISSION COMPLETE" : "MISSION FAILED";
  els.clientResult.className = `client-result ${status}`;
}

function joinRoom() {
  const code = els.roomInput.value.trim().toUpperCase();
  if (code.length !== 4) {
    els.joinError.textContent = "กรุณาใส่ ROOM CODE 4 ตัวอักษร";
    return;
  }

  els.joinError.textContent = "";
  socket.emit("client:join", {
    roomCode: code,
    name: els.nameInput.value.trim() || "Robot Pilot",
  });
}

function sendInput() {
  if (!roomCode || !playerId || !socket.connected) return;
  socket.emit("client:input", { roomCode, playerId, input: { ...inputState } });
}

function startInputLoop() {
  if (inputLoop) return;
  inputLoop = window.setInterval(sendInput, 50);
}

function sendAction(action) {
  if (!roomCode || !playerId) return;
  socket.emit("client:action", { roomCode, playerId, action });
}

function bindHoldButton(button) {
  const key = button.dataset.key;
  if (!key) return;

  const setActive = (active) => {
    inputState[key] = active;
    button.classList.toggle("active", active);
    sendInput();
  };

  const press = (event) => {
    event.preventDefault();
    if (event.pointerId !== undefined && button.setPointerCapture) {
      try {
        button.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some mobile browsers reject pointer capture during synthetic events.
      }
    }
    setActive(true);
  };

  const release = (event) => {
    if (event) event.preventDefault();
    setActive(false);
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("touchstart", press, { passive: false });
  button.addEventListener("touchend", release, { passive: false });
  button.addEventListener("touchcancel", release, { passive: false });
  button.addEventListener("mousedown", press);
  button.addEventListener("mouseup", release);
}

document.querySelectorAll("[data-key]").forEach(bindHoldButton);

document.addEventListener("keydown", (event) => {
  const key = mapKeyboard(event.key);
  if (!key || inputState[key]) return;
  inputState[key] = true;
  sendInput();
});

document.addEventListener("keyup", (event) => {
  const key = mapKeyboard(event.key);
  if (!key) return;
  inputState[key] = false;
  sendInput();
});

window.addEventListener("blur", clearInput);

function clearInput() {
  Object.keys(inputState).forEach((key) => {
    inputState[key] = false;
  });
  document
    .querySelectorAll("[data-key]")
    .forEach((button) => button.classList.remove("active"));
  sendInput();
}

function mapKeyboard(key) {
  const map = {
    ArrowUp: "up",
    w: "up",
    W: "up",
    ArrowDown: "down",
    s: "down",
    S: "down",
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
    Shift: "boost",
    " ": "boost",
  };
  return map[key];
}
