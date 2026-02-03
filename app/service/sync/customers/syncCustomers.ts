import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import { getCustomers, ExternalCustomer, ExternalAddress } from "@/service/italy/customers/getCustomers";
import { client } from "../client/shopify";

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
    log(
      `Syncing ${customersToSync.length} customers${limit ? ` (limited to ${limit})` : ""}`,
    );

    for (const [i, customer] of customersToSync.entries()) {
      try {
        log(
          `[${i + 1}/${customersToSync.length}] Creating customer: ${customer.firstname} ${customer.lastname} (${customer.email})`,
        );

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

        if (customer.telephone) {
          input.phone = customer.telephone.startsWith("+")
            ? customer.telephone
            : `+${customer.telephone}`;
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
          log(
            `[${i + 1}/${customersToSync.length}] Error: ${userErrors.map((e: any) => e.message).join(", ")}`,
          );
          continue;
        }

        const shopifyCustomerId = result?.customerCreate?.customer?.id;
        if (!shopifyCustomerId) {
          log(
            `[${i + 1}/${customersToSync.length}] Error: No customer ID returned`,
          );
          continue;
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

        log(
          `[${i + 1}/${customersToSync.length}] Created: ${shopifyCustomerId}`,
        );
      } catch (e: any) {
        log(
          `[${i + 1}/${customersToSync.length}] Error: ${e.message}`,
        );
      }
    }

    log(`Customer sync completed`);
    return logs;
  } catch (e: any) {
    logs.push(`Error: ${e.message}`);
    throw Object.assign(new Error(`Error syncing customers: ${e.message}`), {
      logs,
    });
  }
};
