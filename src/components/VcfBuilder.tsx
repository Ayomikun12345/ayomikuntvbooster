import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Download, UserPlus, Trash2, Sparkles, Timer, Play, RotateCcw, Lock, Upload, Link2 } from "lucide-react";
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [draft, setDraft] = useState<Contact>({ ...empty });
  const [fileName, setFileName] = useState("ayomikun-tv-contacts");

  const STORAGE_KEY = "ayomikun-vcf-timer";
  const SESSION_KEY = "ayomikun-vcf-session";
  const NAME_KEY = "ayomikun-vcf-name";
  const ACTIVITY_KEY = "ayomikun-vcf-activity";
  const ACTIVITY_MAX = 50;
  type Saved = { hours: number; minutes: number; secs: number; phase: "idle" | "running" | "done"; endsAt: number | null; starterId: string | null };
  type Activity = { id: string; sessionId: string; name: string; label: string; at: number };
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
  let initial = loadSaved();
  // A visitor only sees an existing session when:
  //   1. THIS browser tab already participated in it (sessionStorage key exists), OR
  //   2. They opened a starter's invite link (?join=<starterId> in the URL).
  // Every other visitor — including a brand-new tab on the same device —
  // gets a fresh idle setup so they can create their own session.
  const hadPriorSession =
    typeof window !== "undefined" &&
    (() => {
      try { return !!sessionStorage.getItem(SESSION_KEY); } catch { return false; }
    })();
  const joinToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("join")
      : null;
  const joinMatchesSession = !!joinToken && !!initial.starterId && joinToken === initial.starterId;
  if (typeof window !== "undefined" && !hadPriorSession && !joinMatchesSession) {
    initial = { hours: 0, minutes: 1, secs: 0, phase: "idle", endsAt: null, starterId: null };
  }
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

  const loadActivity = (): Activity[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(ACTIVITY_KEY);
      return raw ? (JSON.parse(raw) as Activity[]) : [];
    } catch { return []; }
  };
  const initialName = (() => {
    if (typeof window === "undefined") return "Guest";
    try {
      const n = sessionStorage.getItem(NAME_KEY);
      if (n) return n;
      const fresh = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
      sessionStorage.setItem(NAME_KEY, fresh);
      return fresh;
    } catch { return "Guest"; }
  })();
  const [displayName, setDisplayName] = useState<string>(initialName);
  const [activity, setActivity] = useState<Activity[]>(() => loadActivity());
  const loggedIndicesRef = useRef<Set<number>>(new Set());

  const saveDisplayName = (n: string) => {
    setDisplayName(n);
    try { sessionStorage.setItem(NAME_KEY, n); } catch {}
  };

  const logActivity = (label: string) => {
    const entry: Activity = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      name: displayName || "Guest",
      label,
      at: Date.now(),
    };
    try {
      const next = [entry, ...loadActivity()].slice(0, ACTIVITY_MAX);
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
      setActivity(next);
    } catch {}
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY) setActivity(loadActivity());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ----- Cloud sync -----
  // Skip applying our own outgoing writes when they echo back via realtime.
  const skipNextRemoteRef = useRef(false);
  const lastPushedRef = useRef<string>("");

  const applyRemote = (row: {
    contacts: Contact[] | null;
    activity: Activity[] | null;
    timer_hours: number | null;
    timer_minutes: number | null;
    timer_secs: number | null;
    phase: "idle" | "running" | "done" | string | null;
    ends_at: string | null;
  }) => {
    setContacts(Array.isArray(row.contacts) ? row.contacts : []);
    setActivity(Array.isArray(row.activity) ? row.activity : []);
    setHours(row.timer_hours ?? 0);
    setMinutes(row.timer_minutes ?? 1);
    setSecs(row.timer_secs ?? 0);
    const newPhase = (row.phase as "idle" | "running" | "done") ?? "idle";
    if (newPhase === "running" && row.ends_at) {
      const ts = new Date(row.ends_at).getTime();
      endsAtRef.current = ts;
      const r = Math.max(0, Math.ceil((ts - Date.now()) / 1000));
      setRemaining(r);
      if (r > 0) {
        setPhase("running");
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(tick, 1000);
      } else {
        setPhase("done");
      }
      persist({ phase: newPhase, endsAt: ts });
    } else {
      endsAtRef.current = null;
      setPhase(newPhase);
      setRemaining(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
      persist({ phase: newPhase, endsAt: null });
    }
  };

  // Subscribe to remote changes for the active session.
  useEffect(() => {
    if (!starterId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vcf_sessions")
        .select("*")
        .eq("starter_id", starterId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (skipNextRemoteRef.current) { skipNextRemoteRef.current = false; return; }
      applyRemote(data as never);
    })();
    const channel = supabase
      .channel(`vcf-session-${starterId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vcf_sessions", filter: `starter_id=eq.${starterId}` },
        (payload) => {
          if (!payload.new) return;
          if (skipNextRemoteRef.current) { skipNextRemoteRef.current = false; return; }
          applyRemote(payload.new as never);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starterId]);

  // Push local state to the cloud whenever the starter changes anything.
  useEffect(() => {
    if (!isStarter || !starterId) return;
    const payload = {
      starter_id: starterId,
      starter_name: displayName,
      contacts: contacts as unknown as never,
      activity: activity as unknown as never,
      timer_hours: hours,
      timer_minutes: minutes,
      timer_secs: secs,
      phase,
      ends_at: endsAtRef.current ? new Date(endsAtRef.current).toISOString() : null,
    };
    const fp = JSON.stringify(payload);
    if (fp === lastPushedRef.current) return;
    lastPushedRef.current = fp;
    skipNextRemoteRef.current = true;
    const t = setTimeout(() => {
      supabase
        .from("vcf_sessions")
        .upsert(payload, { onConflict: "starter_id" })
        .then(({ error }) => {
          if (error) console.error("vcf_sessions upsert failed", error);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [isStarter, starterId, contacts, activity, hours, minutes, secs, phase, displayName]);

  // Contributors (non-starter) push their contact additions remotely.
  const pushContributorContacts = async (next: Contact[]) => {
    if (!starterId || isStarter) return;
    const { error } = await supabase
      .from("vcf_sessions")
      .update({ contacts: next as unknown as never })
      .eq("starter_id", starterId);
    if (error) console.error("contributor contact push failed", error);
  };


  const normPhone = (v: string) => v.replace(/[^\d+]/g, "");
  const normEmail = (v: string) => v.trim().toLowerCase();
  const isValidPhone = (v: string) => {
    const n = normPhone(v);
    if (!n) return false;
    // optional leading +, then 7-15 digits (E.164-friendly)
    return /^\+?\d{7,15}$/.test(n);
  };
  const isValidEmail = (v: string) => {
    if (!v.trim()) return true; // email optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  };
  const isDuplicate = (key: "phone" | "email", value: string) => {
    if (!value.trim()) return false;
    const norm = key === "phone" ? normPhone : normEmail;
    const target = norm(value);
    if (!target) return false;
    return contacts.some((c) => norm(c[key]) === target);
  };

  const updateDraft = (key: keyof Contact, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const submitDraft = () => {
    if (phase === "done") {
      toast.error("Contacts are locked. The countdown has ended.");
      return;
    }
    if (contacts.length >= MAX_CONTACTS) {
      toast.error(`Contact limit reached (${MAX_CONTACTS} max).`);
      return;
    }
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    if (!firstName && !lastName) {
      toast.error("Enter a first or last name.");
      return;
    }
    if (!isValidPhone(draft.phone)) {
      toast.error("Enter a valid phone number (7–15 digits, optional +).");
      return;
    }
    if (!isValidEmail(draft.email)) {
      toast.error("Enter a valid email address or leave it blank.");
      return;
    }
    if (isDuplicate("phone", draft.phone)) {
      toast.error("That phone number is already saved.");
      return;
    }
    if (draft.email.trim() && isDuplicate("email", draft.email)) {
      toast.error("That email is already saved.");
      return;
    }
    const clean: Contact = {
      firstName,
      lastName,
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      org: draft.org.trim(),
      note: draft.note.trim(),
    };
    setContacts((p) => {
      const next = [...p, clean];
      if (next.length === MAX_CONTACTS) {
        toast.warning(`You've hit the ${MAX_CONTACTS}-contact limit.`);
      }
      return next;
    });
    setDraft({ ...empty });
    toast.success(`Saved ${`${firstName} ${lastName}`.trim()}`);
  };

  const removeAt = (i: number) =>
    setContacts((p) => p.filter((_, idx) => idx !== i));

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importCsv = async (file: File) => {
    if (phase === "done") {
      toast.error("Contacts are locked. The countdown has ended.");
      return;
    }
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
    setStarterId(sessionId);
    persist({ phase: "running", endsAt, hours, minutes, secs, starterId: sessionId });
    loggedIndicesRef.current = new Set();
    contacts.forEach((c, i) => {
      if ((c.firstName || c.lastName) && c.phone) loggedIndicesRef.current.add(i);
    });
    try { localStorage.removeItem(ACTIVITY_KEY); } catch {}
    setActivity([]);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 1000);
  };

  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    endsAtRef.current = null;
    setPhase("idle");
    setRemaining(0);
    setStarterId(null);
    persist({ phase: "idle", endsAt: null, starterId: null });
  };

  const startNewSession = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    endsAtRef.current = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
    } catch {}
    setContacts([]);
    setDraft({ ...empty });
    setActivity([]);
    setStarterId(null);
    setPhase("idle");
    setRemaining(0);
    setHours(0);
    setMinutes(1);
    setSecs(0);
    toast.success("Fresh session ready. Set your countdown to begin.");
  };

  const clearTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    endsAtRef.current = null;
    setPhase("idle");
    setRemaining(0);
    setHours(0);
    setMinutes(0);
    setSecs(0);
    setStarterId(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    toast.success("Timer cleared. Download is locked again.");
  };

  const copySessionLink = async () => {
    if (!isStarter || !starterId) return;
    try {
      const url = `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(starterId)}`;
      await navigator.clipboard.writeText(url);
      toast.success("Session link copied. Share it to invite contributors.");
    } catch {
      toast.error("Couldn't copy the link. Please try again.");
    }
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const download = () => {
    if (phase !== "done") {
      toast.error("Download unlocks when the countdown finishes.");
      return;
    }
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
              disabled={contacts.length >= MAX_CONTACTS || phase === "done"}
              title={phase === "done" ? "Locked: countdown has ended" : undefined}
            >
              {phase === "done" ? <Lock className="size-4" /> : <Upload className="size-4" />} Import CSV
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
        <div className="rounded-2xl border border-border/60 bg-background/30 p-5 md:p-6 relative">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm uppercase tracking-widest text-muted-foreground">
              Add a contact
            </span>
            {phase === "done" && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <Lock className="size-3" /> Locked
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>First name</Label>
              <Input value={draft.firstName} onChange={(e) => updateDraft("firstName", e.target.value)} className="mt-2 bg-background/40" placeholder="Ayomikun" disabled={phase === "done"} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={draft.lastName} onChange={(e) => updateDraft("lastName", e.target.value)} className="mt-2 bg-background/40" placeholder="TV" disabled={phase === "done"} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={draft.phone}
                onChange={(e) => updateDraft("phone", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitDraft(); } }}
                inputMode="tel"
                className="mt-2 bg-background/40"
                placeholder="+234 800 000 0000"
                disabled={phase === "done"}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={draft.email} onChange={(e) => updateDraft("email", e.target.value)} className="mt-2 bg-background/40" placeholder="hello@example.com" disabled={phase === "done"} />
            </div>
            <div>
              <Label>Organization</Label>
              <Input value={draft.org} onChange={(e) => updateDraft("org", e.target.value)} className="mt-2 bg-background/40" placeholder="Ayomikun TV Media" disabled={phase === "done"} />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea value={draft.note} onChange={(e) => updateDraft("note", e.target.value)} className="mt-2 bg-background/40 min-h-[42px]" placeholder="Booster member" disabled={phase === "done"} />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              onClick={submitDraft}
              disabled={phase === "done" || contacts.length >= MAX_CONTACTS}
              className="h-11 gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground"
            >
              <UserPlus className="size-4" /> Save contact
            </Button>
          </div>
        </div>

        {contacts.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-background/20 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm uppercase tracking-widest text-muted-foreground">
                Saved contacts ({contacts.length})
              </span>
            </div>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {contacts.map((c, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg bg-background/40 px-3 py-2 text-sm">
                  <span className="font-medium text-foreground truncate">
                    {`${c.firstName} ${c.lastName}`.trim() || "Unnamed"}
                  </span>
                  <span className="text-muted-foreground tabular-nums truncate">{c.phone}</span>
                  {c.email && <span className="text-muted-foreground/80 truncate hidden sm:inline">{c.email}</span>}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAt(i)}
                    disabled={phase === "done"}
                    className="ml-auto text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
            <p className="text-xs text-accent flex items-center gap-2">
              <UserPlus className="size-3" /> Anyone can keep adding contacts while the countdown runs.
            </p>
            {isStarter && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={copySessionLink} variant="outline" size="sm" className="gap-2">
                  <Link2 className="size-4" /> Copy session link
                </Button>
                <Button onClick={resetTimer} variant="ghost" size="sm" className="gap-2">
                  <RotateCcw className="size-4" /> Cancel
                </Button>
              </div>
            )}
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
            {isStarter ? (
              <Button onClick={resetTimer} variant="ghost" size="sm" className="gap-2">
                <RotateCcw className="size-4" /> Restart timer
              </Button>
            ) : (
              <Button onClick={startNewSession} variant="outline" size="sm" className="gap-2">
                <Sparkles className="size-4" /> Start new session
              </Button>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-accent" />
              Works on iPhone, Android & desktop contacts.
            </div>
          </div>
        )}

        {isStarter && phase !== "idle" && (
          <div className="mt-4 pt-4 border-t border-border/50 flex justify-end">
            <Button onClick={clearTimer} variant="outline" size="sm" className="gap-2">
              <Trash2 className="size-4" /> Clear timer & relock
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
