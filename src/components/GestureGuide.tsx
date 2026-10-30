import { memo } from "react";

function FingerIcon({ pinched }: { pinched: boolean }) {
  return (
    <svg viewBox="0 0 56 48" fill="none" aria-hidden="true">
      <path
        d={
          pinched
            ? "M12 37 27 22M42 38V17c0-12-15-12-15 5"
            : "M12 37 24 25M42 38V9"
        }
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {pinched && (
        <circle
          cx="27"
          cy="22"
          r="10"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
      )}
    </svg>
  );
}

export const GestureGuide = memo(function GestureGuide() {
  return (
    <section className="gesture-guide" aria-label="How to change notes">
      <div className="guide-step">
        <span className="guide-number">1</span>
        <FingerIcon pinched={false} />
        <div>
          <strong>Open your fingers</strong>
          <p>Keep thumb and index apart.</p>
        </div>
      </div>
      <div className="guide-step">
        <span className="guide-number">2</span>
        <svg viewBox="0 0 56 48" fill="none" aria-hidden="true">
          <path
            d="M7 24h42M7 24l9-9M7 24l9 9m33-9-9-9m9 9-9 9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <strong>Move your hand left or right</strong>
          <p>Watch the highlighted note change.</p>
        </div>
      </div>
      <div className="guide-step">
        <span className="guide-number">3</span>
        <FingerIcon pinched />
        <div>
          <strong>Pinch to play</strong>
          <p>Open again to choose another note.</p>
        </div>
      </div>
    </section>
  );
});
