import { externalDB } from "@shared/lib/prisma/prisma.server";

export interface ExternalAddress {
  address_id: number;
  customer_id: number;
  firstname: string;
  lastname: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  postcode: string;
  country_id: number;
  zone_id: number;
}

export interface ExternalCustomer {
  customer_id: number;
  firstname: string;
  lastname: string;
  email: string;
  telephone: string;
  status: boolean;
  addresses: ExternalAddress[];
}

export const getCustomers = async (): Promise<ExternalCustomer[]> => {
  const [customers, addresses] = await Promise.all([
    externalDB.bc_customer.findMany({
      where: { status: true },
      select: {
        customer_id: true,
        firstname: true,
        lastname: true,
        email: true,
        telephone: true,
        status: true,
      },
    }),
    externalDB.bc_address.findMany({
      select: {
        address_id: true,
        customer_id: true,
        firstname: true,
        lastname: true,
        company: true,
        address_1: true,
        address_2: true,
        city: true,
        postcode: true,
        country_id: true,
        zone_id: true,
      },
    }),
  ]);

  const addressesByCustomer = new Map<number, ExternalAddress[]>();
  for (const addr of addresses) {
    const list = addressesByCustomer.get(addr.customer_id) || [];
    list.push(addr);
    addressesByCustomer.set(addr.customer_id, list);
  }

  return customers.map((c) => ({
    ...c,
    addresses: addressesByCustomer.get(c.customer_id) || [],
  }));
};
