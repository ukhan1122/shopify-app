import { authenticate } from "../shopify.server";
import { ShopifyProductService } from '../services/shopify/shopifyProductService';

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload, admin } = await authenticate.webhook(request);

    if (topic !== "PRODUCTS_UPDATE") {
      throw new Response("Unauthorized", { status: 401 });
    }

    console.log("🔄 Product update webhook received for:", shop);
    
    // Extract product ID from webhook payload
    const productId = payload.admin_graphql_api_id || payload.id;
    
    if (!productId) {
      console.error("❌ No product ID in webhook payload");
      return new Response("No product ID", { status: 400 });
    }

    console.log(`📦 Processing updated product: ${productId}`);

    // Get the updated product details from Shopify API
    const productResponse = await admin.graphql(`
      #graphql
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          description
          vendor
          tags
          totalInventory
          featuredImage { url }
          variants(first: 5) {
            edges {
              node {
                id
                inventoryQuantity
                selectedOptions { name value }
              }
            }
          }
          priceRange {
            minVariantPrice { amount currencyCode }
          }
        }
      }
    `, {
      variables: { id: productId }
    });

    const productData = await productResponse.json();
    
    if (productData.errors) {
      console.error("❌ GraphQL error:", productData.errors);
      throw new Error(`GraphQL error: ${JSON.stringify(productData.errors)}`);
    }

    const updatedProduct = productData.data.product;
    
    if (!updatedProduct) {
      console.error("❌ Product not found in Shopify");
      return new Response("Product not found", { status: 404 });
    }

    console.log(`✅ Retrieved updated product: ${updatedProduct.title}`);

    // Transform and sync to backend
    const transformedProduct = ShopifyProductService.transformProductsForBackend([updatedProduct])[0];
    
    // Calculate actual inventory from variants
    const inventory = updatedProduct.variants?.edges?.reduce((sum, variant) => 
      sum + (parseInt(variant.node.inventoryQuantity) || 0), 0) || 0;
    
    transformedProduct.quantity = inventory;

    // Sync single product to backend
    const syncResult = await ShopifyProductService.syncProductsToBackend(
      shop,
      [transformedProduct],
      // Note: You might need to get the access token differently for webhooks
      // This might require storing tokens in your database
      process.env.BACKEND_API_TOKEN // Fallback for webhooks
    );

    if (syncResult.success) {
      console.log(`✅ Successfully synced product to backend: ${updatedProduct.title}`);
    } else {
      console.error(`❌ Failed to sync product to backend: ${syncResult.message}`);
    }

    return new Response("Webhook processed successfully", { status: 200 });

  } catch (error) {
    console.error("💥 Webhook processing failed:", error);
    
    // Return 200 to prevent webhook retries for non-critical errors
    // Shopify will retry on 4xx/5xx status codes
    return new Response("Webhook processing failed", { status: 200 });
  }
};