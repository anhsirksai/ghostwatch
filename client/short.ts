// Cuts the ≤2-minute submission video from the recorded live demo (video/raw/host.webm + lines.json):
// two narrated slides → demo with key moments at 1× and everything else fast-forwarded → end card.
// New caption bars cover the recording's original on-screen captions. Output: video/ghostwatch-2min.mp4 + .srt
// Usage: bun short.ts
import OpenAI from "openai"
import { chromium } from "playwright"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { $ } from "bun"
import { intro } from "./slides"

const VIDEO = join(import.meta.dir, "..", "video")
const RAW = join(VIDEO, "raw")
const SHORT = join(RAW, "short")
await $`mkdir -p ${SHORT}`
const openai = new OpenAI()
const W = 1920
const H = 1080
const ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "17", "-r", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]
const FAST = 12

const duration = async (f: string) => Number((await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${f}`.text()).trim())
const spoken = (s: string) => s.replace(/kill -9/g, "kill dash nine").replace(/rm -rf/g, "R M dash R F").replace(/[🚫⚡👻🦇🔥🎃⏩]/gu, "").trim()

async function tts(text: string, file: string) {
    if (!existsSync(file)) {
        const speech = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: "ash",
            input: spoken(text),
            instructions:
                "Speak with a natural Indian English accent, like a friendly software engineer from Bengaluru demoing their hackathon project to judges. Conversational and human, warm and genuinely excited, with natural intonation, small pauses and emphasis. Not robotic, not announcer-like. Moderately brisk pace.",
            response_format: "mp3",
        })
        const rawFile = file.replace(/\.mp3$/, ".raw.mp3")
        writeFileSync(rawFile, Buffer.from(await speech.arrayBuffer()))
        // A touch quicker (pitch preserved) keeps the cut under two minutes without sounding rushed.
        await $`ffmpeg -y -loglevel error -i ${rawFile} -af atempo=1.08 ${file}`
    }
    return duration(file)
}

type Cue = { start: number; end: number; text: string }
function chunk(text: string, start: number, dur: number): Cue[] {
    const parts: string[] = []
    let cur = ""
    for (const w of text.split(/\s+/)) {
        if ((cur + " " + w).trim().length > 84) (parts.push(cur.trim()), (cur = ""))
        cur += " " + w
    }
    if (cur.trim()) parts.push(cur.trim())
    const total = parts.reduce((n, p) => n + p.length, 0)
    let t = start
    return parts.map(p => {
        const d = (dur * p.length) / total
        const c = { start: t, end: t + d, text: p }
        t += d
        return c
    })
}

// ── Slides ──
const archHtml = intro.find(s => s.id === "architecture")!.html
const base = intro[0]!.html
const problemSolution = base.replace(
    /<body>[\s\S]*<div class="foot">/,
    `<body><div style="display:flex;align-items:center;gap:26px"><div style="font-size:84px">👻</div><div><h1 style="font-size:100px;margin:0">GhostWatch</h1><div style="font-size:30px">a séance for software</div></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:46px">
<div><h2 style="color:#ff3355">The problem</h2><ul>
<li><span class="i">🕳️</span>Coding agents are black boxes you can't watch or steer.</li>
<li><span class="i">💣</span>One bad command or injected prompt does real damage.</li>
<li><span class="i">💀</span>When the process crashes, the work dies with it.</li></ul></div>
<div><h2 style="color:#7dffb3">The solution</h2><ul>
<li><span class="i">☁️</span>An OpenAI <b>ghost</b> possesses a fresh <b>Freestyle VM</b> and builds there.</li>
<li><span class="i">🕯️</span>Everything streams live to every viewer, who can <b>curse</b> it mid-build.</li>
<li><span class="i">🪦</span>State lives in a <b>Terse durable actor</b>: it survives kill -9.</li></ul></div></div>
<div class="foot">`,
)
const endHtml = base.replace(
    /<body>[\s\S]*<div class="foot">/,
    `<body><div style="height:100%;display:grid;place-items:center;text-align:center;margin-top:-30px"><div>
<div style="font-size:90px">🎃</div><h1 style="font-size:120px">GhostWatch</h1>
<div style="font-size:32px">Durable ghosts · real VMs · live AI · multiplayer curses</div>
<div class="mono" style="font-size:34px;margin-top:34px;color:#7dffb3">github.com/anhsirksai/ghostwatch</div>
<div class="dim" style="font-size:22px;margin-top:14px">terse actor dev · add OpenAI + Freestyle keys · bun server.ts · open localhost:8790</div></div></div>
<div class="foot">`,
)
const slides = [
    {
        id: "ps",
        html: problemSolution,
        say: "GhostWatch: a séance for software. Coding agents are black boxes that can do real damage and die when they crash. So we summon an AI ghost into a real Freestyle VM, stream it live to everyone, and keep its state in a Terse durable actor.",
    },
    {
        id: "arch",
        html: archHtml,
        say: "Browsers connect to one durable Ghost actor. A disposable worker runs the OpenAI agent, executes tools in the VM, and writes every step back, with an Exorcist screening everything.",
    },
]
const end = { id: "end", html: endHtml, say: "GhostWatch. Code on GitHub. Happy Halloween!" }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 })
for (const s of [...slides, end]) {
    await page.setContent(s.html, { waitUntil: "networkidle" })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(SHORT, `slide-${s.id}.png`) })
}

async function slideSeg(s: { id: string; say: string }) {
    const vo = join(SHORT, `vo-${s.id}.mp3`)
    const d = await tts(s.say, vo)
    const dur = d + 0.6
    const file = join(SHORT, `seg-${s.id}.mp4`)
    await $`ffmpeg -y -loglevel error -loop 1 -i ${join(SHORT, `slide-${s.id}.png`)} -i ${vo} -filter_complex ${`[0:v]scale=${W}:${H}:flags=lanczos[v];[1:a]adelay=400:all=1,apad[a]`} -map [v] -map [a] -t ${dur.toFixed(2)} ${ENC} ${file}`
    return { file, cues: chunk(s.say, 0.4, d) }
}

// ── Demo: narration keyed to moments in the original recording ──
const src = join(RAW, "host.webm")
const srcDur = await duration(src)
const orig: { t: number; text: string }[] = JSON.parse(readFileSync(join(RAW, "lines.json"), "utf8"))
const at = (needle: string) => orig.find(l => l.text.includes(needle))!.t / 1000
const beats = [
    { t: at("This is the live séance") - 1, text: "Here's the live séance: two browsers, both connected to the same Terse durable actor." },
    { t: at("I make a wish") - 1, text: "I make a wish, and summon the ghost." },
    { t: at("brand-new Freestyle VM"), text: "A fresh Freestyle VM boots in under a second. The OpenAI ghost narrates and runs real commands, streamed live." },
    { t: at("It just wrote the entire app"), text: "It writes the whole app into the VM." },
    { t: at("Now the other spectator"), text: "Another spectator throws a curse: make it rain bats." },
    { t: at("Someone malicious"), text: "A malicious rm -rf curse? The Exorcist blocks it instantly." },
    { t: at("Now the scary part"), text: "Now I kill -9 the worker, mid-build." },
    { t: at("The worker comes back"), text: "It restarts and re-enters the same VM. Nothing lost: the state lives in the actor." },
    { t: at("The ghost published"), text: "The ghost publishes its app on a public URL." },
    { t: at("Here it is, full screen") - 0.5, text: "And here's the real app, bats included, served from the Freestyle VM." },
]
for (const [i, b] of beats.entries()) Object.assign(b, { dur: await tts(b.text, join(SHORT, `vo-beat-${i}.mp3`)) })

// Keep a window of real-time footage around each beat; fast-forward everything else.
const keep: [number, number][] = []
for (const b of beats as any[]) {
    const w: [number, number] = [Math.max(0, b.t - 0.5), Math.min(srcDur, b.t + b.dur + 0.3)]
    const last = keep.at(-1)
    if (last && w[0] <= last[1] + 1.5) last[1] = Math.max(last[1], w[1])
    else keep.push(w)
}
keep[keep.length - 1]![1] = Math.min(srcDur, keep.at(-1)![1] + 1.5)
const pieces: { a: number; b: number; f: number }[] = []
let cur = 0
for (const [a, b] of keep) {
    if (a > cur + 0.05) pieces.push({ a: cur, b: a, f: FAST })
    pieces.push({ a, b, f: 1 })
    cur = b
}
const map = (t: number) => {
    let out = 0
    for (const p of pieces) {
        if (t <= p.a) break
        out += (Math.min(t, p.b) - p.a) / p.f
    }
    return out
}
const outDur = map(keep.at(-1)![1])

// Caption bars (cover the recording's original captions) and a fast-forward badge.
async function bar(text: string, file: string, fast = false) {
    await page.setViewportSize({ width: 1200, height: 84 })
    await page.setContent(`<html><body style="margin:0;background:#07050b"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800&display=swap" rel="stylesheet">
<div style="box-sizing:border-box;width:1200px;height:84px;display:grid;place-items:center;padding:0 22px;background:#000;border:2px solid ${fast ? "#7dffb3" : "#ff7a18"};border-radius:12px;color:#fff;font:600 23px/1.3 Inter,system-ui;text-align:center">${text}</div></body></html>`, { waitUntil: "networkidle" })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: file })
}
const bars: { file: string; from: number; to: number }[] = []
const placed: { file: string; start: number }[] = []
const demoCues: Cue[] = []
let cursor = 0
for (const [i, b] of (beats as any[]).entries()) {
    const start = Math.max(map(b.t), cursor + 0.2)
    placed.push({ file: join(SHORT, `vo-beat-${i}.mp3`), start })
    demoCues.push(...chunk(b.text, start, b.dur))
    cursor = start + b.dur
    const png = join(SHORT, `bar-${i}.png`)
    await bar(b.text, png)
    bars.push({ file: png, from: start - 0.1, to: 0 })
}
bars.forEach((b, i) => (b.to = bars[i + 1]?.from ?? outDur + 5))
const idle = join(SHORT, "bar-idle.png")
await bar("👻 GhostWatch live demo · real OpenAI agent · real Freestyle VM", idle)
const ff = join(SHORT, "bar-fast.png")
await bar("⏩ 12× fast-forward while the model works — real and unedited", ff, true)
await browser.close()

const overlays: { file: string; from: number; to: number }[] = [{ file: idle, from: 0, to: bars[0]!.from }, ...bars]
for (const p of pieces) if (p.f > 1 && (p.b - p.a) / p.f > 0.8) overlays.push({ file: ff, from: map(p.a), to: map(p.b) })

const cut = pieces.map((p, i) => `[0:v]trim=start=${p.a.toFixed(3)}:end=${p.b.toFixed(3)},setpts=(PTS-STARTPTS)/${p.f}[p${i}]`).join(";")
let chain = `${cut};${pieces.map((_, i) => `[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0,fps=30,tpad=stop_mode=clone:stop_duration=${Math.max(0, cursor + 1 - outDur).toFixed(2)}[base]`
let last = "base"
const ovIn = overlays.map(o => ["-loop", "1", "-t", (outDur + 6).toFixed(2), "-i", o.file]).flat()
overlays.forEach((o, i) => {
    const out = `o${i}`
    chain += `;[${last}][${i + 1}:v]overlay=x=(W-w)/2:y=4:enable='between(t,${o.from.toFixed(2)},${o.to.toFixed(2)})':shortest=0[${out}]`
    last = out
})
const aBase = overlays.length + 1
const audioIn = placed.flatMap(p => ["-i", p.file])
chain += `;[${last}]scale=${W}:${H}:flags=lanczos,format=yuv420p[v];`
chain += placed.map((p, i) => `[${aBase + i}:a]adelay=${Math.round(p.start * 1000)}:all=1[a${i}]`).join(";")
chain += `;${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0:duration=longest,apad[aout]`
const demoFile = join(SHORT, "seg-demo.mp4")
const demoLen = Math.max(outDur, cursor + 1)
await $`ffmpeg -y -loglevel error -i ${src} ${ovIn} ${audioIn} -filter_complex ${chain} -map [v] -map [aout] -t ${demoLen.toFixed(2)} ${ENC} ${demoFile}`

// ── Assemble ──
const segs = [await slideSeg(slides[0]!), await slideSeg(slides[1]!), { file: demoFile, cues: demoCues }, await slideSeg(end)]
let offset = 0
const cues: Cue[] = []
for (const s of segs) {
    cues.push(...s.cues.map(c => ({ ...c, start: c.start + offset, end: c.end + offset })))
    offset += await duration(s.file)
}
const ts = (s: number) => {
    const ms = Math.round(s * 1000)
    const p = (n: number, w = 2) => String(n).padStart(w, "0")
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
const srt = join(VIDEO, "ghostwatch-2min.srt")
writeFileSync(srt, cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n"))
const list = join(SHORT, "concat.txt")
writeFileSync(list, segs.map(s => `file '${s.file}'`).join("\n"))
const out = join(VIDEO, "ghostwatch-2min.mp4")
await $`ffmpeg -y -loglevel error -f concat -safe 0 -i ${list} -i ${srt} -map 0:v -map 0:a -map 1:s -c:v copy -c:a copy -c:s mov_text -metadata:s:s:0 language=eng -movflags +faststart ${out}`
console.log(`slides+demo+end: ${segs.length} segments; demo ${demoLen.toFixed(1)}s (from ${srcDur.toFixed(0)}s)`)
console.log(`wrote ${out} (${(await duration(out)).toFixed(1)}s) and ${srt}`)
