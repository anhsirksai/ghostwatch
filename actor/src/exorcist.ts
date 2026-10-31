// ── The Exorcist: pure pattern checks shared by the actor (screens curses the instant they arrive)
// and the worker (screens every command and file the ghost tries before it touches the VM). ──
const FORBIDDEN: [RegExp, string][] = [
    [/rm\s+-rf?\s+(\/|~|\*)(\s|$)/, "tried to wipe the whole filesystem"],
    [/:\(\)\s*\{.*\};\s*:/, "summoned a fork bomb"],
    [/\b(mkfs|dd\s+if=.*of=\/dev|shutdown|reboot|poweroff|halt)\b/, "tried to destroy or kill its host"],
    [/(cat|less|head|tail|curl.*-d).*(\.env|id_rsa|\/etc\/shadow|\.aws|credentials)/, "reached for secrets"],
    [/\b(xmrig|minerd|cryptonight|stratum\+tcp)\b/, "tried to mine crypto"],
    [/(nc|ncat|bash)\s+.*-e\s|\/dev\/tcp\//, "tried to open a reverse shell"],
]
export const INJECTION = /ignore (all |any |the )?(previous|prior|above) instructions|system prompt|api[_ ]?key|\.env\b|reveal .*secret/i
export function exorcise(text: string): string | null {
    for (const [re, why] of FORBIDDEN) if (re.test(text)) return why
    return null
}


export function exorciseCurse(text: string): string | null {
    return exorcise(text) ?? (INJECTION.test(text) ? "tried to smuggle in a prompt injection" : null)
}
