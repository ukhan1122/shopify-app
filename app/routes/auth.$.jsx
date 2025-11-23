import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log('🎯 OAuth CALLBACK TRIGGERED');

  try {
    const { session, admin } = await authenticate.admin(request);
    
    console.log('✅ OAuth SUCCESS - Session created');
    console.log('🏪 Shop:', session?.shop);
    console.log('🔐 Token preview:', session?.accessToken?.substring(0, 15) + '...');

    const accessToken = session?.accessToken;
    const shopDomain = session?.shop;
    
    if (!accessToken || !shopDomain) {
      console.log('❌ MISSING TOKEN OR SHOP DOMAIN');
      return null;
    }

    console.log('🚀 Saving to Laravel...');
    
    try {
      const laravelResponse = await fetch('http://depop-backend.test/api/v1/shopify/save-token-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          shop_domain: shopDomain,
          access_token: accessToken
        })
      });

      console.log('📨 Laravel Response Status:', laravelResponse.status);
      
      // ✅ Even if status is 404, continue OAuth flow
      const result = await laravelResponse.json();
      console.log('📨 Laravel Response:', result);
      
      if (laravelResponse.ok) {
        console.log('✅✅✅ TOKEN SAVED TO LARAVEL');
      } else {
        console.log('⚠️ Laravel API returned non-200 but continuing OAuth');
      }
    } catch (apiError) {
      console.log('❌ Laravel API error:', apiError.message);
      // Continue OAuth flow even if API fails
    }

    return null;
  } catch (error) {
    console.log('❌ OAuth failed:', error.message);
    throw error;
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};