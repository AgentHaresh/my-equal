"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const W = 1280;
const H = 720;

function Dots() {
  return (
    <span className="grid grid-cols-2 gap-[5px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-[11px] w-[11px] rounded-full bg-equal-lime" />
      ))}
    </span>
  );
}

function Slide({ n, kicker, children }: { n: number; kicker: string; children: ReactNode }) {
  return (
    <section className="frame">
      <div className="slide relative flex flex-col overflow-hidden px-[72px] pb-[56px] pt-[52px] text-white">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-3">
            <Dots />
            <span className="text-[26px] font-semibold tracking-tight">Equal</span>
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/75">{kicker}</span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
        <footer className="flex items-center justify-between text-[13px] uppercase tracking-[0.22em] text-white/60">
          <span>Builders 2026 · Build Creative</span>
          <span>0{n}</span>
        </footer>
      </div>
    </section>
  );
}

const h1 = "font-display text-[62px] leading-[1.04] text-equal-lime";
const card = "rounded-[28px] border border-white/15 bg-white/[0.06] p-7";
const tag = "text-[13px] font-semibold uppercase tracking-[0.2em] text-equal-lime";

export default function Slides() {
  const [k, setK] = useState(1);
  const root = useRef<HTMLDivElement>(null);

  // Scale each 1280x720 slide to fit the window; arrow keys and space move between slides.
  useEffect(() => {
    const fit = () => setK(Math.min(window.innerWidth / W, window.innerHeight / H));
    const first = setTimeout(fit, 0);
    window.addEventListener("resize", fit);
    const key = (e: KeyboardEvent) => {
      const dir = ["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key) ? -1 : 0;
      if (!dir || !root.current) return;
      e.preventDefault();
      root.current.scrollBy({ top: dir * window.innerHeight, behavior: "smooth" });
    };
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(first);
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <div ref={root} className="deck" style={{ ["--k" as string]: k }}>
      <style>{`
        .deck { height: 100dvh; overflow-y: auto; scroll-snap-type: y mandatory; background: #03050d; }
        .frame { height: 100dvh; width: 100vw; display: flex; align-items: center; justify-content: center; scroll-snap-align: start; overflow: hidden; }
        .slide { width: ${W}px; height: ${H}px; flex: none; transform: scale(var(--k)); background: radial-gradient(760px 520px at 78% 30%, rgba(47,123,255,0.30), transparent 62%), radial-gradient(520px 380px at 8% 96%, rgba(206,248,44,0.09), transparent 60%), #050816; }
        @page { size: ${W}px ${H}px; margin: 0; }
        @media print {
          html, body { background: #050816 !important; }
          .deck { height: auto; overflow: visible; }
          .frame { height: ${H}px; width: ${W}px; break-after: page; }
          .slide { transform: none; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <Slide n={1} kicker="The problem">
        <h1 className={h1}>I can&apos;t keep up with my own life.</h1>
        <p className="mt-5 max-w-[900px] text-[25px] leading-snug text-white/95">
          Everything I need to remember passes through my messages. What broke, who is waiting on me, what I promised. Then it scrolls away, and my
          messaging app does nothing with it.
        </p>
        <div className="mt-9 grid grid-cols-3 gap-5">
          <div className={card}>
            <div className="font-display text-[46px] leading-none text-equal-lime">15 bn hrs</div>
            <div className="mt-2 text-[18px] leading-snug text-white/90">Indians spent on hold in 2024, by one estimate. I make the tedious calls myself.</div>
          </div>
          <div className={card}>
            <div className="font-display text-[46px] leading-none text-equal-lime">1.2 lakh</div>
            <div className="mt-2 text-[18px] leading-snug text-white/90">&ldquo;digital arrest&rdquo; cases in 2024, about ₹1,900 crore lost. My parents face scams alone.</div>
          </div>
          <div className={card}>
            <div className="font-display text-[46px] leading-none text-equal-lime">22 days</div>
            <div className="mt-2 text-[18px] leading-snug text-white/90">since I last spoke to my brother. I never noticed. Nothing told me.</div>
          </div>
        </div>
      </Slide>

      <Slide n={2} kicker="What I built">
        <h1 className={`${h1} !text-[54px]`}>A second me, inside my messenger.</h1>
        <p className="mt-3 max-w-[980px] text-[22px] leading-snug text-white/95">
          One job: make sure I never miss anything, never forget anything, and never lose touch with anyone.
        </p>
        <div className="mt-6 grid grid-cols-4 gap-4">
          {[
            ["Remembers", "Plans, promises and worries from my chats, photos and voice notes. Ask what it knows about anyone."],
            ["Reminds, calls me", "Tap a message: Remind me. It works out the time and rings me ahead of it."],
            ["Keeps me close", "Learns who each person is to me and how often we talk. Tells me when that breaks."],
            ["Acts, and guards", "Phones three mechanics, compares, books when I approve. Flags scams aimed at my father."],
          ].map(([t, d]) => (
            <div key={t} className={`${card} !p-6`}>
              <div className="font-display text-[27px] leading-tight text-equal-lime">{t}</div>
              <div className="mt-2 text-[17px] leading-snug text-white/90">{d}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-[1100px] text-[16px] leading-snug text-white/75">
          And a full messenger around it: phone sign-in, voice and video calls, photos and files, reply, edit, delete, reactions, forward, send later,
          search, read receipts, notifications. It installs as an app.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <span className="rounded-full bg-equal-lime px-5 py-2 text-[18px] font-bold text-equal-ink">Live demo</span>
          <span className="text-[18px] text-white/90">54-213-236-215.sslip.io · sign in with your phone number and try it now</span>
        </div>
      </Slide>

      <Slide n={3} kicker="How it works">
        <h1 className={h1}>
          The model interprets.
          <br />
          Code decides. I approve.
        </h1>
        <div className="mt-8 flex items-stretch gap-3">
          {[
            ["A message arrives", "Typed, spoken as a voice note, or a photo."],
            ["Equal reads it", "What to remember. Whether to speak, or stay quiet, and why."],
            ["I say yes", "A private note only I can see. Nothing happens without my tap."],
            ["It makes the calls", "Says it is an AI. Speech in and out, in English, Hindi or Telugu."],
            ["Code compares", "Plain rules pick the best quote. I tap Book."],
          ].map(([t, d], i) => (
            <div key={t} className={`${card} flex-1 !p-5`}>
              <div className={tag}>Step {i + 1}</div>
              <div className="mt-1 text-[21px] font-semibold leading-tight">{t}</div>
              <div className="mt-2 text-[16px] leading-snug text-white/85">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4 text-[17px] leading-snug">
          <div>
            <div className={tag}>AI-native</div>
            <div className="mt-1 text-white/90">OpenAI for reading messages, vision, speech to text and text to speech. One assistant per person.</div>
          </div>
          <div>
            <div className={tag}>Private by design</div>
            <div className="mt-1 text-white/90">Each person has their own space. The model never sees a whole history: 12 recent messages and 40 ranked facts. I can make it forget anything.</div>
          </div>
          <div>
            <div className={tag}>Built this weekend</div>
            <div className="mt-1 text-white/90">Next.js on AWS. Fifteen end-to-end test suites pass on the live site. A message reaches the other screen in about 0.3 seconds.</div>
          </div>
        </div>
      </Slide>

      <Slide n={4} kicker="Does it work">
        <h1 className={h1}>
          It knows when to speak,
          <br />
          and when to stay quiet.
        </h1>
        <div className="mt-7 grid grid-cols-4 gap-4">
          {[
            ["20/20", "offered help when it should"],
            ["20/20", "stayed quiet when it should"],
            ["10/10", "scam messages caught"],
            ["10/10", "genuine messages left alone"],
          ].map(([n, d]) => (
            <div key={d} className={card}>
              <div className="font-display text-[56px] leading-none text-equal-lime">{n}</div>
              <div className="mt-2 text-[18px] leading-snug text-white/90">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-5 text-[18px] leading-snug">
          <div className={`${card} !bg-white/10`}>
            <div className={tag}>Read this honestly</div>
            <div className="mt-1 text-white/95">
              Sixty messages in English, Hindi and Telugu, written by me, and clear-cut. A perfect score says the set is easy. Every miss would be listed
              at /scoreboard.
            </div>
          </div>
          <div className={`${card} !bg-white/10`}>
            <div className={tag}>What is simulated</div>
            <div className="mt-1 text-white/95">
              The mechanics and the unknown caller are people on a link, not phone lines. My father&apos;s phone is a simple view. Messages are not yet
              end-to-end encrypted. The rest is real.
            </div>
          </div>
        </div>
      </Slide>

      <Slide n={5} kicker="What's next">
        <h1 className={h1}>Your AI messenger will be your AI assistant.</h1>
        <p className="mt-4 max-w-[1000px] text-[23px] leading-snug text-white/95">
          Equal answers calls today. Personal AI messaging is next. This is a working version of it, built in a weekend.
        </p>
        <div className="mt-8 grid grid-cols-3 gap-5">
          {[
            ["Real phone lines", "The same call-around and call screening, on actual numbers, with Equal's existing call stack."],
            ["Private at scale", "End-to-end encryption with the reading done on the phone, a real database in India, and groups."],
            ["Family guardian", "A child protects a parent's phone from scam calls and messages. The child is the paying user."],
          ].map(([t, d]) => (
            <div key={t} className={card}>
              <div className="font-display text-[27px] leading-tight text-equal-lime">{t}</div>
              <div className="mt-2 text-[18px] leading-snug text-white/90">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 text-[22px] font-semibold text-white">Never miss. Never forget. Never lose touch.</div>
      </Slide>
    </div>
  );
}
