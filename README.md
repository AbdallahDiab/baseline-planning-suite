# Baseline Planning Suite

Baseline Planning Suite plans employee capacity and delivery allocations month by month.

Three frontends are built separately and composed in the browser:

- **Shell** hosts the page and the other two applications.
- **People** owns the employee register and rate history.
- **Delivery** owns projects, the work breakdown, allocations, and the staffing grid.

They share one API. This repository is a case-study implementation of that split. It is not a production operations platform.

## Quick start

Docker is the path that does not require Node on the host. From a clean clone:

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080).

The same command with `-d` starts the stack in the background. Stop a foreground run with Ctrl+C, then:

```bash
docker compose down
```

`docker compose down` stops the containers and keeps saved edits. Restoring the original fixture is described under [Persistence and reset](#persistence-and-reset).

The gateway is the only published port. People, Delivery, and the API are reached through that origin.

## Repository map

| Path | Ownership |
| --- | --- |
| `apps/shell` | Host page: section layout, display currency, active user, and the planning event bus. |
| `apps/people` | Employee register and rate-history writes. |
| `apps/delivery` | Projects, work breakdown, allocations, pricing, capacity, and the staffing grid. |
| `apps/api` | Authoritative HTTP API and the JSON working store. |
| `packages/contracts` | Shared request and event types. It does not calculate or store planning data. |
| `packages/delivery-domain` | Pure planning rules: rates, units, pricing, capacity, work-breakdown structure, and display rounding. |

## Micro-frontend architecture

Each frontend is a separate production build:

- React and ReactDOM `18.3.1`
- Rspack `2.2.8`
- Module Federation through `@module-federation/enhanced` `2.9.2`

Shell is the host. People and Delivery are remotes. Shell’s build does not contain their URLs. On startup the gateway writes `/config.json` from `PEOPLE_REMOTE_URL` and `DELIVERY_REMOTE_URL`. Shell fetches that file with `cache: no-store` and registers the remotes at runtime. The Compose defaults are `/people/mf-manifest.json` and `/delivery/mf-manifest.json`.

React, `react/jsx-runtime`, ReactDOM, and `react-dom/client` are one shared singleton. A remote does not bring a second copy of React.

People and Delivery are the same builds in both roles. Each image can render its own page, and Shell can load `./App` from that same image. Through the gateway those standalone pages are:

- [http://localhost:8080/people/](http://localhost:8080/people/)
- [http://localhost:8080/delivery/](http://localhost:8080/delivery/)

Compose publishes only port `8080`. This repository does not demonstrate deploying the three frontends to separate public origins.

## Runtime ownership

Shell owns:

- the People and Delivery section labels
- display currency, fixed to `EUR`
- the active user passed into both remotes (`Baseline Operator`)
- the in-memory planning event bus

People owns:

- the employee register
- employee rate-history writes

Delivery owns:

- the work breakdown
- allocations
- pricing calculations
- capacity calculations
- the staffing grid

The API remains the authoritative server state. Remotes do not treat each other’s memory as stored data.

## Cross-MFE synchronization

A change follows one path:

1. The owning remote sends the mutation to the API.
2. The API accepts it and writes the working store.
3. The owning remote publishes a small signal on the shell bus.
4. The other remote invalidates its own query.
5. That remote refetches the API.

The event identifies what changed. It is not a second copy of employees, rates, or allocations. People and Delivery each keep a separate TanStack Query client, so one remote cannot update the other by writing into shared query cache.

Two cases are visible while both panels stay open:

- A People rate change updates an open Delivery **Cost** view without reloading the page.
- A Delivery allocation change updates People capacity without reloading the page.

A full page load also shows the saved API state, because the bus does not survive navigation.

## Canonical allocation

Person-months (PM) are the stored allocation. Hours, percent of capacity, and cost are derived for the selected month.

One person-month is the employee’s full month: `weeklyHours * workingDays / 5`. Percent of capacity is the person-month amount itself, so `0.50` PM is `50%`. Cost uses the effective hourly rates for that month.

The staffing grid can display any of the four units. Changing the unit only changes the view. A save converts the entered number back to person-months and stores that amount. Display-rounded numbers are not written.

## Pricing and effective rates

Rate history has a `validFrom` date and no end date. A rate applies on its start date and stays in force until a later rate supersedes it. The working calendar is Monday through Friday. Public holidays are ignored.

A rate that starts mid-month splits that month by working day. Days before the first rate have zero cost and are reported as missing coverage. Partial coverage stays explicit. The calculation does not invent a fallback rate.

## Golden reference

Employee **Adaeze Okafor** (`emp-001`) has a 40-hour week.

Rates:

- €80/hour from 2025-01-01
- €95/hour from 2026-03-12

Allocation `alloc-001` is 0.50 PM in March 2026, on **Design** (`wbs-012`). Design sits under Discovery, under Ledger migration, in **Ledger Consolidation**.

March 2026 has 22 working days: 8 before the rate change and 14 after it.

- 1 PM is 176 hours
- 0.50 PM is 88 hours
- daily allocated effort is 4 hours/day
- cost is €7,880.00
- capacity is 50.0%

The exact blended hourly rate is `7880 / 88`, which is `89.5454545...`. Four-decimal display formatting of that rate is €89.5455/hour. The staffing grid does not render a blended-rate column. For this cell it shows:

| Unit | Display |
| --- | --- |
| PM | `0.50` |
| Hours | `88.00` |
| % capacity | `50.0%` |
| Cost | `€7,880.00` |

In the Delivery panel, choose Ledger Consolidation, choose **Plan staffing** on Design, and read Adaeze Okafor’s **Mar 2026** cell.

## Display reconciliation

Calculations stay exact inside the domain. Rounding happens when a value is turned into text. A row, a column, and the grand total use largest-remainder distribution so the visible total matches the visible cells in minor units (cents, or tenths of a percent). Those rounded figures are display output. They are not stored, and they are not the rate used to invert a cost entry back into person-months.

## WBS invariants

A work breakdown has at most three levels: root, child, and grandchild.

- Parent rows are derived. Their staffing totals roll up descendants, and those cells cannot be edited.
- An allocated leaf cannot become a parent. Adding a child there is rejected, and moving another item under it is rejected.
- A move that would create a cycle is rejected.
- A move or create that would exceed three levels is rejected.
- Delete is rejected while the item still has children or allocations. Nothing is cascade-deleted.

## Capacity

Capacity sums an employee’s person-months across every project for that month. More than 1.00 PM (100%) is flagged. The edit is still saved.

The cause is the most recently edited allocation that still contributes a positive person-month. Seeded allocations have `updatedAt: null`, so seeded over-capacity has no cause. Editing a cell to zero person-months records the edit and cannot make that cell the cause.

On the grid, over-capacity shows the cross-project total. The cause label names the work-breakdown item when that allocation belongs to the project on screen. A cause that lives on another project is not assigned to a local item.

## Fixture dataset

The immutable seed is `fixtures/baseline-seed.json`.

- 60 employees
- 150 rate records, 1–4 per employee
- 10 mid-month rate changes
- 4 overlapping projects
- 90 work-breakdown items
- 720 allocations
- metadata horizon `2026-04` through `2027-03`

Ledger Consolidation starts on 2026-03-01. Visible months come from each project’s start and end dates, not from the metadata horizon. March 2026 is therefore a valid month for that project, and `alloc-001` is stored there. The horizon and the project dates disagree on purpose.

## Persistence and reset

The API keeps working state in a JSON file, `/data/baseline-store.json`, on the Docker volume `api-data`. The seed file stays inside the image and is not overwritten. The first start copies the seed into the volume and sets every allocation `updatedAt` to `null`. Later starts reload the working file, including edits.

`docker compose down` does not remove that volume. To return to the immutable fixture:

```bash
docker compose down -v
docker compose up --build -d
```

`-v` deletes `api-data`. The next start copies the seed again. `--build` rebuilds the images; the volume removal is what restores the data.

## Remote failure

Start from a healthy stack, then stop one remote:

```bash
docker compose stop delivery
```

Load [http://localhost:8080](http://localhost:8080) again. Shell stays up. People stays usable. The Delivery panel reports that Delivery is unavailable.

Restore it and load the page again:

```bash
docker compose start delivery
```

The same pair of commands works for People:

```bash
docker compose stop people
docker compose start people
```

Shell registers each remote for the life of that page. After a stop or a start, use a fresh load. The gateway keeps running; `depends_on` applies when the stack starts, not as a permanent bind that takes Shell down with a remote.

## API

All routes are under the gateway origin.

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/api/health` | Process health. |
| `GET` | `/api/employees` | Register. Optional `search` matches name or role. |
| `GET` | `/api/employees/:employeeId` | One employee. |
| `GET` | `/api/rates` | Rate history. Optional `employeeId`. |
| `POST` | `/api/rates` | Add a rate. |
| `PATCH` | `/api/rates/:rateId` | Edit `validFrom` or hourly cost. |
| `DELETE` | `/api/rates/:rateId` | Remove a rate. |
| `GET` | `/api/projects` | Projects. |
| `GET` | `/api/projects/:projectId/wbs` | Work breakdown for one project. |
| `GET` | `/api/projects/:projectId/allocations` | Allocations for one project. |
| `POST` | `/api/projects/:projectId/wbs` | Create a work-breakdown item. |
| `PATCH` | `/api/wbs/:itemId` | Rename and/or move an item. |
| `DELETE` | `/api/wbs/:itemId` | Delete an item when the invariants allow it. |
| `PUT` | `/api/allocations/cell` | Save one leaf cell as person-months. |
| `GET` | `/api/capacity` | Cross-project capacity. Optional `employeeId` and `month`. |

There are no employee or project create/update/delete routes.

## Testing and validation

Host checks use pnpm `10.18.2`, the version pinned in `packageManager`. The Docker quick start does not need them.

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` runs 134 tests.

## Key technical decisions

- **Person-months are the stored unit.** Hours, percent, and cost stay derivable, so a unit switch cannot fork the database.
- **Planning rules live in `packages/delivery-domain`.** The API and the Delivery UI call the same functions instead of each keeping a private formula.
- **The API is the source of truth.** Remotes refetch after a signal. A stale panel cannot outvote the working store.
- **Each remote has its own query client.** Cache updates do not leak across the federation boundary.
- **The event bus carries signals only.** It avoids a second model of rates and allocations, at the cost of a refetch after every accepted change.
- **Remote URLs come from `/config.json`.** The Shell bundle does not bake in People or Delivery locations. This repository proves that on one gateway, not across independent deployments.
- **State is a JSON file.** It makes the fixture reset a volume delete. It is not a multi-user database.
- **No UI kit, grid, tree, or global-store library.** Tables and the work breakdown are local markup. That keeps the dependency set small and leaves layout work in the application.

## Scope boundaries

This exercise does not include:

- authentication
- a dashboard
- employee create, update, or delete
- project create, update, or delete
- a mobile-specific experience
- a public-holiday calendar
- a production database
- WebSocket or server-sent events
- a full design system

## Technology

| Package | Version |
| --- | --- |
| React, ReactDOM | 18.3.1 |
| Rspack (`@rspack/core`, `@rspack/cli`) | 2.2.8 |
| `@module-federation/enhanced` | 2.9.2 |
| TanStack Query (`@tanstack/react-query`) | 5.104.1, in People and Delivery |
| Hono | 4.13.13 |
| `@hono/node-server` | 2.1.3 |
| Zod | 3.25.76 |
| Vitest | 5.0.3 |
| TypeScript | 5.9.3 |
| pnpm | 10.18.2 |

The API and build stage use `node:22-bookworm-slim`. The static images and the gateway use `nginx:1.27-alpine`. Calendar arithmetic is local code in `packages/delivery-domain`; there is no date library. Styling is plain CSS.
