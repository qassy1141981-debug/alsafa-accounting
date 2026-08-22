"use node";
/**
 * Convex Actions للتكامل مع منظومة الفاتورة الإلكترونية لمصلحة الضرائب المصرية (ETA)
 * الوثائق: https://sdk.invoicing.eta.gov.eg
 */

import { action } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

const ETA_URLS = {
  preprod: {
    identity: "https://id.preprod.eta.gov.eg",
    api: "https://api.preprod.invoicing.eta.gov.eg",
  },
  prod: {
    identity: "https://id.eta.gov.eg",
    api: "https://api.invoicing.eta.gov.eg",
  },
} as const;

type ETAEnv = keyof typeof ETA_URLS;

// الحصول على access token من ETA Identity Service
async function getETAToken(
  environment: ETAEnv,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const { identity } = ETA_URLS[environment];
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${identity}/connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=InvoicingAPI",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ConvexError({
      code: "EXTERNAL_SERVICE_ERROR",
      message: `فشل في الحصول على التوكن من ETA: ${res.status} - ${text}`,
    });
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new ConvexError({
      code: "EXTERNAL_SERVICE_ERROR",
      message: "لم يتم استلام access_token من ETA",
    });
  }

  return data.access_token;
}

/** اختبار الاتصال بخوادم ETA */
export const testConnection = action({
  args: {
    environment: v.union(v.literal("preprod"), v.literal("prod")),
    clientId: v.string(),
    clientSecret: v.string(),
  },
  handler: async (_ctx, args): Promise<{ success: boolean; message: string }> => {
    try {
      const token = await getETAToken(
        args.environment as ETAEnv,
        args.clientId,
        args.clientSecret
      );

      if (token) {
        return {
          success: true,
          message: "✅ تم الاتصال بنجاح بمنظومة الفاتورة الإلكترونية",
        };
      }

      return { success: false, message: "لم يتم استلام توكن صالح" };
    } catch (err) {
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : String(err);
      return { success: false, message: msg };
    }
  },
});

/** إرسال فاتورة واحدة إلى منظومة ETA */
export const submitInvoice = action({
  args: {
    environment: v.union(v.literal("preprod"), v.literal("prod")),
    clientId: v.string(),
    clientSecret: v.string(),
    invoicePayload: v.string(), // JSON string للفاتورة
  },
  handler: async (
    _ctx,
    args
  ): Promise<{
    success: boolean;
    submissionId?: string;
    uuid?: string;
    longId?: string;
    hashKey?: string;
    errorMessage?: string;
    rawResponse?: string;
  }> => {
    try {
      const token = await getETAToken(
        args.environment as ETAEnv,
        args.clientId,
        args.clientSecret
      );

      const invoiceDoc = JSON.parse(args.invoicePayload) as object;
      const { api } = ETA_URLS[args.environment as ETAEnv];

      const res = await fetch(`${api}/api/v1/documentsubmissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "ar",
        },
        body: JSON.stringify({
          documents: [invoiceDoc],
        }),
      });

      const rawResponse = await res.text();

      if (!res.ok) {
        return {
          success: false,
          errorMessage: `خطأ ${res.status}: ${rawResponse}`,
          rawResponse,
        };
      }

      const data = JSON.parse(rawResponse) as {
        submissionId?: string;
        acceptedDocuments?: Array<{
          uuid?: string;
          longId?: string;
          hashKey?: string;
          internalId?: string;
        }>;
        rejectedDocuments?: Array<{
          internalId?: string;
          error?: { details?: Array<{ message?: string }> };
        }>;
      };

      const accepted = data.acceptedDocuments?.[0];
      const rejected = data.rejectedDocuments?.[0];

      if (accepted) {
        return {
          success: true,
          submissionId: data.submissionId,
          uuid: accepted.uuid,
          longId: accepted.longId,
          hashKey: accepted.hashKey,
          rawResponse,
        };
      }

      if (rejected) {
        const errMsg =
          rejected.error?.details?.map((d) => d.message).join(", ") ??
          "مستند مرفوض";
        return {
          success: false,
          submissionId: data.submissionId,
          errorMessage: errMsg,
          rawResponse,
        };
      }

      return { success: false, errorMessage: "استجابة غير متوقعة من ETA", rawResponse };
    } catch (err) {
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : String(err);
      return { success: false, errorMessage: msg };
    }
  },
});

/** الحصول على حالة مستند من ETA عبر UUID */
export const getDocumentStatus = action({
  args: {
    environment: v.union(v.literal("preprod"), v.literal("prod")),
    clientId: v.string(),
    clientSecret: v.string(),
    uuid: v.string(),
  },
  handler: async (
    _ctx,
    args
  ): Promise<{ success: boolean; status?: string; errorMessage?: string }> => {
    try {
      const token = await getETAToken(
        args.environment as ETAEnv,
        args.clientId,
        args.clientSecret
      );
      const { api } = ETA_URLS[args.environment as ETAEnv];

      const res = await fetch(`${api}/api/v1/documents/${args.uuid}/details`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return { success: false, errorMessage: `خطأ ${res.status}` };
      }

      const data = (await res.json()) as { status?: string };
      return { success: true, status: data.status };
    } catch (err) {
      return { success: false, errorMessage: String(err) };
    }
  },
});

/** إلغاء مستند مُرسل */
export const cancelDocument = action({
  args: {
    environment: v.union(v.literal("preprod"), v.literal("prod")),
    clientId: v.string(),
    clientSecret: v.string(),
    uuid: v.string(),
    reason: v.string(),
  },
  handler: async (
    _ctx,
    args
  ): Promise<{ success: boolean; errorMessage?: string }> => {
    try {
      const token = await getETAToken(
        args.environment as ETAEnv,
        args.clientId,
        args.clientSecret
      );
      const { api } = ETA_URLS[args.environment as ETAEnv];

      const res = await fetch(`${api}/api/v1/documents/state/${args.uuid}/state`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "cancelled", reason: args.reason }),
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, errorMessage: `خطأ ${res.status}: ${text}` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, errorMessage: String(err) };
    }
  },
});
