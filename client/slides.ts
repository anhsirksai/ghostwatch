// Slide content for the submission video. Each slide is rendered to a PNG and voiced by build.ts.
export type Slide = { id: string; html: string; say: string }

const shell = (inner: string) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Creepster&family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;width:1600px;height:900px;overflow:hidden;color:#ece6ff;font-family:Inter,system-ui;
background:radial-gradient(1000px 600px at 15% -10%,#3a125755,transparent),radial-gradient(900px 500px at 110% 110%,#ff7a1822,transparent),#07050b;padding:70px 90px}
h1{font-family:Creepster,cursive;color:#ff7a18;font-size:84px;margin:0 0 8px;letter-spacing:1px;text-shadow:0 0 24px #ff7a1866;font-weight:400}
h2{font-size:22px;letter-spacing:.2em;text-transform:uppercase;color:#9a8cb3;margin:0 0 28px}
ul{list-style:none;padding:0;margin:0}li{font-size:31px;line-height:1.35;margin:0 0 22px;padding-left:52px;position:relative}
li b{color:#7dffb3}li .i{position:absolute;left:0;top:0}
.mono{font-family:"JetBrains Mono",monospace}.dim{color:#9a8cb3}.o{color:#ff7a18}.g{color:#7dffb3}.r{color:#ff3355}.v{color:#b48cff}
.box{border:2px solid #2a1d38;background:#110b18;border-radius:16px;padding:16px 20px;font-size:22px;line-height:1.35}
.box b{display:block;font-size:25px;margin-bottom:4px}
.foot{position:absolute;left:90px;bottom:40px;font-size:18px;color:#9a8cb3}
</style></head><body>${inner}<div class="foot">👻 GhostWatch · Haunted Hacks 2026 · Terse Durable Actors + Freestyle + OpenAI</div></body></html>`

const arrow = (label: string) =>
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9a8cb3;font-size:17px;min-width:120px;text-align:center">${label}<div style="font-size:34px;color:#ff7a18">⇄</div></div>`

export const intro: Slide[] = [
    {
        id: "title",
        html: shell(`<div style="height:100%;display:grid;place-items:center;text-align:center;margin-top:-40px"><div>
<div style="font-size:130px">👻</div><h1 style="font-size:150px">GhostWatch</h1>
<div style="font-size:40px;margin-top:6px">a séance for software</div>
<div class="dim" style="font-size:26px;margin-top:22px">Summon an AI agent into a real cloud VM — and watch it build, live, together.</div></div></div>`),
        say: "Hi! This is GhostWatch: a séance for software. Summon an AI agent into a real cloud computer, and everyone watches it build your idea, live.",
    },
    {
        id: "problem",
        html: shell(`<h2>The problem</h2><h1>Agents are haunted black boxes</h1><ul style="margin-top:40px">
<li><span class="i">🕳️</span>Coding agents work out of sight. You wait… then get a result you can't follow or steer.</li>
<li><span class="i">💣</span>They run on <b>your</b> machine or a shared sandbox. One bad command — or one injected prompt — and it's gone.</li>
<li><span class="i">💀</span>Long-running agents crash. The process dies and the work, the context and the environment die with it.</li>
<li><span class="i">🧍</span>It's single-player. Teammates can't watch or redirect the agent in real time.</li></ul>`),
        say: "The problem: coding agents are black boxes. You can't follow or steer them, they run where one bad command does real damage, a crash loses everything, and nobody else can watch.",
    },
    {
        id: "solution",
        html: shell(`<h2>The solution</h2><h1>Hold a séance</h1><ul style="margin-top:40px">
<li><span class="i">👻</span><b>The Ghost</b> — an OpenAI tool-calling agent that <b>possesses a fresh Freestyle VM</b>: writes code, runs it, publishes it on a public URL.</li>
<li><span class="i">🕯️</span><b>The Séance</b> — every thought, command and output streams live to every viewer.</li>
<li><span class="i">⚡</span><b>Curses</b> — any spectator can steer the agent mid-build with new requirements.</li>
<li><span class="i">🚫</span><b>The Exorcist</b> — a guard that screens every action and every curse before it touches the VM.</li>
<li><span class="i">🪦</span><b>Durable</b> — state lives in a Terse durable actor. Kill the worker; the ghost returns to the same VM.</li></ul>`),
        say: "Our solution: the ghost, an OpenAI agent, possesses a fresh Freestyle VM and builds there. Everything streams live to every viewer. Anyone can throw curses to steer it. The Exorcist blocks anything dangerous. And state lives in a Terse durable actor, so it survives crashes.",
    },
    {
        id: "architecture",
        html: shell(`<h2>Architecture</h2><h1 style="font-size:64px">One durable actor is the source of truth</h1>
<div style="display:flex;align-items:stretch;gap:0;margin-top:46px">
<div class="box" style="width:250px"><b class="v">🖥️ Spectators</b>Any number of browsers.<br>Send <span class="mono g">wish</span>, <span class="mono g">curse</span>, <span class="mono g">banish</span>.</div>
${arrow("WebSocket<br>state sync")}
<div class="box" style="width:330px;border-color:#ff7a18"><b class="o">🪦 Ghost actor · Terse</b><span class="mono" style="font-size:18px">@Persisted @Emittable</span><br>status · wish · step · vmId<br>log · pendingCurses · previewUrl · spectators</div>
${arrow("RPC<br>append · takeCurses")}
<div class="box" style="width:330px"><b class="g">⚙️ Worker · Bun</b>Supervisor (start / resume)<br>Ghost agent loop<br>Exorcist gate</div>
${arrow("tools")}
<div style="display:flex;flex-direction:column;gap:14px;width:230px">
<div class="box"><b>🧠 OpenAI</b>tool calling</div><div class="box"><b>☁️ Freestyle VM</b>exec · fs · style.dev URL</div></div></div>
<div class="dim" style="font-size:24px;margin-top:40px">The worker is disposable. The actor is not. Browsers never talk to the worker — only to the actor.</div>`),
        say: "Browsers connect over WebSocket to one Terse durable actor, the Ghost, whose persisted state syncs to everyone automatically. A disposable Bun worker runs the agent against OpenAI, executes tools in the Freestyle VM, and writes every step back to the actor.",
    },
    {
        id: "agents",
        html: shell(`<h2>How the agents communicate</h2><h1 style="font-size:64px">Everyone talks through the actor</h1>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:40px">
<div class="box"><b class="v">👻 Ghost agent (OpenAI)</b>Tools: <span class="mono g">run</span>, <span class="mono g">write_file</span>, <span class="mono g">publish</span>, <span class="mono g">finish</span>. Narrates in character before every call.</div>
<div class="box"><b class="r">🚫 Exorcist (guard)</b>Screens every command, file and curse: <span class="mono">rm -rf /</span>, fork bombs, secret reads, reverse shells, prompt injection.</div>
<div class="box"><b class="o">🕰️ Supervisor</b>Watches the actor. New wish → start. "haunting" with no live worker → resume on the same VM. New curses after done → keep going.</div>
<div class="box"><b class="g">🧑‍🤝‍🧑 Spectators (humans)</b>Wish and curse over WebSocket. Curses queue in the actor and are injected into the ghost's next turn.</div></div>
<div class="mono dim" style="font-size:20px;margin-top:30px">spectator ─curse→ actor ─takeCurses→ exorcist ─ok→ ghost ─tool→ VM ─output→ actor ─state_update→ all spectators</div>`),
        say: "The agents talk only through the actor. Spectators' curses queue there and pass the Exorcist; the ghost's tool results flow back and are broadcast to everyone.",
    },
    {
        id: "codebase",
        html: shell(`<h2>Design of the code base</h2><h1 style="font-size:64px">Small, sharp, and swappable</h1>
<div class="mono" style="font-size:24px;line-height:1.7;margin-top:34px">
<div><span class="o">actor/src/actors.ts</span>  <span class="dim">— Ghost durable actor: persisted state, WebSocket messages</span></div>
<div><span class="g">client/server.ts</span>     <span class="dim">— serves the séance, fresh WebSocket URLs, supervisor loop</span></div>
<div><span class="g">client/ghost.ts</span>      <span class="dim">— agent loop, persona prompt, tools, the Exorcist</span></div>
<div><span class="g">client/vm.ts</span>         <span class="dim">— the "vessel": Freestyle VM create/re-enter/exec/publish (+ mock)</span></div>
<div><span class="g">client/public/index.html</span> <span class="dim">— the live dashboard</span></div>
<div><span class="v">client/record.ts · build.ts</span> <span class="dim">— this video: Playwright + OpenAI TTS + ffmpeg</span></div></div>
<div class="dim" style="font-size:24px;margin-top:30px">Outbound calls stay in the worker; the actor only holds state. A mock vessel + scripted ghost let you rehearse offline.</div>`),
        say: "The code is small on purpose: the actor, a server with a supervisor, the agent loop with the Exorcist, and a Freestyle vessel with an offline mock. Let's see it live.",
    },
]

export const outro: Slide[] = [
    {
        id: "howto",
        html: shell(`<h2>How to access & use it</h2><h1 style="font-size:64px">Run your own séance</h1>
<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:40px;margin-top:30px">
<div class="mono" style="font-size:21px;line-height:1.75;background:#0c0812;border:1px solid #2a1d38;border-radius:14px;padding:22px">
<span class="dim"># 1 · actors (Bun ≥ 1.4.2 + Terse CLI)</span><br>cd ghostwatch/actor && bun install<br>terse actor dev<br>
<span class="dim"># 2 · app</span><br>cd ghostwatch/client && bun install<br>terse actor generate --language typescript<br>
<span class="dim"># keys in client/.env.local</span><br>OPENAI_API_KEY=sk-…<br>FREESTYLE_API_KEY=…<br>bun server.ts<br>
<span class="dim"># 3 · open</span> <span class="g">http://localhost:8790</span></div>
<ul style="font-size:28px"><li><span class="i">1️⃣</span>Open the page in two browsers.</li>
<li><span class="i">2️⃣</span>Type a wish → <b>Summon</b>.</li><li><span class="i">3️⃣</span>Throw curses from either window.</li>
<li><span class="i">4️⃣</span>Open the <b>portal URL</b> — it's public.</li><li><span class="i">5️⃣</span>No keys? It runs a scripted ghost on a mock VM.</li></ul></div>`),
        say: "To run it: start the Terse actor server, install the client, add your OpenAI and Freestyle keys, run bun server dot ts, and open localhost 8790 in two browsers. Wish, summon, curse, and open the public portal link.",
    },
    {
        id: "end",
        html: shell(`<div style="height:100%;display:grid;place-items:center;text-align:center;margin-top:-40px"><div>
<div style="font-size:110px">🎃</div><h1 style="font-size:130px">GhostWatch</h1>
<div style="font-size:34px;margin-top:8px">Durable ghosts · real VMs · live AI · multiplayer curses</div>
<div class="dim" style="font-size:24px;margin-top:22px">Terse Durable Actors · Freestyle · OpenAI — Happy Halloween 👻</div></div></div>`),
        say: "GhostWatch: durable ghosts, real VMs, live AI. Happy Halloween!",
    },
]
