interface GreenImpactProps {
  co2_saved_kg: number;
  credits: number;
  show_earned: boolean;
}

function LeafIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="#2d6a4f"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

export default function GreenImpact({ co2_saved_kg, credits, show_earned }: GreenImpactProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        backgroundColor: "#d8f3dc",
        borderRadius: "6px",
        padding: "10px 14px",
        fontSize: "13px",
        color: "#1b4332",
      }}
    >
      <LeafIcon />
      <span>
        Saves <strong>{co2_saved_kg} kg CO₂</strong> vs buying new
        {show_earned && credits > 0 && (
          <>
            {" "}· <strong>+{credits} green credits</strong> earned
          </>
        )}
      </span>
    </div>
  );
}
