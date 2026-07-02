const express = require("express");
const http = require("http");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const TICK_RATE = 30;
const PLAYER_LIMIT = 3;
const ENERGY_MOVE_DRAIN = 0.3;
const ENERGY_CARGO_DRAIN = 0.5;
const ENERGY_BOOST_DRAIN = 5;
const ENEMY_SPEED = 75;
const ENEMY_SIZE = 32;
const ENEMY_DETECT_RANGE = 560;
const ENEMY_ATTACK_RANGE = 30;
const ENEMY_ATTACK_COOLDOWN = 1.15;
const ENEMY_DAMAGE_PER_PLAYER = 2;
const RANDOM_COLLISION_INTERVAL = 4.2;
const RANDOM_COLLISION_DURATION = 1.4;
const RANDOM_COLLISION_DAMAGE_PER_SECOND = 9;

const PLAYER_TEMPLATES = [
  {
    id: "p1",
    label: "R1",
    name: "Robot Alpha",
    color: "#e09cff",
    x: 110,
    y: 120,
  },
  {
    id: "p2",
    label: "R2",
    name: "Robot Beta",
    color: "#00ccff",
    x: 170,
    y: 120,
  },
  {
    id: "p3",
    label: "R3",
    name: "Robot Gamma",
    color: "#00ff88",
    x: 140,
    y: 180,
  },
];

const BASE_BARREL_TEMPLATES = [
  {
    id: "b1",
    type: "small",
    weight: 1,
    points: 10,
    x: 360,
    y: 120,
    delivered: false,
  },
  {
    id: "b2",
    type: "small",
    weight: 1,
    points: 10,
    x: 520,
    y: 270,
    delivered: false,
  },
  {
    id: "b3",
    type: "medium",
    weight: 3,
    points: 25,
    x: 430,
    y: 360,
    delivered: false,
  },
  {
    id: "b4",
    type: "small",
    weight: 1,
    points: 10,
    x: 290,
    y: 280,
    delivered: false,
  },
  {
    id: "b5",
    type: "small",
    weight: 1,
    points: 10,
    x: 610,
    y: 120,
    delivered: false,
  },
];

const LARGE_BARREL_TEMPLATES = [
  {
    id: "l1",
    type: "large",
    weight: 8,
    points: 60,
    x: 640,
    y: 160,
    delivered: false,
    requiresTeam: true,
  },
  {
    id: "l2",
    type: "large",
    weight: 8,
    points: 60,
    x: 720,
    y: 260,
    delivered: false,
    requiresTeam: true,
  },
];

const OBSTACLE_TEMPLATES = [
  { id: "o1", kind: "ENERGY WALL", w: 130, h: 36 },
  { id: "o2", kind: "LAVA PIT", w: 150, h: 40 },
  { id: "o3", kind: "RADIATION GATE", w: 45, h: 160 },
];

const ENEMY_TEMPLATES = [
  {
    id: "e1",
    label: "D1",
    x: 815,
    y: 105,
    spawnX: 815,
    spawnY: 105,
    cooldown: 0,
  },
  {
    id: "e2",
    label: "D2",
    x: 805,
    y: 365,
    spawnX: 805,
    spawnY: 365,
    cooldown: 0.45,
  },
];

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName of Object.keys(interfaces)) {
    for (const net of interfaces[interfaceName] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/qr", async (req, res) => {
  const data = String(req.query.data || "");
  if (!data) {
    res.status(400).send("Missing data query");
    return;
  }

  try {
    const png = await QRCode.toBuffer(data, {
      type: "png",
      width: 260,
      margin: 1,
      color: {
        dark: "#00ff88",
        light: "#0a0a12",
      },
    });
    res.type("png").send(png);
  } catch (error) {
    res.status(500).send("QR generation failed");
  }
});

const rooms = new Map();

app.get("/logs/:code", (req, res) => {
  const room = rooms.get(String(req.params.code || "").toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ roomCode: room.code, logs: room.missionLog });
});

function createRoomCode() {
  let code = "";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) return createRoomCode();
  return code;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function overlapsAny(box, boxes, padding = 18) {
  return boxes.some((other) =>
    rectsOverlap(
      {
        x: box.x - padding,
        y: box.y - padding,
        w: box.w + padding * 2,
        h: box.h + padding * 2,
      },
      other,
    ),
  );
}

function findFreeBox(width, height, blockedBoxes, options = {}) {
  const minX = options.minX ?? 145;
  const maxX = options.maxX ?? 840 - width;
  const minY = options.minY ?? 35;
  const maxY = options.maxY ?? 430 - height;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const box = {
      x: Math.round(randomBetween(minX, maxX)),
      y: Math.round(randomBetween(minY, maxY)),
      w: width,
      h: height,
    };
    if (!overlapsAny(box, blockedBoxes, options.padding ?? 18)) return box;
  }

  return {
    x: Math.round(randomBetween(minX, maxX)),
    y: Math.round(randomBetween(minY, maxY)),
    w: width,
    h: height,
  };
}

function makeSpawnBlockers(safeZone) {
  return [
    safeZone,
    ...PLAYER_TEMPLATES.map((player) => ({
      x: player.x - 35,
      y: player.y - 35,
      w: 96,
      h: 96,
    })),
  ];
}

function makeRandomObstacles(safeZone) {
  const blockedBoxes = makeSpawnBlockers(safeZone);
  return OBSTACLE_TEMPLATES.map((template) => {
    const box = findFreeBox(template.w, template.h, blockedBoxes, {
      minX: 190,
      maxX: 790 - template.w,
      minY: 45,
      maxY: 415 - template.h,
      padding: 28,
    });
    blockedBoxes.push(box);
    return { ...template, ...box };
  });
}

function makeRandomBarrels(obstacles, safeZone) {
  const blockedBoxes = [...makeSpawnBlockers(safeZone), ...obstacles];

  return BASE_BARREL_TEMPLATES.map((template) => {
    const large = template.type === "large";
    const box = findFreeBox(large ? 46 : 30, large ? 38 : 30, blockedBoxes, {
      minX: 175,
      maxX: 830,
      minY: 35,
      maxY: 420,
      padding: 32,
    });
    blockedBoxes.push(box);
    return { ...template, x: box.x, y: box.y, delivered: false };
  });
}

function makeRandomEnemies(obstacles, barrels, safeZone) {
  const blockedBoxes = [
    ...makeSpawnBlockers(safeZone),
    ...obstacles,
    ...barrels.map((barrel) => ({
      x: barrel.x,
      y: barrel.y,
      w: barrel.type === "large" ? 46 : 30,
      h: barrel.type === "large" ? 38 : 30,
    })),
  ];

  return ENEMY_TEMPLATES.map((template) => {
    const box = findFreeBox(34, 34, blockedBoxes, {
      minX: 430,
      maxX: 840,
      minY: 35,
      maxY: 420,
      padding: 42,
    });
    blockedBoxes.push(box);
    return {
      ...template,
      x: box.x,
      y: box.y,
      spawnX: box.x,
      spawnY: box.y,
    };
  });
}

function randomizeLargeBarrel(template, room) {
  const blockedBoxes = [
    room.safeZone,
    ...room.obstacles,
    ...room.barrels.map((barrel) => ({
      x: barrel.x,
      y: barrel.y,
      w: barrel.type === "large" ? 46 : 30,
      h: barrel.type === "large" ? 38 : 30,
    })),
    ...makeSpawnBlockers(room.safeZone),
  ];
  const box = findFreeBox(46, 38, blockedBoxes, {
    minX: 210,
    maxX: 820,
    minY: 45,
    maxY: 410,
    padding: 38,
  });
  return { ...template, x: box.x, y: box.y, delivered: false };
}

function makeRoom(hostSocketId) {
  const safeZone = { x: 18, y: 18, w: 95, h: 424 };
  const obstacles = makeRandomObstacles(safeZone);
  const barrels = makeRandomBarrels(obstacles, safeZone);
  const enemies = makeRandomEnemies(obstacles, barrels, safeZone);
  const players = PLAYER_TEMPLATES.map((template) => ({
    ...template,
    battery: 100,
    carrying: null,
    linked: false,
    connected: false,
    socketId: null,
    input: { up: false, down: false, left: false, right: false, boost: false },
  }));

  return {
    code: createRoomCode(),
    hostSocketId,
    createdAt: Date.now(),
    status: "lobby",
    duration: 120,
    timeLeft: 120,
    target: BASE_BARREL_TEMPLATES.length,
    score: 0,
    collisions: 0,
    safeZone,
    players,
    barrels,
    obstacles,
    enemies,
    hazardPulse: null,
    randomCollisionCooldown: 2.2,
    logAccumulator: 0,
    missionLog: [],
    events: ["HOST ONLINE", "WAITING FOR ROBOT PILOTS"],
  };
}

function normalBarrelCountForPlayers(playerCount) {
  if (playerCount === 1) return 3;
  if (playerCount === 2) return 4;
  if (playerCount >= 3) return 5;
  return 3;
}

function largeBarrelCountForPlayers(playerCount) {
  if (playerCount === 1) return 0;
  if (playerCount === 2) return 1;
  if (playerCount >= 3) return 2;
  return 0;
}

function syncBarrelsForPlayerCount(room) {
  const connectedCount = room.players.filter(
    (player) => player.connected,
  ).length;
  
  const normalCount = normalBarrelCountForPlayers(connectedCount);
  const largeCount = largeBarrelCountForPlayers(connectedCount);
  
  const previousById = new Map(
    room.barrels.map((barrel) => [barrel.id, barrel]),
  );
  
  // Create desired templates: normal barrels + large barrels
  const desiredTemplates = [
    ...BASE_BARREL_TEMPLATES.slice(0, normalCount),
    ...LARGE_BARREL_TEMPLATES.slice(0, largeCount),
  ];

  room.barrels = desiredTemplates.map((template) => {
    const previous = previousById.get(template.id);
    if (previous) return { ...template, ...previous };
    if (template.type === "large") return randomizeLargeBarrel(template, room);
    return { ...template };
  });
  room.target = room.barrels.length;

  const activeBarrelIds = new Set(room.barrels.map((barrel) => barrel.id));
  room.players.forEach((player) => {
    if (player.carrying && !activeBarrelIds.has(player.carrying)) {
      player.carrying = null;
      player.linked = false;
    }
  });

  pushEvent(room, `TEAM SIZE ${connectedCount}: ${normalCount} NORMAL + ${largeCount} LARGE BARRELS`);
}

function getPublicHost(reqHost) {
  const interfaces = os.networkInterfaces();
  const port =
    reqHost && reqHost.includes(":") ? reqHost.split(":").pop() : String(PORT);

  for (const nets of Object.values(interfaces)) {
    for (const net of nets || []) {
      if (net.family === "IPv4" && !net.internal) {
        return `${net.address}:${port}`;
      }
    }
  }

  return reqHost || `localhost:${PORT}`;
}

function publicState(room) {
  return {
    code: room.code,
    status: room.status,
    duration: room.duration,
    timeLeft: Math.max(0, Math.ceil(room.timeLeft)),
    target: room.target,
    score: room.score,
    collisions: room.collisions,
    safeZone: room.safeZone,
    players: room.players.map(({ input, socketId, ...player }) => player),
    barrels: room.barrels,
    obstacles: room.obstacles,
    enemies: room.enemies,
    hazardPulse: room.hazardPulse,
    missionLog: room.missionLog.slice(-10),
    events: room.events.slice(-8),
  };
}

function pushEvent(room, message) {
  room.events.push(message);
  if (room.events.length > 20) room.events.shift();
}

function emitRoom(room) {
  io.to(`room:${room.code}`).emit("game_state", publicState(room));
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId) return room;
    if (room.players.some((player) => player.socketId === socketId))
      return room;
  }
  return null;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getOnlinePlayers(room) {
  return room.players.filter((player) => player.connected);
}

function canEnemyOccupy(room, x, y) {
  const enemyBox = { x, y, w: ENEMY_SIZE, h: ENEMY_SIZE };
  if (x < 0 || y < 0 || x + ENEMY_SIZE > 900 || y + ENEMY_SIZE > 480) {
    return false;
  }
  return !room.obstacles.some((obstacle) => rectsOverlap(enemyBox, obstacle));
}

function moveEnemyTowards(room, enemy, targetX, targetY, speed, dt) {
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  const mag = Math.hypot(dx, dy) || 1;
  const step = Math.min(speed * dt, mag);
  const nextX = enemy.x + (dx / mag) * step;
  const nextY = enemy.y + (dy / mag) * step;

  if (canEnemyOccupy(room, nextX, nextY)) {
    enemy.x = nextX;
    enemy.y = nextY;
    return;
  }

  const canSlideX = canEnemyOccupy(room, nextX, enemy.y);
  const canSlideY = canEnemyOccupy(room, enemy.x, nextY);

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (canSlideX) enemy.x = nextX;
    else if (canSlideY) enemy.y = nextY;
  } else {
    if (canSlideY) enemy.y = nextY;
    else if (canSlideX) enemy.x = nextX;
  }
}

function updateEnemies(room, dt) {
  const onlinePlayers = getOnlinePlayers(room).filter(
    (player) => player.battery > 0,
  );
  const onlineCount = onlinePlayers.length;
  if (!onlineCount) return;

  room.enemies.forEach((enemy) => {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    const target = onlinePlayers
      .filter((player) => distance(enemy, player) <= ENEMY_DETECT_RANGE)
      .sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];

    if (!target) {
      moveEnemyTowards(
        room,
        enemy,
        enemy.spawnX,
        enemy.spawnY,
        ENEMY_SPEED * 0.55,
        dt,
      );
      return;
    }

    moveEnemyTowards(
      room,
      enemy,
      target.x + 13,
      target.y + 13,
      ENEMY_SPEED,
      dt,
    );

    if (distance(enemy, target) <= ENEMY_ATTACK_RANGE && enemy.cooldown <= 0) {
      const damage = ENEMY_DAMAGE_PER_PLAYER * onlineCount;
      target.battery = Math.max(0, target.battery - damage);
      enemy.cooldown = ENEMY_ATTACK_COOLDOWN;
      pushEvent(room, `${target.label} MELEE HIT -${damage}% ENERGY`);
    }
  });
}

function updateRandomObstacleCollision(room, dt) {
  if (room.hazardPulse) {
    room.hazardPulse.ttl -= dt;
    const pulseBox = room.hazardPulse;
    room.players.forEach((player) => {
      if (!player.connected) return;
      if (rectsOverlap({ x: player.x, y: player.y, w: 26, h: 26 }, pulseBox)) {
        player.battery = Math.max(
          0,
          player.battery - RANDOM_COLLISION_DAMAGE_PER_SECOND * dt,
        );
      }
    });
    if (room.hazardPulse.ttl <= 0) room.hazardPulse = null;
    return;
  }

  room.randomCollisionCooldown -= dt;
  if (room.randomCollisionCooldown > 0) return;

  const obstacle =
    room.obstacles[Math.floor(Math.random() * room.obstacles.length)];
  room.hazardPulse = {
    obstacleId: obstacle.id,
    x: obstacle.x - 10,
    y: obstacle.y - 10,
    w: obstacle.w + 20,
    h: obstacle.h + 20,
    ttl: RANDOM_COLLISION_DURATION,
  };
  room.randomCollisionCooldown =
    RANDOM_COLLISION_INTERVAL + Math.random() * 2.2;
  pushEvent(room, `RANDOM COLLISION: ${obstacle.kind}`);
}

function recordMissionLog(room, dt = 0, force = false) {
  room.logAccumulator += force ? 1 : dt;
  if (!force && room.logAccumulator < 1) return;
  room.logAccumulator = 0;

  const entry = {
    at: new Date().toISOString(),
    timeLeft: Math.max(0, Math.ceil(room.timeLeft)),
    missionStatus: room.status,
    players: room.players
      .filter((player) => player.connected)
      .map((player) => ({
        id: player.id,
        label: player.label,
        battery: Math.round(player.battery),
        carrying: player.carrying,
        linked: player.linked,
      })),
  };
  room.missionLog.push(entry);
  if (room.missionLog.length > 240) room.missionLog.shift();
}

function finishMission(room, status, message) {
  if (room.status === "complete" || room.status === "failed") return;
  room.status = status;
  recordMissionLog(room, 0, true);
  const batteries = getOnlinePlayers(room)
    .map((player) => `${player.label} ${Math.round(player.battery)}%`)
    .join(" | ");
  pushEvent(room, `${message} | ${batteries}`);
}

function updateRoom(room, dt) {
  if (room.status !== "running") return;

  room.timeLeft = Math.max(0, room.timeLeft - dt);
  recordMissionLog(room, dt);
  if (room.timeLeft <= 0) {
    finishMission(
      room,
      room.score >= room.target ? "complete" : "failed",
      room.score >= room.target
        ? "MISSION COMPLETE"
        : "MISSION FAILED: TIMEOUT",
    );
    emitRoom(room);
    return;
  }

  for (const player of room.players) {
    if (!player.connected) continue;

    const input = player.input;
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    const moving = dx !== 0 || dy !== 0;
    const mag = Math.hypot(dx, dy) || 1;
    const isBoosting = moving && input.boost && player.battery > 5;
    const cargoDrag = player.carrying ? 0.62 : 1;
    const lowBatteryDrag =
      player.battery <= 0 ? 0 : player.battery <= 5 ? 0.35 : 1;
    const speed = 128 * (isBoosting ? 1.75 : 1) * cargoDrag * lowBatteryDrag;
    const next = {
      x: Math.max(0, Math.min(860, player.x + (dx / mag) * speed * dt)),
      y: Math.max(0, Math.min(440, player.y + (dy / mag) * speed * dt)),
      w: 26,
      h: 26,
    };

    const hitObstacle = room.obstacles.some((obstacle) =>
      rectsOverlap(next, obstacle),
    );
    if (hitObstacle) {
      player.battery = Math.max(0, player.battery - 12 * dt);
      room.collisions += dt * 0.4;
    } else {
      player.x = next.x;
      player.y = next.y;
    }

    if (moving) {
      const movementDrain =
        ENERGY_MOVE_DRAIN +
        (player.carrying ? ENERGY_CARGO_DRAIN : 0) +
        (isBoosting ? ENERGY_BOOST_DRAIN : 0);
      player.battery = Math.max(0, player.battery - movementDrain * dt);
    }

    if (player.carrying) {
      const barrel = room.barrels.find((item) => item.id === player.carrying);
      if (barrel && !barrel.delivered) {
        barrel.x = player.x + 14;
        barrel.y = player.y + 18;
      }
    }
  }

  updateEnemies(room, dt);
  updateRandomObstacleCollision(room, dt);

  for (const barrel of room.barrels) {
    if (barrel.delivered) continue;
    const barrelRect = {
      x: barrel.x,
      y: barrel.y,
      w: barrel.type === "large" ? 46 : 26,
      h: barrel.type === "large" ? 36 : 28,
    };
    if (rectsOverlap(barrelRect, room.safeZone)) {
      barrel.delivered = true;
      room.score += 1;
      room.players.forEach((player) => {
        if (player.carrying === barrel.id) player.carrying = null;
      });
      pushEvent(room, `TOXIC BARREL SECURED +${barrel.points}`);
    }
  }

  const onlinePlayers = getOnlinePlayers(room);
  if (room.score >= room.target) {
    finishMission(room, "complete", "MISSION COMPLETE");
  } else if (
    onlinePlayers.length > 0 &&
    onlinePlayers.every((player) => player.battery <= 0)
  ) {
    finishMission(room, "failed", "MISSION FAILED: ALL BATTERIES EMPTY");
  }
}

function tryGrab(room, player) {
  if (player.carrying) {
    pushEvent(room, `${player.label} RELEASED CARGO`);
    player.carrying = null;
    return;
  }

  const nearby = room.barrels
    .filter((barrel) => !barrel.delivered)
    .sort((a, b) => distance(player, a) - distance(player, b))[0];

  if (!nearby || distance(player, nearby) > 58) {
    pushEvent(room, `${player.label} GRAB FAILED: TOO FAR`);
    return;
  }

  if (nearby.requiresTeam) {
    const helper = room.players.find(
      (other) =>
        other.id !== player.id &&
        other.connected &&
        distance(other, nearby) <= 64,
    );
    if (!helper) {
      pushEvent(room, `${player.label} NEEDS TEAM LIFT FOR LARGE BARREL`);
      return;
    }
    player.linked = true;
    helper.linked = true;
    helper.carrying = nearby.id;
    pushEvent(room, "COLLABORATIVE LIFT LINKED");
  }

  player.carrying = nearby.id;
  pushEvent(
    room,
    `${player.label} GRABBED ${nearby.type.toUpperCase()} BARREL`,
  );
}

function transferPower(room, player) {
  const target = room.players
    .filter((other) => other.id !== player.id && other.connected)
    .sort((a, b) => distance(player, a) - distance(player, b))[0];

  if (!target || distance(player, target) > 54) {
    pushEvent(room, `${player.label} TRANSFER FAILED: NO TEAMMATE NEARBY`);
    return;
  }

  const amount = Math.min(20, Math.max(0, player.battery - 10));
  if (amount <= 0) {
    pushEvent(room, `${player.label} TRANSFER FAILED: LOW BATTERY`);
    return;
  }

  player.battery -= amount;
  target.battery = Math.min(100, target.battery + amount);
  pushEvent(
    room,
    `${player.label} SHARED ${Math.round(amount)}% POWER TO ${target.label}`,
  );
}

io.on("connection", (socket) => {
  socket.on("host:create_room", ({ host } = {}) => {
    const existing = findRoomBySocket(socket.id);
    if (existing) rooms.delete(existing.code);

    const room = makeRoom(socket.id);
    rooms.set(room.code, room);
    socket.join(`room:${room.code}`);

    const publicHost = getPublicHost(host);
    const joinUrl = `http://${publicHost}/client.html?room=${room.code}`;
    socket.emit("host:room_created", {
      code: room.code,
      joinUrl,
      qrUrl: `/qr?data=${encodeURIComponent(joinUrl)}`,
    });
    emitRoom(room);
  });

  socket.on("host:start", ({ roomCode } = {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;
    syncBarrelsForPlayerCount(room);
    room.status = "running";
    room.timeLeft = room.duration;
    pushEvent(room, "MISSION STARTED");
    emitRoom(room);
  });

  socket.on("host:reset", ({ roomCode } = {}) => {
    const oldRoom = rooms.get(String(roomCode || "").toUpperCase());
    if (!oldRoom || oldRoom.hostSocketId !== socket.id) return;

    const newRoom = makeRoom(socket.id);
    newRoom.code = oldRoom.code;
    newRoom.players = newRoom.players.map((freshPlayer, index) => {
      const previousPlayer = oldRoom.players[index];
      return {
        ...freshPlayer,
        connected: previousPlayer.connected,
        socketId: previousPlayer.socketId,
        name: previousPlayer.name,
      };
    });

    syncBarrelsForPlayerCount(newRoom);
    rooms.set(newRoom.code, newRoom);
    socket.join(`room:${newRoom.code}`);
    pushEvent(newRoom, "ROOM RESET");
    emitRoom(newRoom);
  });

  socket.on("client:join", ({ roomCode, name } = {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    if (!room) {
      socket.emit("client:error", "ไม่พบห้องนี้ ลองสแกน QR ใหม่อีกครั้ง");
      return;
    }

    const slot = room.players.find((player) => !player.connected);
    if (!slot) {
      socket.emit(
        "client:error",
        `ห้องเต็มแล้ว รองรับ ${PLAYER_LIMIT} ผู้เล่น`,
      );
      return;
    }

    slot.connected = true;
    slot.socketId = socket.id;
    if (name) slot.name = String(name).slice(0, 18);
    socket.join(`room:${room.code}`);
    socket.emit("client:joined", {
      roomCode: room.code,
      playerId: slot.id,
      label: slot.label,
      color: slot.color,
      name: slot.name,
    });
    pushEvent(room, `${slot.label} PILOT CONNECTED`);
    syncBarrelsForPlayerCount(room);
    if (room.status === "lobby") {
      pushEvent(room, "WAITING FOR HOST START");
    }
    emitRoom(room);
  });

  socket.on("client:input", ({ roomCode, playerId, input } = {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    if (!room) return;
    const player = room.players.find(
      (item) => item.id === playerId && item.socketId === socket.id,
    );
    if (!player) return;
    player.input = { ...player.input, ...input };
  });

  socket.on("client:action", ({ roomCode, playerId, action } = {}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    if (!room) return;
    const player = room.players.find(
      (item) => item.id === playerId && item.socketId === socket.id,
    );
    if (!player) return;
    if (room.status !== "running") return;

    if (action === "grab") tryGrab(room, player);
    if (action === "transfer") transferPower(room, player);
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    if (room.hostSocketId === socket.id) {
      io.to(`room:${room.code}`).emit("room:closed", "Host disconnected");
      rooms.delete(room.code);
      return;
    }

    const player = room.players.find((item) => item.socketId === socket.id);
    if (player) {
      player.connected = false;
      player.socketId = null;
      player.input = {
        up: false,
        down: false,
        left: false,
        right: false,
        boost: false,
      };
      pushEvent(room, `${player.label} PILOT DISCONNECTED`);
      syncBarrelsForPlayerCount(room);
      emitRoom(room);
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    updateRoom(room, 1 / TICK_RATE);
    emitRoom(room);
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  const currentIp = getLocalIp();
  const networkUrl = `http://${currentIp}:${PORT}`;
  console.log(`Swarm Rescue Ops running at http://localhost:${PORT}`);
  console.log(`\n=================================================`);
  console.log(`🚀 Swarm Rescue Ops is running on your network!`);
  console.log(`-------------------------------------------------`);
  console.log(`  🌐 Network Link (Use this):  ${networkUrl}`);
  console.log(`  📱 Client Joining Route:    ${networkUrl}/client.html`);
  console.log(`=================================================\n`);
});
