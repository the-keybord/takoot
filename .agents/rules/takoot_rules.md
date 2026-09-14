---
trigger: always_on
---

# ⚡ Takoot Project Rules & Architectural Directives

This document defines the core behavioral, architectural, and design rules for the **Takoot** project workspace.

---

## 1. Test Activation & Hosting Rules ⚡f
- **Public & Unauthenticated Direct Links**: Test activation links (`/host/:id` or `/?hostQuizId=:id`) MUST remain **public and open to anyone**. Anyone with the link (e.g., substitute teachers or guest hosts) can access the activation screen and click `▶️ PLAY TEST & CREATE ROOM` without logging in. Public can also run the actual game
- **Restricted Teacher Library**: Access to browse the full test bank library requires teacher authentication (`admin` / `admin123`).
- **Automatic Login Redirects**: Non-logged-in users attempting to access the main Host Library without a direct test activation link must be prompted with the Teacher Login modal (pre-filled with `admin` / `admin123`).

---
f
## 2. True/False & Choice Presentation Rules 🎨
- **Fixed True/False Choice Positioning**: True/False questions must NEVER mix option order.
  - **True** = Blue choice on the Left (Option 1).
  - **False** = Red choice on the Right (Option 2).
- **Un-masked Vote Counts**: On host result charts, raw vote count numbers must be clearly visible side-by-side with correct/incorrect badges (`✓`).

---

## 3. SPA Routing & Asset Rules 🛠️
- **Absolute Root Asset Paths**: Always use absolute root paths (`href="/css/style.css"`, `src="/js/app.js"`) in `index.html` to guarantee sub-route navigation (`/host/:id`, `/play/:pin`) resolves static assets cleanly.
- **Multi-Pattern Route Support**: The client-side SPA router (`handleRouting()`) must support path params (`/host/:id`), query params (`?hostQuizId=:id`), and hash params (`#host-:id`).

---

## 4. Real-Time WebSocket & Sound Engine 🔊
- **Web Audio API Engine**: Sound effects (soft chime beeps, rotating question melodies) use Web Audio API synthesis with fallback to HTML5 MP3 files in `/public/audio/`.
- **WebSocket Queueing**: WebSocket messages sent prior to connection opening (`socket.onopen`) must be safely queued (`pendingWSMessage`) and dispatched automatically upon connection.