import { authenticate } from "../shopify.server";
import { getDB } from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log("🔴 App uninstalled from", shop);

  // Delete all merchant data for GDPR compliance
  try {
    const connection = await getDB();
    await connection.execute(
      'DELETE FROM products WHERE store_domain = ?',
      [shop]
    );
    await connection.release();
    console.log("✅ All data deleted for", shop);
  } catch (error) {
    console.error("❌ Error deleting data for", shop, ":", error);
  }

  return new Response();
};