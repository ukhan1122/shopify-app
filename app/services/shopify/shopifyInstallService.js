// app/services/shopifyInstallService.js

/**
 * Service to track Shopify app installation and send data to backend
 */

/**
 * Send shop data to backend when app is installed/opened
 * @param {Object} shopData - Shopify shop data
 * @param {string} shopData.shop_domain - The shop domain
 * @param {string} shopData.shop_name - The shop name
 * @param {string} shopData.access_token - Shopify access token
 * @param {string} shopData.shopify_user_id - Shopify user ID
 */
export async function trackAppInstall(shopData) {
  try {
    const payload = {
      shopify_user_id: shopData.shopify_user_id,
      shop_domain: shopData.shop_domain,
      shop_name: shopData.shop_name || shopData.shop_domain.replace('.myshopify.com', ''),
      shop_email: shopData.shop_email,
      access_token: shopData.access_token,
      installed_at: new Date().toISOString(),
      tracked_at: new Date().toISOString(),
      source: 'shopify_app_service'
    };

     const baseUrl = process.env.BACKEND_URL;
     
     

    const response = await fetch(baseUrl+'v1/shopify-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Token': process.env.SHOPIFY_API_TOKEN,  
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
       return { success: true, data: await response.json() };
    } else {
       return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
     return { success: false, error: error.message };
  }
}

/**
 * Get shop data from Shopify and track installation
 * @param {Object} session - Shopify session object
 */
export async function trackInstallFromSession(session) {
  const shopData = {
    shopify_user_id: session.id,
    shop_domain: session.shop,
    shop_name: session.shop.replace('.myshopify.com', ''),
    access_token: session.accessToken,
    shop_email: session.shopEmail || `${session.shop.replace('.myshopify.com', '')}@shopify.com`,
  };

  return await trackAppInstall(shopData);
}

/**
 * Client-side installation tracking
 */
export async function trackClientSideInstall() {
  try {
    // Get shop data from client-side Shopify API
    const shopResponse = await fetch('/api/shop');
    const shopData = await shopResponse.json();
    
    return await trackAppInstall({
      shop_domain: shopData.shop?.domain,
      shop_name: shopData.shop?.name,
      shop_email: shopData.shop?.email,
      shopify_user_id: shopData.shop?.id,
    });
  } catch (error) {
    console.error('❌ Client-side tracking failed:', error);
    return { success: false, error: error.message };
  }
}

export default {
  trackAppInstall,
  trackInstallFromSession,
  trackClientSideInstall,
};  