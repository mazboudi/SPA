# Response to EUC Leadership Feedback — Software Delivery Automation

> **Draft — for collaborative review before sending**

---

Hi [Name / Team],

Thank you for this feedback — and more importantly, for the candour behind it. We have been sharing design documents, architecture decisions, and progress updates throughout this initiative, and your consolidated review gives us exactly the kind of structured input we need to make sure we are solving the right problems in the right order. The goal of this response is not to defend what has been built — it is to share where we are, be transparent about a pivot we are proposing, and identify where we genuinely need to work through decisions together.

We will address each of the four areas you raised directly.

---

## 1. The request and intake experience — we agree this is the priority

Your framing is exactly right, and it is worth being explicit about why this problem is harder than it looks.

**The current state is broken in a structural way.** Today, the software approval process relies on two static SharePoint lists — one for approved software, one for denied — that are entirely disconnected from the request and intake workflow, disconnected from packages created by packagers, and disconnected from what is actually published and assigned in Intune. There are no naming standards, no versioning, and no reliable way to relate a given package to the title that was approved, the request that triggered it, or the assignment that was deployed. As a result:

- Users submit requests for software that is already packaged and available, with no visibility at the point of request
- Requests arrive for denied software without the requestor knowing it was ever denied
- Packagers have no authoritative source to validate what they are being asked to build
- There is no single record that tracks a title from approval → packaging → publishing → assignment

There is also a subtler but equally important gap: the existing lists carry no machine-readable version rules. EUC's approvals are version-aware — software is approved at a version floor, meaning "this version and above" — but that constraint exists only as text written for a person to read. No system today can evaluate it at the point of a request. A user asking for an outdated or vulnerable version of approved software receives no different response than one asking for a current one. This is not a process failure; it is a data structure problem, and it is one of the core things the new catalog design is built to solve.

Establishing an **authoritative, integrated software list** — one that manages approval state, version constraints, packaging state, and publishing state as a single record of truth — is one of the foundational problems this initiative set out to solve. Everything else depends on it.

---

## 2. The intake portal — more progress than you may realize, and a pivot we want to discuss

We want to be transparent about where we are and where we are headed — including why the ServiceNow path did not work, because the reason matters for what comes next.

We completed meaningful build work with the ServiceNow team — a working scoped application, request form logic, and governance routing built against a real development instance using actual data from your approved and denied lists. Through that work, two conclusions became clear, and together they make ServiceNow the wrong platform for this requirement.

First, the platform cannot express the version rule that is at the core of EUC's requirement. Approvals are version-aware — "approved at this version and above" — but ServiceNow's governance model attaches decisions to a title, not a version. There is no operator in the platform to represent a version floor constraint. This is not a configuration gap that can be worked around; it is a platform boundary.

Second, even setting that aside, the ServiceNow team indicated that building and loading a governed software catalog for the EUC workstation population is a substantial undertaking — on the order of six to nine months of prerequisite data work, separate from any development effort. That does not fit the delivery timeline, and it has not started.

The conclusion from that work is a clean pivot: **ServiceNow is out of scope for both the catalog and the governance workflow.** We are not looking to split the problem between platforms.

However — and this is important context — **we have not been waiting on ServiceNow to do the work**. The SPA intake portal is already built. We developed it with a stubbed backend API specifically designed to be wired to a governance and catalog layer once that layer was confirmed. The front-end experience — the request form, the catalog validation flow, the packager workbench pre-population — is functional today. What remains is connecting it to the right back-end.

We are proposing the **Microsoft 365 ecosystem** as that back-end — Microsoft Teams and Power Automate for the governance and approval workflows, with SharePoint as the structured catalog data layer. This approach:

- Keeps the solution in the tools your teams already use every day
- Allows version-aware approval rules to be stored and evaluated — the core requirement ServiceNow could not meet
- Lets us build approval routing, ASL/DSL logic, and packaging state tracking on our own schedule, without external dependency
- Gives EUC direct visibility and ownership of the catalog and request experience
- Means the intake portal we have already built is the front-end — we are wiring it to the right back-end, not starting over

There are a few integration patterns worth evaluating together — how the catalog is structured in SharePoint, how Power Automate handles approval routing, and how the intake portal connects to both — and we do not want to decide those details unilaterally. **We would like to schedule a working session to walk through the options and agree the approach.**

The scenarios you asked to see — catalog validation at intake, the experience when software is already packaged, the denied software path, the net-new workflow, manual step removal — remain the design intent. The intake portal already demonstrates most of these. What we need to align on is the catalog and workflow design so we can wire it up.

---

## 3. Supportability and operational model of the packaging factory

We understand the concern and want to address it honestly.

The packaging automation (the GitLab pipelines, the packaging workbench, the PSADT framework, and the Intune/Jamf deployment modules) is built on standard, documented, industry-used components. None of the core packaging tooling is bespoke:

- **PSADT** is an open-source industry standard — not a custom framework we built
- **GitLab CI templates** follow standard YAML conventions and are versioned and documented
- **Microsoft Graph API** is the Microsoft-supported path for Intune automation
- **Terraform + Jamf Pro provider** is a maintained, community-standard integration

On your specific questions:

| Question | Where we are |
|----------|-------------|
| Support model post-implementation | The platform is designed for EUC packagers to operate day-to-day. Templates, schemas, and the workbench are documented. A structured knowledge transfer plan is part of our close-out scope. |
| Documentation | Design document, integration guide, workbench user guide, and schema reference already exist. We can define a KT plan together. |
| Ongoing maintenance | Framework components are independently versioned. Title repos pin to specific versions. There is no monolithic upgrade — individual components can be updated independently. |
| Ownership post-transition | We do not want to define this unilaterally. We have a point of view and are ready to discuss it with EUC leadership and platform engineering. |
| Troubleshooting | Pipeline failures produce structured logs. Schema validation surfaces configuration errors before packaging runs. We can document runbooks together. |

We also want to acknowledge your point that **packaging execution is not the primary bottleneck**. We agree. The pipeline's value is in standardization — every title built the same way, validated against the same schemas, with consistent detection and deployment patterns — and in connecting packaging state back to the authoritative software list. Cycle time improvements will primarily come from the intake and catalog changes, not from packaging speed.

---

## 4. Target-state operating model — let's build this together

This is the area where we owe you the most, and where we have fallen short in not bringing you into the design process earlier. We do not yet have a side-by-side view of what the current process looks like step-by-step versus what the future state removes or reduces — and that is something we cannot produce without you.

Here is what we do know:

- **What is being automated or removed:** Intake re-entry, manual catalog lookups, duplicate request discovery, packaging file scaffolding from scratch, manual status tracking, PSADT v3 → v4 migration for existing titles
- **Which teams will see reduced effort:** EUC coordinators spend less time routing and chasing status. Packagers spend less time on boilerplate and repetitive configuration. The degree of change for HCL is a conversation we need to have together.
- **Cycle time reduction:** We cannot put a number on this without baselining the current process. We would like to do that exercise jointly — walk through a real request from submission to assignment and time each step.
- **Business outcomes:** Fewer duplicate requests reaching packagers, standardized packages that pass Intune and Jamf validation the first time, a single record of truth for software state from approval through deployment

Before we get to next steps, we also want to make sure the value of what has been built is clearly understood — because we have not communicated this well enough.

**What the SPA Workbench and framework actually deliver for packagers:**

The honest comparison is this: using Intune by itself to build Win32 apps is a rigid, manual, error-prone process — every required field must be filled in, the `.intunewin` file manually generated and uploaded, no ability to clone, no way to pick up where you left off. The SPA Workbench changes that fundamentally:

- **Clone existing packages** — one of the most common packaging tasks (new version of an existing app) is reduced from a multi-step, copy-paste exercise across two browser windows to a single "Clone Title" operation. This is functionality Intune does not have natively and that was available in Configuration Manager.
- **Automated `.intunewin` generation** — packagers no longer follow the manual preparation process. It runs automatically as part of the pipeline.
- **Guided scaffolding for new titles** — the workbench steps packagers through every phase: installer details, detection rules, PSADT lifecycle actions, Intune metadata. Nothing is skipped or left to tribal knowledge.
- **PSADT v4 always enforced** — packagers cannot accidentally use outdated templates. The latest approved version with EUC-approved configuration is applied automatically. Existing v3 scripts are converted automatically — a conversion capability that is more robust than PSADT's own native tools and has been tested on the most complex real-world scripts.
- **GitLab as the single source of truth** — every version of every package is stored, versioned, and retrievable. Packagers no longer ask "where's the latest PSADT template for this app?" or search file shares. One packager can pick up where another left off. The location of installation binaries is recorded in the project.
- **Incremental saves, not all-or-nothing** — unlike Intune, the workbench lets packagers commit partial work and return to it. A project does not need to be complete before it is saved.
- **Visual Action Builder** — simple apps can be packaged in minutes. Complex, multi-step deployment scripts can be constructed through a UI without writing raw PowerShell from scratch.
- **One-click publish** — once a project is complete, publishing to Intune (create or update) is a single action. The pipeline handles the rest.

This is the packaging layer. It is built, it works, and it meaningfully reduces the effort and variability involved in creating and maintaining packages. The workbench already knows the state of every package — when it was built, what version was published, what Intune App ID it received. Connecting that state back to an authoritative software catalog is largely a matter of wiring the workbench to call back and update the catalog record at each stage. The integration points are already designed. The catalog itself is what we need to finalize together.

---

## Summary — what we are asking for

We would welcome three working sessions in the near term:

1. **Intake and catalog design session** — Walk through the proposed Teams/Power Automate approach to governance workflows and the software catalog model. We want your team's input on what the right data model looks like, how approval states should be managed, and what the requestor experience should feel like.

2. **Current-state process mapping** — A joint session with EUC (and HCL if appropriate) to map the current intake and packaging process step by step. This gives us a shared baseline to measure against and surfaces the specific steps we can target for elimination.

3. **Operating model and ownership conversation** — A conversation with the right stakeholders to define post-transition ownership, documentation expectations, and how support will work after the project closes.

Throughout this initiative, we have invested heavily in documentation, architecture design, and sharing our thinking — the design document, integration guides, schema references, and workbench guides exist precisely because we have been trying to create opportunities for meaningful input. We recognise that joint working sessions have been harder to schedule than either side would have liked, and we want to make that a priority going forward. We are not asking for more patience — we are asking for dedicated time, on a regular cadence, so we can move through the remaining decisions together rather than in isolation.

Looking forward to continuing the conversation.

---

*— [Your Name], EUC Software Delivery*

> **Internal notes (remove before sending):**
> - Confirm HCL's involvement in the process mapping session before committing
> - Align on whether SharePoint List is the right data layer, or Dataverse/Teams-native — decision shapes Power Automate design
> - Before the design session: profile the version constraint column across the full ASL/DSL to confirm expressions are machine-parseable ("18.0.0 and above" works; "any supported version" or blanks do not) — roughly an hour of work, decides the viability of the flat-table approach
> - Decide whether to share the design document and/or the handover summary as pre-read for the catalog design session
> - Confirm whether the server/mainframe team's catalog scope could be extended to workstations — worth one conversation before building a parallel solution
