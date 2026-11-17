# AWS CI/CD Practice

A deliberately small full-stack app used to practise AWS deployment pipelines.
The app itself does almost nothing — the point is the path it takes to get live.

```
frontend/    React + Vite static site   ->  S3 + CloudFront
backend/     Express API in a container ->  ECR + ECS Fargate
```

Each folder has its own `buildspec.yml`, the recipe CodeBuild follows.

The page prints its own build settings — environment, API URL, build timestamp —
and the backend's hostname and version. That makes a deploy **visible**: after a
commit reaches production, those values change on screen.

---

## Running locally

Two terminals.

```bash
cd backend
npm install
npm start           # http://localhost:4000

cd frontend
npm install
cp .env.example .env
npm run dev         # http://localhost:5173
```

---

# Part 1 — The frontend chain

Read this as a chain. **Each piece exists only because the one before it left a gap.**

### 1. The site is just files

A React build produces HTML, CSS and JavaScript. Nothing needs to execute on a
server. *So we need somewhere to put files* → **S3**, a bucket that serves files
over HTTP.

### 2. But S3 alone is slow and insecure

S3 serves from one region, over plain HTTP, and making it a public website means
opening the bucket to the world. *So we need something in front* → **CloudFront**,
a CDN that caches copies worldwide and gives free HTTPS.

### 3. But now CloudFront has to read a private bucket

If we keep the bucket private, CloudFront cannot read it either. *So we need a way
to let in exactly one distribution* → **Origin Access Control (OAC)** plus a bucket
policy naming that distribution and nothing else.

### 4. But someone has to run `npm run build`

Files do not appear by themselves. *So we need a build machine* → **CodeBuild**, a
rented Linux box that clones the repo, installs dependencies, builds, and uploads
the result.

### 5. But CodeBuild needs instructions

It does not know this is a Vite project. *So we need a recipe in the repo* →
**`buildspec.yml`**, listing the commands to run in order.

### 6. But something has to start the build on every push

*So we need a trigger* → **CodePipeline**, which watches GitHub and runs the
stages in order.

### 7. But AWS cannot read a private GitHub repo

*So we need authorisation* → a **CodeConnections** connection, approved once in
the browser.

### The result

```
git push
   -> CodePipeline notices
   -> CodeBuild: npm install, npm run build
   -> aws s3 sync dist/ s3://bucket --delete
   -> CloudFront invalidation
   -> live
```

---

# Part 2 — The backend chain

The backend needs far more pieces, and for one reason: **it is a process that must
keep running**, not a folder of files.

### 1. The API must keep running

A static file is served on request. An Express server must be alive, listening on
a port, before any request arrives. S3 cannot do that.

### 2. "Works on my machine" is not enough

The server needs Node, the right version, the right dependencies and the right OS
libraries. *So we need to package the app with its whole environment* →
**Docker**, which builds an **image** — the app plus everything it needs to run.

### 3. But an image on a laptop helps nobody

AWS has to be able to pull it. *So we need a registry* → **ECR**, a private Docker
registry in the account.

### 4. But a registry only stores images

Something has to actually run one. *So we need an orchestrator* → **ECS**, which
starts containers, restarts them when they crash, and replaces them on deploy.

### 5. But ECS needs somewhere to group things

ECS does not run loose containers. It needs a named space to put them in.
*So we create a **cluster*** — a logical grouping, created first because
everything else attaches to it.

A cluster is **not a machine**. Nothing is reserved and nothing is billed. It is
closer to a folder: it holds services and tasks so they can be managed and
monitored together. Creating one is a single step with a name, and the only real
decision is Fargate vs EC2.

Why it exists at all: one account can run many unrelated workloads. The cluster
is what keeps this project's containers separate from everyone else's.

### 6. But a cluster still needs machines underneath

*So we need compute* → **Fargate**, where AWS provides and manages the servers
invisibly. (The alternative, EC2, means you run and patch the servers yourself.)

This is the distinction worth remembering: **ECS is the orchestrator, Fargate is
one way to give it compute.** They are not alternatives to each other.

### 7. But ECS needs to know what to run

*So we need a spec* → a **task definition**: which image, how much CPU and memory,
which port, which log group. Think of it as a recipe card. Every edit creates a
new numbered **revision**, so rollback is just picking an older number.

### 8. But a container gets a new private IP every time it restarts

Nothing can point at a moving address. *So we need a stable front door* → an
**Application Load Balancer (ALB)** with a permanent DNS name.

### 9. But the ALB needs to know where to send traffic

*So we need a list of destinations* → a **target group**, which ECS registers
containers into automatically. It also **health-checks** them, so a broken
container never receives traffic.

### 10. But everything in AWS is firewalled by default

*So we need firewall rules* → **security groups**. Two of them, and the pairing is
the whole point:

| Group | Allows |
|---|---|
| `alb-sg` | anyone on the internet → port 80 |
| `task-sg` | **only the ALB's security group** → port 4000 |

The second rule names a *group*, not an IP range. Containers come and go with new
IPs; group membership stays true. The container is therefore unreachable from the
internet — only the load balancer can talk to it.

### 11. But the ALB must live somewhere reachable

*So we choose the network* → a **VPC** and **public subnets** (they have a route
to the internet gateway), across at least **two availability zones**.

### 12. But someone has to build and push the image

*So we reuse CodeBuild*, this time running `docker build` and `docker push`.
It needs the **privileged** flag enabled, because running Docker inside a
container requires elevated permissions.

### 13. But the deploy stage does not know which image was just built

The build and deploy stages are separate and do not talk. *So the build leaves a
note* → **`imagedefinitions.json`**, holding the container name and the exact
image URI. The deploy stage reads it and rolls the service forward.

### The result

```
git push
   -> CodePipeline
   -> CodeBuild: docker build, docker push to ECR, write imagedefinitions.json
   -> ECS: start new container, health-check it, drain the old one
   -> live, with no downtime
```

---

# Part 3 — Joining the two halves

Both sides worked, and the site still could not call the API.

**The problem:** the site is on `https://...cloudfront.net`. The API is on
`http://...elb.amazonaws.com`. A browser **refuses** to let an HTTPS page call an
HTTP address. This is **mixed content**, and it shows as `Failed to fetch` with
**nothing in the server logs** — the request never left the browser.

**The fix:** stop having two addresses. CloudFront already speaks HTTPS, so let it
forward API calls too.

1. Add a second **origin** on the distribution → the ALB's DNS name, HTTP only, port 80
2. Add a **behaviour** → path `/api/*`, pointing at that origin, with:
   - **CachingDisabled** — API answers differ per request and per user
   - **AllViewer** — otherwise CloudFront strips the headers and query string
   - all HTTP methods — the default is GET/HEAD only, which blocks every POST
3. Set the frontend's `VITE_API_URL` to **empty**, so it requests `/api/health`
   relatively and the browser fills in the current domain

```
Browser  --https-->  CloudFront  --- /api/* ? ---+--- no --> S3 (the site)
                                                 |
                                                 +--- yes -> ALB :80 -> container :4000
```

The HTTP hop now happens inside AWS, where the browser cannot see it.

---

## Three numbers that must agree

The commonest backend failure. All three must equal the port the app actually
listens on (here, **4000**):

1. the port in `server.js`
2. `containerPort` in the task definition
3. the target group's port

The ALB **listener** is separate and stays on **80** — that is the public side.

---

## Frontend vs backend, side by side

| | Frontend | Backend |
|---|---|---|
| What ships | files | a running process |
| Where it lands | S3 bucket | ECS container |
| Deploy means | overwrite files | replace containers |
| Needs a load balancer | no | yes — the IP keeps changing |
| Build output | `dist/` | a Docker image |
| Rollback | re-run an older build | point at an older image tag |

---

## Deployment notes

Settings are injected **at build time**, not committed. `frontend/buildspec.yml`
writes `.env` from CodeBuild environment variables before running the build — which
is why a local build and a deployed build never produce identical files, and why
changing an environment variable requires a **rebuild**, not just a cache
invalidation.

In a buildspec, **the working directory carries between phases but shell variables
do not**. That is why `cd backend` appears once, and `REPO_URI` is recomputed in
each phase that uses it.

Each backend image is tagged with its **commit SHA**, so any running container can
be traced back to the exact source that produced it, and rollback is a matter of
pointing at an older tag.

The S3 bucket stays **private**. CloudFront reads it through Origin Access Control,
and the bucket policy allows that one distribution and nothing else.

---

## Gotchas learned the hard way

- **Two triggers = corrupted deploy.** Enabling both a CodeBuild webhook *and* a
  pipeline runs two builds at once. With content-hashed filenames and
  `s3 sync --delete`, one build's `index.html` ends up referencing the other
  build's deleted JavaScript. Pick one trigger.
- **One repo, two pipelines, both fire on every push.** Pipelines watch a repo and
  branch, not a folder. Fix with trigger **file-path filters** (`backend/**`,
  `frontend/**`).
- **A fixed ECS service looks broken for 5 more minutes.** That is the old task
  **draining**. Check the service events for `steady state` and compare timestamps
  before hunting a second cause.
- **An ALB needs 8 free IPs per subnet.** A `/28` subnet with 7 free fails with
  `InvalidSubnetException`. Pick a different AZ.
- **A load balancer cannot be stopped**, only deleted. It bills hourly from
  creation regardless of traffic.
- **Recreating an ALB gives it a new DNS name.** Every reference to the old one —
  CloudFront origin, frontend config — must be updated.
- **Leave the ECS service name blank and the console invents one**
  (`<family>-service-<random>`), which silently breaks the pipeline's deploy stage.

---

## Cost

| Resource | Cost |
|---|---|
| Load balancer | ~$17.50/month, from creation to deletion |
| Fargate task (0.25 vCPU, 0.5 GB, 24/7) | ~$9/month |
| CodePipeline | first free, then $1/month each |
| ECS cluster, task definitions, target groups, security groups, VPC | free |
| CodeBuild | per build-minute only |
| S3, CloudFront, ECR at this scale | pennies |

**The rule:** anything *reserved* for you bills hourly whether used or not.
Anything that only stores or waits is free or nearly free.

See [DELETE-RESOURCES.md](DELETE-RESOURCES.md) for teardown and rebuild steps.

---

## Evidence

`screenshots/` holds the working stack before teardown, including
`_working-proof.txt` — a live `200` from `/api/health` through CloudFront, showing
the deployed code's own version string.
