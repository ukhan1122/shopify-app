import { Outlet, useLoaderData, useRouteError, redirect, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log('🔄 App loader started - URL:', request.url);
  
  const url = new URL(request.url);
  const pathname = url.pathname;
  const shop = url.searchParams.get('shop');

  console.log('🔍 App loader details:', { pathname, shop });

  // ✅ FIXED: Always authenticate to get the admin instance
  try {
    const { admin, session } = await authenticate.admin(request);

    console.log('✅ Session found in app loader:', {
      shop: session?.shop,
    });

    // ✅ AUTO-CREATE USER: Add this line
    await autoCreateUserInDatabase(session.shop);

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session.shop,
      admin: admin // ✅ Pass admin instance to child routes
    };

  } catch (error) {
    console.log('❌ App loader session error:', error.message);

    // Redirect to auth if authentication fails
    if (shop) {
      console.log('🔀 Redirecting to auth with shop:', shop);
      throw redirect(`/auth/login?shop=${shop}`);
    }

    console.log('🔀 Redirecting to general auth');
    throw redirect('/auth/login');
  }
};

// ✅ ADD THIS FUNCTION: Auto-create users during installation
async function autoCreateUserInDatabase(shop) {
  try {
    if (!shop) {
      console.log('❌ No shop provided for user creation');
      return;
    }

    console.log('🔄 Auto-creating user for shop:', shop);

    // ✅ FIXED: Use the correct URL with 'oauth' path
    const response = await fetch(`http://depop-backend.test/api/v1/shopify/oauth/auto-create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shop_domain: shop
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ User auto-created in database:', data);
    } else {
      console.error('❌ Failed to auto-create user:', await response.text());
    }

  } catch (error) {
    console.error('❌ Error auto-creating user:', error.message);
  }
}

export default function App() {
  const { apiKey, shop, admin } = useLoaderData();

  console.log("🏠 App rendered for shop:", shop);

  return (
    <AppProvider
      embedded
      apiKey={apiKey}
      shopOrigin={`https://${shop}`}
    >
      {/* 🧭 Simple navigation */}
      <nav style={{
        padding: "20px",
        background: "#f5f5f5",
        borderBottom: "1px solid #ddd",
        marginBottom: "15px"
      }}>
        <Link
          to="/app"
          style={{ marginRight: "20px", textDecoration: "none", color: "#333" }}
        >
          Dashboard
        </Link>

        <Link
          to="/app/products"
          style={{ textDecoration: "none", color: "#333" }}
        >
          Products
        </Link>
      </nav>

      {/* 🧭 Render child routes with admin context */}
      <Outlet context={{ admin, shop }} />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const hydrate = boundary.hydrate;