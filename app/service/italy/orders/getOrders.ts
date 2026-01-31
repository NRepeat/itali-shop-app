import { externalDB } from "@shared/lib/prisma/prisma.server";

export interface ExternalOrderProduct {
  order_product_id: number;
  order_id: number;
  product_id: number;
  name: string;
  model: string;
  quantity: number;
  price: any; // Decimal
  total: any; // Decimal
  tax: any; // Decimal
  reward: number;
}

export interface ExternalOrderTotal {
  order_total_id: number;
  order_id: number;
  code: string;
  title: string;
  value: any; // Decimal
  sort_order: number;
}

export interface ExternalOrderOption {
  order_option_id: number;
  order_id: number;
  order_product_id: number;
  product_option_id: number;
  product_option_value_id: number;
  name: string;
  value: string;
  type: string;
}

export interface ExternalOrder {
  order_id: number;
  customer_id: number;
  firstname: string;
  lastname: string;
  email: string;
  telephone: string;
  total: any; // Decimal
  order_status_id: number;
  currency_code: string;
  comment: string;
  date_added: Date;
  date_modified: Date;
  shipping_firstname: string;
  shipping_lastname: string;
  shipping_company: string;
  shipping_address_1: string;
  shipping_address_2: string;
  shipping_city: string;
  shipping_postcode: string;
  shipping_country: string;
  shipping_country_id: number;
  shipping_zone: string;
  payment_firstname: string;
  payment_lastname: string;
  payment_company: string;
  payment_address_1: string;
  payment_address_2: string;
  payment_city: string;
  payment_postcode: string;
  payment_country: string;
  payment_country_id: number;
  payment_zone: string;
  payment_method: string;
  products: ExternalOrderProduct[];
  totals: ExternalOrderTotal[];
  options: ExternalOrderOption[];
}

export const getOrders = async (): Promise<ExternalOrder[]> => {
  const [orders, orderProducts, orderTotals, orderOptions] = await Promise.all([
    externalDB.bc_order.findMany({
      select: {
        order_id: true,
        customer_id: true,
        firstname: true,
        lastname: true,
        email: true,
        telephone: true,
        total: true,
        order_status_id: true,
        currency_code: true,
        comment: true,
        date_added: true,
        date_modified: true,
        shipping_firstname: true,
        shipping_lastname: true,
        shipping_company: true,
        shipping_address_1: true,
        shipping_address_2: true,
        shipping_city: true,
        shipping_postcode: true,
        shipping_country: true,
        shipping_country_id: true,
        shipping_zone: true,
        payment_firstname: true,
        payment_lastname: true,
        payment_company: true,
        payment_address_1: true,
        payment_address_2: true,
        payment_city: true,
        payment_postcode: true,
        payment_country: true,
        payment_country_id: true,
        payment_zone: true,
        payment_method: true,
      },
    }),
    externalDB.bc_order_product.findMany({
      select: {
        order_product_id: true,
        order_id: true,
        product_id: true,
        name: true,
        model: true,
        quantity: true,
        price: true,
        total: true,
        tax: true,
        reward: true,
      },
    }),
    externalDB.bc_order_total.findMany({
      select: {
        order_total_id: true,
        order_id: true,
        code: true,
        title: true,
        value: true,
        sort_order: true,
      },
    }),
    externalDB.bc_order_option.findMany({
      select: {
        order_option_id: true,
        order_id: true,
        order_product_id: true,
        product_option_id: true,
        product_option_value_id: true,
        name: true,
        value: true,
        type: true,
      },
    }),
  ]);

  const productsByOrder = new Map<number, ExternalOrderProduct[]>();
  for (const p of orderProducts) {
    const list = productsByOrder.get(p.order_id) || [];
    list.push(p);
    productsByOrder.set(p.order_id, list);
  }

  const totalsByOrder = new Map<number, ExternalOrderTotal[]>();
  for (const t of orderTotals) {
    const list = totalsByOrder.get(t.order_id) || [];
    list.push(t);
    totalsByOrder.set(t.order_id, list);
  }

  const optionsByOrder = new Map<number, ExternalOrderOption[]>();
  for (const o of orderOptions) {
    const list = optionsByOrder.get(o.order_id) || [];
    list.push(o);
    optionsByOrder.set(o.order_id, list);
  }

  return orders.map((o) => ({
    ...o,
    products: productsByOrder.get(o.order_id) || [],
    totals: totalsByOrder.get(o.order_id) || [],
    options: optionsByOrder.get(o.order_id) || [],
  }));
};
