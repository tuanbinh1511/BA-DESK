import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function IntroduceMuse() {
  const host = useRef<HTMLDivElement>(null);
  const poster = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const [atlas, setAtlas] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (reduced) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => setAtlas(image);
    image.src = "/ba-muse-anime-gesture.webp";
    return () => {
      image.onload = null;
    };
  }, [reduced]);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          desktop: "(min-width: 1000px) and (min-height: 650px)",
        },
        (context) => {
          if (!context.conditions?.motion) return;
          const element = host.current;
          if (!element) return;
          const surface = canvas.current;
          const drawing = surface?.getContext("2d");
          const hero = ScrollTrigger.getById("intro-hero-scroll");
          if (atlas && surface && drawing && hero) {
            // shortcut: 16 rendered poses; use a rigged model if free camera movement is needed.
            const width = atlas.naturalWidth / 4;
            const height = atlas.naturalHeight / 4;
            surface.width = width;
            surface.height = height;
            const pose = { frame: 0 };
            let previous = -1;
            const draw = () => {
              const frame = Math.round(pose.frame);
              if (frame === previous) return;
              drawing.clearRect(0, 0, width, height);
              drawing.drawImage(
                atlas,
                (frame % 4) * width,
                Math.floor(frame / 4) * height,
                width,
                height,
                0,
                0,
                width,
                height,
              );
              previous = frame;
            };
            draw();
            gsap.set(surface, { autoAlpha: 1 });
            gsap.set(poster.current, { autoAlpha: 0 });
            gsap.fromTo(
              pose,
              { frame: 0 },
              {
                frame: 15,
                ease: "none",
                snap: "frame",
                onUpdate: draw,
                scrollTrigger: {
                  trigger: hero.trigger,
                  start: () =>
                    ScrollTrigger.getById("intro-hero-scroll")?.start ?? 0,
                  end: () => {
                    const current = ScrollTrigger.getById("intro-hero-scroll");
                    return context.conditions?.desktop
                      ? (current?.end ?? 650)
                      : (current?.start ?? 0) + 420;
                  },
                  scrub: 0.45,
                  refreshPriority: -1,
                  invalidateOnRefresh: true,
                },
              },
            );
          }
          const rotateX = gsap.quickTo(element, "rotationX", {
            duration: 1,
            ease: "power3.out",
          });
          const rotateY = gsap.quickTo(element, "rotationY", {
            duration: 1,
            ease: "power3.out",
          });
          const move = (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            const box = element.getBoundingClientRect();
            rotateY(((event.clientX - box.left) / box.width - 0.5) * 8);
            rotateX(((event.clientY - box.top) / box.height - 0.5) * -5);
          };
          const leave = () => {
            rotateX(0);
            rotateY(0);
          };
          element.addEventListener("pointermove", move);
          element.addEventListener("pointerleave", leave);
          return () => {
            element.removeEventListener("pointermove", move);
            element.removeEventListener("pointerleave", leave);
          };
        },
      );
      return () => media.revert();
    },
    { scope: host, dependencies: [atlas], revertOnUpdate: true },
  );
  return (
    <div ref={host} className="intro-muse">
      <div className="intro-muse-portrait">
        <img
          ref={poster}
          src="/ba-muse-anime.webp"
          width="1024"
          height="1536"
          fetchPriority="high"
          alt="Nhân vật anime 3D lấy cảm hứng từ ảnh của bạn, tóc đen dài, mái lệch và áo kem thắt nơ."
        />
        <canvas ref={canvas} aria-hidden="true" />
      </div>
    </div>
  );
}

export function RosePetals() {
  return (
    <div className="intro-rose-petals" aria-hidden="true">
      {Array.from({ length: 16 }, (_, index) => (
        <span className="intro-petal-drift" key={index}>
          <i className="intro-petal" />
        </span>
      ))}
    </div>
  );
}
