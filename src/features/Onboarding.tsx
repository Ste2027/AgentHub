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
    <div className="onboarding-backdrop">
      <section
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <button
          className="onboarding-close"
          aria-label="Skip onboarding"
          onClick={finish}
        >
          <X size={17} />
        </button>
        <div className="onboarding-visual" aria-hidden="true">
          <div className="onboarding-orbit orbit-one" />
          <div className="onboarding-orbit orbit-two" />
          <div className="onboarding-icon">
            <ShieldCheck size={34} />
          </div>
          <span>LOCAL ONLY</span>
        </div>
        <div className="onboarding-content">
          <span className="eyebrow">
            GETTING STARTED · {step + 1}/{steps.length}
          </span>
          <h2 id="onboarding-title">{steps[step][0]}</h2>
          <p>{steps[step][1]}</p>
          <div className="onboarding-steps" aria-label="Onboarding steps">
            {steps.map((s, i) => (
              <button
                type="button"
                className={i === step ? "current" : i < step ? "complete" : ""}
                key={s[0]}
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <span>{i < step ? <Check size={13} /> : i + 1}</span>
                {s[0]}
              </button>
            ))}
          </div>
          <footer>
            <Button variant="ghost" onClick={finish}>
              Skip for now
            </Button>
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)}>Continue</Button>
            ) : (
              <Button onClick={finish}>Open my workspace</Button>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}
