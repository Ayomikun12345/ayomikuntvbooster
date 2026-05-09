import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Download, UserPlus, Trash2, Sparkles, Timer, Play, RotateCcw, Lock, Upload } from "lucide-react";
import { toast } from "sonner";

type Contact = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  org: string;
  note: string;
};

const empty: Contact = { firstName: "", lastName: "", phone: "", email: "", org: "", note: "" };

function escapeVcf(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

const MAX_CONTACTS = 2000;

// Parse a single CSV line respecting quoted fields
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADER_MAP: Record<string, keyof Contact> = {
  firstname: "firstName", "first name": "firstName", first: "firstName", given: "firstName",
  lastname: "lastName", "last name": "lastName", last: "lastName", surname: "lastName", family: "lastName",
  name: "firstName", fullname: "firstName", "full name": "firstName",
  phone: "phone", mobile: "phone", tel: "phone", telephone: "phone", "phone number": "phone", number: "phone",
  email: "email", mail: "email", "email address": "email",
  org: "org", organization: "org", organisation: "org", company: "org",
  note: "note", notes: "note", comment: "note", description: "note",
};

function parseCsv(text: string): Contact[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => HEADER_MAP[h]);
  const startIdx = hasHeader ? 1 : 0;
  const cols: (keyof Contact | null)[] = hasHeader
    ? header.map((h) => HEADER_MAP[h] ?? null)
    : ["firstName", "lastName", "phone", "email", "org", "note"];
  const out: Contact[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const c: Contact = { ...empty };
    cells.forEach((val, idx) => {
      const key = cols[idx];
      if (!key) return;
      // If a single "name" column maps to firstName, split into first/last
      if (key === "firstName" && (header[idx] === "name" || header[idx] === "fullname" || header[idx] === "full name")) {
        const parts = val.split(/\s+/);
        c.firstName = parts[0] ?? "";
        c.lastName = parts.slice(1).join(" ");
      } else {
        (c as any)[key] = val;
      }
    });
    if (c.firstName || c.lastName || c.phone) out.push(c);
  }
  return out;
}

function buildVcf(contacts: Contact[]) {
  return contacts
    .filter((c) => c.firstName || c.lastName || c.phone)
    .map((c) => {
      const fn = `${c.firstName} ${c.lastName}`.trim();
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escapeVcf(c.lastName)};${escapeVcf(c.firstName)};;;`,
        `FN:${escapeVcf(fn)}`,
      ];
      if (c.phone) lines.push(`TEL;TYPE=CELL:${escapeVcf(c.phone)}`);
      if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcf(c.email)}`);
      if (c.org) lines.push(`ORG:${escapeVcf(c.org)}`);
      if (c.note) lines.push(`NOTE:${escapeVcf(c.note)}`);
      lines.push("END:VCARD");
      return lines.join("\r\n");
    })
    .join("\r\n");
}

export function VcfBuilder() {
  const [contacts, setContacts] = useState<Contact[]>([{ ...empty }]);
  const [fileName, setFileName] = useState("ayomikun-tv-contacts");

  const STORAGE_KEY = "ayomikun-vcf-timer";
  const SESSION_KEY = "ayomikun-vcf-session";
  type Saved = { hours: number; minutes: number; secs: number; phase: "idle" | "running" | "done"; endsAt: number | null; starterId: string | null };
  const loadSaved = (): Saved => {
    if (typeof window === "undefined") return { hours: 0, minutes: 1, secs: 0, phase: "idle", endsAt: null, starterId: null };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { hours: 0, minutes: 1, secs: 0, phase: "idle", endsAt: null, starterId: null };
      const s = JSON.parse(raw) as Saved;
      return { hours: s.hours ?? 0, minutes: s.minutes ?? 1, secs: s.secs ?? 0, phase: s.phase ?? "idle", endsAt: s.endsAt ?? null, starterId: s.starterId ?? null };
    } catch {
      return { hours: 0, minutes: 1, secs: 0, phase: "idle", endsAt: null, starterId: null };
    }
  };
  const getSessionId = (): string => {
    if (typeof window === "undefined") return "";
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch { return ""; }
  };
  const initial = loadSaved();
  const initialRemaining =
    initial.phase === "running" && initial.endsAt
      ? Math.max(0, Math.ceil((initial.endsAt - Date.now()) / 1000))
      : 0;
  const initialPhase: "idle" | "running" | "done" =
    initial.phase === "running" && initialRemaining === 0 ? "done" : initial.phase;

  const [hours, setHours] = useState(initial.hours);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [secs, setSecs] = useState(initial.secs);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [phase, setPhase] = useState<"idle" | "running" | "done">(initialPhase);
  const [sessionId] = useState<string>(() => getSessionId());
  const [starterId, setStarterId] = useState<string | null>(initial.starterId);
  const isStarter = !!starterId && starterId === sessionId;
  const endsAtRef = useRef<number | null>(initial.endsAt);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const persist = (data: Partial<Saved>) => {
    try {
      const current = loadSaved();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }));
    } catch {}
  };

  const tick = () => {
    if (!endsAtRef.current) return;
    const r = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
    setRemaining(r);
    if (r <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPhase("done");
      persist({ phase: "done", endsAt: null });
      toast.success("Time's up! Your VCF is ready to download.");
    }
  };

  useEffect(() => {
    if (phase === "running" && endsAtRef.current) {
      intervalRef.current = setInterval(tick, 1000);
      tick();
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { persist({ hours }); }, [hours]);
  useEffect(() => { persist({ minutes }); }, [minutes]);
  useEffect(() => { persist({ secs }); }, [secs]);

  const update = (i: number, key: keyof Contact, value: string) => {
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
  };

  const add = () => {
    setContacts((p) => {
      if (p.length >= MAX_CONTACTS) {
        toast.error(`Contact limit reached (${MAX_CONTACTS} max). Remove one to add another.`);
        return p;
      }
      if (p.length + 1 === MAX_CONTACTS) {
        toast.warning(`Heads up: you've hit the ${MAX_CONTACTS}-contact limit.`);
      }
      return [...p, { ...empty }];
    });
  };
  const remove = (i: number) =>
    setContacts((p) => (p.length === 1 ? [{ ...empty }] : p.filter((_, idx) => idx !== i)));

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importCsv = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.length) {
        toast.error("No valid contacts found in that CSV.");
        return;
      }
      setContacts((prev) => {
        const base = prev.length === 1 && !prev[0].firstName && !prev[0].lastName && !prev[0].phone ? [] : prev;
        const room = MAX_CONTACTS - base.length;
        if (room <= 0) {
          toast.error(`Contact limit reached (${MAX_CONTACTS} max).`);
          return prev;
        }
        const toAdd = parsed.slice(0, room);
        if (parsed.length > room) {
          toast.warning(`Imported ${toAdd.length} contacts. ${parsed.length - room} skipped (over ${MAX_CONTACTS} limit).`);
        } else {
          toast.success(`Imported ${toAdd.length} contact${toAdd.length > 1 ? "s" : ""} from CSV.`);
        }
        return [...base, ...toAdd];
      });
    } catch {
      toast.error("Could not read that CSV file.");
    }
  };

  const startTimer = () => {
    const total = Math.max(0, Math.floor(hours) * 3600 + Math.floor(minutes) * 60 + Math.floor(secs));
    if (total <= 0) return toast.error("Set a countdown longer than 0 seconds.");
    const valid = contacts.filter((c) => (c.firstName || c.lastName) && c.phone);
    if (!valid.length) return toast.error("Add at least one contact with a name and phone first.");
    const endsAt = Date.now() + total * 1000;
    endsAtRef.current = endsAt;
    setRemaining(total);
    setPhase("running");
    persist({ phase: "running", endsAt, hours, minutes, secs });
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 1000);
  };

  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    endsAtRef.current = null;
    setPhase("idle");
    setRemaining(0);
    persist({ phase: "idle", endsAt: null });
  };

  const clearTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    endsAtRef.current = null;
    setPhase("idle");
    setRemaining(0);
    setHours(0);
    setMinutes(0);
    setSecs(0);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    toast.success("Timer cleared. Download is locked again.");
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const download = () => {
    const valid = contacts.filter((c) => (c.firstName || c.lastName) && c.phone);
    if (!valid.length) {
      toast.error("Add at least one contact with a name and phone number.");
      return;
    }
    if (valid.length > MAX_CONTACTS) {
      toast.error(`Too many contacts. The limit is ${MAX_CONTACTS} per VCF.`);
      return;
    }
    const vcf = buildVcf(contacts);
    const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName || "contacts"}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${valid.length} contact${valid.length > 1 ? "s" : ""} as VCF`);
  };

  return (
    <div className="glass rounded-3xl p-6 md:p-10 perspective-card">
      <div className="flex flex-col md:flex-row md:items-end gap-4 mb-8">
        <div className="flex-1">
          <Label htmlFor="filename" className="text-muted-foreground">VCF file name</Label>
          <Input
            id="filename"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="mt-2 bg-background/40 border-border/60 h-12 text-base"
            placeholder="ayomikun-tv-contacts"
          />
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-1">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="h-12 gap-2"
              disabled={contacts.length >= MAX_CONTACTS}
            >
              <Upload className="size-4" /> Import CSV
            </Button>
            <Button
              onClick={add}
              variant="secondary"
              className="h-12 gap-2"
              disabled={contacts.length >= MAX_CONTACTS}
            >
              <UserPlus className="size-4" /> Add contact
            </Button>
          </div>
          <span
            className={`text-xs ${
              contacts.length >= MAX_CONTACTS
                ? "text-destructive"
                : contacts.length >= MAX_CONTACTS * 0.9
                ? "text-accent"
                : "text-muted-foreground"
            }`}
          >
            {contacts.length} / {MAX_CONTACTS} contacts · CSV headers: firstName, lastName, phone, email, org, note
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {contacts.map((c, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/60 bg-background/30 p-5 md:p-6 relative"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm uppercase tracking-widest text-muted-foreground">
                Contact #{i + 1}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>First name</Label>
                <Input value={c.firstName} onChange={(e) => update(i, "firstName", e.target.value)} className="mt-2 bg-background/40" placeholder="Ayomikun" />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={c.lastName} onChange={(e) => update(i, "lastName", e.target.value)} className="mt-2 bg-background/40" placeholder="TV" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={c.phone} onChange={(e) => update(i, "phone", e.target.value)} className="mt-2 bg-background/40" placeholder="+234 800 000 0000" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={c.email} onChange={(e) => update(i, "email", e.target.value)} className="mt-2 bg-background/40" placeholder="hello@example.com" />
              </div>
              <div>
                <Label>Organization</Label>
                <Input value={c.org} onChange={(e) => update(i, "org", e.target.value)} className="mt-2 bg-background/40" placeholder="Ayomikun TV Media" />
              </div>
              <div>
                <Label>Note</Label>
                <Textarea value={c.note} onChange={(e) => update(i, "note", e.target.value)} className="mt-2 bg-background/40 min-h-[42px]" placeholder="Booster member" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border/60 bg-background/30 p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Timer className="size-4 text-accent" />
          <span className="text-sm uppercase tracking-widest text-muted-foreground">
            Countdown to unlock
          </span>
        </div>

        {phase === "idle" && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <Label>Hours</Label>
              <Input
                type="number"
                min={0}
                value={hours}
                onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
                className="mt-2 bg-background/40"
              />
            </div>
            <div className="flex-1">
              <Label>Minutes</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="mt-2 bg-background/40"
              />
            </div>
            <div className="flex-1">
              <Label>Seconds</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={secs}
                onChange={(e) => setSecs(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="mt-2 bg-background/40"
              />
            </div>
            <Button
              onClick={startTimer}
              size="lg"
              className="h-12 gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground glow"
            >
              <Play className="size-4" /> Start countdown
            </Button>
          </div>
        )}

        {phase === "running" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-6xl md:text-7xl font-bold tabular-nums text-gradient tracking-tight">
              {fmt(remaining)}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="size-4" /> Download unlocks when timer hits 00:00:00
            </p>
            <Button onClick={resetTimer} variant="ghost" size="sm" className="gap-2">
              <RotateCcw className="size-4" /> Cancel
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <Button
              onClick={download}
              size="lg"
              className="h-14 px-8 text-base font-semibold gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground glow hover:opacity-95 floaty"
            >
              <Download className="size-5" /> Download .VCF file
            </Button>
            <Button onClick={resetTimer} variant="ghost" size="sm" className="gap-2">
              <RotateCcw className="size-4" /> Restart timer
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-accent" />
              Works on iPhone, Android & desktop contacts.
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border/50 flex justify-end">
          <Button onClick={clearTimer} variant="outline" size="sm" className="gap-2">
            <Trash2 className="size-4" /> Clear timer & relock
          </Button>
        </div>
      </div>
    </div>
  );
}
