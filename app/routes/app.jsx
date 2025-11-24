import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

let sessionCache = new Map(); // ✅ Cache by shop

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get('shop');
  
  console.log('🔍 App loader - Called for shop:', shopParam);
  
  // ✅ Return cached data for this specific shop
  if (sessionCache.has(shopParam)) {
    console.log('🔍 App loader - Returning cached data for shop:', shopParam);
    return sessionCache.get(shopParam);
  }

  try {
    console.log('🔍 App loader - Starting authentication for shop:', shopParam);
    
    const { session } = await authenticate.admin(request);
    
    console.log('🔍 App loader - Authentication successful:', {
      shop: session?.shop,
      hasSession: !!session
    });

    // ✅ Cache data for this specific shop
    const result = {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session.shop,
    };
    
    sessionCache.set(session.shop, result);
    console.log('🔍 App loader - Cached data for shop:', session.shop);

    // ✅ FIXED: PASS THE FULL SESSION OBJECT, NOT JUST session.shop
    await autoCreateUserInDatabase(session);

    return result;
    
  } catch (error) {
    console.error('❌ App loader error:', error);
    
    if (error instanceof Response && error.status === 302) {
      console.log('🔄 App loader - Handling 302 redirect');
      sessionCache.delete(shopParam); // Clear cache for this shop
      throw error;
    }
    
    const fallback = {
      apiKey: "ERROR_FALLBACK",
      shop: shopParam || "error.myshopify.com",
      error: error.message
    };
    
    return fallback;
  }
}

// ✅ CORRECTED AUTO-CREATE FUNCTION (WITH TOKEN SUPPORT)
async function autoCreateUserInDatabase(session) {
  try {
    if (!session?.shop) {
      console.log('❌ Auto-create: No session or shop provided');
      return;
    }

    console.log('🔄 Starting auto-create for shop:', session.shop);
    console.log('🔑 Auto-create - Token preview:', session.accessToken?.substring(0, 20) + '...');
    
    const url = `http://depop-backend.test/api/v1/shopify/oauth/auto-create-user`;
    console.log('📡 Auto-create: Calling URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`, // ✅ TOKEN IN HEADER
        'X-Shop-Domain': session.shop // ✅ SHOP DOMAIN IN HEADER
      },
      body: JSON.stringify({ 
        shop_domain: session.shop,
        access_token: session.accessToken // ✅ ALSO IN BODY FOR BACKWARDS COMPATIBILITY
      })
    });

    console.log('📊 Auto-create response status:', response.status);
    console.log('📊 Auto-create response ok:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Auto-create SUCCESS:', data);
    } else {
      const errorText = await response.text();
      console.error('❌ Auto-create FAILED - Status:', response.status);
      console.error('❌ Auto-create Error response:', errorText);
      
      // Check if endpoint doesn't exist
      if (response.status === 404) {
        console.error('❌ ENDPOINT NOT FOUND: The auto-create-user endpoint does not exist in your Laravel backend!');
        console.error('💡 You can remove the autoCreateUserInDatabase call if this endpoint is not needed');
      }
    }
  } catch (error) {
    console.error('❌ Auto-create NETWORK ERROR:', error.message);
    
    // Check if backend is reachable
    if (error.message.includes('fetch failed') || error.message.includes('NetworkError')) {
      console.error('❌ BACKEND UNREACHABLE: Cannot connect to http://depop-backend.test');
    }
  }
}

export default function App() {
  const loaderData = useLoaderData();

  console.log('🔍 App component - Loader data received:', loaderData);

  const { apiKey = "DEFAULT_API_KEY", shop = "DEFAULT_SHOP" } = loaderData || {};

  return (
    <AppProvider
      embedded
      apiKey={apiKey}
      shopOrigin={`https://${shop}`}
    >
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const hydrate = boundary.hydrate;