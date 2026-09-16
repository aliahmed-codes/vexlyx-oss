import { z } from "zod";

export {
  CreateSubAccountSchema,
  UpdateUserRoleSchema,
  UpdateUserQuotasSchema,
  UpdateUserPermissionsSchema,
} from "@vexlyx/shared";
export type {
  CreateSubAccountInput,
  UpdateUserRoleInput,
  UpdateUserQuotasInput,
  UpdateUserPermissionsInput,
} from "@vexlyx/shared";

export const UserIdParamSchema = z.object({
  id: z.string().min(1),
});
export type UserIdParam = z.infer<typeof UserIdParamSchema>;
