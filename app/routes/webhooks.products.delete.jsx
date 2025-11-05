import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);

  if (topic !== "PRODUCTS_DELETE") {
    throw new Response("Unauthorized", { status: 401 });
  }

  console.log("🗑️ Product deleted from", shop);
  return new Response();
};