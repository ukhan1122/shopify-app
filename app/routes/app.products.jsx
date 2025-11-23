import { useLoaderData, useFetcher } from "react-router-dom";
import { useState, useEffect } from 'react';
import '../styles/Productlist.css';

// ✅ Helper function to build correct API URL
function buildApiUrl(endpoint, shop = null) {
  let backendUrl = process.env.BACKEND_URL || 'http://depop-backend.test/api';
  
  // ✅ Remove trailing slash if present
  backendUrl = backendUrl.replace(/\/$/, '');
  
  // ✅ Build the full URL
  let apiUrl = `${backendUrl}/v1/shopify/${endpoint}`;
  
  // ✅ Add shop_domain parameter if provided (your Laravel expects shop_domain, not shop)
  if (shop) {
    apiUrl += `?shop_domain=${shop}`;
  }
  
  console.log('🔗 Built API URL:', apiUrl);
  return apiUrl;
}

// ✅ Loader calls YOUR LARAVEL BACKEND API
export const loader = async ({ request }) => {
  console.log('📦 Products loader - LOADING FROM LARAVEL BACKEND');

  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');

  console.log('✅ Loading products for shop:', shop);

  try {
    // ✅ Use the helper function to build correct URL
    const apiUrl = buildApiUrl('products', shop);
    
    console.log('🔄 Calling Laravel backend:', apiUrl);
    
    const response = await fetch(apiUrl);
    
    console.log('📡 Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      // ✅ Try to get JSON error first, then fall back to text
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = await response.text();
      }
      
      console.error('❌ Backend API error details:', {
        status: response.status,
        statusText: response.statusText,
        url: apiUrl,
        errorData: errorData
      });
      
      throw new Error(`Backend API error: ${response.status} - ${response.statusText}. Details: ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    console.log('✅ Backend response data:', data);

    // ✅ FIX: Extract products from data.data.products instead of data.products
    const products = data.data?.products || data.products || [];
    
    console.log(`✅ Loaded ${products.length} products from Laravel backend`);

    return {
      products: products, // ✅ Now using the correct products array
      productsCount: products.length,
      shop: shop,
      currentStore: shop,
      message: data.message || 'Products loaded from database'
    };
  } catch (error) {
    console.error('❌ Error loading products:', error);
    return {
      products: [],
      productsCount: 0,
      shop: shop,
      currentStore: shop,
      message: 'No products found. Click "Refresh from Shopify" to sync.',
      error: error.message
    };
  }
};

export const action = async ({ request }) => {
  console.log('🔄 Sync action - SYNCING FROM SHOPIFY VIA LARAVEL');

  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');

  try {
    // ✅ Use the helper function to build correct URL
    const apiUrl = buildApiUrl('products/sync');

    console.log('🔄 Calling sync endpoint:', apiUrl);
    console.log('🔄 Sending shop_domain:', shop);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      // ✅ FIX: Send as URL parameter OR in body, but be consistent
      body: JSON.stringify({ 
        shop_domain: shop,
        // ✅ Add any other required fields your backend expects
        force_sync: true
      })
    });

    console.log('📡 Sync response status:', response.status, response.statusText);

    if (!response.ok) {
      // ✅ Get detailed error message from backend
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = await response.text();
      }
      
      console.error('❌ Sync API error details:', {
        status: response.status,
        statusText: response.statusText,
        url: apiUrl,
        errorData: errorData
      });
      
      throw new Error(`Sync failed: ${response.status} - ${response.statusText}. ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('✅ Sync completed:', data);

    // ✅ FIX: Extract products from data.data.products
    const products = data.data?.products || data.products || [];

    return {
      success: data.success !== false,
      message: data.message || 'Products synced successfully',
      products: products,
      currentStore: shop,
      shop: shop,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error("❌ Sync action error:", error.message);
    return {
      success: false,
      message: `Sync failed: ${error.message}`,
      timestamp: Date.now()
    };
  }
};

// ✅ Your UI component with Shopify Connect added
export default function ProductsPage() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();

  // ✅ ADDED: Shopify Connect State
  const [shopDomain, setShopDomain] = useState('');
  
  // ✅ ADDED: Shopify Install Function
  const installShopifyApp = async (domain) => {
    const shopDomainToUse = domain || loaderData.shop || 'your-store.myshopify.com';
    
    try {
      console.log('🚀 Starting Shopify OAuth for:', shopDomainToUse);
      
      const response = await fetch(
        `http://depop-backend.test/api/v1/shopify/oauth/start?shop=${shopDomainToUse}`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      
      const data = await response.json();
      
      if (data.redirect_url) {
        console.log('🔀 Redirecting to:', data.redirect_url);
        window.location.href = data.redirect_url;
      } else {
        console.error('❌ No redirect URL received:', data);
        alert('Failed to start installation. Please try again.');
      }
    } catch (error) {
      console.error('❌ Installation failed:', error);
      alert('Connection failed. Please check your store domain and try again.');
    }
  };

  console.log('📊 ProductsPage - Loader data:', {
    shop: loaderData.shop,
    currentStore: loaderData.currentStore,
    productsCount: loaderData.products?.length,
    hasError: !!loaderData.error
  });

  // ✅ ADDED: Debug products data
  console.log('🔍 PRODUCTS DATA:', loaderData.products);
  if (loaderData.products && loaderData.products.length > 0) {
    console.log('🔍 FIRST PRODUCT:', loaderData.products[0]);
  }

  const [products, setProducts] = useState(loaderData.products || []);
  const [currentStore, setCurrentStore] = useState(loaderData.shop || loaderData.currentStore || 'Loading...');

  const isSyncing = fetcher.state === "submitting";
  const syncResult = fetcher.data;

  // Update UI when sync completes or when loader data changes
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
    }
  }, [syncResult]);

  // Format store name
  const formatStoreName = (store) => {
    if (!store || store === 'Loading...') return 'Loading Store...';
    try {
      const baseName = store.replace('.myshopify.com', '');
      return baseName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    } catch (error) {
      return store;
    }
  };

  // ✅ SAFE: Helper function to safely render text
  const safeText = (text, fallback = 'N/A') => {
    if (text === null || text === undefined) return fallback;
    return String(text);
  };

  // Calculate statistics
  const totalProducts = products?.length || 0;
  const excellentCondition = products?.filter(p => {
    const condition = p.condition?.title || p.condition;
    return condition === 'Excellent' || condition?.toLowerCase().includes('excellent');
  })?.length || 0;

  const totalInventory = products?.reduce((sum, product) => sum + (product.quantity_left || 0), 0) || 0;       

  const outOfStock = products?.filter(p => (p.quantity_left || 0) === 0)?.length || 0;

  return (
    <div className="products-container">
      {/* ✅ ADDED: Shopify Connect Section */}
      {!loaderData.shop && !loaderData.currentStore && (
        <div style={{ 
          margin: '20px 0', 
          padding: '20px', 
          border: '1px solid #ddd',
          borderRadius: '8px',
          backgroundColor: '#f9f9f9'
        }}>
          <h3>Connect Your Shopify Store</h3>
          <p>Enter your Shopify store domain to sync products:</p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="your-store.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              style={{ 
                padding: '8px 12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                flex: 1,
                maxWidth: '300px'
              }}
            />
            <button 
              onClick={() => installShopifyApp(shopDomain)}
              disabled={!shopDomain}
              style={{ 
                padding: '10px 20px', 
                background: shopDomain ? '#000' : '#ccc', 
                color: '#fff', 
                border: 'none',
                borderRadius: '4px',
                cursor: shopDomain ? 'pointer' : 'not-allowed'
              }}
            >
              Connect Shopify
            </button>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="products-header">
        <div className="header-content">
          <div className="store-info-section">
            <h1 className="app-title">Smart Product Sync</h1>
            <div className="store-name-display">
              <span className="store-icon">🛍️</span>
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
                  Refresh from Shopify
                </>
              )}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {/* Messages */}
      {loaderData.error && (
        <div className="sync-message error">
          ❌ Error: {loaderData.error}
        </div>
      )}

      {syncResult && (
        <div className={`sync-message ${syncResult.success ? 'success' : 'error'}`}>
          {syncResult.success ? '✅' : '❌'} {syncResult.message}
        </div>
      )}

      {loaderData.message && !loaderData.error && (
        <div className="sync-message info">
          💡 {loaderData.message}
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <h3>Total Products</h3>
          <p className="value">{totalProducts}</p>
          <small>From Shopify</small>
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

      {/* Products Table - FIXED RENDERING */}
      <div className="products-table-container">
        <table className="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Price</th>
              <th>Inventory</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products && products.length > 0 ? (
              products.map((product) => (
                <tr key={product.id} className="product-row">
                  <td className="product-info-cell">
                    <div className="product-info">
                      {product.images && product.images.length > 0 ? (
                        <img
                          src={product.images[0].src}
                          alt={safeText(product.title)}
                          className="product-thumbnail"
                        />
                      ) : (
                        <div className="no-image-placeholder">No Image</div>
                      )}
                      <div className="product-text-info">
                        <div className="product-title-table">
                          {/* ✅ SAFE: Ensure title is a string */}
                          {safeText(product.title, 'No Title')}
                        </div>
                        {product.description && (
                          <div className="product-description-table">
                            {/* ✅ SAFE: Convert description to string */}
                            {safeText(product.description).substring(0, 80)}...
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className="brand-value">
                      {/* ✅ SAFE: Ensure brand is a string */}
                      {safeText(product.brand, 'No Brand')}
                    </span>
                  </td>

                  <td>
                    <span className="price-value-table">
                      {/* ✅ SAFE: Handle price conversion */}
                      {product.price ? `$${parseFloat(product.price).toFixed(2)}` : 'N/A'}
                    </span>
                  </td>

                  <td>
                    <span className={`inventory-badge ${(product.quantity_left || 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>
                      {/* ✅ SAFE: Ensure number */}
                      {Number(product.quantity_left || 0)}
                    </span>
                  </td>

                  <td>
                    <span className={`condition-badge ${safeText(product.condition || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}>
                      {/* ✅ SAFE: Ensure condition is a string */}
                      {safeText(product.condition, 'Unknown')}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="empty-state">
                  <h3>No products found for {formatStoreName(currentStore)}</h3>
                  <p>Click "Refresh from Shopify" to sync products from your store.</p>
                  {loaderData.error && (
                    <p className="error-text">Error: {loaderData.error}</p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}