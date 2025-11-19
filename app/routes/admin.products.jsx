import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from 'react';
import '../styles/Productlist.css';
import { ShopifyProductService } from '../services/shopify/shopifyProductService';
import ShopifyProductCategoryService from '../services/shopify/shopifyCategoryService';

// Keep all your extraction functions (they're the same)
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

// ✅ FIXED VERSION - Add proper parsing and validation
function extractInventoryFromPreloved(product) {
  try {
    // Method 1: Calculate from variants (most accurate)
    if (product.variants?.edges?.length > 0) {
      const total = product.variants.edges.reduce((sum, variant) => {
        const quantity = parseInt(variant.node.inventoryQuantity);
        return sum + (isNaN(quantity) ? 0 : quantity);
      }, 0);
      console.log(`📊 Inventory from variants: ${total} for ${product.title}`);
      return total;
    }
    
    // Method 2: Use totalInventory with validation
    if (product.totalInventory !== null && product.totalInventory !== undefined) {
      const quantity = parseInt(product.totalInventory);
      const validQuantity = isNaN(quantity) ? 0 : quantity;
      console.log(`📊 Inventory from totalInventory: ${validQuantity} for ${product.title}`);
      return validQuantity;
    }
    
    console.log(`📊 No inventory data found for: ${product.title}, defaulting to 0`);
    return 0;
    
  } catch (error) {
    console.error(`❌ Error extracting inventory for ${product.title}:`, error);
    return 0;
  }
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

// ✅ UPDATED: Loader gets data from backend database
export async function loader({ request }) {
  try {
    const { authenticate } = await import("../shopify.server");
    const { session } = await authenticate.admin(request);
    const storeDomain = session.shop;
    
    console.log(`📥 Loading products from inventory database for: ${storeDomain}`);
    
    // ✅ GET DATA FROM BACKEND DATABASE
    const products = await ShopifyProductService.getProductsFromBackend(storeDomain);
    
    return { 
      products: products,
      sessionValid: true,
      currentStore: storeDomain,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error("❌ Failed to load products from backend database:", error);
    return { 
      products: [],
      error: "Failed to load products from inventory system.",
      timestamp: Date.now()
    };
  }
}

// ✅ UPDATED: Action syncs between Shopify ↔ Backend Database
export async function action({ request }) {
  try {
    const { authenticate } = await import("../shopify.server");
    const { admin, session } = await authenticate.admin(request);
    const storeDomain = session.shop;

    // STEP 1: Get current Shopify products
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

    // ✅ ADD DETAILED INVENTORY DEBUGGING
    console.log("🔍 INVENTORY DEBUG - Raw Shopify data:");
    shopifyProducts.forEach((productEdge, index) => {
      const product = productEdge.node;
      const variantInventory = product.variants?.edges?.reduce((sum, variant) => 
        sum + (parseInt(variant.node.inventoryQuantity) || 0), 0) || 0;
      
      console.log(`Product ${index}: "${product.title}"`);
      console.log(`  - totalInventory: ${product.totalInventory}`);
      console.log(`  - variant sum: ${variantInventory}`);
      console.log(`  - variants:`, product.variants?.edges?.map(v => ({
        id: v.node.id,
        quantity: v.node.inventoryQuantity
      })));
    });

    // Process Shopify products
    const processedShopifyProducts = shopifyProducts.map(productEdge => {
      const product = productEdge.node;
      const inventory = extractInventoryFromPreloved(product);
      
      console.log(`✅ Final inventory for "${product.title}": ${inventory}`);
      
      return {
        ...productEdge,
        node: {
          ...product,
          condition: extractConditionFromPreloved(product),
          brand: extractBrandFromPreloved(product),
          size: extractSizeFromPreloved(product),
          price: extractPriceFromPreloved(product),
          inventory: inventory, // ✅ Use the properly calculated inventory
          mainImage: extractMainImage(product)
        }
      };
    });

    // STEP 2: SYNC ALL PRODUCTS TO BACKEND DATABASE
    console.log("🔄 Sending Shopify products to backend database...");
    
    const productsForBackend = processedShopifyProducts.map(edge => ({
      ...ShopifyProductService.transformProductsForBackend([edge.node])[0],
      quantity: edge.node.inventory // ✅ OVERRIDE WITH CORRECT INVENTORY
    }));

    productsForBackend.forEach((product, index) => {
      const shopifyProduct = processedShopifyProducts[index].node;
    
      
      if (product.quantity > 1000) { // Unreasonable quantity
      }
    });
    
    console.log(`📤 Sending ${productsForBackend.length} Shopify products to backend database...`);
    const backendResult = await ShopifyProductService.syncProductsToBackend(
      storeDomain, 
      productsForBackend
    );
    
    console.log("✅ Shopify → Backend sync completed:", backendResult);

    // ✅ NEW STEP: SYNC CATEGORIES TO BACKEND DATABASE
    console.log("🔄 Starting Shopify category sync...");
    try {
      const categorySyncResult = await ShopifyProductCategoryService.syncShopifyProductCategories(
        storeDomain,
        session.accessToken, // Use the access token from session
        admin // Pass admin for GraphQL if needed
      );
      console.log("✅ Category sync completed:", categorySyncResult);
    } catch (categoryError) {
      console.error("❌ Category sync failed, but continuing with product sync:", categoryError);
      // Don't throw here - let product sync succeed even if category sync fails
    }

    // STEP 3: Get UPDATED data from backend for UI
    console.log("⏳ Waiting for backend to process updates...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("📥 Getting UPDATED data from backend for UI...");
    const updatedProducts = await ShopifyProductService.getProductsFromBackend(storeDomain);

    // ✅ DEBUG: Check if quantities changed AFTER sync
    console.log("🔍 POST-SYNC INVENTORY CHECK:");
    updatedProducts.forEach((product, index) => {
      const originalProduct = productsForBackend[index];
      if (originalProduct) {
        console.log(`Product ${index}: ${product.title}`);
        console.log(`  - Sent to backend: ${originalProduct.quantity}`);
        console.log(`  - Received from backend: ${product.quantity_left}`);
        
        if (product.quantity_left > originalProduct.quantity) {
          console.log(`🚨 MULTIPLICATION DETECTED: ${originalProduct.quantity} → ${product.quantity_left}`);
        }
      }
    });

    return { 
      success: true, 
      message: `Sync completed! 📤 ${productsForBackend.length} products sent to inventory system`,
      products: updatedProducts, // ✅ UI gets data from backend
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

// ✅ Client component - works with backend data
export default function ProductsPage() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  
  // State to store products FROM BACKEND
  const [products, setProducts] = useState(loaderData.products);
  const [currentStore, setCurrentStore] = useState(loaderData.currentStore);
  
  const isSyncing = fetcher.state === "submitting";
  const syncResult = fetcher.data;

  // Update UI when sync completes
  useEffect(() => {
    if (syncResult && syncResult.success && syncResult.products) {
      console.log("🔄 UI updating with latest backend data...");
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

  // ✅ UPDATED: Calculate statistics from backend data
  const totalProducts = products?.length || 0;
  const excellentCondition = products?.filter(p => p.condition === 'Excellent').length || 0;
  const totalInventory = products?.reduce((sum, product) => sum + (product.quantity_left || 0), 0) || 0;
  const outOfStock = products?.filter(p => (p.quantity_left || 0) === 0).length || 0;

  return (
    <div className="products-container">
      {/* Header Section - Matches your image exactly */}
      <div className="products-header">
        <div className="header-content">
          <div className="store-info-section">
            <h1 className="app-title">Smart Product Sync</h1>
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

      {/* Summary Cards - Now showing backend data */}
      <div className="summary-cards">
        <div className="summary-card">
          <h3>Total Items</h3>
          <p className="value">{totalProducts}</p>
          <small>In Inventory</small>
        </div>
        <div className="summary-card">
          <h3>Total Inventory</h3>
          <p className="value">{totalInventory}</p>
          <small>Available Stock</small>
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

      {/* Products Table - Now showing backend data */}
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
            {products && products.map((product) => {
              // Debug logging to see what we're getting
              console.log('Product data:', {
                id: product.id,
                title: product.title,
                brand: product.brand,
                condition: product.condition,
                size: product.size,
                quantity_left: product.quantity_left,
                photos: product.photos
              });
              
              return (
                <tr key={product.id} className="product-row">
                  <td className="product-info-cell">
                    <div className="product-info">
                      {/* ✅ SAFE: Get first photo */}
                      {product.photos && Array.isArray(product.photos) && product.photos.length > 0 && product.photos[0].image_path ? (
                        <img 
                          src={product.photos[0].image_path} 
                          alt={product.title} 
                          className="product-thumbnail" 
                        />
                      ) : (
                        <div className="no-image-placeholder">No Image</div>
                      )}
                      <div className="product-text-info">
                        <div className="product-title-table">{product.title || 'No Title'}</div>
                        {product.description && (
                          <div className="product-description-table">
                            {String(product.description).substring(0, 80)}...
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  {/* ✅ SAFE: Brand */}
                  <td>
                    <span className="brand-value">
                      {product.brand?.name || (typeof product.brand === 'string' ? product.brand : 'No Brand')}
                    </span>
                  </td>
                  
                  {/* ✅ SAFE: Size - Handle object or string */}
                  <td>
                    <span className="size-value">
                      {product.size?.standard_size || 
                      (typeof product.size === 'string' ? product.size : 
                        (product.size ? 'Has Size Object' : 'N/A'))}
                    </span>
                  </td>
                  
                  {/* ✅ SAFE: Condition */}
                  <td>
                    <span className={`condition-badge ${String(product.condition?.title || product.condition || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}>
                      {product.condition?.title || product.condition || 'Unknown'}
                    </span>
                  </td>
                  
                  {/* ✅ SAFE: Price */}
                  <td>
                    <span className="price-value-table">
                      {product.price ? `$${parseFloat(product.price).toFixed(2)}` : 'N/A'}
                    </span>
                  </td>
                  
                  {/* ✅ SAFE: Inventory */}
                  <td>
                    <span className={`inventory-badge ${(product.quantity_left || 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>
                      {product.quantity_left || 0}
                    </span>
                  </td>
                  
                  <td>
                    <span className="update-time">
                      {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(!products || products.length === 0) && (
          <div className="empty-state">
            <h3>No products found for {formatStoreName(currentStore)}</h3>
            <p>Click "Sync Data" to import products from Shopify to inventory system.</p>
          </div>
        )}
      </div>
    </div>
  );
}