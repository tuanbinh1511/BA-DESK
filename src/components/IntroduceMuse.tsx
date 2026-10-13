import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function IntroduceMuse() {
  const host = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const element = host.current;
        if (!element) return;
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
      });
      return () => media.revert();
    },
    { scope: host },
  );
  return (
    <div ref={host} className="intro-muse">
      <img
        src="/ba-muse.png"
        width="1024"
        height="1536"
        fetchPriority="high"
        alt="Nàng BA trong bộ blazer hồng thanh lịch, ghi chú bên laptop, minh hoạ phong cách 3D."
      />
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
