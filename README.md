# 👻 GhostWatch — a séance for software

**Summon an AI ghost into a real cloud VM and watch it build your wish, live, together.**

Built at Haunted Hacks: Real-Time AI Edition (YC, SF, 2026-10-31) with **Terse Durable Actors**, **Freestyle VMs** and **OpenAI**.

📺 **Demo video:** https://www.youtube.com/watch?v=yusV9XR0Xjo

## What it does

1. You make a wish: *"a haunted guestbook where messages fade away like ghosts."*
2. A **ghost** (an OpenAI tool-calling agent) **possesses a fresh Freestyle VM**. It checks the runtimes, writes the code, starts a server, curls it, and publishes it on a public `*.style.dev` HTTPS URL.
3. Every spectator watches the séance live: the ghost's in-character narration, each shell command, its output, and each file written.
4. Spectators can throw **curses** mid-build ("make it rain bats", "add a scream button"). The ghost has to work them into the app.
5. An **Exorcist** gate checks every command and file *before* it reaches the VM. It blocks `rm -rf /`, fork bombs, reading secrets, reverse shells and crypto miners, and shows a red card.
6. **Kill the worker with `kill -9` mid-build.** When it comes back, it re-enters the *same VM* and carries on, because the ghost's wish, step, VM id, log and pending curses all live in a Terse durable actor.

## Architecture

```
 browsers (any number) ──WebSocket──►  Ghost durable actor (Terse)          ◄── state lives here
   wish / curse / banish               @Persisted @Emittable status, log,
                                        vmId, previewUrl, curses, spectators
                                              ▲  RPC (append, setStatus, takeCurses…)
                                              │
                         server.ts (Bun) ─ supervisor loop ─ ghost.ts
                           /ws-url (fresh, expiring socket URLs)    │  OpenAI tool calls: run / write_file / publish / finish
                                                                    │  Exorcist gate on every action
                                                                    ▼
                                                    Freestyle VM (vm.exec, vm.fs, tls.rules → *.style.dev)
```

- `actor/src/actors.ts`: the `Ghost` actor. It holds the durable state that every socket syncs to, and handles wishes and curses that arrive over WebSocket.
- `client/server.ts`: serves the séance page and fresh socket URLs, and runs a supervisor. The supervisor starts a haunting for a new wish and **resumes** one it finds mid-haunt after a crash.
- `client/ghost.ts`: the agent loop, the persona prompt, the tools and the Exorcist.
- `client/vm.ts`: the Freestyle "vessel" (create or re-enter a VM, exec, write, publish), plus a mock vessel for offline rehearsal.
- `client/public/index.html`: the séance UI.
- `client/record.ts`, `slides.ts`, `build.ts`: the narrated, captioned submission video (Playwright + OpenAI TTS + ffmpeg).

## Run it

Requires Bun ≥ 1.4.2 and the Terse CLI (`~/.bun/bin/terse`).

```sh
# 1. actors
cd actor && bun install && terse actor dev           # http://127.0.0.1:7100

# 2. app (new terminal)
cd client && bun install && terse actor generate --language typescript
cat > .env.local <<EOF
OPENAI_API_KEY=sk-...
FREESTYLE_API_KEY=...
EOF
bun server.ts                                         # http://localhost:8790
```

## Use it

1. Open **http://localhost:8790** in two browser windows (or share your screen and invite teammates on your network).
2. Type a wish in the top-left box, e.g. *"a haunted guestbook where messages fade away like ghosts"*, and press **🕯️ Summon**.
3. Watch the left column. Purple lines are the ghost's thoughts, green `$` lines are commands run in the VM, and orange blocks are files it wrote.
4. Throw a **curse** from either window, using a preset chip or the curse box. Try "🔥 burn the server down: rm -rf /" to watch the Exorcist intercept it.
5. When the **portal** on the right opens, click its URL. It's a public `https://ghost-….style.dev` link that anyone can visit.
6. Optional: kill `bun server.ts` mid-build and start it again. The ghost resumes on the same VM.

Without keys, it runs a scripted ghost against a mock VM so the UI can be rehearsed offline.

Optional env: `GHOST_MODEL` (default `gpt-5-mini`), `GHOST_MAX_STEPS` (18), `GHOST_STEP_DELAY_MS` (600), `GHOST_ID` (`seance`).

Rebuild the demo video: `cd client && bun record.ts "<wish>" && bun build.ts` → `video/ghostwatch-demo.mp4` + `.srt` captions.

## Why durable actors

Long-running agents crash. Here the agent process is disposable and the ghost is not. One actor per séance is the single source of truth. Every browser is just a socket on it, and the worker can die at any point and resume against the same VM without losing the narrative, the curses or the build.
