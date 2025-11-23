import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload, admin } = await authenticate.webhook(request);

    if (topic !== "PRODUCTS_UPDATE") {
      throw new Response("Unauthorized", { status: 401 });
    }

    console.log("🔄 Product update webhook received for:", shop);
    
    // Get the product ID from webhook
    const productId = payload.admin_graphql_api_id || payload.id;
    
    if (!productId) {
      console.error("❌ No product ID in webhook payload");
      return new Response("No product ID", { status: 400 });
    }

    console.log(`📦 Processing updated product: ${productId}`);

    // Send comprehensive data to backend
    const backendResponse = await fetch('http://depop-backend.test/api/v1/shopify/webhook/product-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shop_domain: shop,
        product_id: productId,
        title: payload.title || 'Unknown Product',
        quantity: payload.variants?.[0]?.inventory_quantity || 0,
        variants: payload.variants || [],
        handle: payload.handle,
        product_type: payload.product_type,
        status: payload.status,
        updated_at: payload.updated_at || new Date().toISOString()
      })
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('❌ Backend sync failed:', errorText);
      
      // Don't throw error - return 200 to prevent webhook retries
      // Shopify will retry webhooks that return non-200 status
      return new Response("Webhook processed", { status: 200 });
    }

    const syncResult = await backendResponse.json();
    
    if (syncResult.success) {
      console.log(`✅ Successfully synced product to backend: ${productId}`);
    } else {
      console.warn(`⚠️ Backend sync issue: ${syncResult.message}`);
    }

    return new Response("Webhook processed successfully", { status: 200 });

  } catch (error) {
    console.error("💥 Webhook processing failed:", error);
    
    // Return 200 to prevent webhook retries for non-critical errors
    return new Response("Webhook processed", { status: 200 });
  }
};