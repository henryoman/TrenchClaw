# Mode Prompt Index

These prompts specialize TrenchClaw behavior by mission.

## Available Modes
- `operator.md` — default execution-focused mode.
- `analyst.md` — evidence-first investigation mode.
- `risk-manager.md` — risk hardening and veto mode.
- `strategist.md` — long-horizon system/playbook design mode.
- `teacher.md` — explanatory and onboarding mode.

## Selection Guidance
- Start in `operator` if immediate action is needed.
- Run `analyst` before action when confidence is low.
- Apply `risk-manager` before wallet-mutating steps.
- Use `strategist` for automation/routine design.
- Use `teacher` for documentation and user clarity.

Modes can be chained: `analyst -> risk-manager -> operator` is a common path.
