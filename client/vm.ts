import { Freestyle } from "freestyle"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// The body the ghost possesses. Real mode is a Freestyle VM; mock mode fakes one on local disk
// so the séance can be rehearsed without credits.
export interface Vessel {
    id: string
    run(command: string, timeoutMs?: number): Promise<{ out: string; code: number | null }>
    write(path: string, content: string): Promise<void>
    publish(port: number): Promise<string>
}

const MOCK_ROOT = join(import.meta.dir, "mock-vm")

export const freestyleEnabled = Boolean(process.env.FREESTYLE_API_KEY)

export async function possess(existingVmId?: string): Promise<Vessel> {
    if (!freestyleEnabled) return mockVessel(existingVmId || `mock-${Date.now().toString(36)}`)

    const freestyle = new Freestyle({ apiKey: process.env.FREESTYLE_API_KEY })
    let vmId = existingVmId
    if (vmId) {
        // A restarted worker re-enters the same body.
        await freestyle.vms.ref(vmId).start().catch(() => {})
    } else {
        const created = await freestyle.vms.create({
            idleTimeoutSeconds: 1800,
            ttlSeconds: 6 * 3600,
            // Outbound web so the ghost can fetch packages; inbound only through the published style.dev domain.
            firewall: {
                rules: [
                    { action: "allow", source: {}, destination: { public: true, port: 443, protocol: "tcp" } },
                    { action: "allow", source: {}, destination: { public: true, port: 80, protocol: "tcp" } },
                    { action: "allow", source: {}, destination: { public: true, port: 53, protocol: "udp" } },
                ],
            } as any,
        })
        vmId = created.vmId
    }
    const vm = freestyle.vms.ref(vmId!)

    return {
        id: vmId!,
        async run(command, timeoutMs = 60_000) {
            const r = await vm.exec({ command, timeoutMs })
            return { out: `${r.stdout ?? ""}${r.stderr ? `\n${r.stderr}` : ""}`.trim(), code: r.statusCode ?? null }
        },
        async write(path, content) {
            await vm.exec({ command: `mkdir -p "$(dirname '${path.replace(/'/g, "")}')"` })
            await vm.fs.writeTextFile(path, content)
        },
        async publish(port) {
            const domain = `ghost-${vmId!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-10)}-${port}.style.dev`
            await freestyle.tls.rules
                .create({ action: "allow", domain, source: { public: true }, destination: { vmId: vmId!, port } } as any)
                .catch((e: any) => {
                    // Re-publishing the same port after a restart is fine.
                    if (!/exist|conflict|taken/i.test(String(e?.message))) throw e
                })
            return `https://${domain}`
        },
    }
}

function mockVessel(id: string): Vessel {
    const root = join(MOCK_ROOT, id)
    mkdirSync(root, { recursive: true })
    return {
        id,
        async run(command) {
            await Bun.sleep(400 + Math.random() * 600)
            if (/^\s*(which|command -v)/.test(command)) return { out: "/usr/bin/node\n/usr/bin/python3", code: 0 }
            if (/^\s*(node|python3) --version/.test(command)) return { out: "v22.11.0", code: 0 }
            if (/^\s*ls/.test(command)) return { out: "index.html  server.js", code: 0 }
            if (/curl/.test(command)) return { out: "<!doctype html>… 200 OK", code: 0 }
            return { out: "", code: 0 }
        },
        async write(path, content) {
            const local = join(root, path.replace(/^\/+/, ""))
            mkdirSync(dirname(local), { recursive: true })
            writeFileSync(local, content)
        },
        async publish() {
            return `/mock/${id}/`
        },
    }
}

export const mockRoot = MOCK_ROOT
