import { useRef } from "react";
import type { CSSProperties } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function BrandHero({
  morning,
  evening,
  reminderEnabled,
  busy,
  onReport,
  onSettings,
  onIntroduce,
}: {
  morning: string;
  evening: string;
  reminderEnabled: boolean;
  busy: boolean;
  onReport: () => void;
  onSettings: () => void;
  onIntroduce: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({
      motion: "(prefers-reduced-motion: no-preference)",
      desktop: "(min-width: 1100px) and (min-height: 760px)",
      pointer: "(hover: hover) and (pointer: fine)",
    }, (context) => {
      if (!context.conditions?.motion) return;
      const sculpture = root.current?.querySelector<HTMLElement>(".sculpture-parallax");
      if (!sculpture || !root.current) return;
      gsap.from(".hero-copy > *", {
        opacity: 0, y: 22, duration: 0.8, stagger: 0.09, ease: "power3.out",
      });
      if (context.conditions.desktop) {
        ScrollTrigger.create({
          trigger: root.current, pin: true, start: "top 100px", end: "+=100",
          invalidateOnRefresh: true,
        });
      }
      gsap.timeline({
        scrollTrigger: {
          trigger: root.current, start: "top 80%", end: "bottom top", scrub: 0.6,
        },
      })
        .fromTo(".sculpture-scroll", { scale: 0.82, opacity: 0.55 }, { scale: 1, opacity: 1, ease: "none" })
        .to(".sculpture-scroll", { scale: 1.06, opacity: 0.3, ease: "none" });
      gsap.to(".sculpture-float", {
        y: -14, rotation: 5, duration: 4.5, yoyo: true, repeat: -1, ease: "sine.inOut",
        scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", toggleActions: "play pause play pause" },
      });
      gsap.to(".sculpture-pearl", {
        y: -10, duration: 3, stagger: 0.35, yoyo: true, repeat: -1, ease: "sine.inOut",
        scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", toggleActions: "play pause play pause" },
      });
      const tiltX = gsap.quickTo(sculpture, "rotationX", { duration: 0.8, ease: "power3.out" });
      const tiltY = gsap.quickTo(sculpture, "rotationY", { duration: 0.8, ease: "power3.out" });
      const target = root.current;
      const move = (event: PointerEvent) => {
        const box = target.getBoundingClientRect();
        tiltX(-((event.clientY - box.top) / box.height - 0.5) * 16);
        tiltY(((event.clientX - box.left) / box.width - 0.5) * 22);
      };
      const reset = () => { tiltX(0); tiltY(0); };
      if (context.conditions.pointer) {
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerleave", reset);
      }
      const loops = ScrollTrigger.getAll().filter((trigger) => trigger.trigger === target && trigger.animation?.repeat() === -1);
      const visibility = () => {
        for (const trigger of loops) {
          if (document.hidden) trigger.animation?.pause();
          else if (trigger.isActive) trigger.animation?.play();
        }
      };
      document.addEventListener("visibilitychange", visibility);
      return () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerleave", reset);
        document.removeEventListener("visibilitychange", visibility);
      };
    });
    return () => media.revert();
  }, { scope: root });

  return (
    <section className="aura-hero" ref={root} aria-labelledby="aura-title">
      <div className="hero-copy">
        <p className="hero-signature">Xinh gái. Có khí chất.</p>
        <h2 id="aura-title">
          Đẹp <img className="inline-rose" src="/rose-study.svg" alt="" /> không cần cố gắng,
          <em>khí chất mới là thứ vĩnh hằng.</em>
        </h2>
        <p className="hero-description">Một không gian thật xinh cho những ngày đầy cảm hứng. Việc cần nhớ, lời cần đáp — cứ để BA Desk ở bên.</p>
        <div className="hero-actions">
          <button className="button primary" onClick={onReport} disabled={busy}>Bản tin của mình</button>
          <button className="hero-text-button" onClick={onIntroduce}>Khám phá khí chất BA <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="sculpture-scroll">
          <div className="sculpture-parallax">
            <div className="sculpture-float">
              <div className="rose-halo" />
              <div className="rose-sculpture">
                {Array.from({ length: 7 }, (_, index) => (
                  <span className="rose-petal" key={index} style={{ "--petal-angle": `${index * (360 / 7)}deg` } as CSSProperties} />
                ))}
                <span className="rose-heart" />
              </div>
              <span className="sculpture-pearl pearl-one" />
              <span className="sculpture-pearl pearl-two" />
              <span className="sculpture-pearl pearl-three" />
              <span className="sculpture-orbit" />
            </div>
          </div>
        </div>
        <span className="art-caption">a little pink. a lot of presence.</span>
      </div>
      <div className="hero-reminder">
        <span>{reminderEnabled ? "Nhịp của bạn" : "Nhắc việc đang tạm dừng"}</span>
        <p><strong>{morning}</strong> Bắt đầu ngày mới <span aria-hidden="true">/</span> <strong>{evening}</strong> Khép lại thật êm</p>
        <button onClick={onSettings}>Điều chỉnh</button>
      </div>
      <div className="aura-marquee" aria-hidden="true">
        <div>{[0, 1].map((copy) => <span key={copy}>Đẹp theo cách của mình <i /> Tự tin trong từng khoảnh khắc <i /> Khí chất là vĩnh hằng <i /></span>)}</div>
      </div>
    </section>
  );
}
