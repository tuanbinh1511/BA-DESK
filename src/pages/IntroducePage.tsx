import { lazy, Suspense, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./introduce.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);
const Sculpture = lazy(() => import("../components/IntroduceSculpture"));
const qualities = [
  {
    title: "Xinh gái",
    subtitle: "Có gu, có chất riêng.",
    body: "Một chút hồng, một chút dịu dàng. Không cần giống ai để thấy mình thật đẹp.",
    detail: "Không gian đẹp để mỗi lần mở máy, bạn muốn bắt đầu ngày mới.",
    word: "beauty",
    className: "beauty",
  },
  {
    title: "Giỏi giang",
    subtitle: "Hiểu sâu. Nói rõ. Làm tới.",
    body: "Từ một lời nhắn đến một yêu cầu rõ ràng. Bạn kết nối con người, đặt đúng câu hỏi và đưa dự án về đích.",
    detail:
      "Tin nhắn, tài liệu và đầu việc được đặt đúng chỗ — dành sự tập trung cho điều quan trọng.",
    word: "brilliance",
    className: "brilliance",
  },
  {
    title: "Sang chảnh",
    subtitle: "Khí chất đến từ bên trong.",
    body: "Không cần ồn ào để được chú ý. Sự điềm tĩnh, tinh tế và tự tin luôn có sức hút riêng.",
    detail:
      "Nhịp làm việc do bạn chọn. Không gian đủ tinh tế để đi cùng phiên bản tốt nhất của bạn.",
    word: "presence",
    className: "presence",
  },
];
const statements = [
  "Đẹp không cần cố gắng, khí chất mới là thứ vĩnh hằng.",
  "Dịu dàng trong cách nói. Sắc sảo trong cách nghĩ.",
  "Có gu trong từng lựa chọn. Có tâm trong từng việc làm.",
];

export function IntroducePage({
  onOpenWorkspace,
}: {
  onOpenWorkspace: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const progress = useRef({ value: 0 });
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [quote, setQuote] = useState(0);
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
          gsap.from(".intro-hero-copy > *", {
            y: 28,
            opacity: 0,
            stagger: 0.1,
            duration: 0.9,
            ease: "power3.out",
          });
          const heroTimeline = gsap.timeline({
            scrollTrigger: {
              trigger: ".intro-hero",
              start: context.conditions.desktop ? "top 72px" : "top 75%",
              end: context.conditions.desktop ? "+=650" : "bottom top",
              pin: !!context.conditions.desktop,
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          });
          heroTimeline
            .fromTo(
              ".intro-art-scroll",
              { scale: 0.8, opacity: 0.5 },
              { scale: 1, opacity: 1, ease: "none" },
            )
            .to(".intro-art-scroll", {
              scale: context.conditions.desktop ? 1.2 : 1.08,
              y: context.conditions.desktop ? -55 : 0,
              rotationZ: -6,
              opacity: 0.25,
              ease: "none",
            });
          if (context.conditions.desktop)
            heroTimeline.to(
              ".intro-hero-copy",
              { y: -30, opacity: 0.35, ease: "none" },
              "<",
            );
          gsap.to(progress.current, {
            value: 1,
            ease: "none",
            scrollTrigger: {
              trigger: ".intro-hero",
              start: "top top",
              end: "bottom top",
              scrub: 1,
            },
          });
          gsap.utils
            .toArray<HTMLElement>(".intro-reveal")
            .forEach((section) => {
              gsap.from(section, {
                y: 50,
                opacity: 0,
                duration: 0.85,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: section,
                  start: "top 88%",
                  toggleActions: "play none none reverse",
                },
              });
            });
          gsap.from(".manifesto-word", {
            opacity: 0.12,
            stagger: 0.08,
            ease: "none",
            scrollTrigger: {
              trigger: ".intro-manifesto",
              start: "top 75%",
              end: "bottom 55%",
              scrub: 0.7,
            },
          });
          if (context.conditions.desktop) {
            gsap.to(".intro-story-track", {
              xPercent: (-100 * 2) / 3,
              ease: "none",
              scrollTrigger: {
                trigger: ".intro-workflow",
                start: "top 72px",
                end: "+=1200",
                pin: true,
                scrub: 0.8,
                invalidateOnRefresh: true,
              },
            });
            const timeline = gsap.timeline({
              scrollTrigger: {
                trigger: ".intro-desire",
                start: "top 100px",
                end: "+=1050",
                pin: true,
                scrub: 0.8,
                invalidateOnRefresh: true,
              },
            });
            timeline
              .fromTo(
                ".intro-stack-card:nth-child(2)",
                { yPercent: 110, rotationX: -25, rotationZ: 8 },
                { yPercent: 0, rotationX: 0, rotationZ: -4, ease: "none" },
              )
              .to(
                ".intro-stack-card:first-child",
                { scale: 0.9, rotationZ: 5, opacity: 0.65, ease: "none" },
                "<",
              )
              .fromTo(
                ".intro-stack-card:nth-child(3)",
                { yPercent: 110, rotationX: -25, rotationZ: -10 },
                { yPercent: 0, rotationX: 0, rotationZ: 2, ease: "none" },
              )
              .to(
                ".intro-stack-card:nth-child(2)",
                { scale: 0.94, opacity: 0.8, ease: "none" },
                "<",
              );
          }
          gsap.fromTo(
            ".intro-reading-progress",
            { scaleX: 0 },
            {
              scaleX: 1,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top top",
                end: "bottom bottom",
                scrub: 0.3,
              },
            },
          );
        },
      );
      let mounted = true;
      void document.fonts.ready.then(() => {
        if (mounted) ScrollTrigger.refresh();
      });
      return () => {
        mounted = false;
        media.revert();
        progress.current.value = 0;
      };
    },
    { scope: root },
  );

  const spring = { type: "spring" as const, stiffness: 220, damping: 26 };
  return (
    <article ref={root} className="introduce-page">
      <nav className="intro-nav" aria-label="Điều hướng giới thiệu">
        <span className="intro-reading-progress" aria-hidden="true" />
        <span className="intro-wordmark">
          ba desk <em>the pink edition</em>
        </span>
        <div>
          <a href="#intro-qualities">Khí chất BA</a>
          <button onClick={onOpenWorkspace}>
            Vào workspace <span aria-hidden="true">↗</span>
          </button>
        </div>
      </nav>
      <section className="intro-hero" aria-labelledby="intro-title">
        <div className="intro-hero-copy">
          <p className="intro-signature">Dành cho nàng Business Analyst</p>
          <h1 id="intro-title">
            Xinh gái là một{" "}
            <img className="intro-inline-rose" src="/rose-study.svg" alt="" />{" "}
            vibe.
            <br />
            <em>Giỏi giang là khí chất.</em>
          </h1>
          <p>
            Đủ dịu dàng để lắng nghe. Đủ sắc sảo để dẫn lối.
            <br />
            Một không gian mang dấu ấn của bạn, từ cái đẹp đến cách làm việc.
          </p>
          <div className="intro-actions">
            <motion.button
              className="button primary"
              onClick={onOpenWorkspace}
              whileHover={reduced ? undefined : { scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              transition={spring}
            >
              Bắt đầu ngày thật xinh <span aria-hidden="true">↗</span>
            </motion.button>
            <a className="intro-outline-button" href="#intro-qualities">
              Khám phá khí chất BA <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className="intro-art-scroll">
          <div className="intro-art-stage">
            <Suspense
              fallback={
                <div className="sculpture-fallback">
                  <span />
                  <i />
                </div>
              }
            >
              <Sculpture progress={progress} />
            </Suspense>
          </div>
          <p className="intro-art-caption">
            Mềm mại trong hình dáng. Mạnh mẽ trong bản sắc.
          </p>
        </div>
        <div className="intro-scroll-cue" aria-hidden="true">
          <span />
          Cuộn để cảm nhận
        </div>
      </section>
      <div className="intro-marquee" aria-hidden="true">
        <div>
          {[0, 1].map((copy) => (
            <span key={copy}>
              Xinh gái <i /> Giỏi giang <i /> Sang chảnh <i /> Khí chất vĩnh
              hằng <i />
            </span>
          ))}
        </div>
      </div>
      <section
        className="intro-qualities intro-chapter"
        id="intro-qualities"
        aria-labelledby="qualities-title"
      >
        <header className="intro-reveal">
          <p>Ba sắc thái. Một phiên bản rất bạn.</p>
          <h2 id="qualities-title">
            Dịu dàng có chủ đích.
            <br />
            <em>Rực rỡ có chiều sâu.</em>
          </h2>
        </header>
        <div className="intro-accordion">
          {qualities.map((item, index) => (
            <motion.article
              key={item.title}
              className={`intro-quality ${item.className} ${active === index ? "is-active" : ""}`}
              layout={!reduced}
              transition={spring}
            >
              <button
                className="intro-quality-toggle"
                aria-expanded={active === index}
                aria-controls={`quality-${index}`}
                onClick={() => setActive(index)}
              >
                <span>{item.title}</span>
                <span aria-hidden="true">{active === index ? "−" : "+"}</span>
              </button>
              <div className="intro-quality-art" aria-hidden="true">
                <span />
                <i />
                <b />
              </div>
              <h3>{item.subtitle}</h3>
              <p>{item.body}</p>
              <div id={`quality-${index}`}>
                <AnimatePresence initial={false}>
                  {active === index && (
                    <motion.div
                      className="intro-quality-detail"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {item.detail}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <span className="intro-quality-word" aria-hidden="true">
                {item.word}
              </span>
            </motion.article>
          ))}
        </div>
      </section>
      <section
        className="intro-workflow intro-chapter"
        aria-labelledby="workflow-title"
      >
        <div className="intro-workflow-copy">
          <p>Đằng sau một BA có khí chất.</p>
          <h2 id="workflow-title">
            Nghe được điều khó nói.
            <br />
            <em>Làm rõ điều chưa rõ.</em>
          </h2>
          <p>
            Từ một hội thoại nhỏ đến một quyết định có cơ sở. Mỗi bước đều có
            dấu ấn của bạn.
          </p>
          <span>Tình huống minh hoạ · cuộn để đi tiếp</span>
        </div>
        <div className="intro-story-window">
          <div className="intro-story-track">
            <article className="intro-story-panel story-listen">
              <p>Lắng nghe</p>
              <h3>
                Bắt đầu từ
                <br />
                đúng người.
              </h3>
              <div className="story-message">
                <strong>Hà · Product</strong>
                <p>
                  “Mình cần làm rõ khi nào khách được huỷ đơn và hoàn tiền.”
                </p>
              </div>
              <p>
                Biết ai đang hỏi, hỏi trong dự án nào, và vì sao điều đó quan
                trọng.
              </p>
            </article>
            <article className="intro-story-panel story-clarify">
              <p>Làm rõ</p>
              <h3>
                Đặt câu hỏi.
                <br />
                Kết nối ngữ cảnh.
              </h3>
              <dl>
                <dt>Điều kiện</dt>
                <dd>Đơn đã được bàn giao chưa?</dd>
                <dt>Ngoại lệ</dt>
                <dd>Nếu thanh toán một phần thì sao?</dd>
                <dt>Kết quả</dt>
                <dd>Khách nhận được thông báo gì?</dd>
              </dl>
              <p>Những câu hỏi nhỏ tạo nên một yêu cầu đủ sâu.</p>
            </article>
            <article className="intro-story-panel story-action">
              <p>Đi đến hành động</p>
              <h3>
                Mỗi yêu cầu
                <br />
                có một bước tiếp.
              </h3>
              <div className="story-task">
                <strong>Làm rõ luồng huỷ đơn</strong>
                <span>Người gửi: Hà · Product</span>
                <p>Cần làm: chốt điều kiện, ngoại lệ và tiêu chí nghiệm thu.</p>
              </div>
              <p>Giữ tin gốc bên cạnh công việc. Luôn biết bắt đầu từ đâu.</p>
            </article>
          </div>
        </div>
      </section>
      <section
        className="intro-manifesto intro-chapter"
        aria-label="Tuyên ngôn khí chất"
      >
        <p className="intro-manifesto-copy">
          {"Bạn không cần chọn giữa xinh đẹp và giỏi giang. Cứ là mình, thật tinh tế, thật tự tin, thật xuất sắc."
            .split(" ")
            .map((word, index) => (
              <span className="manifesto-word" key={index}>
                {word}{" "}
              </span>
            ))}
        </p>
        <p className="intro-manifesto-note">
          Vẻ đẹp làm người ta nhìn. Khí chất làm người ta nhớ.
        </p>
      </section>
      <section
        className="intro-desire intro-chapter"
        aria-labelledby="desire-title"
      >
        <div className="intro-desire-copy">
          <p>Phong thái của người biết mình muốn gì.</p>
          <h2 id="desire-title">
            Một ngày bận rộn.
            <br />
            <em>Vẫn thật thanh lịch.</em>
          </h2>
          <p>
            BA Desk giữ những điều cần nhớ ở gần bạn. Để mỗi quyết định rõ ràng
            hơn, mỗi ngày làm việc nhẹ nhàng hơn.
          </p>
          <button className="intro-text-link" onClick={onOpenWorkspace}>
            Mở không gian của mình <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="intro-card-stack">
          <article className="intro-stack-card">
            <p>Trước mỗi cuộc họp</p>
            <h3>
              Hiểu vấn đề.
              <br />
              Hỏi đúng câu.
            </h3>
            <div
              className="intro-card-graphic graphic-orbits"
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
            </div>
            <p>
              Nghe kỹ hơn. Nhìn sâu hơn. Tìm ra điều thực sự cần giải quyết.
            </p>
          </article>
          <article className="intro-stack-card">
            <p>Trong từng trao đổi</p>
            <h3>
              Rõ yêu cầu.
              <br />
              Đúng ngữ cảnh.
            </h3>
            <div
              className="intro-card-graphic graphic-pages"
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
            </div>
            <p>
              Tin nhắn và tài liệu luôn có nơi để tìm lại. Không bỏ lỡ những chi
              tiết đáng giá.
            </p>
          </article>
          <article className="intro-stack-card">
            <p>Khi khép lại ngày</p>
            <h3>
              Việc đâu vào đó.
              <br />
              Bạn cứ rạng rỡ.
            </h3>
            <div
              className="intro-card-graphic graphic-pearl"
              aria-hidden="true"
            >
              <i />
              <i />
            </div>
            <p>
              Nhìn lại những điều đã làm. Dành phần còn lại của ngày cho chính
              mình.
            </p>
          </article>
        </div>
      </section>
      <section
        className="intro-quote intro-chapter"
        aria-label="Cảm hứng mỗi ngày"
      >
        <span className="intro-quote-mark" aria-hidden="true">
          “
        </span>
        <div className="intro-quote-stage">
          <AnimatePresence mode="wait" initial={false}>
            <motion.blockquote
              key={quote}
              initial={{ opacity: 0, y: reduced ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -15 }}
              transition={{ duration: 0.25 }}
            >
              {statements[quote]}
            </motion.blockquote>
          </AnimatePresence>
        </div>
        <div className="intro-quote-controls">
          <button
            aria-label="Câu trước"
            onClick={() =>
              setQuote((quote + statements.length - 1) % statements.length)
            }
          >
            ←
          </button>
          <span aria-live="polite">
            {quote + 1} / {statements.length}
          </span>
          <button
            aria-label="Câu tiếp theo"
            onClick={() => setQuote((quote + 1) % statements.length)}
          >
            →
          </button>
        </div>
      </section>
      <section
        className="intro-cta intro-reveal"
        aria-labelledby="intro-cta-title"
      >
        <p>Gu của bạn. Nhịp của bạn. Không gian của bạn.</p>
        <h2 id="intro-cta-title">
          Hôm nay, chọn
          <br />
          <em>phiên bản rạng rỡ.</em>
        </h2>
        <motion.button
          className="button primary"
          onClick={onOpenWorkspace}
          whileHover={reduced ? undefined : { scale: 1.04, y: -3 }}
          whileTap={{ scale: 0.98 }}
          transition={spring}
        >
          Vào BA Desk <span aria-hidden="true">↗</span>
        </motion.button>
        <span className="intro-cta-pearl" aria-hidden="true" />
      </section>
      <footer className="intro-footer">
        <span>ba desk / made for your presence</span>
        <button onClick={onOpenWorkspace}>Về tổng quan ↗</button>
      </footer>
    </article>
  );
}
