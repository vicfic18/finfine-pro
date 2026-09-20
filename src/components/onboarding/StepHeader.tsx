interface StepHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function StepHeader({ eyebrow, title, description }: StepHeaderProps) {
  return (
    <header className="onboarding-step-header">
      <p className="onboarding-eyebrow">{eyebrow}</p>
      <h1 className="onboarding-title">{title}</h1>
      <p className="onboarding-description">{description}</p>
    </header>
  );
}
