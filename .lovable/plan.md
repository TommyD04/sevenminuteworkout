## 7-Minute Workout — iPhone web app

A mobile-first web app you open in Safari and "Add to Home Screen" so it launches like a native app. No login, no cloud — your history lives on your phone.

### The workout
The standard 12 exercises, 30 seconds each, 10 second rest between, ~7 minutes total:
1. Jumping jacks
2. Wall sit
3. Push-ups
4. Crunches
5. Step-ups on chair
6. Squats
7. Tricep dips
8. Plank
9. High knees
10. Lunges
11. Push-up + rotation
12. Side plank

### Screens

**Home (`/`)**
- Big "Start workout" button
- Today's count (e.g. "Done 1× today")
- Last 7 days as a simple streak row of dots
- Link to History

**Workout (`/workout`)**
- Current exercise: name, illustration, a short form tip
- Big circular countdown (30s work / 10s rest)
- "Up next" preview of the following exercise
- Audio: beep at 3-2-1, different beep at transition, optional voice "Push-ups, go!"
- Pause / Skip / Quit controls
- Wake lock so the screen stays on
- On finish → log entry screen

**Log entry (after finish)**
- "Nice work!" + total time
- Difficulty 1–5 (tap a face/number)
- Optional note
- Save → back to Home (count increments)

**History (`/history`)**
- List of completed sessions: date, time, difficulty
- Simple stats: total sessions, current streak, average difficulty

### Visual direction
Bold, athletic, focused. Dark background, one strong accent color (energetic orange or lime), large numerals for the timer (display font), clean sans for body. Full-bleed exercise illustrations. Minimal chrome during the workout — the timer is the hero.

### Tech notes (for reference)
- TanStack Start routes: `/`, `/workout`, `/history`
- State + history in `localStorage` (no backend, no Cloud)
- Web Audio API for beeps (generated, no audio files needed)
- Optional Web Speech API for spoken exercise names
- Screen Wake Lock API during workout
- Exercise illustrations: AI-generated line-art style, one per exercise
- Manifest-only installability: `manifest.json` + apple-touch-icon + `apple-mobile-web-app-capable` meta. **No service worker** (per Lovable PWA guidance — avoids preview/cache issues; you still get the home-screen icon and fullscreen launch)
- Preview viewport set to mobile

### Out of scope (can add later)
- Custom workout lengths or exercise swaps
- Cloud sync across devices (would need Lovable Cloud + login)
- Offline support (requires service worker — skipped intentionally)
- Apple Health integration (not possible from a web app)

Approve this and I'll build it.