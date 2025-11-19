import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { trackInstallFromSession } from "../services/shopify/index";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Only track install - NO AUTOMATIC SYNC OPERATIONS
  const trackResult = await trackInstallFromSession(session);
  
  let userId = null;
  
  if (trackResult.success) {
    userId = trackResult.data.user_id;
    
    // Only store basic shop info - no heavy operations
    try {
      const { db } = await import("@shopify/shopify-app-remix/server");
      
      await db.query(
        `UPDATE users SET shopify_store_url = ? WHERE id = ?`,
        [session.shop, userId]
      );
    } catch (dbError) {
      console.error('Failed to store user-shop mapping:', dbError);
    }
  }

  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    installationTracked: trackResult.success,
    shop: session.shop,
    userId: userId
    // REMOVED: All the sync result flags
  };
};

export default function App() {
  const { apiKey, shop } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/additional">Additional page</s-link>
        <s-link href="/admin/products">Products</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};