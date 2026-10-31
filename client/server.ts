import { existsSync, readdirSync, statSync } from "node:fs"
import { join, normalize } from "node:path"
import { actors } from "./generated"
import { haunt, openaiEnabled } from "./ghost"
import { freestyleEnabled, mockRoot } from "./vm"

const PORT = Number(process.env.PORT ?? 8790)
const GHOST_ID = process.env.GHOST_ID ?? "seance"
const page = join(import.meta.dir, "public", "index.html")

// ── Supervisor: watches the durable Ghost and drives a haunting whenever one is owed. ──
let active: Promise<void> | null = null
async function supervise() {
    while (true) {
        try {
            if (!active) {
                const s = await actors.Ghost.get(GHOST_ID).read()
                // "summoning" = new wish. "haunting" with no live worker = we crashed mid-build: resume on the same VM.
                // "done" with fresh curses = the audience wants more.
                const resume = s.status === "haunting" || (s.status === "done" && s.pendingCurses.length > 0)
                if (s.status === "summoning" || resume) {
                    active = haunt(GHOST_ID, { resume })
                        .catch(e => console.error("haunt failed", e))
                        .finally(() => (active = null))
                }
            }
        } catch (e: any) {
            console.error("supervisor:", e?.message ?? e)
        }
        await Bun.sleep(700)
    }
}

function findIndex(dir: string): string | null {
    if (!existsSync(dir)) return null
    if (existsSync(join(dir, "index.html"))) return join(dir, "index.html")
    for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) {
            const hit = findIndex(p)
            if (hit) return hit
        }
    }
    return null
}

Bun.serve({
    port: PORT,
    idleTimeout: 60,
    async fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/") return new Response(Bun.file(page))
        if (url.pathname === "/ws-url") {
            // Websocket URLs carry a key and expire, so the browser asks for a fresh one on every connect.
            const { websocketUrl } = await actors.Ghost.prepareWebsocket({ actorId: GHOST_ID, metadata: null })
            return Response.json({ websocketUrl, ghostId: GHOST_ID, openai: openaiEnabled, freestyle: freestyleEnabled })
        }
        if (url.pathname.startsWith("/mock/")) {
            const id = normalize(url.pathname.split("/")[2] ?? "").replace(/[^\w-]/g, "")
            const file = findIndex(join(mockRoot, id))
            return file ? new Response(Bun.file(file)) : new Response("the portal is empty", { status: 404 })
        }
        return new Response("not found", { status: 404 })
    },
})

console.log(`👻 GhostWatch séance on http://localhost:${PORT}  (openai: ${openaiEnabled ? "live" : "mock"}, freestyle: ${freestyleEnabled ? "live" : "mock"})`)
supervise()
