import React, { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";

export interface BentoProps {
  children?: React.ReactNode;
  textAutoHide?: boolean;
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string; // "R, G, B" format
  clickEffect?: boolean;
  enableMagnetism?: boolean;
  onClick?: () => void;
  className?: string;
}

export const MagicBento: React.FC<BentoProps> = ({
  children,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = 300,
  enableTilt = false,
  glowColor = "14, 165, 233",
  clickEffect = true,
  enableMagnetism = false,
  onClick,
  className = "",
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || disableAnimations) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Update CSS variables for border glow and spotlight
      card.style.setProperty("--glow-x", `${x}px`);
      card.style.setProperty("--glow-y", `${y}px`);

      if (enableSpotlight && spotlightRef.current) {
        gsap.to(spotlightRef.current, {
          x: x - spotlightRadius / 2,
          y: y - spotlightRadius / 2,
          duration: 0.1,
          ease: "power2.out",
        });
      }

      if (enableTilt) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -8;
        const rotateY = ((x - centerX) / centerX) * 8;

        gsap.to(card, {
          rotateX,
          rotateY,
          duration: 0.2,
          ease: "power2.out",
          transformPerspective: 1000,
        });
      }

      if (enableMagnetism) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const magnetX = (x - centerX) * 0.04;
        const magnetY = (y - centerY) * 0.04;

        gsap.to(card, {
          x: magnetX,
          y: magnetY,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };

    const handleMouseEnter = () => {
      setHovered(true);
      if (enableSpotlight && spotlightRef.current) {
        gsap.to(spotlightRef.current, {
          opacity: 0.15,
          duration: 0.3,
        });
      }
    };

    const handleMouseLeave = () => {
      setHovered(false);
      if (enableSpotlight && spotlightRef.current) {
        gsap.to(spotlightRef.current, {
          opacity: 0,
          duration: 0.4,
        });
      }

      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        x: 0,
        y: 0,
        duration: 0.4,
        ease: "power2.out",
      });
    };

    const handleClick = (e: MouseEvent) => {
      if (!clickEffect) return;

      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const ripple = document.createElement("div");
      ripple.className = "absolute rounded-full pointer-events-none z-10";
      const size = Math.max(rect.width, rect.height) * 2.5;

      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x - size / 2}px`;
      ripple.style.top = `${y - size / 2}px`;
      ripple.style.background = `radial-gradient(circle, rgba(${glowColor}, 0.25) 0%, transparent 60%)`;

      card.appendChild(ripple);

      gsap.fromTo(
        ripple,
        { scale: 0, opacity: 1 },
        {
          scale: 1,
          opacity: 0,
          duration: 0.8,
          ease: "power2.out",
          onComplete: () => ripple.remove(),
        }
      );
    };

    card.addEventListener("mousemove", handleMouseMove);
    card.addEventListener("mouseenter", handleMouseEnter);
    card.addEventListener("mouseleave", handleMouseLeave);
    card.addEventListener("click", handleClick);

    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseenter", handleMouseEnter);
      card.removeEventListener("mouseleave", handleMouseLeave);
      card.removeEventListener("click", handleClick);
    };
  }, [disableAnimations, enableSpotlight, spotlightRadius, enableTilt, enableMagnetism, clickEffect, glowColor]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`relative rounded-2xl border p-6 overflow-hidden transition-colors ${className}`}
      style={{
        background: "rgba(15, 23, 42, 0.45)",
        borderColor: "rgba(148, 163, 184, 0.12)",
        cursor: onClick ? "pointer" : "default",
        transformStyle: "preserve-3d",
        ...((enableBorderGlow && hovered)
          ? {
              boxShadow: `0 0 20px -5px rgba(${glowColor}, 0.15)`,
            }
          : {}),
      }}
    >
      {/* Spotlight overlay */}
      {enableSpotlight && !disableAnimations && (
        <div
          ref={spotlightRef}
          className="absolute rounded-full pointer-events-none opacity-0 z-0"
          style={{
            width: `${spotlightRadius}px`,
            height: `${spotlightRadius}px`,
            background: `radial-gradient(circle, rgba(${glowColor}, 0.15) 0%, transparent 70%)`,
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Border Glow border-mask simulation */}
      {enableBorderGlow && !disableAnimations && hovered && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none z-[1]"
          style={{
            border: "1px solid transparent",
            background: `radial-gradient(circle at var(--glow-x) var(--glow-y), rgba(${glowColor}, 0.45) 0%, transparent 60%)`,
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            padding: "1px",
          }}
        />
      )}

      {/* Content wrapper */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between">
        {children}
      </div>
    </div>
  );
};

export default MagicBento;
