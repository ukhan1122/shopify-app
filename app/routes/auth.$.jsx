import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, loginErrorMessage } from "../shopify.server";
import { redirect } from "react-router";

export const loader = async ({ request }) => {
  console.log('🎉 OAuth CALLBACK TRIGGERED');

  try {
    const { session, admin } = await authenticate.admin(request);

    console.log('✅ OAuth SUCCESS - Session created');
    console.log('🔍 Shop:', session?.shop);
    console.log('🔑 Token preview:', session?.accessToken?.substring(0, 20) + '...');
    console.log('📏 Token length:', session?.accessToken?.length);
    console.log('🔄 Is Online:', session?.isOnline);
    console.log('🎯 Scope:', session?.scope);

    const accessToken = session?.accessToken;
    const shopDomain = session?.shop;

    if (!accessToken || !shopDomain) {
      console.log('❌ MISSING TOKEN OR SHOP DOMAIN');
      throw new Error('Missing token or shop domain');
    }

    // 🚨 CRITICAL: Check token length
    if (accessToken.length < 50) {
      console.log('🚨 INVALID TOKEN LENGTH:', accessToken.length);
      throw new Error(`Invalid token length: ${accessToken.length}. Expected 50+ characters.`);  
    }

    console.log('🚀 OAuth completed successfully - redirecting to app');

    // 🎯 CRITICAL FIX: Redirect to app instead of returning null
    console.log('🔀 Redirecting to /app');
    return redirect('/app');

  } catch (error) {
    console.log('❌ OAuth failed:', error.message);
    console.log('📝 OAuth error details:', error);
    throw error;
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};