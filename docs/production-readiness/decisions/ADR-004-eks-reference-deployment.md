# ADR-004: Use EKS as the First Production Reference Deployment

- Status: Accepted working assumption
- Date: 2026-06-20
- Related gaps: SEC-004, SEC-005, SEC-006, DEPLOY-001, DEPLOY-002, DR-001

## Context

kprobe needs a concrete production environment to make capability, identity,
network, storage, availability, and operational choices testable. The existing
documentation already targets EKS and financial infrastructure commonly uses
AWS-managed identity and secret services, but no actual deployment artifacts
exist.

## Decision

The first reference deployment targets a single AWS region on EKS with EC2
worker nodes. The probe runs as a capability-minimized DaemonSet. Regional
services use Kubernetes workloads or appropriately selected managed services.
AWS workload identity and Secrets Manager are the default identity/secret
integration points.

The application architecture must remain Kubernetes-portable; AWS-specific
behavior stays behind deployment/configuration boundaries.

## Consequences

- Fargate cannot host the kernel probe.
- Helm and Kubernetes tests target EKS semantics first.
- IAM/IRSA, private networking, load balancing, storage classes, and secret
  rotation become part of the reference design.
- A different first production target requires updating the execution plan and
  replacing this working assumption before Phase 5 begins.

## Revisit When

Confirm before Phase 5 implementation. Earlier phases must not hard-code AWS
behavior into event contracts or core services.
