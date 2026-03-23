import React, { useEffect } from 'react';
import { Hero } from './components/Hero';
import { Work } from './components/Work';
import { About } from './components/About';
import { Experience } from './components/Experience';
import { Footer } from './components/Footer';

function App() {
  useEffect(() => {
    // Check if autoscroll is enabled via query params
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoscroll') === 'true') {
      let animationFrameId: number;
      let lastTime = performance.now();
      const pixelsPerSecond = 20;

      const scrollLoop = (time: number) => {
        const delta = (time - lastTime) / 1000;
        lastTime = time;
        
        // Scroll the window down by pixels computed from delta
        window.scrollBy({
          top: pixelsPerSecond * delta,
          left: 0,
          behavior: 'auto'
        });

        // Loop if we haven't reached the bottom
        // Adding a 5px buffer to prevent precision issues at the extreme bottom
        if (window.scrollY + window.innerHeight < document.body.scrollHeight - 5) {
          animationFrameId = requestAnimationFrame(scrollLoop);
        } else {
          // Restart from top if we reach the bottom, creating an infinite loop effect
          window.scrollTo(0, 0);
          animationFrameId = requestAnimationFrame(scrollLoop);
        }
      };

      // Start scrolling after a short delay to let the page load
      setTimeout(() => {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(scrollLoop);
      }, 1000);

      return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      };
    }
  }, []);

  return (
    <div className="bg-pholio-backdrop min-h-screen w-full relative selection:bg-pholio-accent selection:text-white overflow-hidden text-pholio-text-main">
      {/* 
        Main Container with padding creates the gap between the viewport edges and the cards.
        Gap-6 creates the spacing between the cards themselves.
      */}
      <main className="flex flex-col w-full p-4 md:p-6 gap-6">
        <Hero />
        <Work />
        <About />
        <Experience />
        <Footer />
      </main>
    </div>
  );
}

export default App;