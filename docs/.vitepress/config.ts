import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Vexlyx",
  description: "Open-source hybrid hosting control panel — deploy modern apps and manage traditional hosting services on a single server.",
  lang: "en-US",
  lastUpdated: true,

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  ],

  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "/guide/" },
      { text: "Developer Docs", link: "/dev/monorepo", activeMatch: "/dev/" },
      { text: "API Reference", link: "/api/", activeMatch: "/api/" },
      { text: "Changelog", link: "/changelog" },
      {
        text: "GitHub",
        link: "https://github.com/atlantiqs-org/vexlyx",
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "What is Vexlyx?", link: "/guide/" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Getting Started", link: "/guide/getting-started" },
          ],
        },
        {
          text: "Contribute",
          items: [
            { text: "Contributing", link: "/guide/contributing" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
          ],
        },
      ],

      "/dev/": [
        {
          text: "Architecture",
          items: [
            { text: "Monorepo Setup", link: "/dev/monorepo" },
            { text: "Infrastructure", link: "/dev/infrastructure" },
            { text: "Shared Package", link: "/dev/shared-package" },
            { text: "Environment Variables", link: "/dev/environment-variables" },
            { text: "Design System", link: "/dev/design-system" },
          ],
        },
        {
          text: "Authentication",
          items: [
            { text: "Auth & Sessions", link: "/dev/authentication" },
            { text: "Roles & Permissions", link: "/dev/roles-permissions" },
            { text: "Fine-Grained Permissions", link: "/dev/fine-grained-permissions" },
            { text: "Settings Page", link: "/dev/settings-page" },
          ],
        },
        {
          text: "Projects & Deployment",
          items: [
            { text: "Projects API", link: "/dev/projects-api" },
            { text: "Projects UI", link: "/dev/projects-ui" },
            { text: "Build System", link: "/dev/build-system" },
            { text: "Deployment Engine", link: "/dev/deployment-engine" },
            { text: "Git Integration", link: "/dev/git-integration" },
            { text: "GitHub Webhooks", link: "/dev/github-webhooks" },
            { text: "Realtime Logs", link: "/dev/realtime-logs" },
            { text: "Custom Dockerfile", link: "/dev/runtimes/custom-dockerfile" },
            { text: "Project Detail Page", link: "/dev/project-detail-page" },
          ],
        },
        {
          text: "Runtimes",
          items: [
            { text: "Next.js", link: "/dev/runtimes/nextjs" },
            { text: "React / Vite", link: "/dev/runtimes/react-vite" },
            { text: "Python", link: "/dev/runtimes/python" },
            { text: "PHP & WordPress", link: "/dev/runtimes/php-wordpress" },
            { text: "No-Build PHP Hosting", link: "/dev/no-build-php-hosting" },
            { text: "Fast Static / WordPress Serving", link: "/dev/fast-static-wordpress-serving" },
          ],
        },
        {
          text: "Databases & Storage",
          items: [
            { text: "Database Provisioning", link: "/dev/database-provisioning" },
            { text: "Database", link: "/dev/database" },
            { text: "File Manager & SFTP", link: "/dev/file-manager-sftp" },
          ],
        },
        {
          text: "Domains & SSL",
          items: [
            { text: "Domains", link: "/dev/domains" },
            { text: "Domain Routing", link: "/dev/domain-routing" },
            { text: "DNS Management", link: "/dev/dns-management" },
            { text: "DNS Onboarding", link: "/dev/dns-onboarding" },
            { text: "Subdomains", link: "/dev/subdomains" },
            { text: "SSL Management", link: "/dev/ssl-management" },
          ],
        },
        {
          text: "Email",
          items: [
            { text: "Postfix", link: "/dev/email/postfix" },
            { text: "Dovecot", link: "/dev/email/dovecot" },
            { text: "Mailbox Management", link: "/dev/email/mailbox-management" },
            { text: "Aliases", link: "/dev/email/aliases" },
            { text: "Authentication", link: "/dev/email/authentication" },
            { text: "Vacation Responder", link: "/dev/email/vacation-responder" },
            { text: "Mail Operations", link: "/dev/email/mail-operations" },
            { text: "Webmail", link: "/dev/email/webmail" },
          ],
        },
        {
          text: "System & Operations",
          items: [
            { text: "API Setup", link: "/dev/api-setup" },
            { text: "Dashboard Setup", link: "/dev/dashboard-setup" },
            { text: "Dashboard Home", link: "/dev/dashboard-home" },
            { text: "Installer", link: "/dev/installer" },
            { text: "Monitoring", link: "/dev/monitoring" },
            { text: "Service Status", link: "/dev/service-status" },
            { text: "Backup System", link: "/dev/backup-system" },
            { text: "Docker Cleanup", link: "/dev/docker-cleanup" },
            { text: "Firewall", link: "/dev/firewall" },
            { text: "Audit Log", link: "/dev/audit-log" },
            { text: "Reseller Overselling", link: "/dev/reseller-overselling" },
          ],
        },
      ],

      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "Overview", link: "/api/" },
            { text: "Authentication", link: "/api/auth" },
            { text: "Projects", link: "/api/projects" },
            { text: "Deployments", link: "/api/deployments" },
            { text: "Domains", link: "/api/domains" },
            { text: "Databases", link: "/api/databases" },
            { text: "Files", link: "/api/files" },
            { text: "Mail", link: "/api/mail" },
            { text: "DNS", link: "/api/dns" },
            { text: "System", link: "/api/system" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/atlantiqs-org/vexlyx" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Vexlyx Contributors",
    },

    editLink: {
      pattern: "https://github.com/atlantiqs-org/vexlyx/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    search: {
      provider: "local",
    },
  },
});
