export function SubHeader({ icon, title, onBack }: { icon: string; title: string; onBack: () => void }) {
  return (
    <button class="sub-header" onClick={onBack}>
      <span class="sh-chevron">‹</span>
      <span class="sh-icon">{icon}</span>
      <span class="sh-title">{title}</span>
    </button>
  );
}
