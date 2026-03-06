# 05 — Communication Plan

## 1. Stakeholder Identification

### Stakeholder Map

| Stakeholder | Role | Interest | Influence |
|-------------|------|----------|-----------|
| Engineering Manager | Project owner; architecture approval | System design, decisions, team velocity | High |
| Backend Engineer(s) | Core implementors | Technical clarity, unblocked work | High |
| Frontend Engineer(s) | UI implementors | Clear API contracts, design specs | High |
| QA Engineer | Test coverage | Acceptance criteria, test environments | Medium |
| DevOps / Platform | Infrastructure and deployment | Infra requirements, secrets management | Medium |
| Product Manager | Requirements and sign-off | Feature scope, UAT approval, timeline | High |
| Business Stakeholders | Sales, Support, Leadership | Business impact, go-live timeline | Medium |
| End Users (Customers) | Review submitters | Submission reliability, feedback | Low (indirect) |
| Internal Moderators | Review queue operators | Dashboard usability, workload | Medium |

### RACI Matrix

| Activity | Eng Manager | Backend Eng | Frontend Eng | QA | DevOps | Product Manager |
|----------|------------|-------------|--------------|-----|--------|-----------------|
| Architecture decisions | **A** | R | C | I | C | I |
| API design | **A** | R | C | I | — | C |
| Database schema | **A** | R | — | I | I | I |
| Sprint planning | **A** | R | R | R | C | C |
| Code review | **A** | R | R | I | — | — |
| UAT sign-off | C | I | I | R | — | **A** |
| Go-live decision | **A** | C | C | C | C | R |
| Post-release monitoring | I | **A** | I | C | R | I |

> R = Responsible, A = Accountable, C = Consulted, I = Informed

---

## 2. Communication Channels and Cadence

### Regular Meetings

| Meeting | Participants | Frequency | Duration | Format | Purpose |
|---------|-------------|-----------|----------|--------|---------|
| Daily Standup | Engineering team | Daily (weekdays) | 15 min | Sync call or async Slack | Blockers, progress, coordination |
| Sprint Planning | All team | Start of each sprint | 1 hr | Video call | Select tasks, assign owners |
| Sprint Review | All + PM + stakeholders | End of each sprint | 30 min | Demo + video call | Demo working features |
| Sprint Retrospective | Engineering team | End of each sprint | 30 min | Video call | Process improvements |
| Architecture Review | Eng Manager + Backend | As needed (major decisions) | 45 min | Video call | Design sign-off |
| Stakeholder Update | PM + Business Stakeholders | Weekly | 30 min | Email or call | Progress, risks, timeline |

### Asynchronous Communication

| Channel | Used For | SLA |
|---------|----------|-----|
| GitHub Pull Requests | Code review, technical discussion | Review within 1 business day |
| DECISION_LOG.md | Recording architectural decisions | Updated within same day of decision |
| Slack / Team Chat | Day-to-day questions, quick syncs | Respond within 4 hours |
| Email | Formal stakeholder updates, go/no-go decisions | Respond within 1 business day |
| JIRA / Linear / GitHub Issues | Task tracking, bug reports | Triaged within 1 business day |

---

## 3. Status Reporting

### Weekly Status Update Template (PM to Business Stakeholders)

```
Product Review Service — Weekly Update
Week of: [date]

STATUS: [Green / Amber / Red]

COMPLETED THIS WEEK:
- [task 1]
- [task 2]

IN PROGRESS:
- [task in flight and % complete]

BLOCKERS:
- [blocker description, owner, ETA to resolve]

UPCOMING NEXT WEEK:
- [task 1]
- [task 2]

RISKS:
- [any new or changed risks from 01_PROJECT_PLANNING.md]

MILESTONE TRACKER:
  Milestone 1 (Database): [Done / On Track / At Risk]
  Milestone 2 (Submission): [Done / On Track / At Risk]
  Milestone 3 (Moderation): [Done / On Track / At Risk]
  Milestone 4 (Display): [Done / On Track / At Risk]
  Milestone 5 (Production): [Done / On Track / At Risk]
```

### Traffic Light Criteria

| Status | Meaning |
|--------|---------|
| Green | On track; no blockers; milestone dates unchanged |
| Amber | Minor risk or small delay (< 1 week); mitigation in place |
| Red | Blocker with no clear resolution; milestone at risk of missing by > 1 week |

---

## 4. Decision Communication

All architectural and product decisions must be:
1. Discussed synchronously (standup, architecture review, or Slack thread)
2. Documented in `DECISION_LOG.md` within 24 hours
3. Communicated to affected team members via the relevant PR or Slack message

No significant technical decision is considered final until it is in `DECISION_LOG.md`.

### Decision Escalation Path

```
Engineer identifies decision point
        │
        ▼
Can it be resolved within the team?
  YES → Document in DECISION_LOG.md; notify Eng Manager in standup
  NO  →
        │
        ▼
Eng Manager + PM alignment call (same day if blocking)
        │
        ▼
Decision recorded in DECISION_LOG.md with rationale
        │
        ▼
If it affects timeline → PM notifies Business Stakeholders in weekly update
```

---

## 5. Incident and Escalation Communication

### Severity Levels

| Level | Description | Example | Response Time |
|-------|-------------|---------|---------------|
| P1 Critical | System down or data loss | All reviews returning 500; PII exposed in response | 15 minutes |
| P2 High | Major feature broken | Moderation queue empty despite flagged reviews | 1 hour |
| P3 Medium | Degraded functionality | Statistics stale; priority filter not working | 4 hours |
| P4 Low | Minor cosmetic or non-blocking | Styling issue; typo in error message | Next sprint |

### Incident Response Communication

**P1/P2 — Immediate notification:**
1. Engineer who detects it posts in incident channel immediately
2. Engineering Manager paged within 5 minutes
3. Product Manager notified within 15 minutes
4. Business Stakeholders informed if user-facing impact within 30 minutes
5. Status updates every 30 minutes until resolved
6. Post-incident write-up within 24 hours

**P3/P4:**
- File GitHub issue; assign to backlog
- Mention in next standup
- No immediate escalation required

---

## 6. Go-Live Communication

### Announcement Template (to Business Stakeholders)

```
Subject: Product Review Service — Go-Live [Date]

We are pleased to announce that the in-house Product Review Service
will go live on [date] at [time].

What's changing:
- Customer review submissions now handled by our own system
- Reviews will be automatically moderated before publication
- Internal moderation dashboard available at [URL]
- Full audit trail of all review decisions

What's not changing:
- Customer experience for submitting reviews remains the same
- Published reviews continue to appear on product pages

Rollback capability:
- The old third-party system remains available in read-only mode
  for 2 weeks as a fallback

Contact: [PM name] for business questions; [Eng Manager name] for technical questions.
```

### Moderator Onboarding Communication

Before go-live, internal moderators receive:
1. A walkthrough of the Moderation Dashboard (live demo)
2. A brief guide on the three-tier system (what HIGH/MEDIUM/LOW means)
3. Instructions on how to interpret moderation notes (risk score + flags)
4. Contact point for technical issues with the dashboard
