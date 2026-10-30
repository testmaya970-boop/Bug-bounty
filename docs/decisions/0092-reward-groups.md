# 0092: Reward groups replace asset tiers

Status: accepted (2026-10-30). Migrations `202610300001_reward_groups.sql`, `202610300002_onboarding_reward_groups.sql`.

## Why

Tiers 1, 2 and 3 had no business meaning, there were always exactly three, and a lower tier
only paid a percentage of each program's table. Customers think in categories of assets
("Payments", "Public Website"), and want each to pay a table they set directly.

## Model

- `reward_groups`: organization-level, unlimited. Name (unique among active groups),
  description, color, icon, currency (INR/USD), order, one default, archived flag.
- `reward_group_bounties`: each group's own table, a from/up-to range per severity
  (critical, high, medium, low, informational). No multipliers between groups.
- `assets.reward_group_id`: every asset belongs to one group. New assets join the default
  group; archiving or deleting a group moves its assets to the default (which can't be
  archived or deleted until another group is the default).

## How a bounty uses it

Calculation is unchanged except where the range comes from. A trigger on
`report_bounty_decisions` takes the report's asset → its group → the group's row for the
calculated severity (priority-adjusted as before). With a row, that range and the group's
currency are used and `reward_group_id` / `reward_group_name` record it. Without one, the
program's own bounty table applies. `get_report_reward_suggestion` shows the same rule on the
report once it's accepted ("Asset → Reward group → Severity → Suggested"). Programs still need
a bounty policy (it also says whether the program pays at all).

## Migration

Every organization with assets got Core Platform (default, from Tier 1), High Value Systems
(Tier 2) and Standard Assets (Tier 3). Their tables were built from the organization's current
program table (active programs first, newest policy) with that program's tier percentages, so
no amount was lost. Then `assets.tier`, the programs' tier percentages, the decisions' tier
columns and the tier functions were dropped. Organizations with several programs whose tables
differed now share the groups' tables for assets in a group; adjust them on Bounty tables.

## Product surface

Sidebar section **Rewards**: Reward groups (cards: icon, color, description, asset count,
critical bounty, high/medium/low preview; search; drag-and-drop with keyboard up/down
equivalents; edit, duplicate, make default, archive/restore, delete; empty state; templates)
and Bounty tables (matrix of every group and severity, edit, CSV export). Assets page: a
Reward group dropdown per asset. Report page: Suggested reward. Onboarding: "Choose a reward
group template". Templates: SaaS, Banking, AI company, E-commerce, Healthcare, Government,
Custom; each creates five groups with starting tables in the chosen currency.

## Audit and history

Every change is an audit row; `reward_group.updated` stores the previous table, which is the
version history. Future items (asset tags, program-specific groups, campaigns, multipliers,
CSV import, API) fit on top: groups are plain rows keyed by organization.
