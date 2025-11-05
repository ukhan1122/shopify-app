import { useLoaderData, useFetcher } from "react-router";
import { useState } from 'react';
import '../styles/Productlist.css';

// PRELOVED-SPECIFIC EXTRACTION FUNCTIONS (client-side only)
function extractConditionFromPreloved(product) {
  if (product.metafields?.edges?.length > 0) {
    const conditionMetafield = product.metafields.edges.find(edge => 
      edge.node.key.toLowerCase().includes('condition') ||
      edge.node.namespace.toLowerCase().includes('condition')
    );
    if (conditionMetafield) return conditionMetafield.value;
  }
  
  if (product.tags?.length > 0) {
    const conditionTags = ['excellent', 'very good', 'good', 'fair', 'poor'];
    for (const tag of product.tags) {
      const lowerTag = tag.toLowerCase();
      if (conditionTags.some(condition => lowerTag.includes(condition))) {
        return tag.charAt(0).toUpperCase() + tag.slice(1);
      }
    }
  }
  
  return 'Unknown';
}

function extractBrandFromPreloved(product) {
  if (product.vendor?.trim()) return product.vendor;
  if (product.productType?.trim()) return product.productType;

  if (product.metafields?.edges?.length > 0) {
    const brandMetafield = product.metafields.edges.find(edge => 
      edge.node.key.toLowerCase().includes('brand') ||
      edge.node.key.toLowerCase().includes('designer')
    );
    if (brandMetafield) return brandMetafield.value;
  }

  return 'Luxury Brand';
}

function extractSizeFromPreloved(product) {
  if (product.variants?.edges?.length > 0) {
    const firstVariant = product.variants.edges[0].node;
    
    if (firstVariant.selectedOptions?.length > 0) {
      const sizeOption = firstVariant.selectedOptions.find(option => 
        option.name.toLowerCase().includes('size')
      );
      if (sizeOption?.value && sizeOption.value !== 'Default Title') {
        return sizeOption.value;
      }
    }
  }

  const sizeFromTitle = extractSizeFromText(product.title);
  if (sizeFromTitle !== 'One Size') return sizeFromTitle;

  return 'One Size';
}

function extractSizeFromText(text) {
  if (!text) return 'One Size';
  
  const sizePatterns = [
    /\b(XS|S|M|L|XL|XXL|XXXL)\b/i,
    /\b(2[0-9]|3[0-9]|4[0-9])\b/,
    /\b(Small|Medium|Large|One Size)\b/i,
  ];

  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return 'One Size';
}

function extractInventoryFromPreloved(product) {
  if (product.totalInventory !== null && product.totalInventory !== undefined) {
    return product.totalInventory;
  }
  
  if (product.variants?.edges?.length > 0) {
    return product.variants.edges.reduce((sum, variant) => {
      return sum + (variant.node.inventoryQuantity || 0);
    }, 0);
  }
  
  return 0;
}

function extractPriceFromPreloved(product) {
  if (product.priceRange?.minVariantPrice) {
    const price = parseFloat(product.priceRange.minVariantPrice.amount);
    const currency = product.priceRange.minVariantPrice.currencyCode;
    
    const formattedPrice = price % 1 === 0 ? price.toFixed(0) : price.toFixed(2);
    return `${formattedPrice} ${currency}`;
  }
  return 'Price not available';
}

function formatPrice(priceString) {
  if (!priceString || priceString === 'Price not available') return 'N/A';
  
  try {
    const [amountStr, currency] = priceString.split(' ');
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount)) return priceString;
    
    const formattedAmount = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
    return `${formattedAmount} ${currency || 'USD'}`;
  } catch (error) {
    return priceString;
  }
}

function extractMainImage(product) {
  if (product.featuredImage?.url) return product.featuredImage.url;
  if (product.images?.edges?.length > 0) return product.images.edges[0].node.url;
  return null;
}

// Server-side loader with AUTOMATIC TABLE CREATION
export async function loader({ request }) {
  try {
    const { authenticate } = await import("../shopify.server");
    const { 
      getProductsFromAutoStoreTable, 
      saveProductsToAutoStoreTable, 
      getAllStoresWithStats 
    } = await import("../utils/db");
    
    console.log("🔄 Loader: Starting session authentication...");
    
    try {
      const { admin, session } = await authenticate.admin(request);
      const storeDomain = session.shop;
      
      console.log("✅ Loader: Session validated successfully");
      console.log(`🏪 Current Store: ${storeDomain}`);
      
      // Get current store's products from Shopify
      const response = await admin.graphql(
        `#graphql
          query {
            products(first: 50) {
              edges {
                node {
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
            }
          }`
      );
      
      const data = await response.json();
      
      if (!data.data || !data.data.products) {
        throw new Error('Invalid response from Shopify API');
      }
      
      const shopifyProducts = data.data.products.edges;
      console.log(`🛍️ Loader: Loaded ${shopifyProducts.length} products from Shopify store: ${storeDomain}`);
      
      // Process Shopify products
      const processedShopifyProducts = shopifyProducts.map(productEdge => {
        const product = productEdge.node;
        
        return {
          ...productEdge,
          node: {
            ...product,
            condition: extractConditionFromPreloved(product),
            brand: extractBrandFromPreloved(product),
            size: extractSizeFromPreloved(product),
            price: extractPriceFromPreloved(product),
            inventory: extractInventoryFromPreloved(product),
            mainImage: extractMainImage(product)
          }
        };
      });

      // ✅ AUTOMATICALLY CREATE STORE TABLE AND SAVE PRODUCTS
      const saveResult = await saveProductsToAutoStoreTable(storeDomain, processedShopifyProducts);
      
      // ✅ GET PRODUCTS FROM STORE-SPECIFIC TABLE
      const dbProducts = await getProductsFromAutoStoreTable(storeDomain);
      
      // ✅ GET ALL STORES STATS
      const allStores = await getAllStoresWithStats();
      
      console.log(`📊 Store Stats [${storeDomain}]: ${dbProducts.length} products in store table`);
      console.log(`🏪 Total Stores: ${allStores.length}`);
      
      return { 
        products: dbProducts,
        shopifyProductsCount: shopifyProducts.length,
        sessionValid: true,
        currentStore: storeDomain,
        storeTable: saveResult.tableName,
        allStores: allStores,
        timestamp: Date.now()
      };
      
    } catch (authError) {
      console.error("❌ Loader: Authentication failed:", authError.message);
      return { 
        products: [],
        shopifyProductsCount: 0,
        error: "Authentication failed. Please refresh the page.",
        timestamp: Date.now()
      };
    }
    
  } catch (error) {
    console.error("❌ Loader error:", error.message);
    
    return { 
      products: [],
      shopifyProductsCount: 0,
      error: "Failed to load products. Please refresh the page.",
      timestamp: Date.now()
    };
  }
}

// Server-side action with store separation
export async function action({ request }) {
  try {
    const { authenticate } = await import("../shopify.server");
    const { 
      saveProductsToAutoStoreTable, 
      getProductsFromAutoStoreTable, 
      syncTitleToShopify, 
      syncInventoryToShopify, 
      detectChanges, 
      getAllStoresWithStats 
    } = await import("../utils/db");
    
    console.log("🔄 Action: Starting SMART bidirectional sync with automatic table creation...");
    
    try {
      // Authenticate for THIS request - fresh session every time
      const { admin, session } = await authenticate.admin(request);
      const storeDomain = session.shop;
      
      console.log("✅ Action: Session validated, starting sync...");
      console.log(`🏪 Syncing with store: ${storeDomain}`);

      let syncResults = {
        shopifyToDB: { saved: 0, updated: 0, errors: 0, titleChanges: 0, inventoryChanges: 0 },
        dbToShopify: { titleSynced: 0, inventorySynced: 0, errors: 0 },
        currentStore: storeDomain
      };

      // STEP 1: Get current data from both sources
      console.log("📊 STEP 1: Getting current data from both sources...");
      
      const originalDBProducts = await getProductsFromAutoStoreTable(storeDomain);
      console.log(`📋 Current DB products for ${storeDomain}: ${originalDBProducts.length}`);
      
      // Get current Shopify products from CURRENT STORE
      const response = await admin.graphql(
        `#graphql
          query {
            products(first: 50) {
              edges {
                node {
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
            }
          }`
      );
      
      const data = await response.json();
      
      if (!data.data || !data.data.products) {
        throw new Error('Invalid response from Shopify API');
      }
      
      const shopifyProducts = data.data.products.edges;
      console.log(`📋 Current Shopify products from ${storeDomain}: ${shopifyProducts.length}`);
      
      // Process Shopify products for comparison
      const processedShopifyProducts = shopifyProducts.map(productEdge => {
        const product = productEdge.node;
        
        return {
          ...productEdge,
          node: {
            ...product,
            condition: extractConditionFromPreloved(product),
            brand: extractBrandFromPreloved(product),
            size: extractSizeFromPreloved(product),
            price: extractPriceFromPreloved(product),
            inventory: extractInventoryFromPreloved(product),
            mainImage: extractMainImage(product)
          }
        };
      });

      // STEP 2: Detect changes FOR THIS STORE
      console.log("🔍 STEP 2: Analyzing changes for current store...");
      
      const { titleChanges, inventoryChanges } = await detectChanges(originalDBProducts, processedShopifyProducts, storeDomain);
      
      // STEP 3: Sync DB → Shopify for title changes FOR THIS STORE
      console.log("📤 STEP 3: Syncing title changes from Database to Shopify...");
      
      let titleSyncSuccess = 0;
      let titleSyncErrors = 0;
      
      if (titleChanges.length > 0) {
        for (const change of titleChanges) {
          try {
            const syncResult = await syncTitleToShopify(admin, change.dbProductId, storeDomain);
            if (syncResult.success) {
              titleSyncSuccess++;
              console.log(`✅ DB → Shopify (Title) [${storeDomain}]: "${change.dbTitle}" → Shopify`);
            } else {
              titleSyncErrors++;
              console.log(`❌ DB → Shopify (Title) failed [${storeDomain}]: ${change.dbTitle} - ${syncResult.error}`);
            }
          } catch (error) {
            titleSyncErrors++;
            console.error(`❌ DB → Shopify (Title) error [${storeDomain}]: ${change.dbTitle} - ${error.message}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } else {
        console.log(`🔵 No DB → Shopify title changes needed for ${storeDomain}`);
      }
      
      // STEP 4: Sync DB → Shopify for inventory changes FOR THIS STORE
      console.log("📤 STEP 4: Syncing inventory changes from Database to Shopify...");
      
      let inventorySyncSuccess = 0;
      let inventorySyncErrors = 0;
      
      if (inventoryChanges.length > 0) {
        for (const change of inventoryChanges) {
          try {
            const syncResult = await syncInventoryToShopify(admin, change.dbProductId, storeDomain);
            if (syncResult.success) {
              inventorySyncSuccess++;
              console.log(`✅ DB → Shopify (Inventory) [${storeDomain}]: ${change.dbInventory} → ${change.shopifyInventory}`);
            } else {
              inventorySyncErrors++;
              console.log(`❌ DB → Shopify (Inventory) failed [${storeDomain}]: ${change.dbInventory} - ${syncResult.error}`);
            }
          } catch (error) {
            inventorySyncErrors++;
            console.error(`❌ DB → Shopify (Inventory) error [${storeDomain}]: ${change.dbInventory} - ${error.message}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } else {
        console.log(`🔵 No DB → Shopify inventory changes needed for ${storeDomain}`);
      }
      
      syncResults.dbToShopify.titleSynced = titleSyncSuccess;
      syncResults.dbToShopify.inventorySynced = inventorySyncSuccess;
      syncResults.dbToShopify.errors = titleSyncErrors + inventorySyncErrors;

      // STEP 5: Sync Shopify → Database FOR THIS STORE (with automatic table creation)
      console.log("📥 STEP 5: Syncing from Shopify to Database with automatic table creation...");
      
      const saveResult = await saveProductsToAutoStoreTable(storeDomain, processedShopifyProducts);
      syncResults.shopifyToDB = {
        ...saveResult,
        titleChanges: saveResult.titleChanges || 0,
        inventoryChanges: saveResult.inventoryChanges || 0
      };

      // Get updated database stats
      const allStores = await getAllStoresWithStats();
      const currentStoreStats = allStores.find(store => store.name === storeDomain.replace('.myshopify.com', ''));

      console.log("✅ SMART Bidirectional sync completed!");
      console.log(`🏪 Store: ${storeDomain}`);
      console.log(`📤 DB → Shopify: ${titleSyncSuccess} title updates, ${inventorySyncSuccess} inventory updates`);
      console.log(`📥 Shopify → DB: ${syncResults.shopifyToDB.updated} products updated`);
      console.log(`📊 Store Database: ${currentStoreStats?.productCount || 0} products for this store`);

      return { 
        success: true, 
        message: `Sync completed for ${storeDomain}! 📤 ${titleSyncSuccess} titles & ${inventorySyncSuccess} inventory to Shopify | 📥 ${syncResults.shopifyToDB.updated} updates from Shopify`,
        details: syncResults,
        storeTable: saveResult.tableName,
        allStores: allStores,
        timestamp: Date.now()
      };
      
    } catch (authError) {
      console.error("❌ Action: Authentication failed:", authError.message);
      return { 
        success: false, 
        message: "Session expired. Please try syncing again.",
        timestamp: Date.now()
      };
    }
    
  } catch (error) {
    console.error("❌ Bidirectional sync failed:", error.message);
    
    return { 
      success: false, 
      message: `Sync failed: ${error.message}`,
      timestamp: Date.now()
    };
  }
}

// Client component
export default function ProductsPage() {
  const { products, error, currentStore, storeTable, allStores } = useLoaderData();
  const fetcher = useFetcher();
  
  const isSyncing = fetcher.state === "submitting";
  const syncResult = fetcher.data;

  // Calculate summary statistics
  const totalProducts = products.length;
  const excellentCondition = products.filter(p => p.product_condition === 'Excellent').length;
  const totalInventory = products.reduce((sum, product) => sum + (product.inventory_quantity || 0), 0);
  const outOfStock = products.filter(p => (p.inventory_quantity || 0) === 0).length;

  return (
    <div className="products-container">
      {/* Header Section */}
      <div className="products-header">
        <div>
          <h1 className="products-title">Preloved Products</h1>
          <div className="products-count">
            {totalProducts} luxury items • {isSyncing ? "Smart Syncing..." : "Smart Sync (Title + Inventory)"}
          </div>
          <div className="store-info">
            {/* 🏪 Current Store: <strong>{currentStore || 'Loading...'}</strong> */}
          </div>
          {storeTable && (
            <div className="store-table-info">
              {/* 🗃️ Store Table: <strong>{storeTable}</strong> */}
            </div>
          )}
        </div>
        
        {/* Bidirectional Sync Button */}
        <fetcher.Form method="post">
          <button 
            type="submit"
            disabled={isSyncing}
            className={`sync-button ${isSyncing ? 'syncing' : ''}`}
            title={`Smart sync for ${currentStore}`}
          >
            {isSyncing ? (
              <>
                <span className="sync-spinner"></span>
                Smart Syncing...
              </>
            ) : (
              <>
                <span className="sync-icon">🔄</span>
                Smart Sync
              </>
            )}
          </button>
        </fetcher.Form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="sync-message error">
          ❌ {error}
        </div>
      )}

      {/* Sync Status Message */}
      {syncResult && (
        <div className={`sync-message ${syncResult.success ? 'success' : 'error'}`}>
          {syncResult.success ? '✅' : '❌'} {syncResult.message}
          {syncResult.storeTable && (
            <div className="sync-stats">
              🗃️ Store Table: <strong>{syncResult.storeTable}</strong>
            </div>
          )}
          {syncResult.details?.dbToShopify?.errors > 0 && ` (${syncResult.details.dbToShopify.errors} errors)`}
        </div>
      )}

      {/* Automatic Table Creation Info Box */}
      {/* <div className="store-separation-info">
        <h4>✅ Automatic Table Creation: Active</h4>
        <p>Each store has its own isolated table in the database</p>
        <p>Current Store Table: <strong>{storeTable || 'Loading...'}</strong></p>
      </div> */}

      {/* All Stores Section */}
      {allStores && allStores.length > 0 && (
        <div className="all-stores-section">
          {/* <h3>📊 All Stores in Database</h3> */}
          <div className="stores-grid">
            {allStores.map(store => (
              <div key={store.name} className={`store-card ${store.name === currentStore?.replace('.myshopify.com', '') ? 'current-store' : ''}`}>
                {/* <h4>{store.name}</h4>
                <p>Products: {store.productCount}</p>
                <p>Inventory: {store.totalInventory}</p>
                <p>Table: {store.tableName}</p> */}
                {store.name === currentStore?.replace('.myshopify.com', '') && (
                  <div className="current-store-badge">Current</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <h3>Total Items</h3>
          <p className="value">{totalProducts}</p>
          <small>In this store</small>
        </div>
        <div className="summary-card">
          <h3>Total Inventory</h3>
          <p className="value">{totalInventory}</p>
          <small>This store's stock</small>
        </div>
        <div className="summary-card">
          <h3>Excellent Condition</h3>
          <p className="value">{excellentCondition}</p>
          <small>Top quality</small>
        </div>
        <div className="summary-card">
          <h3>Out of Stock</h3>
          <p className="value">{outOfStock}</p>
          <small>Need restock</small>
        </div>
      </div>

      {/* Products Table */}
      <div className="products-table-container">
        <table className="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Size</th>
              <th>Condition</th>
              <th>Price</th>
              <th>Inventory</th>
              <th>Store Table</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="product-row">
                <td className="product-info-cell">
                  <div className="product-info">
                    {product.image_url && (
                      <img 
                        src={product.image_url} 
                        alt={product.title}
                        className="product-thumbnail"
                      />
                    )}
                    <div className="product-text-info">
                      <div className="product-title-table">{product.title}</div>
                      {product.description && (
                        <div className="product-description-table">
                          {product.description.substring(0, 80)}...
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span className="brand-value">{product.brand}</span>
                </td>
                <td>
                  <span className="size-value">{product.size}</span>
                </td>
                <td>
                  <span className={`condition-badge ${product.product_condition?.toLowerCase().replace(' ', '-')}`}>
                    {product.product_condition}
                  </span>
                </td>
                <td>
                  <span className="price-value-table">
                    {formatPrice(product.price)}
                  </span>
                </td>
                <td>
                  <span className={`inventory-badge ${(product.inventory_quantity || 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>
                    {product.inventory_quantity || 0}
                  </span>
                </td>
                <td>
                  <span className="store-badge">
                    {storeTable || 'store_...'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <div className="empty-state">
            <h3>No products found for {currentStore}</h3>
            <p>Click "Smart Sync" to import products from your Shopify store.</p>
          </div>
        )}
      </div>
    </div>
  );
}