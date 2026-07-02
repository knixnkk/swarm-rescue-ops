# Swarm Rescue Ops

เว็บต้นแบบเกม **Swarm Robotics / Swarm Rescue** แบบ 8-bit co-op แยกเป็น Node.js backend และ frontend หลายไฟล์

## Structure

```txt
Robot-Sawrn/
├── server.js              # Express + Socket.io backend, room/game state, QR route
├── package.json           # npm scripts/dependencies
└── public/
    ├── index.html         # Host / projector screen
    ├── client.html        # Mobile controller screen
    ├── styles.css         # 8-bit UI theme
    ├── host.js            # Host Socket.io renderer
    └── client.js          # Mobile controller input logic
```

## Run

```bash
npm install
npm start
```

จากนั้นเปิด Host ที่:

```txt
http://localhost:3000
```

กด `CREATE ROOM` แล้วให้ผู้เล่น 1-3 คนสแกน QR หรือเปิดลิงก์ `/client.html?room=XXXX` บนมือถือที่อยู่ network เดียวกัน

## Workflow

1. Host สร้างห้องและแสดง QR
2. Client มือถือ join ด้วย room code
3. Host กด `START MISSION`
4. มือถือส่ง input ผ่าน Socket.io
5. Backend อัปเดตตำแหน่ง, battery, collision, grab/release, power transfer
6. Host render arena แบบ real-time

## Game Mechanics ที่ใส่แล้ว

- Toxic barrels + safe zone
- สุ่มตำแหน่ง cargo, wall/obstacle และ enemy spawn ทุกครั้งที่สร้างห้องหรือ reset
- Dynamic heavy barrels ตามจำนวนผู้เล่น: 1 คน = 0 ถังใหญ่, 2 คน = 1 ถังใหญ่, 3 คน = 2 ถังใหญ่
- ทุก movement ของหุ่นยนต์เสีย battery
- แบกของเสีย battery เพิ่ม และ Boost เสียหนักขึ้น
- Battery ผู้เล่น online ทุกคนหมดก่อนสำเร็จ = Mission Failed
- ภารกิจสำเร็จ = Mission Complete สีเขียว, ล้มเหลว = Mission Failed สีแดง
- Obstacle collision ทำให้แบตลดเพิ่ม
- Random collision hazard: ระบบสุ่ม obstacle ให้ active เป็นช่วง ๆ ถ้าอยู่ในพื้นที่นั้นจะเสีย energy
- Enemy drones เข้ามาโจมตีระยะประชิดแทนการยิงกระสุน
- ถ้าโดน melee จะเสีย energy = 2 × จำนวนผู้เล่น online ในตอนนั้น
- Collaborative lifting สำหรับถังใหญ่
- Power sharing ระหว่างผู้เล่น
- Event log บนจอ Host
- Mission log snapshot: time, mission status, battery ของผู้เล่น online
- ดู log แบบ JSON ได้ที่ `/logs/ROOMCODE`
