import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from 'react';
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

// Server-side loader - ONLY GET FROM DATABASE
export async function loader({ request }) {
  try {
    const { authenticate } = await import("../shopify.server");
    const { 
      getProductsFromAutoStoreTable, 
      getAllStoresWithStats 
    } = await import("../utils/db");
    
    const { session } = await authenticate.admin(request);
    const storeDomain = session.shop;
    
    const dbProducts = await getProductsFromAutoStoreTable(storeDomain);
    const allStores = await getAllStoresWithStats();
    
    return { 
      products: dbProducts,
      sessionValid: true,
      currentStore: storeDomain,
      allStores: allStores,
      timestamp: Date.now()
    };
    
  } catch (error) {
    return { 
      products: [],
      error: "Failed to load products from database.",
      timestamp: Date.now()
    };
  }
}

// SIMPLE SYNC FUNCTION: ALWAYS accept Shopify changes
async function syncShopifyToDB(storeDomain, shopifyProducts) {
  const { saveProductsToDB } = await import("../utils/db");
  
  let savedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  
  console.log(`🔄 Syncing ALL Shopify changes to DB...`);
  
  // Process each Shopify product
  for (const productEdge of shopifyProducts) {
    const product = productEdge.node;
    
    try {
      // Extract Shopify ID
      let shopifyId = product.id;
      if (shopifyId && shopifyId.includes('/')) {
        shopifyId = shopifyId.split('/').pop();
      }
      
      if (!shopifyId) {
        console.error(`❌ Missing shopify_id for product:`, product.title);
        errorCount++;
        continue;
      }
      
      // ALWAYS save Shopify data to DB (this will create or update)
      await saveProductsToDB([productEdge], storeDomain);
      updatedCount++;
      console.log(`✅ Updated from Shopify: ${product.title}`);
      
    } catch (error) {
      console.error(`❌ Error syncing product:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`✅ Shopify sync completed: ${updatedCount} updated, ${errorCount} errors`);
  
  return { 
    success: true, 
    saved: savedCount, 
    updated: updatedCount, 
    errors: errorCount
  };
}

// Server-side action - BIDIRECTIONAL SYNC (SIMPLE AND RELIABLE)
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
    
    const { admin, session } = await authenticate.admin(request);
    const storeDomain = session.shop;

    let syncResults = {
      dbToShopify: { titleSynced: 0, inventorySynced: 0, errors: 0 },
      shopifyToDB: { saved: 0, updated: 0, errors: 0 }
    };

    // STEP 1: Get CURRENT DB data
    const currentDBProducts = await getProductsFromAutoStoreTable(storeDomain);
    console.log(`📋 Current DB products: ${currentDBProducts.length}`);
    
    // STEP 2: Get current Shopify products
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
    const shopifyProducts = data.data.products.edges;
    console.log(`📋 Current Shopify products: ${shopifyProducts.length}`);
    
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

    // STEP 3: Detect DB → Shopify changes (YOUR CHANGES)
    const { titleChanges, inventoryChanges } = await detectChanges(currentDBProducts, processedShopifyProducts, storeDomain);
    console.log(`📝 Your DB changes detected: ${titleChanges.length} titles, ${inventoryChanges.length} inventory`);
    
    // STEP 4: FIRST - Sync DB → Shopify (Your changes to Shopify)
    let titleSyncSuccess = 0;
    let titleSyncErrors = 0;
    
    if (titleChanges.length > 0) {
      console.log("🔄 Sending your title changes to Shopify...");
      for (const change of titleChanges) {
        try {
          const syncResult = await syncTitleToShopify(admin, change.dbProductId, storeDomain);
          if (syncResult.success) {
            titleSyncSuccess++;
            console.log(`✅ Sent to Shopify: "${change.dbTitle}" → "${change.shopifyTitle}"`);
          } else {
            titleSyncErrors++;
            console.log(`❌ Failed: "${change.dbTitle}"`);
          }
        } catch (error) {
          titleSyncErrors++;
          console.error(`❌ Error: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    let inventorySyncSuccess = 0;
    let inventorySyncErrors = 0;
    
    if (inventoryChanges.length > 0) {
      console.log("🔄 Sending your inventory changes to Shopify...");
      for (const change of inventoryChanges) {
        try {
          const syncResult = await syncInventoryToShopify(admin, change.dbProductId, storeDomain);
          if (syncResult.success) {
            inventorySyncSuccess++;
            console.log(`✅ Sent to Shopify: ${change.dbInventory} → ${change.shopifyInventory}`);
          } else {
            inventorySyncErrors++;
            console.log(`❌ Failed: ${change.dbInventory}`);
          }
        } catch (error) {
          inventorySyncErrors++;
          console.error(`❌ Error: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    syncResults.dbToShopify.titleSynced = titleSyncSuccess;
    syncResults.dbToShopify.inventorySynced = inventorySyncSuccess;
    syncResults.dbToShopify.errors = titleSyncErrors + inventorySyncErrors;

    // STEP 5: ALWAYS sync Shopify → DB (Accept ALL Shopify changes)
    console.log("🔄 Bringing ALL Shopify changes to DB...");
    const shopifySaveResult = await syncShopifyToDB(storeDomain, processedShopifyProducts);
    syncResults.shopifyToDB = shopifySaveResult;

    // STEP 6: Get FINAL DB data (Shopify changes are now in DB)
    const finalDBProducts = await getProductsFromAutoStoreTable(storeDomain);
    const allStores = await getAllStoresWithStats();

    console.log("✅ Sync completed! Shopify changes are in DB.");
    console.log(`📊 Final DB: ${finalDBProducts.length} products`);

    return { 
      success: true, 
      message: `Sync completed! 📤 ${titleSyncSuccess} titles & ${inventorySyncSuccess} inventory to Shopify | 📥 ${shopifySaveResult.updated} Shopify updates to DB`,
      details: syncResults,
      products: finalDBProducts,
      allStores: allStores,
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

// Client component
export default function ProductsPage() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  
  // State to store products
  const [products, setProducts] = useState(loaderData.products);
  const [currentStore, setCurrentStore] = useState(loaderData.currentStore);
  
  const isSyncing = fetcher.state === "submitting";
  const syncResult = fetcher.data;

  // Update UI when sync completes
  useEffect(() => {
    if (syncResult && syncResult.success && syncResult.products) {
      console.log("🔄 UI updating with latest data...");
      setProducts(syncResult.products);
      setCurrentStore(syncResult.currentStore || currentStore);
    }
  }, [syncResult]);

  // Update when loader data changes
  useEffect(() => {
    if (loaderData.products) {
      setProducts(loaderData.products);
      setCurrentStore(loaderData.currentStore);
    }
  }, [loaderData]);

  // Format store name - remove .myshopify.com and capitalize
  const formatStoreName = (store) => {
    if (!store) return '';
    const baseName = store.replace('.myshopify.com', '');
    return baseName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Calculate summary statistics
  const totalProducts = products?.length || 0;
  const excellentCondition = products?.filter(p => p.product_condition === 'Excellent').length || 0;
  const totalInventory = products?.reduce((sum, product) => sum + (product.inventory_quantity || 0), 0) || 0;
  const outOfStock = products?.filter(p => (p.inventory_quantity || 0) === 0).length || 0;

  return (
    <div className="products-container">
      {/* Header Section - Matches your image exactly */}
      <div className="products-header">
        <div className="header-content">
          <div className="store-info-section">
            <h1 className="app-title">Dev-App</h1>
            <div className="store-name-display">
              <span className="store-icon">🏪</span>
              <span className="store-name">{formatStoreName(currentStore)}</span>
            </div>
          </div>
          
          <fetcher.Form method="post" className="sync-form">
            <button 
              type="submit"
              disabled={isSyncing}
              className={`sync-button ${isSyncing ? 'syncing' : ''}`}
            >
              {isSyncing ? (
                <>
                  <span className="sync-spinner"></span>
                  Syncing...
                </>
              ) : (
                <>
                  <span className="sync-icon">🔄</span>
                  Sync Data
                </>
              )}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {/* Messages */}
      {loaderData.error && (
        <div className="sync-message error">❌ {loaderData.error}</div>
      )}

      {syncResult && (
        <div className={`sync-message ${syncResult.success ? 'success' : 'error'}`}>
          {syncResult.success ? '✅' : '❌'} {syncResult.message}
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <h3>Total Items</h3>
          <p className="value">{totalProducts}</p>
          <small>In database</small>
        </div>
        <div className="summary-card">
          <h3>Total Inventory</h3>
          <p className="value">{totalInventory}</p>
          <small>Database stock</small>
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
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {products && products.map((product) => (
              <tr key={product.id} className="product-row">
                <td className="product-info-cell">
                  <div className="product-info">
                    {product.image_url && (
                      <img src={product.image_url} alt={product.title} className="product-thumbnail" />
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
                <td><span className="brand-value">{product.brand}</span></td>
                <td><span className="size-value">{product.size}</span></td>
                <td>
                  <span className={`condition-badge ${product.product_condition?.toLowerCase().replace(' ', '-')}`}>
                    {product.product_condition}
                  </span>
                </td>
                <td><span className="price-value-table">{formatPrice(product.price)}</span></td>
                <td>
                  <span className={`inventory-badge ${(product.inventory_quantity || 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>
                    {product.inventory_quantity || 0}
                  </span>
                </td>
                <td>
                  <span className="update-time">
                    {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : 'N/A'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!products || products.length === 0) && (
          <div className="empty-state">
            <h3>No products found for {formatStoreName(currentStore)}</h3>
            <p>Click "Sync Data" to import products from Shopify.</p>
          </div>
        )}
      </div>
    </div>
  );
}