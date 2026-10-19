"use client";

const css = `
@keyframes lm-gradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes lm-float{0%,100%{transform:translateY(0) rotate(var(--r,0deg))}50%{transform:translateY(-14px) rotate(var(--r,0deg))}}
@keyframes lm-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes lm-blob{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,-50px) scale(1.12)}66%{transform:translate(-30px,30px) scale(.92)}}
@keyframes lm-draw{from{stroke-dashoffset:113}to{stroke-dashoffset:6}}
@keyframes lm-ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.4);opacity:0}}
.lm-gradient{background-size:220% 220%;animation:lm-gradient 14s ease infinite}
.lm-float{animation:lm-float 6.5s ease-in-out infinite}
.lm-blob{animation:lm-blob 20s ease-in-out infinite}
.lm-draw{animation:lm-draw 1.8s .8s cubic-bezier(.2,.8,.2,1) both}
.lm-ping{animation:lm-ping 1.8s ease-out infinite}
.lm-rise{opacity:0;animation:lm-rise .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(var(--i,0)*80ms + 120ms)}
@media (prefers-reduced-motion:reduce){.lm-gradient,.lm-float,.lm-blob,.lm-draw,.lm-ping{animation:none}.lm-rise{animation:none;opacity:1}}
`;

const glass = "rounded-2xl border border-white/25 bg-white/15 shadow-xl shadow-black/10 backdrop-blur-md";
const rot = (deg: number, delay = 0) => ({ "--r": `${deg}deg`, animationDelay: `${delay}s` }) as React.CSSProperties;

export default function AuthShell({
  title,
  subtitle,
  tagline,
  children,
}: {
  title: string;
  subtitle: string;
  tagline: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate py-6">
      <style>{css}</style>

      {/* ánh sáng nền trôi chậm phía sau khung */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="lm-blob absolute left-[8%] top-16 h-80 w-80 rounded-full bg-indigo-400/40 blur-3xl dark:bg-indigo-500/25" />
        <div className="lm-blob absolute right-[6%] top-32 h-96 w-96 rounded-full bg-fuchsia-400/35 blur-3xl [animation-delay:-7s] dark:bg-fuchsia-500/20" />
        <div className="lm-blob absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-cyan-300/40 blur-3xl [animation-delay:-13s] dark:bg-cyan-500/15" />
      </div>

      <div className="lm-rise relative mx-auto grid min-h-[660px] max-w-5xl overflow-hidden rounded-[2rem] border border-white/50 bg-white/60 shadow-2xl shadow-indigo-500/25 backdrop-blur-xl md:grid-cols-[1.1fr_1fr] dark:border-white/10 dark:bg-neutral-900/50">
        {/* ===== Bên trái: showcase ===== */}
        <aside className="lm-gradient relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-10 text-white md:flex">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,.22) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              maskImage: "linear-gradient(to bottom, black, transparent 85%)",
            }}
          />
          <div className="lm-blob absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
          <div className="lm-blob absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl [animation-delay:-9s]" />

          <div className="relative space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="lm-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              LUMER · Thi trực tuyến
            </span>
            <h2 className="text-balance text-4xl font-extrabold leading-[1.15] tracking-tight">{tagline}</h2>
            <p className="max-w-xs text-sm text-white/80">
              Chấm điểm tự động, đếm ngược theo thời gian thực, có kết quả ngay khi nộp bài.
            </p>
          </div>

          {/* các thẻ mô phỏng bài thi trôi lơ lửng */}
          <div className="relative mt-8 h-80">
            <div className={`lm-float absolute left-0 top-10 w-[82%] p-4 ${glass}`} style={rot(-3)}>
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>Câu 3 · 2 điểm</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5">Trắc nghiệm</span>
              </div>
              <p className="mt-2 text-sm font-semibold">Giao thức nào dùng để duyệt web?</p>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="rounded-lg bg-white/10 px-3 py-1.5">A. FTP</div>
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 font-semibold text-indigo-700">
                  <span>B. HTTP</span>
                  <span>✓</span>
                </div>
                <div className="rounded-lg bg-white/10 px-3 py-1.5">C. SMTP</div>
              </div>
            </div>

            <div className={`lm-float absolute right-0 top-0 flex items-center gap-2 px-3.5 py-2 text-sm font-mono font-semibold ${glass}`} style={rot(5, -1.5)}>
              <span className="h-2 w-2 rounded-full bg-rose-300" />
              28:45
            </div>

            <div className={`lm-float absolute bottom-0 right-0 flex items-center gap-3 p-3.5 ${glass}`} style={rot(3, -3)}>
              <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="4" />
                <circle cx="22" cy="22" r="18" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="6" className="lm-draw" />
              </svg>
              <div className="leading-tight">
                <p className="text-xs text-white/70">Kết quả</p>
                <p className="text-xl font-extrabold">9.5<span className="text-sm font-medium text-white/70">/10</span></p>
              </div>
            </div>

            <div className={`lm-float absolute bottom-6 left-3 px-3 py-1.5 text-xs font-medium ${glass}`} style={rot(-5, -4.5)}>
              ✓ Đã nộp bài
            </div>
          </div>
        </aside>

        {/* ===== Bên phải: form ===== */}
        <section className="flex flex-col justify-center p-8 sm:p-12">
          <div className="lm-rise mb-7" style={{ "--i": 0 } as React.CSSProperties}>
            <h1 className="bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              {title}
            </h1>
            <p className="mt-1.5 text-sm opacity-70">{subtitle}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}