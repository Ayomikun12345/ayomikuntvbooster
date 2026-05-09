import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Download, UserPlus, Trash2, Sparkles, Timer, Play, RotateCcw, Lock } from "lucide-react";
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

  const update = (i: number, key: keyof Contact, value: string) => {
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
  };

  const add = () => setContacts((p) => [...p, { ...empty }]);
  const remove = (i: number) =>
    setContacts((p) => (p.length === 1 ? [{ ...empty }] : p.filter((_, idx) => idx !== i)));

  const download = () => {
    const valid = contacts.filter((c) => (c.firstName || c.lastName) && c.phone);
    if (!valid.length) {
      toast.error("Add at least one contact with a name and phone number.");
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
        <Button onClick={add} variant="secondary" className="h-12 gap-2">
          <UserPlus className="size-4" /> Add contact
        </Button>
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

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Button onClick={download} size="lg" className="h-14 px-8 text-base font-semibold gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground glow hover:opacity-95">
          <Download className="size-5" /> Download .VCF file
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-accent" />
          Works on iPhone, Android & desktop contacts.
        </div>
      </div>
    </div>
  );
}
