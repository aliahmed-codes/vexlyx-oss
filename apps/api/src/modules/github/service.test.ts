import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    API_BASE_URL: "https://api.vexlyx.example",
    CORS_ORIGIN: "https://vexlyx.example",
  },
}));

import { GitHubService } from "./service.js";

describe("GitHubService.createManifest", () => {
  it("uses GitHub's supported OAuth-on-install manifest key", async () => {
    const redis = { set: vi.fn().mockResolvedValue("OK") };
    const service = new GitHubService({} as never, redis as never, {} as never);

    const { manifest } = await service.createManifest("user-1", "session-1");

    expect(manifest).toHaveProperty("request_oauth_on_install", true);
    expect(manifest).not.toHaveProperty("request_oauth_on_installation");
  });
});
