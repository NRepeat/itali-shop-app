import { v1 } from "@google-shopping/products";
import { GoogleAuth } from "google-auth-library";
const { ProductInputsServiceClient, ProductsServiceClient } = v1;
const auth = new GoogleAuth({
  keyFile: "./service-account.json", // Путь к твоему секретному файлу
  scopes: [
    "https://www.googleapis.com/auth/content",
    "https://www.googleapis.com/auth/cloud-platform",
  ],
});
export const productsClient = new ProductInputsServiceClient({
  auth,
  quotaProjectId: "italy-shop-480420",
});

export const productsReadClient = new ProductsServiceClient({
  auth,
  quotaProjectId: "italy-shop-480420",
});


export const MERCHANT_ID = "5748164350";
export const PARENT = `accounts/${MERCHANT_ID}`;
export const DATA_SOURCE_ID = 10624598761;

export async function insertProduct(productData: any) {
  try {
    const request = {
      parent: PARENT,
      dataSource: `${PARENT}/dataSources/${DATA_SOURCE_ID}`,
      productInput: productData,
    };

    const [response] = await productsClient.insertProductInput(request);
    console.log(`✅ Success! Inserted product: ${productData.offerId}`);
    return response;
  } catch (err: any) {
    console.error(`❌ Error inserting product ${productData.offerId}:`);
    if (err.code === 403) {
      console.error(
        "Make sure the service account email is added to Merchant Center -> Settings -> People & access with Admin rights.",
      );
    } else {
      console.error(err.message);
    }
    throw err;
  }
}

export async function getProduct(offerId: string, contentLanguage: string, feedLabel: string) {
  try {
    // В v1 формат: contentLanguage~feedLabel~offerId
    const name = `${PARENT}/products/${contentLanguage}~${feedLabel}~${offerId}`;
    const request = {
      name,
    };

    const [response] = await productsReadClient.getProduct(request);
    return response;
  } catch (err: any) {
    console.error(`❌ Error getting product ${offerId}:`);
    console.error(err.message);
    throw err;
  }
}

export async function listProducts() {
  try {
    const request = {
      parent: PARENT,
    };

    const [products] = await productsReadClient.listProducts(request);
    return products;
  } catch (err: any) {
    console.error("❌ Error listing products:");
    console.error(err.message);
    throw err;
  }
}

export async function deleteProduct(offerId: string, contentLanguage: string, feedLabel: string) {
  try {
    // В v1 формат: contentLanguage~feedLabel~offerId
    const name = `${PARENT}/productInputs/${contentLanguage}~${feedLabel}~${offerId}`;
    const request = {
      name,
      dataSource: `${PARENT}/dataSources/${DATA_SOURCE_ID}`,
    };

    await productsClient.deleteProductInput(request);
    console.log(`✅ Success! Deleted product: ${offerId}`);
  } catch (err: any) {
    console.error(`❌ Error deleting product ${offerId}:`);
    console.error(err.message);
    // throw err;
  }
}
