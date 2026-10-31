// Records the live-demo segment: a host window and a spectator window on the same séance, with captions
// burned in and every narrated line logged (with its offset) for narrate.ts.
// Usage: bun record.ts "<wish>"   (needs `terse actor dev` running; this script owns server.ts)
import { chromium, type Page } from "playwright"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { actors } from "./generated"

const WISH = process.argv[2] ?? "a haunted guestbook where messages fade away like ghosts"
const RAW = join(import.meta.dir, "..", "video", "raw")
const SIZE = { width: 1600, height: 900 }
const FRAMES = join(RAW, "frames")
rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })
mkdirSync(RAW, { recursive: true })

let server: ChildProcess | null = null
const startServer = () => {
    server = spawn("bun", ["server.ts"], { cwd: import.meta.dir, stdio: "inherit", env: process.env })
}
const waitUp = async () => {
    for (let i = 0; i < 50; i++) {
        try {
            if ((await fetch("http://localhost:8790/ws-url")).ok) return
        } catch {}
        await Bun.sleep(200)
    }
    throw new Error("server did not come up")
}

let videoStart = 0
const lines: { t: number; text: string }[] = []
// Narrate a line: log it for the voice-over and show it as an on-screen caption.
async function say(page: Page, text: string, holdMs = 0) {
    lines.push({ t: Date.now() - videoStart, text })
    await page.evaluate(t => {
        let el = document.getElementById("__cap")
        if (!el) {
            el = document.createElement("div")
            el.id = "__cap"
            el.style.cssText =
                "position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99;width:72%;padding:10px 18px;border-radius:12px;background:#000f;border:1px solid #ff7a18;color:#fff;font:600 19px/1.35 Inter,system-ui;text-align:center;box-shadow:0 10px 40px #000"
            document.body.append(el)
        }
        el.textContent = t
    }, text)
    // Leave roughly enough time for the voice-over (~15 chars/s) before the next scene.
    await Bun.sleep(Math.max(holdMs, text.length * 62))
}

async function until(page: Page, fn: string, timeoutMs: number) {
    return page
        .waitForFunction(fn, null, { timeout: timeoutMs, polling: 300 })
        .then(() => true)
        .catch(() => (console.warn("timeout waiting for", fn), false))
}
const count = (kind: string) => `document.querySelectorAll('#log .e.${kind}').length`

await actors.Ghost.get(process.env.GHOST_ID ?? "seance").reset()
startServer()
await waitUp()

const browser = await chromium.launch()
// HiDPI (1.6x → 2560x1440) so text stays sharp on YouTube.
const host = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1.6 })
const spec = await browser.newContext({ viewport: { width: 1200, height: 800 } })
const A = await host.newPage()
videoStart = Date.now()
// Capture Chrome's own screencast (full-quality JPEG frames, pushed on every repaint) instead of
// Playwright's low-bitrate video recorder. Frames are stitched with their real timings afterwards.
const frames: { file: string; t: number }[] = []
const cdp = await host.newCDPSession(A)
cdp.on("Page.screencastFrame", async (f: any) => {
    const file = join(FRAMES, `${String(frames.length).padStart(6, "0")}.jpg`)
    writeFileSync(file, Buffer.from(f.data, "base64"))
    frames.push({ file, t: Date.now() - videoStart })
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
})
const screencast = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2560, maxHeight: 1440 })
await screencast()
const B = await spec.newPage()
await A.goto("http://localhost:8790")
await B.goto("http://localhost:8790")
await Bun.sleep(1200)

await say(A, "This is the live séance. Two browsers are connected right now — mine, and a second spectator — both as WebSockets on the same Terse durable actor.")
await say(A, "Left: the ghost's live stream. Right: the portal where its app will appear, and the curse panel any spectator can use.")

await A.click("#wish")
await A.keyboard.type(WISH, { delay: 30 })
await say(A, "I make a wish, and summon the ghost.", 1500)
await A.click("#summonBtn")

await until(A, `${count("cmd")} >= 1`, 90_000)
await say(A, "The worker just booted a brand-new Freestyle VM in under a second. The ghost — an OpenAI agent — is now inside it, checking which runtimes exist.")
await say(A, "Every thought, command and output is appended to the durable actor, which pushes it to every viewer instantly. The agents talk through the actor, never directly.")

await until(A, `${count("file")} >= 1`, 180_000)
await say(A, "It just wrote the entire app into the VM — you can see the file land in the stream.")

await B.click("text=make it rain bats")
await until(A, `${count("curse")} >= 1`, 10_000)
await say(A, "Now the other spectator throws a curse: make it rain bats. It travels over their WebSocket into the actor. On its next turn the ghost must obey.")

await B.click("text=burn the server down")
await until(A, `${count("blocked")} >= 1`, 30_000)
await say(A, "Someone malicious tries to curse the ghost into running rm -rf. The Exorcist intercepts it — destructive commands, secrets and prompt injections never reach the agent or the VM.")

if ((await A.textContent("#status")) === "haunting") {
    await say(A, "Now the scary part. I kill -9 the worker process, mid-build.", 1500)
    server!.kill("SIGKILL")
    await Bun.sleep(2500)
    await say(A, "The browser stays connected to the actor. The wish, the step, the VM id and pending curses are all persisted there.")
    startServer()
    await waitUp()
    await until(A, `[...document.querySelectorAll('#log .e.system')].some(e => e.textContent.includes('Worker restarted'))`, 30_000)
    await say(A, "The worker comes back, finds a haunting in progress, and re-enters the exact same VM. Nothing lost.")
}

await say(A, "While it finishes, notice the ghost narrating in character. That narration is the real model output, streamed live.")
await until(A, `!document.getElementById('frame').hidden`, 300_000)
await say(A, "The ghost published its app on a public HTTPS URL, served straight from the Freestyle VM.")
await until(A, `document.getElementById('status').textContent === 'done'`, 300_000)

const url = (await actors.Ghost.get(process.env.GHOST_ID ?? "seance").read()).previewUrl
if (url.startsWith("http")) {
    await A.goto(url)
    await screencast().catch(() => {})
    await Bun.sleep(1500)
    await say(A, "Here it is, full screen: a real app, built live by an AI agent in a cloud VM, while everyone watched.")
    try {
        await A.locator("input, textarea").first().fill("Happy Halloween from Haunted Hacks", { timeout: 4000 })
        await A.locator("button").first().click({ timeout: 3000 })
    } catch {}
    await say(A, "Anyone can open this link right now.", 2500)
    await A.goto("http://localhost:8790")
    await screencast().catch(() => {})
    await Bun.sleep(1500)
}
await say(A, "And the whole séance — log, curses, VM — lives on in the durable actor, ready for the next wish.", 3000)

await cdp.send("Page.stopScreencast").catch(() => {})
await host.close()
await spec.close()
await browser.close()
server!.kill()
// Stitch frames into a constant-30fps 1440p video using each frame's real display time.
const end = Date.now() - videoStart
const list = frames.map((f, i) => `file '${f.file}'\nduration ${(((frames[i + 1]?.t ?? end) - (i === 0 ? 0 : f.t)) / 1000).toFixed(3)}`)
writeFileSync(join(RAW, "frames.txt"), list.join("\n") + `\nfile '${frames.at(-1)!.file}'\n`)
await Bun.$`ffmpeg -y -loglevel error -f concat -safe 0 -i ${join(RAW, "frames.txt")} -vf fps=30,scale=2560:1440:flags=lanczos,format=yuv420p -c:v libx264 -preset medium -crf 14 ${join(RAW, "host.mp4")}`
writeFileSync(join(RAW, "lines.json"), JSON.stringify(lines, null, 2))
// The ghost's own timeline (thoughts, blocks, portal), offset into the video, for build.ts to voice in the quiet stretches.
const ghostLog = (await actors.Ghost.get(process.env.GHOST_ID ?? "seance").read()).log
writeFileSync(join(RAW, "ghostlog.json"), JSON.stringify(ghostLog.map(e => ({ t: e.ts - videoStart, kind: e.kind, text: e.text })), null, 2))
console.log(`recorded ${((Date.now() - videoStart) / 1000).toFixed(0)}s → ${RAW}`)
process.exit(0)
