# Family Reunion Bingo 🎉

A mobile-first Progressive Web App for family reunion bingo. Each player gets their own randomized 5×5 card.

## Quick Start

Serve the folder over HTTP (required for PWA/service worker):

```bash
cd "The W game"
python3 -m http.server 8080
```

Open `http://localhost:8080` on your phone (same Wi‑Fi) or use a hosting service.

## Install on iPhone

1. Open the app in **Safari**
2. Tap the **Share** button
3. Tap **Add to Home Screen**
4. Tap **Add**

## How to Play

1. Tap **+ Add** to create a player (each person gets their own card)
2. Switch players with the dropdown
3. Tap squares when the moment happens
4. Get 5 in a row (horizontal, vertical, or diagonal) for **BINGO!**
5. **New Game** shuffles the current player's card
6. **Reset All** clears everyone and starts fresh

Progress is saved automatically in local storage.
