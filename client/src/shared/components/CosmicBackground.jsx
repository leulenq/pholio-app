import React, { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import "./CosmicBackground.css";

const CosmicBackground = React.memo(() => {
  const [init, setInit] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Check for prefers-reduced-motion
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);

    // Initialize particles engine - only once
    const initEngine = async () => {
      await initParticlesEngine(async (engine) => {
        await loadSlim(engine);
      });
      setInit(true);
    };

    if (!init) {
      initEngine();
    }

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [init]);

  const particlesOptions = {
    background: {
      color: "#0a0805",
    },
    fpsLimit: 60,
    particles: [
      // Group 1 — Stars
      {
        number: {
          value: 60,
          density: {
            enable: true,
            area: 800,
          },
        },
        color: {
          value: ["#ffffff", "#fffbe6", "#C9A84C"],
        },
        shape: {
          type: "circle",
        },
        opacity: {
          value: { min: 0.2, max: 0.8 },
          animation: {
            enable: true,
            speed: 0.5,
            minimumValue: 0.1,
            sync: false,
          },
        },
        size: {
          value: { min: 0.5, max: 1.5 },
        },
        move: {
          enable: true,
          speed: 0.1,
          direction: "none",
          random: true,
          straight: false,
          outModes: {
            default: "out",
          },
        },
      },
      // Group 2 — Gold dust
      {
        number: {
          value: 30,
          density: {
            enable: true,
            area: 800,
          },
        },
        color: {
          value: "#C9A84C",
        },
        shape: {
          type: "circle",
        },
        opacity: {
          value: { min: 0.05, max: 0.25 },
          animation: {
            enable: true,
            speed: 0.3,
            sync: false,
          },
        },
        size: {
          value: { min: 1, max: 3 },
        },
        move: {
          enable: true,
          speed: 0.2,
          direction: "top",
          random: true,
          straight: false,
          outModes: {
            default: "out",
          },
        },
        // Blur is handled via shadow in tsparticles for circle shapes
        shadow: {
          enable: true,
          color: "#C9A84C",
          blur: 2,
        },
      },
    ],
    detectRetina: true,
  };

  return (
    <div className="cosmic-container">
      {init && !reducedMotion && (
        <Particles
          id="tsparticles-cosmic"
          options={particlesOptions}
          className="cosmic-particles"
        />
      )}
    </div>
  );
});

export default CosmicBackground;
