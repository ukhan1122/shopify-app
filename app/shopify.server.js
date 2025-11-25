import "@shopify/shopify-app-react-router/adapters/node";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from '@prisma/client';
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";

console.log('🛠️ Shopify server initializing...');

// ✅ Initialize Prisma client
const prisma = new PrismaClient();

// 🐛 DEBUG: Create debug session storage
const originalStorage = new PrismaSessionStorage(prisma);

const debugStorage = {
  async storeSession(session) {
    console.log('💾 DEBUG STORING SESSION:');
    console.log('  Shop:', session.shop);
    console.log('  Token:', session.accessToken);
    console.log('  Token length:', session.accessToken?.length);
    console.log('  Session ID:', session.id);
    console.log('  Is Online:', session.isOnline);
    
    const result = await originalStorage.storeSession(session);
    console.log('💾 DEBUG SESSION STORED');
    return result;
  },
  
  async loadSession(id) {
    console.log('📂 DEBUG LOADING SESSION:', id);
    const session = await originalStorage.loadSession(id);
    if (session) {
      console.log('📂 DEBUG LOADED SESSION:');
      console.log('  Shop:', session.shop);
      console.log('  Token:', session.accessToken);
      console.log('  Token length:', session.accessToken?.length);
    } else {
      console.log('📂 DEBUG NO SESSION FOUND FOR ID:', id);
    }
    return session;
  },
  
  async deleteSession(id) {
    console.log('🗑️ DEBUG DELETING SESSION:', id);
    return await originalStorage.deleteSession(id);
  },
  
  async findSessionsByShop(shop) {
    console.log('🔍 DEBUG FINDING SESSIONS FOR SHOP:', shop);
    return await originalStorage.findSessionsByShop(shop);
  }
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: [
    "read_products",
    "write_products",
    "read_inventory",
    "write_inventory",
    "read_locations",
    "read_orders",
  ],
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",

  // ✅ Use debug session storage
  sessionStorage: debugStorage,


  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// ✅ ADD THIS FUNCTION HERE (Shopify auth utility)
export function loginErrorMessage(loginResult) {
  if (!loginResult) {
    return {};
  }

  const { shop, host, ...errors } = loginResult;

  if (errors.shop) {
    return { shop: errors.shop };
  }

  if (Object.keys(errors).length > 0) {
    return errors;
  }

  return {};
}

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;