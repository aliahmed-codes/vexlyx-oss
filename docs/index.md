---
layout: home

hero:
  name: "Vexlyx"
  text: "Open-Source Hybrid Hosting Panel"
  tagline: Deploy Next.js, Node.js, PHP, WordPress & more — AND manage email, DNS, domains, and databases — all on one server.
  image:
    src: /hero-screenshot.png
    alt: Vexlyx Dashboard
  actions:
    - theme: brand
      text: Get Started
      link: /guide/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/atlantiqs-org/vexlyx

features:
  - icon: 🚀
    title: Modern App Deployment
    details: Zero-config deployment for Next.js, Node.js, Python, React, static sites, PHP, and WordPress via Nixpacks. Git push or manual deploy.
  - icon: 📧
    title: Traditional Hosting
    details: Full email stack (Postfix + Dovecot + Roundcube), CoreDNS zone management, SSL certificates via Traefik, and MySQL/PostgreSQL provisioning.
  - icon: 🔐
    title: Security First
    details: Argon2id passwords, Redis-backed HTTP-only sessions, 2FA/TOTP, fine-grained permissions, firewall management, and AES-256-GCM secrets.
  - icon: 🌐
    title: One Server, Everything
    details: No multi-server complexity. Traefik handles SSL termination and routing. Docker isolates every app. One panel controls everything.
  - icon: 🏗️
    title: Modern Stack
    details: Next.js 15 frontend, Fastify backend, Prisma ORM, BullMQ queues, Socket.io real-time, Turborepo monorepo.
  - icon: 📖
    title: Open Source
    details: MIT licensed. Self-host without vendor lock-in. Community-driven features and transparent development.
---
