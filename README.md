# ⚡ Takoot - Lightweight Kahoot-like Interactive Quiz Engine

**Takoot** is an ultra-lightweight (<30 MB RAM idle footprint), high-performance, real-time interactive quiz system inspired by Kahoot. Designed specifically for low-resource deployment on VPS servers, classrooms, and events.

---

## ✨ Features

- 📄 **XML Quiz Upload**: Upload custom questions & answers via XML files (sample template included).
- 🎲 **Game PIN & QR Code**: Generates a 6-digit Game PIN and auto-generates a join QR code for instant mobile access.
- ⏱️ **Real-Time Timed Questions**: Customizable timer countdown per question (e.g. 15s, 20s, 30s).
- 📱 **Mobile-First Player UI**: Vibrant color-coded shape buttons (▲ Red, ◆ Blue, ● Yellow, ■ Green) optimized for all mobile screens.
- ⚡ **Speed-Based Scoring & Streaks**: Speed-weighted score calculations with streak bonuses (🔥 2x, 3x streak boost!).
- 📊 **Live Response Distribution Chart**: Displays real-time answer distribution graph after each question.
- 🏆 **Leaderboards & Winner Podium**: Displays top 5 leaderboard after each question and 1st, 2nd, 3rd place podium upon quiz completion.
- 🪶 **Ultra-Lightweight Architecture**: Native WebSockets (`ws`), zero heavy database requirements, runs smoothly on $3-$5 VPS.

---

## 📄 XML Quiz File Format

Upload any XML file matching this structure (or download `sample_quiz.xml` directly from the host interface):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <title>General Science Quiz</title>
  <description>Fun science questions for students</description>

  <question timeLimit="20">
    <text>What is the chemical symbol for Gold?</text>
    <option correct="true">Au</option>
    <option>Ag</option>
    <option>Fe</option>
    <option>Cu</option>
  </question>

  <question timeLimit="15">
    <text>Which planet is known as the Red Planet?</text>
    <option>Venus</option>
    <option correct="true">Mars</option>
    <option>Jupiter</option>
    <option>Saturn</option>
  </question>
</quiz>
```

---

## 🚀 Deployment Guide for VPS Server

You can install Takoot on your VPS using **Docker** (Recommended) or directly via **Node.js + Systemd**.

### Option A: Docker / Docker Compose (Recommended)

1. Clone or copy the project folder to your VPS:
   ```bash
   git clone https://github.com/your-username/Takoot.git
   cd Takoot
   ```

2. Start the service with Docker Compose:
   ```bash
   docker compose up -d --build
   ```

3. Open your browser at `http://YOUR_VPS_IP:3000`.

---

### Option B: Direct Node.js Installation

1. Install Node.js (v18 or higher) on your VPS:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. Navigate to project directory and install dependencies:
   ```bash
   cd Takoot
   npm install --production
   ```

3. Start the application:
   ```bash
   npm start
   ```

#### Setting up Systemd (Keep app running 24/7)
Create a systemd unit file at `/etc/systemd/system/takoot.service`:
```ini
[Unit]
Description=Takoot Quiz Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/Takoot
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3000 NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable takoot
sudo systemctl start takoot
```

---

### Option C: Nginx Reverse Proxy & SSL (Optional)

To serve Takoot on custom domain with HTTPS (`https://quiz.yourdomain.com`), configure Nginx:

```nginx
server {
    server_name quiz.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then install SSL via Certbot:
```bash
sudo certbot --nginx -d quiz.yourdomain.com
```

---

## 🛠️ Local Development & Testing

1. Start development mode with auto-reload:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000` in two browser windows:
   - Window 1: Click **Host a Quiz**, upload `sample_quiz.xml`.
   - Window 2: Click **Join Game**, enter the PIN code displayed on Window 1.
