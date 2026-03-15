import { useState, useRef, useEffect } from 'react';

export default function HorizontalScroll({ children, label, sublabel }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }

  useEffect(() => { updateArrows(); }, []);

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
    setTimeout(updateArrows, 400);
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{label}</h2>
          {sublabel && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sublabel}</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={() => scroll(-1)} disabled={!canScrollLeft}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-20"
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
            &#8249;
          </button>
          <button onClick={() => scroll(1)} disabled={!canScrollRight}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-20"
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
            &#8250;
          </button>
        </div>
      </div>
      <div ref={scrollRef} onScroll={updateArrows}
        className="flex gap-4 overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </div>
  );
}
