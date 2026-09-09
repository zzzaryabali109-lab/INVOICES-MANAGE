import { useState, useEffect, useCallback } from 'react';

interface PreloaderScreenProps {
  onComplete: () => void;
}

const lines = [
  "Hey, My Name is Abdullah Jatoi",
  "and I Am a Software Developer.",
  "This Website is free",
  "If you wish, you can make a donation so that we can move forward."
];

export function PreloaderScreen({ onComplete }: PreloaderScreenProps) {
  const [currentLine, setCurrentLine] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  const LINE_DURATION = 2000; // Time each line stays visible
  const FADE_OUT_DURATION = 600;

  const handleComplete = useCallback(() => {
    setFadeOut(true);
    setTimeout(() => {
      onComplete();
    }, FADE_OUT_DURATION);
  }, [onComplete]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentLine < lines.length - 1) {
        setIsAnimating(false);
        
        // Brief pause before showing next line
        setTimeout(() => {
          setCurrentLine(prev => prev + 1);
          setIsAnimating(true);
        }, 300);
      } else {
        // All lines shown, complete the preloader
        handleComplete();
      }
    }, LINE_DURATION);

    return () => clearTimeout(timer);
  }, [currentLine, handleComplete]);

  // Fallback timeout to ensure preloader never gets stuck
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (!fadeOut) {
        handleComplete();
      }
    }, (lines.length * LINE_DURATION) + 2000); // Total time + buffer

    return () => clearTimeout(fallbackTimer);
  }, [fadeOut, handleComplete]);

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-white transition-opacity ease-out ${
        fadeOut ? 'opacity-0 duration-500' : 'opacity-100 duration-300'
      }`}
    >
      <div className="text-center px-6 max-w-3xl">
        <div className="relative overflow-hidden min-h-[80px] flex items-center justify-center">
          <p 
            key={currentLine}
            className={`
              text-xl md:text-2xl lg:text-3xl font-light text-black leading-relaxed tracking-wide
              ${isAnimating ? 'animate-text-slide-in' : 'animate-text-slide-out'}
            `}
            style={{ 
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 300,
            }}
          >
            {lines[currentLine]}
          </p>
        </div>

        {/* Elegant progress indicator */}
        <div className="mt-16 flex justify-center items-center gap-3">
          {lines.map((_, index) => (
            <div 
              key={index}
              className="relative h-[2px] w-8 bg-black/10 overflow-hidden rounded-full"
            >
              <div 
                className={`
                  absolute inset-y-0 left-0 bg-black rounded-full transition-all ease-out
                  ${index < currentLine ? 'w-full duration-300' : index === currentLine ? 'w-full duration-[2000ms]' : 'w-0 duration-300'}
                `}
              />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes textSlideIn {
          0% {
            opacity: 0;
            transform: translateX(-30px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        @keyframes textSlideOut {
          0% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateX(30px) scale(0.95);
          }
        }

        .animate-text-slide-in {
          animation: textSlideIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .animate-text-slide-out {
          animation: textSlideOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </div>
  );
}
