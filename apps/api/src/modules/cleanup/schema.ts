import { z } from "zod";
import { UpdateCleanupSettingsSchema } from "@vexlyx/shared";

export { UpdateCleanupSettingsSchema };
export type UpdateCleanupSettingsInput = z.infer<typeof UpdateCleanupSettingsSchema>;
