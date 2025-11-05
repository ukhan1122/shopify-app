import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);

  if (topic !== "PRODUCTS_UPDATE") {
    throw new Response("Unauthorized", { status: 401 });
  }

  console.log("📦 Product updated in", shop);
  return new Response();
};