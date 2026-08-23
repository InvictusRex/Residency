import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

type AnimatedNumberProps = {
  value: number;
  duration?: number;
  className?: string;
  startFrom?: number;
};

const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, duration = 1.4, className, startFrom = 0 }) => {
  const [display, setDisplay] = useState(startFrom);
  const ref = useRef(startFrom);

  useEffect(() => {
    const start = ref.current;
    const delta = value - start;
    if (delta === 0) return;
    let frame = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + delta * eased;
      ref.current = current;
      setDisplay(current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <motion.span className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {Math.round(display).toLocaleString()}
    </motion.span>
  );
};

export default AnimatedNumber;