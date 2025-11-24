import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData as useLoaderData$1, useActionData, Form, redirect, UNSAFE_withErrorBoundaryProps, useRouteError } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-react-router/adapters/node";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { shopifyApp, AppDistribution, ApiVersion, boundary } from "@shopify/shopify-app-react-router/server";
import mysql from "mysql2/promise";
import { useLoaderData, useFetcher } from "react-router-dom";
import { useState, useEffect } from "react";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
console.log("🛠️ Shopify server initializing...");
const prisma = new PrismaClient();
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
    "read_orders"
  ],
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  // ✅ Pass the instantiated Prisma client
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
const originalAuthenticate = shopify.authenticate;
shopify.authenticate = {
  ...originalAuthenticate,
  admin: async (request) => {
    var _a, _b;
    console.log("🔐 authenticate.admin called - URL:", request.url);
    try {
      const result = await originalAuthenticate.admin(request);
      console.log("🔐 authenticate.admin result type:", (_a = result == null ? void 0 : result.constructor) == null ? void 0 : _a.name);
      return result;
    } catch (error) {
      console.log("🔐 authenticate.admin error:", (_b = error == null ? void 0 : error.constructor) == null ? void 0 : _b.name, error.message);
      throw error;
    }
  }
};
function loginErrorMessage(loginResult) {
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
ApiVersion.January25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: reactRouterContext, url: request.url }),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width,initial-scale=1"
      }), /* @__PURE__ */ jsx("link", {
        rel: "preconnect",
        href: "https://cdn.shopify.com/"
      }), /* @__PURE__ */ jsx("link", {
        rel: "stylesheet",
        href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
const action$5 = async ({
  request
}) => {
  const {
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log("🔄 Scopes updated for", shop);
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  acquireTimeout: 6e4,
  timeout: 6e4
});
async function getDB() {
  return await pool.getConnection();
}
const action$4 = async ({
  request
}) => {
  const {
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log("🔴 App uninstalled from", shop);
  try {
    const connection = await getDB();
    await connection.execute("DELETE FROM products WHERE store_domain = ?", [shop]);
    await connection.release();
    console.log("✅ All data deleted for", shop);
  } catch (error) {
    console.error("❌ Error deleting data for", shop, ":", error);
  }
  return new Response();
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const action$3 = async ({
  request
}) => {
  const {
    topic,
    shop
  } = await authenticate.webhook(request);
  if (topic !== "PRODUCTS_DELETE") {
    throw new Response("Unauthorized", {
      status: 401
    });
  }
  console.log("🗑️ Product deleted from", shop);
  return new Response();
};
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const action$2 = async ({
  request
}) => {
  var _a, _b;
  try {
    const {
      topic,
      shop,
      payload,
      admin
    } = await authenticate.webhook(request);
    if (topic !== "PRODUCTS_UPDATE") {
      throw new Response("Unauthorized", {
        status: 401
      });
    }
    console.log("🔄 Product update webhook received for:", shop);
    const productId = payload.admin_graphql_api_id || payload.id;
    if (!productId) {
      console.error("❌ No product ID in webhook payload");
      return new Response("No product ID", {
        status: 400
      });
    }
    console.log(`📦 Processing updated product: ${productId}`);
    const backendResponse = await fetch("http://depop-backend.test/api/v1/shopify/webhook/product-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        shop_domain: shop,
        product_id: productId,
        title: payload.title || "Unknown Product",
        quantity: ((_b = (_a = payload.variants) == null ? void 0 : _a[0]) == null ? void 0 : _b.inventory_quantity) || 0,
        variants: payload.variants || [],
        handle: payload.handle,
        product_type: payload.product_type,
        status: payload.status,
        updated_at: payload.updated_at || (/* @__PURE__ */ new Date()).toISOString()
      })
    });
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error("❌ Backend sync failed:", errorText);
      return new Response("Webhook processed", {
        status: 200
      });
    }
    const syncResult = await backendResponse.json();
    if (syncResult.success) {
      console.log(`✅ Successfully synced product to backend: ${productId}`);
    } else {
      console.warn(`⚠️ Backend sync issue: ${syncResult.message}`);
    }
    return new Response("Webhook processed successfully", {
      status: 200
    });
  } catch (error) {
    console.error("💥 Webhook processing failed:", error);
    return new Response("Webhook processed", {
      status: 200
    });
  }
};
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2
}, Symbol.toStringTag, { value: "Module" }));
async function loader$6({
  request
}) {
  var _a, _b;
  try {
    console.log("📦 Products loader started");
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || "my-shop-dev-2.myshopify.com";
    console.log("✅ Loading products for shop:", shop);
    const apiUrl = `http://depop-backend.test/api/v1/shopify/products?shop_domain=${shop}`;
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    return {
      products: ((_a = data.data) == null ? void 0 : _a.products) || [],
      currentStore: shop,
      shop,
      totalProducts: ((_b = data.data) == null ? void 0 : _b.total_products) || 0
    };
  } catch (error) {
    console.error("❌ Products loader failed:", error);
    return {
      products: [],
      error: error.message,
      shop: null,
      currentStore: null,
      totalProducts: 0
    };
  }
}
async function action$1({
  request
}) {
  var _a, _b, _c, _d, _e;
  try {
    console.log("🔄 Starting Shopify sync");
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || "my-shop-dev-2.myshopify.com";
    console.log("🛍️ Sync for shop:", shop);
    console.log("📦 Starting product sync...");
    const syncResponse = await fetch("http://depop-backend.test/api/v1/shopify/products/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        shop_domain: shop,
        products: []
        // Empty array - Laravel will fetch from Shopify
      })
    });
    console.log("📨 Sync response status:", syncResponse.status);
    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      console.log("❌ Sync endpoint error:", errorText);
      throw new Error(`Backend sync failed: ${syncResponse.status} - ${errorText}`);
    }
    const syncResult = await syncResponse.json();
    console.log("✅ Sync result:", syncResult);
    const finalResponse = await fetch(`http://depop-backend.test/api/v1/shopify/products?shop_domain=${shop}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });
    if (!finalResponse.ok) {
      throw new Error(`Final API error: ${finalResponse.status}`);
    }
    const finalData = await finalResponse.json();
    const finalProducts = ((_a = finalData.data) == null ? void 0 : _a.products) || [];
    const successMessage = `Sync completed: ${((_b = syncResult.data) == null ? void 0 : _b.products_created) || 0} new, ${((_c = syncResult.data) == null ? void 0 : _c.products_updated) || 0} updated, ${((_d = syncResult.data) == null ? void 0 : _d.images_synced) || 0} images, ${((_e = syncResult.data) == null ? void 0 : _e.variants_synced) || 0} variants for shop: ${shop}`;
    return {
      success: true,
      message: successMessage,
      products: finalProducts,
      currentStore: shop,
      shop,
      syncSummary: syncResult.data,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error("❌ Sync failed:", error.message);
    return {
      success: false,
      message: `Sync failed: ${error.message}`,
      timestamp: Date.now()
    };
  }
}
const admin_products = UNSAFE_withComponentProps(function ProductsPage() {
  var _a, _b, _c;
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  console.log("📊 ProductsPage - Loader data:", {
    shop: loaderData.shop,
    currentStore: loaderData.currentStore,
    productsCount: (_a = loaderData.products) == null ? void 0 : _a.length
  });
  const [products, setProducts] = useState(loaderData.products || []);
  const [currentStore, setCurrentStore] = useState(loaderData.shop || loaderData.currentStore || "Loading...");
  const isSyncing = fetcher.state === "submitting";
  const syncResult = fetcher.data;
  useEffect(() => {
    if (loaderData.products) {
      setProducts(loaderData.products);
    }
    if (loaderData.shop || loaderData.currentStore) {
      setCurrentStore(loaderData.shop || loaderData.currentStore);
    }
  }, [loaderData]);
  useEffect(() => {
    if (syncResult && syncResult.success && syncResult.products) {
      setProducts(syncResult.products);
      if (syncResult.shop || syncResult.currentStore) {
        setCurrentStore(syncResult.shop || syncResult.currentStore);
      }
      if (syncResult.syncSummary) {
        console.log("📊 Sync Summary:", syncResult.syncSummary);
      }
    }
  }, [syncResult]);
  const formatStoreName = (store) => {
    if (!store || store === "Loading...") return "Loading Store...";
    try {
      const baseName = store.replace(".myshopify.com", "");
      return baseName.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    } catch (error) {
      return store;
    }
  };
  const totalProducts = (products == null ? void 0 : products.length) || 0;
  const excellentCondition = ((_b = products == null ? void 0 : products.filter((p) => {
    var _a2;
    const condition = ((_a2 = p.condition) == null ? void 0 : _a2.title) || p.condition;
    return condition === "Excellent" || (condition == null ? void 0 : condition.toLowerCase().includes("excellent"));
  })) == null ? void 0 : _b.length) || 0;
  const totalInventory = (products == null ? void 0 : products.reduce((sum, product) => sum + (product.quantity_left || 0), 0)) || 0;
  const outOfStock = ((_c = products == null ? void 0 : products.filter((p) => (p.quantity_left || 0) === 0)) == null ? void 0 : _c.length) || 0;
  return /* @__PURE__ */ jsxs("div", {
    className: "products-container",
    children: [/* @__PURE__ */ jsx("div", {
      className: "products-header",
      children: /* @__PURE__ */ jsxs("div", {
        className: "header-content",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "store-info-section",
          children: [/* @__PURE__ */ jsx("h1", {
            className: "app-title",
            children: "Smart Product Sync"
          }), /* @__PURE__ */ jsxs("div", {
            className: "store-name-display",
            children: [/* @__PURE__ */ jsx("span", {
              className: "store-icon",
              children: "🛍️"
            }), /* @__PURE__ */ jsx("span", {
              className: "store-name",
              children: formatStoreName(currentStore)
            })]
          })]
        }), /* @__PURE__ */ jsx(fetcher.Form, {
          method: "post",
          className: "sync-form",
          children: /* @__PURE__ */ jsx("button", {
            type: "submit",
            disabled: isSyncing,
            className: `sync-button ${isSyncing ? "syncing" : ""}`,
            children: isSyncing ? /* @__PURE__ */ jsxs(Fragment, {
              children: [/* @__PURE__ */ jsx("span", {
                className: "sync-spinner"
              }), "Syncing..."]
            }) : /* @__PURE__ */ jsxs(Fragment, {
              children: [/* @__PURE__ */ jsx("span", {
                className: "sync-icon",
                children: "🔄"
              }), "Bi-Directional Sync"]
            })
          })
        })]
      })
    }), loaderData.error && /* @__PURE__ */ jsxs("div", {
      className: "sync-message error",
      children: ["❌ ", loaderData.error]
    }), syncResult && /* @__PURE__ */ jsxs("div", {
      className: `sync-message ${syncResult.success ? "success" : "error"}`,
      children: [syncResult.success ? "✅" : "❌", " ", syncResult.message, syncResult.syncSummary && /* @__PURE__ */ jsx("div", {
        className: "sync-details",
        children: /* @__PURE__ */ jsxs("small", {
          children: ["Created: ", syncResult.syncSummary.products_created, " | Updated: ", syncResult.syncSummary.products_updated, " | Images: ", syncResult.syncSummary.images_synced]
        })
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "summary-cards",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "summary-card",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Total Items"
        }), /* @__PURE__ */ jsx("p", {
          className: "value",
          children: totalProducts
        }), /* @__PURE__ */ jsx("small", {
          children: "In Inventory"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "summary-card",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Total Inventory"
        }), /* @__PURE__ */ jsx("p", {
          className: "value",
          children: totalInventory
        }), /* @__PURE__ */ jsx("small", {
          children: "Available Stock"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "summary-card",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Excellent Condition"
        }), /* @__PURE__ */ jsx("p", {
          className: "value",
          children: excellentCondition
        }), /* @__PURE__ */ jsx("small", {
          children: "Top quality"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "summary-card",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Out of Stock"
        }), /* @__PURE__ */ jsx("p", {
          className: "value",
          children: outOfStock
        }), /* @__PURE__ */ jsx("small", {
          children: "Need restock"
        })]
      })]
    }), (syncResult == null ? void 0 : syncResult.syncSummary) && /* @__PURE__ */ jsxs("div", {
      className: "sync-details",
      children: [/* @__PURE__ */ jsx("h4", {
        children: "Sync Details:"
      }), /* @__PURE__ */ jsxs("div", {
        className: "sync-stats",
        children: [/* @__PURE__ */ jsxs("span", {
          children: ["🔄 Products Created: ", syncResult.syncSummary.products_created]
        }), /* @__PURE__ */ jsxs("span", {
          children: ["🔄 Products Updated: ", syncResult.syncSummary.products_updated]
        }), /* @__PURE__ */ jsxs("span", {
          children: ["🖼️ Images Synced: ", syncResult.syncSummary.images_synced]
        })]
      })]
    }), /* @__PURE__ */ jsx("div", {
      className: "products-table-container",
      children: /* @__PURE__ */ jsxs("table", {
        className: "products-table",
        children: [/* @__PURE__ */ jsx("thead", {
          children: /* @__PURE__ */ jsxs("tr", {
            children: [/* @__PURE__ */ jsx("th", {
              children: "Product"
            }), /* @__PURE__ */ jsx("th", {
              children: "Brand"
            }), /* @__PURE__ */ jsx("th", {
              children: "Size"
            }), /* @__PURE__ */ jsx("th", {
              children: "Condition"
            }), /* @__PURE__ */ jsx("th", {
              children: "Price"
            }), /* @__PURE__ */ jsx("th", {
              children: "Inventory"
            }), /* @__PURE__ */ jsx("th", {
              children: "Last Updated"
            })]
          })
        }), /* @__PURE__ */ jsx("tbody", {
          children: products && products.length > 0 ? products.map((product) => {
            var _a2, _b2, _c2, _d;
            return /* @__PURE__ */ jsxs("tr", {
              className: "product-row",
              children: [/* @__PURE__ */ jsx("td", {
                className: "product-info-cell",
                children: /* @__PURE__ */ jsxs("div", {
                  className: "product-info",
                  children: [product.photos && Array.isArray(product.photos) && product.photos.length > 0 && product.photos[0].image_path ? /* @__PURE__ */ jsx("img", {
                    src: product.photos[0].image_path,
                    alt: product.title,
                    className: "product-thumbnail"
                  }) : /* @__PURE__ */ jsx("div", {
                    className: "no-image-placeholder",
                    children: "No Image"
                  }), /* @__PURE__ */ jsxs("div", {
                    className: "product-text-info",
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "product-title-table",
                      children: product.title || "No Title"
                    }), product.description && /* @__PURE__ */ jsxs("div", {
                      className: "product-description-table",
                      children: [String(product.description).substring(0, 80), "..."]
                    })]
                  })]
                })
              }), /* @__PURE__ */ jsx("td", {
                children: /* @__PURE__ */ jsx("span", {
                  className: "brand-value",
                  children: ((_a2 = product.brand) == null ? void 0 : _a2.name) || (typeof product.brand === "string" ? product.brand : "No Brand")
                })
              }), /* @__PURE__ */ jsx("td", {
                children: /* @__PURE__ */ jsx("span", {
                  className: "size-value",
                  children: ((_b2 = product.size) == null ? void 0 : _b2.standard_size) || (typeof product.size === "string" ? product.size : product.size ? "Has Size Object" : "N/A")
                })
              }), /* @__PURE__ */ jsx("td", {
                children: /* @__PURE__ */ jsx("span", {
                  className: `condition-badge ${String(((_c2 = product.condition) == null ? void 0 : _c2.title) || product.condition || "unknown").toLowerCase().replace(/\s+/g, "-")}`,
                  children: ((_d = product.condition) == null ? void 0 : _d.title) || product.condition || "Unknown"
                })
              }), /* @__PURE__ */ jsx("td", {
                children: /* @__PURE__ */ jsx("span", {
                  className: "price-value-table",
                  children: product.price ? `$${parseFloat(product.price).toFixed(2)}` : "N/A"
                })
              }), /* @__PURE__ */ jsx("td", {
                children: /* @__PURE__ */ jsx("span", {
                  className: `inventory-badge ${(product.quantity_left || 0) > 0 ? "in-stock" : "out-of-stock"}`,
                  children: product.quantity_left || 0
                })
              }), /* @__PURE__ */ jsx("td", {
                children: /* @__PURE__ */ jsx("span", {
                  className: "update-time",
                  children: product.updated_at ? new Date(product.updated_at).toLocaleDateString() : "N/A"
                })
              })]
            }, product.id);
          }) : /* @__PURE__ */ jsx("tr", {
            children: /* @__PURE__ */ jsxs("td", {
              colSpan: "7",
              className: "empty-state",
              children: [/* @__PURE__ */ jsxs("h3", {
                children: ["No products found for ", formatStoreName(currentStore)]
              }), /* @__PURE__ */ jsx("p", {
                children: 'Click "Sync Data" to import products from Shopify to inventory system.'
              })]
            })
          })
        })]
      })
    })]
  });
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: admin_products,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const loader$5 = async ({
  request
}) => {
  console.log("🔐 Auth.login loader - Manual login page");
  const errors = loginErrorMessage(await login(request));
  console.log("🔐 Auth.login - Errors:", errors);
  return {
    errors
  };
};
const action = async ({
  request
}) => {
  console.log("🔐 Auth.login action - Form submitted");
  const errors = loginErrorMessage(await login(request));
  console.log("🔐 Auth.login action - Errors:", errors);
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function AuthLogin() {
  const loaderData = useLoaderData$1();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const {
    errors
  } = actionData || loaderData;
  console.log("🔐 AuthLogin component - Errors:", errors);
  console.log("🔐 AuthLogin component - Shop state:", shop);
  return /* @__PURE__ */ jsx(AppProvider, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "on",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: route$1,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
async function loader$4() {
  console.log("🔍 DEBUG ROUTE - Environment check:");
  console.log("BACKEND_URL:", process.env.BACKEND_URL);
  console.log("SHOPIFY_API_TOKEN exists:", !!process.env.SHOPIFY_API_TOKEN);
  return new Response(JSON.stringify({
    BACKEND_URL: process.env.BACKEND_URL,
    SHOPIFY_API_TOKEN_EXISTS: !!process.env.SHOPIFY_API_TOKEN
  }), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
const debug_env = UNSAFE_withComponentProps(function DebugEnv() {
  return /* @__PURE__ */ jsx("div", {
    children: "Check terminal for environment debug logs"
  });
});
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: debug_env,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const loader$3 = async ({
  request
}) => {
  console.log("🔐 Auth.$ loader - OAuth callback started");
  console.log("🔐 Auth.$ URL:", request.url);
  try {
    const {
      session,
      admin
    } = await authenticate.admin(request);
    console.log("✅ Auth.$ - Session created successfully:", {
      shop: session == null ? void 0 : session.shop,
      id: session == null ? void 0 : session.id,
      accessToken: session == null ? void 0 : session.accessToken,
      // ← ACCESS TOKEN HERE
      scope: session == null ? void 0 : session.scope,
      isOnline: session == null ? void 0 : session.isOnline
    });
    const accessToken = session == null ? void 0 : session.accessToken;
    const shopDomain = session == null ? void 0 : session.shop;
    if (accessToken && shopDomain) {
      console.log("🎯 ACCESS TOKEN FOUND:", accessToken);
      console.log("🏪 SHOP DOMAIN:", shopDomain);
      try {
        const response = await fetch("http://depop-backend.test/api/v1/shopify/store-access-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Token": process.env.BACKEND_API_TOKEN
            // ✅ ADD THIS
          },
          body: JSON.stringify({
            shop_domain: shopDomain,
            access_token: accessToken
          })
        });
        if (response.ok) {
          console.log("✅ Token sent to Laravel backend successfully");
        } else {
          console.log("❌ Failed to send token to Laravel");
        }
      } catch (backendError) {
        console.log("❌ Error sending to Laravel:", backendError.message);
      }
    } else {
      console.log("❌ No access token found in session");
    }
    return null;
  } catch (error) {
    console.log("❌ Auth.$ - OAuth callback failed:", error.message);
    console.log("❌ Auth.$ - Full error:", error);
    throw error;
  }
};
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_1hqgz_1";
const heading = "_heading_1hqgz_21";
const text = "_text_1hqgz_23";
const content = "_content_1hqgz_43";
const form = "_form_1hqgz_53";
const label = "_label_1hqgz_69";
const input = "_input_1hqgz_85";
const button = "_button_1hqgz_93";
const list = "_list_1hqgz_101";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$2 = async ({
  request
}) => {
  console.log("🏠 Index loader - Landing page");
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    const shop = url.searchParams.get("shop");
    console.log("🔄 Index - Redirecting to app with shop:", shop);
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {
    showForm: Boolean(login)
  };
};
const route = UNSAFE_withComponentProps(function Index() {
  const {
    showForm
  } = useLoaderData$1();
  console.log("🏠 Index component rendered - showForm:", showForm);
  return /* @__PURE__ */ jsx("div", {
    className: styles.index,
    children: /* @__PURE__ */ jsxs("div", {
      className: styles.content,
      children: [/* @__PURE__ */ jsx("h1", {
        className: styles.heading,
        children: "A short heading about [your app]"
      }), /* @__PURE__ */ jsx("p", {
        className: styles.text,
        children: "A tagline about [your app] that describes your value proposition."
      }), showForm && /* @__PURE__ */ jsxs(Form, {
        className: styles.form,
        method: "post",
        action: "/auth/login",
        children: [/* @__PURE__ */ jsxs("label", {
          className: styles.label,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Shop domain"
          }), /* @__PURE__ */ jsx("input", {
            className: styles.input,
            type: "text",
            name: "shop"
          }), /* @__PURE__ */ jsx("span", {
            children: "e.g: my-shop-domain.myshopify.com"
          })]
        }), /* @__PURE__ */ jsx("button", {
          className: styles.button,
          type: "submit",
          children: "Log in"
        })]
      }), /* @__PURE__ */ jsxs("ul", {
        className: styles.list,
        children: [/* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        })]
      })]
    })
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({
  request
}) => {
  console.log("🔄 App loader started - URL:", request.url);
  try {
    const {
      session
    } = await authenticate.admin(request);
    console.log("✅ Session found in app loader:", {
      shop: session == null ? void 0 : session.shop,
      id: session == null ? void 0 : session.id,
      isOnline: session == null ? void 0 : session.isOnline,
      accessToken: (session == null ? void 0 : session.accessToken) ? "***" : "none"
    });
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session.shop
    };
  } catch (error) {
    console.log("❌ App loader session error:", error.message);
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    if (shop) {
      console.log("🔄 Redirecting to auth with shop:", shop);
      throw redirect(`/auth/login?shop=${shop}`);
    }
    console.log("🔄 Redirecting to general auth");
    throw redirect("/auth/login");
  }
};
const app = UNSAFE_withComponentProps(function App2() {
  const {
    apiKey,
    shop
  } = useLoaderData$1();
  console.log("🏠 App component rendered - Shop:", shop);
  return /* @__PURE__ */ jsxs(AppProvider, {
    embedded: true,
    apiKey,
    shopOrigin: `https://${shop}`,
    children: [/* @__PURE__ */ jsxs("s-app-nav", {
      children: [/* @__PURE__ */ jsx("s-link", {
        href: "/app",
        children: "Dashboard"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/admin/products",
        children: "Products"
      })]
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const hydrate = boundary.hydrate;
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  hydrate,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const app_additional = UNSAFE_withComponentProps(function AdditionalPage() {
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Additional page",
    children: [/* @__PURE__ */ jsxs("s-section", {
      heading: "Multiple pages",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using", " ", /* @__PURE__ */ jsx("s-link", {
          href: "https://shopify.dev/docs/apps/tools/app-bridge",
          target: "_blank",
          children: "App Bridge"
        }), "."]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["To create your own page and have it show up in the app navigation, add a page inside ", /* @__PURE__ */ jsx("code", {
          children: "app/routes"
        }), ", and a link to it in the", " ", /* @__PURE__ */ jsx("code", {
          children: "<ui-nav-menu>"
        }), " component found in", " ", /* @__PURE__ */ jsx("code", {
          children: "app/routes/app.jsx"
        }), "."]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Resources",
      children: /* @__PURE__ */ jsx("s-unordered-list", {
        children: /* @__PURE__ */ jsx("s-list-item", {
          children: /* @__PURE__ */ jsx("s-link", {
            href: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            children: "App nav best practices"
          })
        })
      })
    })]
  });
});
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
async function loader() {
  return redirect("/admin/products");
}
const app__index = UNSAFE_withComponentProps(function Index2() {
  return null;
});
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app__index,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-BOm4nx4P.js", "imports": ["/assets/jsx-runtime-BlYPhtYe.js", "/assets/chunk-4WY6JWTD-BNuEJNLV.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/root-ChEezJU2.js", "imports": ["/assets/jsx-runtime-BlYPhtYe.js", "/assets/chunk-4WY6JWTD-BNuEJNLV.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.products.delete": { "id": "routes/webhooks.products.delete", "parentId": "root", "path": "webhooks/products/delete", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.products.delete-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.products.update": { "id": "routes/webhooks.products.update", "parentId": "root", "path": "webhooks/products/update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.products.update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.products": { "id": "routes/admin.products", "parentId": "root", "path": "admin/products", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.products-CLOn2VER.js", "imports": ["/assets/chunk-4WY6JWTD-BNuEJNLV.js", "/assets/jsx-runtime-BlYPhtYe.js"], "css": ["/assets/admin-BL7HP8fE.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-B0LwL5Dz.js", "imports": ["/assets/chunk-4WY6JWTD-BNuEJNLV.js", "/assets/jsx-runtime-BlYPhtYe.js", "/assets/AppProxyProvider-DhqyYSsH.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/debug.env": { "id": "routes/debug.env", "parentId": "root", "path": "debug/env", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/debug.env-BiSfzCXe.js", "imports": ["/assets/chunk-4WY6JWTD-BNuEJNLV.js", "/assets/jsx-runtime-BlYPhtYe.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-CTht1bZ4.js", "imports": ["/assets/chunk-4WY6JWTD-BNuEJNLV.js", "/assets/jsx-runtime-BlYPhtYe.js"], "css": ["/assets/route-CNPfFM0M.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/app-Byiq3ryS.js", "imports": ["/assets/chunk-4WY6JWTD-BNuEJNLV.js", "/assets/jsx-runtime-BlYPhtYe.js", "/assets/AppProxyProvider-DhqyYSsH.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.additional-Bo05iMuK.js", "imports": ["/assets/chunk-4WY6JWTD-BNuEJNLV.js", "/assets/jsx-runtime-BlYPhtYe.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app._index-B96R0r-G.js", "imports": ["/assets/chunk-4WY6JWTD-BNuEJNLV.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-01bcaecc.js", "version": "01bcaecc", "sri": void 0 };
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "v8_middleware": false, "unstable_optimizeDeps": false, "unstable_splitRouteModules": false, "unstable_subResourceIntegrity": false, "unstable_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/webhooks.products.delete": {
    id: "routes/webhooks.products.delete",
    parentId: "root",
    path: "webhooks/products/delete",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/webhooks.products.update": {
    id: "routes/webhooks.products.update",
    parentId: "root",
    path: "webhooks/products/update",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/admin.products": {
    id: "routes/admin.products",
    parentId: "root",
    path: "admin/products",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/debug.env": {
    id: "routes/debug.env",
    parentId: "root",
    path: "debug/env",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route12
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
