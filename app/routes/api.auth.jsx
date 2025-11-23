import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  console.log("🔐 /api/auth called for shop:", shop);
  
  if (!shop) {
    throw new Response("Shop parameter required", { status: 400 });
  }

  // This initiates the OAuth flow - redirects to Shopify's OAuth page
  console.log("🔄 /api/auth - Starting OAuth flow for shop:", shop);
  return authenticate.admin(request);
}

export default function ApiAuth() {
  return (
    <div>
      <h1>Starting authentication...</h1>
      <p>Redirecting to Shopify OAuth...</p>
    </div>
  );
}