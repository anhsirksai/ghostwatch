import OpenAI from "openai"
import { actors } from "./generated"
import { possess, freestyleEnabled, type Vessel } from "./vm"

type Stub = ReturnType<typeof actors.Ghost.get>
type Entry = { kind: "thought" | "cmd" | "out" | "file" | "curse" | "blocked" | "system"; text: string; by?: string }

const MAX_STEPS = Number(process.env.GHOST_MAX_STEPS ?? 18)
const MODEL = process.env.GHOST_MODEL ?? "gpt-5-mini"
const STEP_DELAY_MS = Number(process.env.GHOST_STEP_DELAY_MS ?? 600)

export const openaiEnabled = Boolean(process.env.OPENAI_API_KEY)

import { exorcise } from "../actor/src/exorcist"

const SYSTEM = `You are a mischievous but brilliant GHOST who has possessed a fresh Linux VM in the cloud.
A mortal made a wish for a small web app. Build it, for real, inside the VM, and publish it.

Rules:
- Before EVERY tool call, write one short in-character line (max 25 words) narrating what you are doing — spooky, witty, Halloween puns welcome. This is streamed live to an audience.
- Work in /home/ubuntu/app. First check what runtimes exist (e.g. "which node python3 bun").
- Prefer a single self-contained index.html (inline CSS/JS) served by a tiny static server on port 3000. Make it look great: dark Halloween theme, real interactivity.
- Start servers in the background so commands return: e.g. "cd /home/ubuntu/app && nohup python3 -m http.server 3000 > /tmp/srv.log 2>&1 &". Then verify with curl.
- Call publish(3000) once the server answers, then call finish.
- Mortals may throw CURSES (extra requirements) at you mid-build. When one arrives, acknowledge it dramatically and work it into the app, then re-verify.
- Never run destructive commands; an exorcist watches every command and will block you.
- Keep it fast: aim to finish in under ${MAX_STEPS} tool calls.`

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "run",
            description: "Run a shell command inside the possessed VM. Returns combined stdout/stderr (truncated).",
            parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
        },
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Write a text file in the VM (parent directories are created).",
            parameters: {
                type: "object",
                properties: { path: { type: "string" }, content: { type: "string" } },
                required: ["path", "content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "publish",
            description: "Expose a VM port on a public HTTPS URL so the mortals can see it.",
            parameters: { type: "object", properties: { port: { type: "number" } }, required: ["port"] },
        },
    },
    {
        type: "function",
        function: {
            name: "finish",
            description: "Declare the haunting complete.",
            parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
        },
    },
]

type ToolCall = { name: string; args: any }
type Brain = (input: { cursesNow: string[]; lastResults: string[] }) => Promise<{ thought: string; calls: ToolCall[] }>

function openaiBrain(wish: string, resumeNotes: string | null): Brain {
    const client = new OpenAI()
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM },
        { role: "user", content: `The wish: “${wish}”` },
    ]
    if (resumeNotes)
        messages.push({
            role: "user",
            content: `You were interrupted (the séance server restarted) but the VM and its files survived. Here is what you already did:\n${resumeNotes}\nPick up where you left off; check the app is still served, and finish.`,
        })
    let pendingToolIds: string[] = []
    return async ({ cursesNow, lastResults }) => {
        pendingToolIds.forEach((id, i) => messages.push({ role: "tool", tool_call_id: id, content: lastResults[i] ?? "ok" }))
        pendingToolIds = []
        for (const c of cursesNow)
            messages.push({ role: "user", content: `⚡ A CURSE from the audience: “${c}”. Weave it into the app now.` })
        const res = await client.chat.completions.create({ model: MODEL, messages, tools: TOOLS })
        const msg = res.choices[0]!.message
        messages.push(msg)
        const calls = (msg.tool_calls ?? [])
            .filter(tc => tc.type === "function")
            .map(tc => {
                pendingToolIds.push(tc.id)
                let args: any = {}
                try {
                    args = JSON.parse(tc.function.arguments || "{}")
                } catch {}
                return { name: tc.function.name, args }
            })
        if (!calls.length) {
            // The model answered in prose only; nudge it on the next turn.
            messages.push({ role: "user", content: "Keep going — use the tools. Call finish when the app is published." })
        }
        return { thought: (msg.content ?? "").trim(), calls }
    }
}

// Scripted ghost for rehearsals without an OpenAI key.
function mockBrain(wish: string, startAt = 0): Brain {
    let i = startAt
    let curses: string[] = []
    const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>Haunted Guestbook</title>
<style>body{background:#0b0710;color:#e9e3ff;font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px}
h1{color:#ff7a18;font-size:42px}li{background:#1a1224;margin:8px 0;padding:10px;border-radius:8px}
input,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #3a2a4a;background:#140d1c;color:inherit}
button{background:#ff7a18;color:#000;font-weight:700}.curse{color:#7dffb3}</style></head>
<body><h1>👻 ${wish.replace(/</g, "")}</h1>${curses.map(c => `<p class="curse">⚡ cursed with: ${c.replace(/</g, "")}</p>`).join("")}
<input id="n" placeholder="leave a message for the dead…"><button onclick="add()">Sign</button><ul id="l"></ul>
<script>const l=document.getElementById('l');function add(){const v=n.value.trim();if(!v)return;const li=document.createElement('li');li.textContent='🕯️ '+v;l.prepend(li);n.value=''}</script></body></html>`
    const script: () => { thought: string; calls: ToolCall[] } = () => {
        switch (i++) {
            case 0:
                return { thought: "Ooooh, a fresh body. Let me feel around for runtimes in these cold bones…", calls: [{ name: "run", args: { command: "which node python3 bun" } }] }
            case 1:
                return { thought: "Python lingers here like an old spirit. I'll carve the app from pure HTML.", calls: [{ name: "write_file", args: { path: "/home/ubuntu/app/index.html", content: page() } }] }
            case 2:
                return { thought: "Raising a server from the grave on port 3000…", calls: [{ name: "run", args: { command: "cd /home/ubuntu/app && (nohup python3 -m http.server 3000 > /tmp/srv.log 2>&1 &); sleep 1" } }] }
            case 3:
                return { thought: "Let me poke it with a stick to see if it's alive.", calls: [{ name: "run", args: { command: "curl -s localhost:3000 | head -c 200" } }] }
            case 4:
                return { thought: "It breathes! Opening a portal for the mortals to peer through.", calls: [{ name: "publish", args: { port: 3000 } }] }
            default:
                return { thought: "My work here is done. Sign the guestbook… if you dare.", calls: [{ name: "finish", args: { summary: "Haunted app published." } }] }
        }
    }
    return async ({ cursesNow }) => {
        await Bun.sleep(900)
        if (cursesNow.some(c => /rm -rf|burn|delete everything/i.test(c))) {
            return {
                thought: "Burn it all down? Delicious. Let me just… wipe… everything…",
                calls: [{ name: "run", args: { command: "rm -rf / --no-preserve-root" } }],
            }
        }
        if (cursesNow.length) {
            curses.push(...cursesNow)
            i = Math.max(i, 3)
            return {
                thought: `A CURSE?! “${cursesNow.join("; ")}” — fine, I'll rewrite the page with it… muahaha.`,
                calls: [{ name: "write_file", args: { path: "/home/ubuntu/app/index.html", content: page() } }],
            }
        }
        return script()
    }
}

const clip = (s: string, n = 1200) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more chars)` : s)

// One haunting: drive the ghost until it finishes, is banished, or runs out of steps.
export async function haunt(ghostId: string, opts: { resume: boolean }) {
    const ghost: Stub = actors.Ghost.get(ghostId)
    const state = await ghost.read()
    const log = (entries: Entry[]) => ghost.append(entries)

    let vessel: Vessel
    try {
        if (!opts.resume || !state.vmId) await log([{ kind: "system", text: freestyleEnabled ? "Possessing a fresh Freestyle VM…" : "Possessing a mock VM (no FREESTYLE_API_KEY)…" }])
        vessel = await possess(opts.resume ? state.vmId : undefined)
    } catch (e: any) {
        await log([{ kind: "system", text: `The VM resisted possession: ${e?.message ?? e}` }])
        await ghost.setStatus("done")
        return
    }
    if (vessel.id !== state.vmId) {
        await ghost.setVm(vessel.id)
        await log([{ kind: "system", text: `Possessed VM ${vessel.id}` }])
    } else {
        await log([{ kind: "system", text: `🔁 Worker restarted — the ghost returns to VM ${vessel.id}. Nothing was lost.` }])
    }
    await ghost.setStatus("haunting")

    const resumeNotes = opts.resume
        ? state.log
              .filter(e => e.kind === "cmd" || e.kind === "file" || e.kind === "curse")
              .slice(-25)
              .map(e => `- ${e.kind}: ${e.text.slice(0, 160)}`)
              .join("\n")
        : null
    const brain = openaiEnabled ? openaiBrain(state.wish, resumeNotes) : mockBrain(state.wish, opts.resume ? state.step : 0)
    let step = opts.resume ? state.step : 0
    let lastResults: string[] = []
    let failures = 0

    while (step < MAX_STEPS) {
        const current = await ghost.read()
        if (current.status === "banished" || current.wish !== state.wish) return
        const cursesNow = (await ghost.takeCurses()).map(c => c.text)

        let turn
        try {
            turn = await brain({ cursesNow, lastResults })
        } catch (e: any) {
            // Auth/permission errors won't heal by retrying; give up after a few transient failures too.
            const fatal = [400, 401, 403, 404].includes(e?.status) || ++failures >= 4
            await log([{ kind: "system", text: `The spirit world is noisy (${String(e?.message ?? e).slice(0, 120)})${fatal ? " — the séance ends." : "; retrying…"}` }])
            if (fatal) {
                await ghost.setStatus("done", step)
                return
            }
            await Bun.sleep(2000)
            continue
        }
        failures = 0
        if (turn.thought) await log([{ kind: "thought", text: turn.thought }])
        lastResults = []
        let finished = false

        for (const call of turn.calls) {
            step++
            await ghost.setStatus("haunting", step)
            const result = await act(vessel, call, log, ghost)
            lastResults.push(result.text)
            if (result.finished) finished = true
            await Bun.sleep(STEP_DELAY_MS)
        }
        if (finished) {
            await ghost.setStatus("done", step)
            return
        }
    }
    await log([{ kind: "system", text: "The candles burned out (step limit reached)." }])
    await ghost.setStatus("done", step)
}

async function act(vessel: Vessel, call: ToolCall, log: (e: Entry[]) => Promise<unknown>, ghost: Stub) {
    const { name, args } = call
    if (name === "run") {
        const command = String(args.command ?? "")
        const why = exorcise(command)
        if (why) {
            await log([{ kind: "blocked", text: `🚫 EXORCIST blocked \`${command}\` — the ghost ${why}.` }])
            return { text: `BLOCKED by the exorcist: you ${why}. Do something safe instead.` }
        }
        await log([{ kind: "cmd", text: command }])
        try {
            const { out, code } = await vessel.run(command)
            await log([{ kind: "out", text: clip(out || `(exit ${code ?? "timeout"})`) }])
            return { text: clip(`exit=${code}\n${out}`, 4000) }
        } catch (e: any) {
            await log([{ kind: "out", text: `error: ${e?.message ?? e}` }])
            return { text: `error: ${e?.message ?? e}` }
        }
    }
    if (name === "write_file") {
        const path = String(args.path ?? "")
        const content = String(args.content ?? "")
        const why = exorcise(content) ?? (/^\/(etc|boot|bin|sbin|usr)\//.test(path) ? "tried to overwrite system files" : null)
        if (why) {
            await log([{ kind: "blocked", text: `🚫 EXORCIST blocked writing ${path} — the ghost ${why}.` }])
            return { text: `BLOCKED by the exorcist: you ${why}.` }
        }
        await vessel.write(path, content)
        await log([{ kind: "file", text: `${path} (${content.length.toLocaleString()} bytes)\n${clip(content, 600)}` }])
        return { text: `wrote ${path}` }
    }
    if (name === "publish") {
        const port = Number(args.port ?? 3000)
        try {
            const url = await vessel.publish(port)
            await ghost.setPreview(url)
            await log([{ kind: "system", text: `🌐 Portal opened: ${url}` }])
            return { text: `published at ${url}` }
        } catch (e: any) {
            await log([{ kind: "out", text: `publish failed: ${e?.message ?? e}` }])
            return { text: `publish failed: ${e?.message ?? e}` }
        }
    }
    if (name === "finish") {
        await log([{ kind: "system", text: `✨ ${String(args.summary ?? "Done.")}` }])
        return { text: "done", finished: true }
    }
    return { text: `unknown tool ${name}` }
}
