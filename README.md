# AWS CI/CD Practice

A deliberately small full-stack app used to practise AWS deployment pipelines.
The app itself does almost nothing — the point is the path it takes to get live.

## What is here

```
frontend/    React + Vite static site  ->  S3 + CloudFront
backend/     Express API in a container ->  ECR + ECS Fargate
```

Each folder has its own `buildspec.yml`, the recipe CodeBuild follows.

## Why the app looks the way it does

The page prints its own build settings — environment, API URL, build
timestamp — and the backend's hostname and version. That makes a deploy
visible: after a commit reaches production, those values change on screen.

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

## Target architecture

```
Frontend
  commit -> CodePipeline -> CodeBuild -> S3 (private) -> CloudFront -> browser

Backend
  commit -> CodePipeline -> CodeBuild -> ECR -> ECS Fargate -> load balancer
```

## Deployment notes

Settings are injected at build time, not committed. `frontend/buildspec.yml`
writes `.env` from CodeBuild environment variables before running the build,
which is why a local build and a deployed build never produce identical files.

The S3 bucket stays private. CloudFront reads it through Origin Access
Control, and the bucket policy allows that one distribution and nothing else.

Each backend image is tagged with its commit SHA, so any running container can
be traced back to the exact source that produced it.
