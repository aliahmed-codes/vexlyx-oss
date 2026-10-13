import { describe, it, expect } from "vitest";
import { CreateProjectSchema, UpdateProjectSchema } from "./schema.js";
import { ConnectRepoSchema } from "../git/schema.js";
import { GitUrlSchema } from "@vexlyx/shared";

const ALLOWED = [
  "https://github.com/acme/app",
  "https://github.com/acme/app.git",
  "http://github.com/acme/app",
  "https://gitlab.com/group/sub/app.git",
  "https://bitbucket.org/acme/app.git",
  "git@github.com:acme/app.git",
  "git@gitlab.com:acme/app.git",
  "git@bitbucket.org:acme/app.git",
];

// Each is a distinct way to make the build worker clone from somewhere other
// than a supported public Git host (#62).
const REJECTED = [
  ["file URL to a local path", "file:///var/lib/vexlyx/projects/other-project"],
  ["cloud metadata endpoint", "http://169.254.169.254/latest/meta-data/"],
  ["loopback service", "http://127.0.0.1:5000/x/y"],
  ["internal hostname", "https://internal-host.corp/acme/app.git"],
  ["ssh to an arbitrary host", "ssh://git@internal-host/acme/app.git"],
  ["scp-style to an arbitrary host", "git@internal-host:acme/app.git"],
  ["git:// transport", "git://github.com/acme/app.git"],
  ["ext:: remote helper", "ext::sh -c 'id'"],
  ["allow-listed host as a prefix", "https://github.com.evil.example/acme/app"],
  ["allow-listed host as userinfo", "https://github.com@evil.example/acme/app"],
  ["allow-listed host in the path", "https://evil.example/github.com/acme/app"],
  ["option-looking value", "--upload-pack=touch /tmp/pwned"],
  ["extra git arguments via whitespace", "https://github.com/acme/app --upload-pack=x"],
  ["embedded newline", "https://github.com/acme/app\nhttp://169.254.169.254/a"],
  ["host with no repository path", "https://github.com/"],
  ["plain text", "not a url"],
] as const;

describe("GitUrlSchema", () => {
  it.each(ALLOWED)("accepts %s", (url) => {
    expect(GitUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each(REJECTED)("rejects %s", (_label, url) => {
    expect(GitUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("project schemas apply the same git host allow-list", () => {
  const base = { name: "my-app", type: "NODEJS" as const };

  it("CreateProjectSchema accepts an allow-listed URL, an empty string and no URL", () => {
    expect(CreateProjectSchema.safeParse({ ...base, gitUrl: ALLOWED[0] }).success).toBe(true);
    expect(CreateProjectSchema.safeParse({ ...base, gitUrl: "" }).success).toBe(true);
    expect(CreateProjectSchema.safeParse(base).success).toBe(true);
  });

  it.each(REJECTED)("CreateProjectSchema rejects %s", (_label, url) => {
    expect(CreateProjectSchema.safeParse({ ...base, gitUrl: url }).success).toBe(false);
  });

  it("UpdateProjectSchema accepts an allow-listed URL and an empty string (clear)", () => {
    expect(UpdateProjectSchema.safeParse({ gitUrl: ALLOWED[0] }).success).toBe(true);
    expect(UpdateProjectSchema.safeParse({ gitUrl: "" }).success).toBe(true);
  });

  it.each(REJECTED)("UpdateProjectSchema rejects %s", (_label, url) => {
    expect(UpdateProjectSchema.safeParse({ gitUrl: url }).success).toBe(false);
  });

  it.each(REJECTED)("ConnectRepoSchema rejects %s", (_label, url) => {
    expect(ConnectRepoSchema.safeParse({ gitUrl: url }).success).toBe(false);
  });

  it("ConnectRepoSchema still requires a URL and accepts allow-listed ones", () => {
    expect(ConnectRepoSchema.safeParse({ gitUrl: "" }).success).toBe(false);
    expect(ConnectRepoSchema.safeParse({ gitUrl: ALLOWED[0] }).success).toBe(true);
  });
});
