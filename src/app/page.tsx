import Link from "next/link";

const steps = [
  { n: "1", title: "Add your website", text: "Tadaa reads it and learns your brand: what you sell, how you talk, your colours and logo." },
  { n: "2", title: "Upload a photo or clip", text: "Shot on your phone in a minute. Or skip it – Tadaa can work from your brand alone." },
  { n: "3", title: "Get a finished Reel", text: "Hook, on-screen text, caption and hashtags, in your brand. Ask for changes in plain words." },
  { n: "4", title: "Approve and post", text: "Nothing goes out without your OK. Download the video and post it in seconds." },
];

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="inline-block rounded-full bg-sun/20 text-ink px-3 py-1 text-xs font-bold uppercase tracking-wider mb-5">
            Reels for busy businesses
          </p>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.02]">
            Snap a photo.
            <br />
            Get an on-brand Reel.
            <br />
            <span className="text-coral">Tadaa!</span>
          </h1>
          <p className="mt-6 text-lg text-ink/70 max-w-md">
            Tadaa turns your photos into scroll-stopping Reels in your brand&apos;s look and voice – in English, Swedish, Spanish, German or French.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary text-base px-7 py-3">
              Make my first Reel – free
            </Link>
            <Link href="/login" className="btn-ghost text-base px-7 py-3">
              Log in
            </Link>
          </div>
        </div>
        <div className="relative mx-auto">
          <div className="w-[260px] aspect-[9/16] rounded-[32px] bg-gradient-to-b from-coral to-sun p-6 flex flex-col justify-between shadow-2xl rotate-2">
            <span className="self-start rounded-lg bg-white/90 px-3 py-1 text-xs font-black tracking-widest">AFTER</span>
            <p className="text-white font-black text-3xl leading-tight drop-shadow">Wait for the after 👀</p>
            <p className="text-white/90 text-sm font-semibold">Your café · Book today</p>
          </div>
          <div className="absolute -left-16 top-16 w-[180px] aspect-[9/16] rounded-[26px] bg-ink p-5 flex flex-col justify-end shadow-xl -rotate-6">
            <p className="text-white font-black text-xl leading-tight">3 things our customers always ask</p>
          </div>
        </div>
      </section>

      <section className="bg-white border-y border-black/5">
        <div className="mx-auto max-w-6xl px-4 py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.n}>
              <div className="h-9 w-9 rounded-full bg-coral text-white grid place-items-center font-black">{s.n}</div>
              <h3 className="mt-4 font-bold text-lg">{s.title}</h3>
              <p className="mt-1.5 text-sm text-ink/65">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
