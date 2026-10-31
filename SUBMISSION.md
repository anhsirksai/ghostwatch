# GhostWatch: a séance for software

**One-liner:** Summon an AI ghost into a real Freestyle cloud VM, watch it build your wish live with everyone else, throw curses at it mid-build, and kill its worker with kill -9 without losing anything.

**Tracks:** Stateful Apps (Terse Durable Actors) · Freestyle

**What it does**
- You make a wish ("a haunted guestbook…"). An AI ghost possesses a fresh **Freestyle VM**, checks the runtimes, writes the app, starts a server, curls it, and publishes it on a public `*.style.dev` URL.
- Every viewer is a WebSocket on one **Terse durable actor** (the séance). They all watch the ghost's narration, commands, output and files stream in real time.
- Any spectator can throw a **curse** (a new requirement) mid-build, and the ghost has to weave it in.
- An **Exorcist** gate inspects every command and file before it reaches the VM, and blocks `rm -rf /`, fork bombs, secret reads, reverse shells and miners.
- **Durability:** we `kill -9` the worker mid-build. The wish, step, VM id, log and pending curses live in the actor, so the restarted worker re-enters the same VM and carries on.

**How it's built:** Terse `Ghost` actor (`@Persisted @Emittable` state, WebSocket messages) · Bun supervisor/worker · OpenAI tool calling (`run`, `write_file`, `publish`, `finish`) · Freestyle SDK (`vms.create`, `vm.exec`, `vm.fs`, `tls.rules` for public HTTPS) · a single-page séance UI.

**Video (4:39, narrated, closed captions):** https://www.youtube.com/watch?v=yusV9XR0Xjo
