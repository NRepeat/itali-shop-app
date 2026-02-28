import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import {
  getCustomers,
  ExternalCustomer,
  ExternalAddress,
} from "@/service/italy/customers/getCustomers";
import { client } from "../client/shopify";
import { toE164 } from "@/shared/phone";

const CUSTOMER_CREATE_MUTATION = `
  mutation customerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const EMAIL_MARKETING_CONSENT_MUTATION = `
  mutation customerEmailMarketingConsentUpdate($input: CustomerEmailMarketingConsentUpdateInput!) {
    customerEmailMarketingConsentUpdate(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

const SMS_MARKETING_CONSENT_MUTATION = `
  mutation customerSmsMarketingConsentUpdate($input: CustomerSmsMarketingConsentUpdateInput!) {
    customerSmsMarketingConsentUpdate(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

const WORKERS = 10;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delayMs = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isThrottled =
        error.message?.includes("Throttled") ||
        error.message?.includes("throttled") ||
        error.extensions?.code === "THROTTLED";

      if (isThrottled && attempt < retries) {
        const wait = delayMs * 2 ** attempt; // 1s, 2s, 4s, 8s, 16s
        console.log(
          `Throttled, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`,
        );
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

async function createCustomerInShopify(
  customer: ExternalCustomer,
  domain: string,
  accessToken: string,
): Promise<string | null> {
  const addresses = customer.addresses.map((addr) => ({
    firstName: addr.firstname || customer.firstname,
    lastName: addr.lastname || customer.lastname,
    company: addr.company || undefined,
    address1: addr.address_1,
    address2: addr.address_2 || undefined,
    city: addr.city,
    zip: addr.postcode,
    countryCode: "UA",
  }));

  const input: Record<string, any> = {
    firstName: customer.firstname,
    lastName: customer.lastname,
    email: customer.email,
  };

  const phone = toE164(customer.telephone);
  if (phone) {
    input.phone = phone;
  }

  if (addresses.length > 0) {
    input.addresses = addresses;
  }

  const result = await client.request<any, any>({
    query: CUSTOMER_CREATE_MUTATION,
    variables: { input },
    accessToken,
    shopDomain: domain,
  });

  const userErrors = result?.customerCreate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }

  const shopifyCustomerId = result?.customerCreate?.customer?.id;
  if (!shopifyCustomerId) {
    throw new Error("No customer ID returned");
  }

  await prisma.customerMap.upsert({
    where: { localCustomerId: customer.customer_id },
    update: { shopifyCustomerId },
    create: {
      localCustomerId: customer.customer_id,
      shopifyCustomerId,
    },
  });

  // Set email marketing consent
  if (customer.email) {
    await client.request<any, any>({
      query: EMAIL_MARKETING_CONSENT_MUTATION,
      variables: {
        input: {
          customerId: shopifyCustomerId,
          emailMarketingConsent: {
            marketingOptInLevel: "SINGLE_OPT_IN",
            marketingState: "SUBSCRIBED",
          },
        },
      },
      accessToken,
      shopDomain: domain,
    });
  }

  // Set SMS marketing consent
  if (customer.telephone) {
    await client.request<any, any>({
      query: SMS_MARKETING_CONSENT_MUTATION,
      variables: {
        input: {
          customerId: shopifyCustomerId,
          smsMarketingConsent: {
            marketingOptInLevel: "SINGLE_OPT_IN",
            marketingState: "SUBSCRIBED",
          },
        },
      },
      accessToken,
      shopDomain: domain,
    });
  }

  return shopifyCustomerId;
}

function splitIntoBatches<T>(arr: T[], batchCount: number): T[][] {
  const batches: T[][] = Array.from({ length: batchCount }, () => []);
  for (let i = 0; i < arr.length; i++) {
    batches[i % batchCount].push(arr[i]);
  }
  return batches.filter((b) => b.length > 0);
}

export const syncCustomers = async (
  domain: string,
  accessToken: string,
  limit?: number,
) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const allCustomers = await getCustomers();
    log(`Found ${allCustomers.length} active customers in external DB`);

    const existingMaps = await prisma.customerMap.findMany({
      select: { localCustomerId: true },
    });
    const syncedIds = new Set(existingMaps.map((m) => m.localCustomerId));

    const newCustomers = allCustomers.filter(
      (c) => !syncedIds.has(c.customer_id),
    );
    log(`${newCustomers.length} customers not yet synced`);

    const customersToSync = limit ? newCustomers.slice(0, limit) : newCustomers;
    const total = customersToSync.length;
    log(
      `Syncing ${total} customers${limit ? ` (limited to ${limit})` : ""}`,
    );

    let successCount = 0;
    let errorCount = 0;

    const batches = splitIntoBatches(customersToSync, WORKERS);
    log(`Split into ${batches.length} batches`);

    let globalIndex = 0;

    await Promise.all(
      batches.map(async (batch, batchIdx) => {
        for (const customer of batch) {
          const index = ++globalIndex;
          try {
            log(
              `[${index}/${total}] [Batch ${batchIdx + 1}] Creating customer: ${customer.firstname} ${customer.lastname} (${customer.email})`,
            );

            const shopifyCustomerId = await withRetry(() =>
              createCustomerInShopify(customer, domain, accessToken),
            );

            successCount++;
            log(
              `[${index}/${total}] [Batch ${batchIdx + 1}] ✓ Created: ${shopifyCustomerId}`,
            );
          } catch (e: any) {
            errorCount++;
            log(
              `[${index}/${total}] [Batch ${batchIdx + 1}] ✗ Error: ${e.message}`,
            );
          }
        }
      }),
    );

    log(`\n=== Sync Summary ===`);
    log(`Total processed: ${total}`);
    log(`Batches: ${batches.length}`);
    log(`Success: ${successCount}`);
    log(`Errors: ${errorCount}`);
    log(`====================\n`);

    return { logs, successCount, errorCount };
  } catch (e: any) {
    logs.push(`Error: ${e.message}`);
    throw Object.assign(new Error(`Error syncing customers: ${e.message}`), {
      logs,
    });
  }
};