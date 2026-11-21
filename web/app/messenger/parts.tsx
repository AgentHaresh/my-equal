// Two small pieces drawn in many places on the messenger screen:
// the Equal wordmark, and the round avatar that stands for a person.

/** The four-dot mark and wordmark, drawn in text so no logo file is needed. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid grid-cols-2 gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[7px] w-[7px] rounded-full bg-equal-lime" />
        ))}
      </span>
      <span className="text-xl font-semibold tracking-tight text-white">Equal</span>
    </span>
  );
}

export function Avatar({ name, picture, tone }: { name: string; picture?: string; tone?: string }) {
  if (picture)
    // A small profile photo served by Google; the image optimiser adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold ${tone ?? "bg-equal-lime text-equal-ink"}`}>{name[0]?.toUpperCase()}</span>
  );
}
