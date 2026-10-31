// Builds the submission video: narrated slides → narrated live demo (from record.ts) → narrated how-to.
// Output: video/ghostwatch-demo.mp4 (with an embedded closed-caption track) + video/ghostwatch-demo.srt for YouTube.
// Usage: bun record.ts && bun build.ts
import OpenAI from "openai"
import { chromium } from "playwright"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { $ } from "bun"
import { intro, outro, type Slide } from "./slides"

const VIDEO = join(import.meta.dir, "..", "video")
const RAW = join(VIDEO, "raw")
const openai = new OpenAI()
const ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-r", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]

type Cue = { start: number; end: number; text: string }
const duration = async (f: string) => Number((await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${f}`.text()).trim())

const spoken = (s: string) =>
    s.replace(/🚫|⚡|👻|🦇|🔥|🎃/g, "").replace(/kill -9/g, "kill dash nine").replace(/rm -rf/g, "R M dash R F").replace(/…/g, "...").trim()

const NARRATOR = {
    voice: "onyx",
    instructions: "A warm, playful Halloween narrator presenting a hackathon demo to judges. Clear, confident, upbeat, a hint of spooky delight. Brisk pace.",
}
const GHOST = {
    voice: "fable",
    instructions: "You are a theatrical, mischievous ghost narrating your own work: breathy, playful, savoring every word with spooky relish. Not too slow.",
}

async function tts(text: string, file: string, who = NARRATOR) {
    if (!existsSync(file)) {
        const speech = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: who.voice as any,
            input: spoken(text),
            instructions: who.instructions,
            response_format: "mp3",
        })
        writeFileSync(file, Buffer.from(await speech.arrayBuffer()))
    }
    return duration(file)
}

// Narrator explainers for quiet stretches where the model is thinking and nothing changes on screen.
const EXPLAINERS = [
    "We're fast-forwarding through the model's thinking time. Everything you see is real and unedited.",
    "While the model thinks, nothing is polling. The actor pushes each change to every browser the moment it is persisted.",
    "Every command you see is really executing inside an isolated Freestyle virtual machine, not on my laptop.",
    "Each step is written to the durable actor as it happens, so a crash can never lose more than the step in flight.",
    "The ghost has a strict toolset: run a command, write a file, publish a port, and finish. Nothing else.",
    "Spectators can join at any time. On connect, the actor sends the full séance state, so latecomers catch up instantly.",
    "The narration you hear in the ghost's voice is the model's real output, written to the actor and streamed live.",
]

// Captions: split a long narration into ~2-line chunks spread over its duration.
function chunk(text: string, start: number, dur: number): Cue[] {
    const words = text.split(/\s+/)
    const parts: string[] = []
    let cur = ""
    for (const w of words) {
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

async function renderSlides(slides: Slide[]) {
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.6 })
    for (const s of slides) {
        await page.setContent(s.html, { waitUntil: "networkidle" })
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: join(RAW, `slide-${s.id}.png`) })
    }
    await browser.close()
}

async function slideSegment(s: Slide): Promise<{ file: string; dur: number; cues: Cue[] }> {
    const vo = join(RAW, `vo-slide-${s.id}.mp3`)
    const d = await tts(s.say, vo)
    const lead = 0.6
    const dur = d + lead + 1.0
    const file = join(RAW, `seg-${s.id}.mp4`)
    await $`ffmpeg -y -loglevel error -loop 1 -i ${join(RAW, `slide-${s.id}.png`)} -i ${vo} -filter_complex ${`[1:a]adelay=${lead * 1000}:all=1,apad[a]`} -map 0:v -map [a] -t ${dur.toFixed(2)} ${ENC} ${file}`
    return { file, dur, cues: chunk(s.say, lead, d) }
}

async function demoSegment(): Promise<{ file: string; dur: number; cues: Cue[] }> {
    const lines: { t: number; text: string }[] = JSON.parse(readFileSync(join(RAW, "lines.json"), "utf8"))
    const ghostPath = join(RAW, "ghostlog.json")
    const ghostLog: { t: number; kind: string; text: string }[] = existsSync(ghostPath) ? JSON.parse(readFileSync(ghostPath, "utf8")) : []
    const src = join(RAW, "host.mp4")
    const videoDur = await duration(src)

    // 0. Fast-forward long stretches between scripted lines (the model working) so the video keeps moving.
    const SPEED = 4
    const fast: [number, number][] = []
    for (let i = 0; i < lines.length; i++) {
        const from = lines[i]!.t / 1000 + lines[i]!.text.length / 15 + 4
        const to = (i + 1 < lines.length ? lines[i + 1]!.t / 1000 : videoDur) - 3
        if (to - from > 8) fast.push([from, to])
    }
    const map = (t: number) => {
        let out = t
        for (const [a, b] of fast) if (t > a) out -= (Math.min(t, b) - a) * (1 - 1 / SPEED)
        return out
    }
    const inFast = (t: number) => fast.some(([a, b]) => t > a && t < b)
    const mappedDur = map(videoDur)

    // 1. The scripted narration owns its moments.
    const placed: { start: number; end: number; file: string }[] = []
    const cues: Cue[] = []
    let cursor = 0
    for (const [i, line] of lines.entries()) {
        const file = join(RAW, `vo-demo-${i}.mp3`)
        const d = await tts(line.text, file)
        const start = Math.max(map(line.t / 1000), cursor + 0.25)
        placed.push({ start, end: start + d, file })
        cues.push(...chunk(line.text, start, d))
        cursor = start + d
    }

    // 2. Fill the silences: first with the ghost's own thoughts at the moment they appeared, then with explainers.
    const busy = () => [...placed].sort((x, y) => x.start - y.start)
    const fits = (start: number, end: number) => busy().every(p => end + 0.35 <= p.start || start >= p.end + 0.35)
    const thoughts = ghostLog.filter(e => e.kind === "thought" && e.t > 0)
    for (const [i, th] of thoughts.entries()) {
        const text = th.text.length > 200 ? th.text.slice(0, 200).replace(/\s\S*$/, "") + "…" : th.text
        if (inFast(th.t / 1000)) continue
        const start = map(th.t / 1000) + 0.3
        if (start > mappedDur - 2) continue
        const file = join(RAW, `vo-ghost-${i}.mp3`)
        const d = await tts(text, file, GHOST)
        if (!fits(start, start + d)) continue
        placed.push({ start, end: start + d, file })
        cues.push(...chunk(`👻 ${text}`, start, d))
    }
    let explainer = 0
    for (let pass = 0; pass < 12 && explainer < EXPLAINERS.length; pass++) {
        // Find the longest remaining silence and drop an explainer into it.
        const spans = busy()
        let best = { from: 0, len: 0 }
        let prevEnd = 0
        for (const p of [...spans, { start: mappedDur, end: mappedDur }]) {
            if (p.start - prevEnd > best.len) best = { from: prevEnd, len: p.start - prevEnd }
            prevEnd = Math.max(prevEnd, p.end)
        }
        if (best.len < 6.5) break
        const text = EXPLAINERS[explainer]!
        const file = join(RAW, `vo-explain-${explainer++}.mp3`)
        const d = await tts(text, file)
        const start = best.from + 1.0
        if (!fits(start, start + d)) continue
        placed.push({ start, end: start + d, file })
        cues.push(...chunk(text, start, d))
    }
    cues.sort((x, y) => x.start - y.start)
    const lastEnd = Math.max(...placed.map(p => p.end))

    const pad = Math.max(0, lastEnd + 1 - mappedDur)
    const inputs = placed.flatMap(p => ["-i", p.file])
    const delays = placed.map((p, i) => `[${i + 1}:a]adelay=${Math.round(p.start * 1000)}:all=1[a${i}]`).join(";")
    const mix = `${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0:duration=longest,apad[aout]`
    const pieces: [number, number, number][] = []
    let at = 0
    for (const [a, b] of fast) (pieces.push([at, a, 1]), pieces.push([a, b, SPEED]), (at = b))
    pieces.push([at, videoDur, 1])
    const cut = pieces.map(([a, b, f], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${f}[p${i}]`).join(";")
    const joined = `${cut};${pieces.map((_, i) => `[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[vc]`
    const filter = `${joined};[vc]fps=30,tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},scale=2560:1440,format=yuv420p[v];${delays};${mix}`
    const file = join(RAW, "seg-demo.mp4")
    await $`ffmpeg -y -loglevel error -i ${src} ${inputs} -filter_complex ${filter} -map [v] -map [aout] -shortest ${ENC} ${file}`
    const silence = mappedDur - placed.reduce((n, p) => n + (p.end - p.start), 0)
    console.log(`demo: ${placed.length} voice clips, ~${silence.toFixed(0)}s of silence left in ${mappedDur.toFixed(0)}s (from ${videoDur.toFixed(0)}s, ${fast.length} fast-forwards)`)
    return { file, dur: await duration(file), cues }
}

const srtTime = (s: number) => {
    const ms = Math.round(s * 1000)
    const p = (n: number, w = 2) => String(n).padStart(w, "0")
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

await renderSlides([...intro, ...outro])
const segments = []
for (const s of intro) segments.push(await slideSegment(s))
segments.push(await demoSegment())
for (const s of outro) segments.push(await slideSegment(s))

let offset = 0
const all: Cue[] = []
for (const seg of segments) {
    const real = await duration(seg.file)
    all.push(...seg.cues.map(c => ({ ...c, start: c.start + offset, end: c.end + offset })))
    offset += real
}
const srtPath = join(VIDEO, "ghostwatch-demo.srt")
writeFileSync(srtPath, all.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n"))

const list = join(RAW, "concat.txt")
writeFileSync(list, segments.map(s => `file '${s.file}'`).join("\n"))
const out = join(VIDEO, "ghostwatch-demo.mp4")
await $`ffmpeg -y -loglevel error -f concat -safe 0 -i ${list} -i ${srtPath} -map 0:v -map 0:a -map 1:s -c:v copy -c:a copy -c:s mov_text -metadata:s:s:0 language=eng -disposition:s:0 default -movflags +faststart ${out}`
console.log(`wrote ${out} (${(await duration(out)).toFixed(1)}s) and ${srtPath}`)
