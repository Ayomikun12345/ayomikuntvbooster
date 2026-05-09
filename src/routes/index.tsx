import { createFileRoute } from "@tanstack/react-router";
import { VcfBuilder } from "@/components/VcfBuilder";
import { Toaster } from "@/components/ui/sonner";
import { Radio, Users, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Ayomikun TV Media Booster — VCF Contact Builder" },
      { name: "description", content: "Create and download VCF contact files instantly with Ayomikun TV Media Booster. Modern 3D web app for boosting your media network." },
    ],
  }),
});

function Floating3D() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 -left-24 size-[420px] rounded-full bg-primary/30 blur-3xl floaty-slow" />
      <div className="absolute top-1/3 -right-32 size-[480px] rounded-full bg-accent/30 blur-3xl floaty" />
      <div className="absolute bottom-0 left-1/3 size-[360px] rounded-full bg-neon/20 blur-3xl floaty-slow" />

      <div className="absolute top-24 right-[10%] size-40 rounded-3xl bg-gradient-to-br from-primary to-accent opacity-80 floaty rotate-12 shadow-[0_30px_80px_-20px_oklch(0.72_0.22_320/0.6)]" />
      <div className="absolute bottom-24 left-[6%] size-28 rounded-2xl bg-gradient-to-br from-accent to-neon opacity-80 floaty-slow -rotate-12" />
      <div className="absolute top-1/2 left-[45%] size-24 rounded-full border-2 border-accent/60 spin-slow" />

      <div className="absolute inset-0 grid-bg" />
    </div>
  );
}

function Index() {
  return (
    <div className="relative min-h-screen">
      <Floating3D />
      <Toaster theme="dark" position="top-center" />

      <header className="relative z-10 px-6 md:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center glow">
            <Radio className="size-5 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Ayomikun TV</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#builder" className="hover:text-foreground transition-colors">Builder</a>
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
        </div>
      </header>

      <main className="relative z-10">
        <section className="px-6 md:px-10 pt-12 md:pt-20 pb-12 max-w-6xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">
            <Zap className="size-3 text-accent" /> Media Booster · v1
          </span>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95]">
            <span className="text-gradient">Ayomikun TV</span>
            <br />
            <span className="text-foreground">Media Booster</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            Build a downloadable <span className="text-foreground font-semibold">.VCF contact file</span> in seconds.
            Share it with your audience and boost your reach across every device.
          </p>
        </section>

        <section id="builder" className="px-6 md:px-10 pb-20 max-w-5xl mx-auto">
          <VcfBuilder />
        </section>

        <section id="features" className="px-6 md:px-10 pb-28 max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            { icon: Users, title: "Unlimited contacts", desc: "Add as many contacts as you need into one VCF file." },
            { icon: Zap, title: "Instant export", desc: "Generate a clean vCard 3.0 file ready for any phone." },
            { icon: Radio, title: "Boost your media", desc: "Grow your Ayomikun TV community with one tap saves." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl p-6">
              <div className="size-11 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center mb-4">
                <Icon className="size-5 text-primary-foreground" />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{desc}</p>
            </div>
          ))}
        </section>

        <footer className="relative z-10 border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Ayomikun TV Media Booster. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
