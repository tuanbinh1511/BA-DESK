import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export default function IntroduceSculpture({
  progress,
}: {
  progress: RefObject<{ value: number }>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, window.innerWidth < 800 ? 1.25 : 1.5),
    );
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.setClearColor(0xffffff, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(38, 1, 0.1, 30);
    const environment = new RoomEnvironment();
    const generator = new PMREMGenerator(renderer);
    const environmentMap = generator.fromScene(environment, 0.04);
    scene.environment = environmentMap.texture;
    environment.dispose();
    generator.dispose();
    scene.add(new AmbientLight(0xffe3d9, 1.4));
    const light = new DirectionalLight(0xfff5ed, 4);
    light.position.set(-3, 5, 4);
    scene.add(light);
    const sculpture = new Group();
    scene.add(sculpture);
    const satin = new MeshPhysicalMaterial({
      color: 0xe88c9e,
      metalness: 0.62,
      roughness: 0.25,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
    });
    const pearl = new MeshPhysicalMaterial({
      color: 0xfff2e5,
      metalness: 0.25,
      roughness: 0.16,
      clearcoat: 1,
      iridescence: 0.3,
    });
    const gold = new MeshPhysicalMaterial({
      color: 0xc99470,
      metalness: 0.85,
      roughness: 0.27,
    });
    const ribbonGeometry = new TorusKnotGeometry(1.04, 0.27, 160, 20, 2, 3);
    const ribbon = new Mesh(ribbonGeometry, satin);
    ribbon.rotation.set(0.25, -0.25, 0.35);
    sculpture.add(ribbon);
    const pearlGeometry = new SphereGeometry(0.54, 32, 24);
    sculpture.add(new Mesh(pearlGeometry, pearl));
    const beadGeometry = new SphereGeometry(0.09, 14, 10);
    for (let index = 0; index < 28; index++) {
      const angle = (index / 28) * Math.PI * 2;
      const bead = new Mesh(beadGeometry, pearl);
      bead.position.set(
        Math.cos(angle) * 1.96,
        Math.sin(angle) * 1.96,
        Math.sin(angle * 2) * 0.3,
      );
      sculpture.add(bead);
    }
    const orbitGeometry = new TorusGeometry(2.05, 0.012, 6, 100);
    const orbit = new Mesh(orbitGeometry, gold);
    orbit.rotation.x = 1.12;
    orbit.rotation.y = 0.2;
    sculpture.add(orbit);
    const warm = new Color(0xe88c9e);
    const blush = new Color(0xf6b4b5);
    const pointer = { x: 0, y: 0 };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let contextLost = false;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    const render = () => {
      const p = motion.matches ? 0 : progress.current.value;
      sculpture.rotation.x = 0.12 + p * 0.7 + pointer.y * 0.08;
      sculpture.rotation.y =
        elapsed * 0.12 + p * Math.PI * 1.7 + pointer.x * 0.16;
      sculpture.rotation.z = -0.12 + p * 0.4;
      sculpture.position.y = motion.matches
        ? 0
        : Math.sin(elapsed * 0.6) * 0.06;
      satin.color.copy(warm).lerp(blush, p);
      renderer.render(scene, camera);
    };
    const tick = (time: number) => {
      frame = 0;
      if (!visible || document.hidden || motion.matches || contextLost) return;
      if (time - last >= (window.innerWidth < 800 ? 32 : 16)) {
        elapsed += Math.min((time - last) / 1000, 0.05);
        last = time;
        render();
      }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (document.hidden || !visible || contextLost) return;
      render();
      if (!motion.matches) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.position.z =
        2.6 / Math.tan((19 * Math.PI) / 180) / Math.min(camera.aspect, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    });
    resize.observe(element);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    observer.observe(element);
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || motion.matches) return;
      const box = element.getBoundingClientRect();
      pointer.x = (event.clientX - box.left) / box.width - 0.5;
      pointer.y = (event.clientY - box.top) / box.height - 0.5;
    };
    const leave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      setReady(false);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", resume);
    motion.addEventListener("change", resume);
    resume();
    setReady(true);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", resume);
      motion.removeEventListener("change", resume);
      ribbonGeometry.dispose();
      pearlGeometry.dispose();
      beadGeometry.dispose();
      orbitGeometry.dispose();
      satin.dispose();
      pearl.dispose();
      gold.dispose();
      environmentMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [progress]);
  return (
    <div
      ref={host}
      className={`introduce-sculpture ${ready ? "is-ready" : ""}`}
      aria-hidden="true"
    >
      <div className="sculpture-fallback">
        <span />
        <i />
      </div>
    </div>
  );
}
