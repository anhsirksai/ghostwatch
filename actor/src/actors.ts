import { Actor, Emittable, Persisted, type ActorSocket } from "terse-sdk/actor"
import { exorciseCurse } from "./exorcist.js"

export type LogKind = "thought" | "cmd" | "out" | "file" | "curse" | "blocked" | "system"
export type LogEntry = { id: number; kind: LogKind; text: string; ts: number; by?: string }
export type GhostStatus = "sleeping" | "summoning" | "haunting" | "done" | "banished"

export type GhostMessage =
    | { type: "wish"; text: string; by?: string }
    | { type: "curse"; text: string; by?: string }
    | { type: "banish" }

const MAX_LOG = 300

// A Ghost is one séance: a wish, the Freestyle VM it possesses, and everything it did.
// Outbound work (OpenAI, Freestyle) happens in the worker; the actor is the durable source of truth
// that every spectator's WebSocket is synced to.
export class Ghost extends Actor<null, GhostMessage> {
    @Persisted @Emittable status: GhostStatus = "sleeping"
    @Persisted @Emittable wish = ""
    @Persisted @Emittable vmId = ""
    @Persisted @Emittable previewUrl = ""
    @Persisted @Emittable step = 0
    @Persisted @Emittable log: LogEntry[] = []
    @Persisted @Emittable pendingCurses: { text: string; by?: string }[] = []
    @Persisted @Emittable spectators = 0
    @Persisted seq = 0

    async read() {
        return {
            status: this.status,
            wish: this.wish,
            vmId: this.vmId,
            previewUrl: this.previewUrl,
            step: this.step,
            log: this.log,
            pendingCurses: this.pendingCurses,
        }
    }

    async reset() {
        this.status = "sleeping"
        this.wish = ""
        this.vmId = ""
        this.previewUrl = ""
        this.step = 0
        this.pendingCurses = []
        this.log = []
    }

    async summon(wish: string, by?: string) {
        this.wish = wish
        this.status = "summoning"
        this.step = 0
        this.previewUrl = ""
        this.pendingCurses = []
        this.log = []
        await this.append([{ kind: "system", text: `${by ?? "Someone"} lit the candles and wished: “${wish}”` }])
        return true
    }

    async append(entries: { kind: LogKind; text: string; by?: string }[]) {
        const next = [...this.log]
        for (const e of entries) next.push({ ...e, id: ++this.seq, ts: Date.now() })
        this.log = next.slice(-MAX_LOG)
        return this.seq
    }

    async setVm(vmId: string) {
        this.vmId = vmId
    }

    async setPreview(previewUrl: string) {
        this.previewUrl = previewUrl
    }

    async setStatus(status: GhostStatus, step?: number) {
        this.status = status
        if (step !== undefined) this.step = step
    }

    async curse(text: string, by?: string) {
        await this.append([{ kind: "curse", text, by }])
        // The Exorcist screens the audience too: a malicious curse is stopped here and never reaches the ghost.
        const why = exorciseCurse(text)
        if (why) {
            await this.append([{ kind: "blocked", text: `🚫 EXORCIST intercepted ${by ?? "a spectator"}'s curse — it ${why}. The ghost never sees it.` }])
            return
        }
        this.pendingCurses = [...this.pendingCurses, { text, by }]
    }

    async takeCurses() {
        const curses = this.pendingCurses
        if (curses.length) this.pendingCurses = []
        return curses
    }

    async onConnect() {
        this.spectators++
    }

    async onDisconnect() {
        this.spectators = Math.max(0, this.spectators - 1)
    }

    async onMessage(_socket: ActorSocket<null, GhostMessage>, message: GhostMessage) {
        if (message.type === "wish" && message.text?.trim()) await this.summon(message.text.trim().slice(0, 500), message.by)
        else if (message.type === "curse" && message.text?.trim()) await this.curse(message.text.trim().slice(0, 300), message.by)
        else if (message.type === "banish") {
            this.status = "banished"
            await this.append([{ kind: "system", text: "The ghost was banished. The candles go out." }])
        }
    }
}
