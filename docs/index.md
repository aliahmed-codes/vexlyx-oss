---
layout: home

hero:
  name: Vexlyx
  text: Documentation
  tagline: The open-source hybrid hosting control panel. Install it on your own server, deploy your first project, and go from there.
  image:
    src: /logo.svg
    alt: Vexlyx
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Read the reference
      link: /reference/

features:
  - title: Install in one command
    details: A fresh Ubuntu 24.04 server and a domain. The installer sets up Docker, Traefik, the mail stack, DNS and the panel, and is safe to re-run.
    link: /guide/getting-started
    linkText: Read the getting started guide
  - title: How it is built
    details: A Next.js dashboard, a Fastify API and shared Zod schemas in one monorepo, with a Python system layer for Docker, mail, DNS and backups.
    link: /reference/monorepo
    linkText: See the architecture
  - title: Contribute
    details: Vexlyx is MIT licensed. Learn how to set up a development environment and send a change.
    link: /project/contributing
    linkText: Contributing guide
---
