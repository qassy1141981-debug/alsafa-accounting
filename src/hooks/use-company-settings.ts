import { useLiveQuery } from "dexie-react-hooks";
import { db, type CompanySettings } from "@/lib/db.ts";

export function useCompanySettings(): CompanySettings | undefined | null {
  return useLiveQuery(async () => {
    const settings = await db.settings.get("company");
    return settings ?? null;
  });
}
