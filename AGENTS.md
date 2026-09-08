# Unpatched Agent Operating Manual

## 1. Initial Product-Build Mode

Unpatched is currently in **product discovery and interface-building mode**.

The primary objective is to rapidly build, visualize, test and iterate on the product experience.

### Default data rule

**ALL DATA IS MOCK DATA BY DEFAULT.**

Unless the current task explicitly says otherwise:

- Use realistic mock users.
- Use realistic mock researchers.
- Use realistic mock reports.
- Use realistic mock programs.
- Use realistic mock bounties.
- Use realistic mock analytics.
- Use realistic mock activity.
- Use realistic mock notifications.
- Use realistic mock organizations.

Do NOT stop implementation to ask for production data.

Do NOT require APIs before building the experience.

Do NOT fabricate the existence of a real integration.

Mock data should behave like real data and should be structured so it can later be replaced by APIs.

Do not add warnings such as "mock data", "demo data", or "fictional data" throughout the UI unless the current task specifically requires them. The objective is to make the interface feel like the finished product.

Keep fixtures/data providers separated from production integration boundaries so they can later be replaced cleanly.

## 2. Authority and conflict handling

Use the following order of authority:

1. Current task requirements
2. `AGENTS.md`
3. `DESIGN.md`
4. `SECURITY.md`
5. `DOMAIN.md`
6. `ARCHITECTURE.md`
7. Existing implementation
8. Approved external research references

If two applicable sources conflict, stop implementation, identify the conflict and its impact, and request or document a resolution when the conflict is genuinely important or changes the direction of the system (see Section 8) — an ordinary implementation choice does not need this ceremony. Do not silently choose a behavior on a real conflict. A request to rewrite one of these documents is itself resolved through this same order: current task requirements outrank the document being rewritten, which is why such a rewrite is legitimate process, not a violation of it.

## 3. Product architecture references

Unpatched is building a bug-bounty / security-research platform.

Use established products in this category to understand **core product architecture and workflows**.

HackerOne may be used as a functional reference for understanding concepts such as:

- Programs
- Researchers
- Reports
- Vulnerability lifecycle
- Triaging
- Severity
- Bounties
- Reputation
- Researcher profiles
- Program scopes
- Report communication
- Notifications
- Program/researcher relationships
- Platform workflows

Think about this the same way an e-commerce product may study Flipkart or Amazon to understand the architecture of:

`catalog → search → product → cart → checkout → order → fulfillment`

Studying the category architecture does NOT mean reproducing their implementation.

We are building our own product.

### Important distinction

**Copy the proven product/category model where appropriate.**

Do NOT copy:

- source code
- proprietary assets
- logos
- exact copy
- exact visual layouts
- proprietary illustrations
- private implementation details

The goal is:

**proven product architecture + original Unpatched execution.**

Do not waste implementation time reinventing fundamental concepts that are already established by the category.

### Other research sources

Beyond category-architecture references like HackerOne, the same "extract the principle, adapt it, never copy the implementation" discipline applies to two further reference categories:

**Standing references** — always available, no per-use justification needed:

- https://github.com/VoltAgent/awesome-claude-design
- https://github.com/obra/superpowers
- https://github.com/VoltAgent/awesome-claude-skills
- https://github.com/vercel-labs/agent-skills
- https://github.com/supabase/agent-skills
- https://github.com/trailofbits/skills
- https://github.com/anthropics/skills
- https://github.com/All-Hands-AI/OpenHands
- https://github.com/SWE-agent/SWE-agent

**Task-directed commercial references** — a live commercial product (e.g. a competitor's marketing site) becomes a legitimate visual/UX reference when the current task's requirements explicitly name it or the user explicitly directs its use.

## 4. Design references

When the user provides a website, screenshot or product reference:

1. Inspect it.
2. Understand why the design works.
3. Extract hierarchy, interaction patterns, density and visual principles.
4. Translate those principles into Unpatched.
5. Build the strongest appropriate interpretation.

Do not automatically produce a generic SaaS dashboard.

Do not assume that "original" means "different for the sake of being different."

Use proven interaction patterns when they make the product better.

The objective is:

**familiar where it should be familiar, distinctive where Unpatched should be distinctive.**

## 5. Agent autonomy

Agents should operate with high autonomy.

Do not repeatedly ask the user for permission to:

- create components
- create mock data
- restructure local UI
- refactor weak components
- improve layouts
- add useful interactions
- run the application
- inspect the result
- fix obvious issues
- iterate on visual design

Use judgment and continue until the requested experience is meaningfully complete.

Ask questions only when the missing information materially affects the product direction, security, irreversible data changes, or architecture.

## 6. Visual quality

Never consider a UI complete merely because it technically renders.

Before finishing a visual task, inspect the result and ask:

- Does this feel generic?
- Does it feel like a real security product?
- Is the information hierarchy strong?
- Does the visualization communicate something useful?
- Is the page visually memorable?
- Is the density appropriate?
- Are interactions meaningful?
- Does realistic mock data make the product believable?
- Would this look credible beside a mature security platform?

If the result feels generic, **iterate**.

Do not defend a weak implementation simply because it satisfies the initial component requirements.

## 7. Build for the current phase

Do not prematurely optimize for production infrastructure.

During initial product development, prioritize:

1. Product clarity
2. UX quality
3. Visual quality
4. Workflow completeness
5. Realistic mock data
6. Fast iteration
7. Clean architecture that can evolve

Production concerns such as:

- real integrations
- production datasets
- complex infrastructure
- advanced observability
- migration systems
- performance optimization
- operational scaling

should only be introduced when the current task actually requires them.

Do not spend hours solving future problems while the product experience is still being discovered.

## 8. The 10× rule

Use the 10× rule as a product-quality check, not as bureaucracy.

For significant work ask:

- Is this substantially clearer?
- Is the workflow substantially easier?
- Does it create a better security-operation experience?
- Does it increase trust?
- Does it make future development easier?

If yes, proceed.

Do not turn the rule into unnecessary documentation or approval gates.

## 9. Documentation

Documentation should support development, not slow it down.

Update architecture/design/domain documents when a decision is genuinely important or changes the direction of the system.

Do NOT create a decision document for every ordinary implementation choice.

Prefer building and validating the experience first.

## 10. Definition of done

For an initial product/UI task:

```text
Inspect
  ↓
Understand
  ↓
Research when useful
  ↓
Design
  ↓
Build with realistic mock data
  ↓
Run / inspect
  ↓
Iterate
  ↓
Deliver
```

## Product integrity

Even in build mode, mock data must be internally honest: it should behave like real data, be structured so a real query can later replace it cleanly, and never be presented as a real integration, a real production dataset, or a claim about actual users/traffic/revenue outside the product itself. "Do not label mock data in the UI" (Section 1) is a UI-polish decision, not a license to claim a fake integration is real, or to blur mock and production data stores together.
