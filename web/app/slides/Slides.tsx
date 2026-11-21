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
          <span>My Equal · built at Equal AI&apos;s Builders 2026</span>
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

      <Slide n={1} kicker="The world we live in">
        <h1 className={h1}>
          More connected than ever.
          <br />
          And still losing touch.
        </h1>
        <p className="mt-5 max-w-[960px] text-[25px] leading-snug text-white/95">
          Everyone has so much on their plate that friends and family slip out of reach, a little more each week. And with every tool to stay in
          touch, we still forget what we promised and what we are responsible for.
        </p>
        <div className="mt-9 grid grid-cols-3 gap-5">
          <div className={card}>
            <div className="font-display text-[34px] leading-none text-equal-lime">People drift</div>
            <div className="mt-3 text-[18px] leading-snug text-white/90">Nobody decides to lose touch. Weeks pass, and the distance grows until it feels hard to cross.</div>
          </div>
          <div className={card}>
            <div className="font-display text-[34px] leading-none text-equal-lime">Promises slip</div>
            <div className="mt-3 text-[18px] leading-snug text-white/90">&ldquo;I&apos;ll send it by Friday.&rdquo; &ldquo;I&apos;ll come on Monday.&rdquo; It is all in our chats, and then it scrolls away.</div>
          </div>
          <div className={card}>
            <div className="font-display text-[34px] leading-none text-equal-lime">Chores pile up</div>
            <div className="mt-3 text-[18px] leading-snug text-white/90">The mechanic, the doctor, the pharmacy. Indians spent an estimated 15 billion hours on hold in 2024.</div>
          </div>
        </div>
      </Slide>

      <Slide n={2} kicker="What I built">
        <h1 className={`${h1} !text-[54px]`}>My Equal makes sure that never happens.</h1>
        <p className="mt-3 max-w-[1040px] text-[22px] leading-snug text-white/95">
          It lives in my messenger and keeps me equal to my own life: every person, every promise, every responsibility.
        </p>
        <div className="mt-6 grid grid-cols-4 gap-4">
          {[
            ["Keeps my people close", "Knows who each person is to me and how close I want them. It works that out itself, and gladly takes more when I tell it."],
            ["Keeps every promise", "Plans and promises in my chats become reminders. It rings me ahead of a flight or a meeting."],
            ["Does the work for me", "It spots a responsibility and asks first: call a mechanic, book the doctor, ring the pharmacy. It acts when I say yes."],
            ["Looks out for family", "Flags scam messages and calls aimed at my parents, and tells me straight away."],
          ].map(([t, d]) => (
            <div key={t} className={`${card} !p-6`}>
              <div className="font-display text-[26px] leading-tight text-equal-lime">{t}</div>
              <div className="mt-2 text-[16.5px] leading-snug text-white/90">{d}</div>
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
