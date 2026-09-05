import { useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    [
      "Welcome to AgentHub",
      "One local workspace for the coding-agent history you already have.",
    ],
    [
      "Everything stays here",
      "AgentHub reads local files only. It does not upload transcripts, run agents or collect telemetry.",
    ],
    [
      "Detect your agents",
      "Claude Code and OpenAI Codex are detected from the current user's normal local directories.",
    ],
    [
      "Index sessions",
      "Choose Index sessions when you're ready. Source files stay untouched.",
    ],
  ];
  const finish = () => {
    localStorage.setItem("agenthub.onboarding.v1", "done");
    onDone();
  };
  return (
    <section className="onboarding panel" aria-label="AgentHub onboarding">
      <button
        className="onboarding-close"
        aria-label="Skip onboarding"
        onClick={finish}
      >
        <X size={16} />
      </button>
      <div className="onboarding-icon">
        <ShieldCheck size={24} />
      </div>
      <span className="eyebrow">
        GETTING STARTED · {step + 1}/{steps.length}
      </span>
      <h2>{steps[step][0]}</h2>
      <p>{steps[step][1]}</p>
      <div className="onboarding-steps">
        {steps.map((s, i) => (
          <span className={i <= step ? "active" : ""} key={s[0]}>
            <Check size={13} />
            {s[0]}
          </span>
        ))}
      </div>
      <footer>
        <Button variant="ghost" onClick={finish}>
          Skip
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={() => setStep(step + 1)}>Next</Button>
        ) : (
          <Button onClick={finish}>Start using AgentHub</Button>
        )}
      </footer>
    </section>
  );
}
