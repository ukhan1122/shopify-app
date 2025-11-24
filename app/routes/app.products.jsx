import { useLoaderData, useFetcher } from "react-router-dom";
import { useState, useEffect } from 'react';
import { authenticate } from "../shopify.server";
import '../styles/Productlist.css';

// Helper function to build correct API URL
function buildApiUrl(endpoint, shop = null) {
  let backendUrl = process.env.BACKEND_URL || 'http://depop-backend.test/api';
  backendUrl = backendUrl.replace(/\/$/, '');
  
  let apiUrl = `${backendUrl}/v1/shopify/${endpoint}`;
  
  if (shop) {
    apiUrl += `?shop_domain=${shop}`;
  }
  
  return apiUrl;
}

// ✅ CORRECTED LOADER WITH AUTHENTICATION HEADERS
export const loader = async ({ request }) => {
  try {
    // ✅ GET SESSION FOR SHOP DOMAIN AND TOKEN
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const accessToken = session.accessToken;

    console.log('🔑 Loader - Token preview:', accessToken?.substring(0, 20) + '...');
    console.log('🏪 Loader - Shop:', shop);

    if (!shop || !accessToken) {
      throw new Error('No shop domain or access token available in loader');
    }

    try {
      const apiUrl = buildApiUrl('products', shop);
      console.log('📡 Loader - Calling backend API:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`, // ✅ TOKEN IN HEADER
          'X-Shop-Domain': shop, // ✅ SHOP DOMAIN IN HEADER
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      console.log('📡 Loader - Response status:', response.status);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = await response.text();
        }
        
        console.error('❌ Loader - Backend API error:', {
          status: response.status,
          statusText: response.statusText,
          errorData: errorData
        });
        
        throw new Error(`Backend API error: ${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      const products = data.data?.products || data.products || [];

      console.log('✅ Loader - Successfully loaded products:', products.length);
      
      return {
        products: products,
        productsCount: products.length,
        shop: shop,
        currentStore: shop,
        message: data.message || 'Products loaded from database'
      };
    } catch (error) {
      console.error('❌ Loader - Products fetch error:', error.message);
      
      return {
        products: [],
        productsCount: 0,
        shop: shop,
        currentStore: shop,
        message: 'No products found. Click "Refresh from Shopify" to sync.',
        error: error.message
      };
    }
  } catch (error) {
    console.error('❌ Loader - Authentication error:', error.message);
    
    return {
      products: [],
      productsCount: 0,
      shop: 'unknown',
      currentStore: 'unknown',
      message: 'Authentication failed',
      error: error.message
    };
  }
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const accessToken = session.accessToken;

    console.log('🔑 Action - Token preview:', accessToken.substring(0, 20) + '...');
    console.log('🏪 Action - Shop:', shop);

    if (!shop || !accessToken) {
      throw new Error('No shop domain or access token available');
    }

    // 🚀 IMPORT LATEST PRODUCTS FROM SHOPIFY
    const importApiUrl = `http://depop-backend.test/api/v1/shopify/products/import`;
    
    const importResponse = await fetch(importApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Shop-Domain': shop
      },
      body: JSON.stringify({
        shop_domain: shop,
        session_access_token: accessToken
      })
    });

    if (!importResponse.ok) {
      let errorData = await importResponse.text();
      throw new Error(`Import failed: ${importResponse.status} - ${errorData}`);
    }

    const importResult = await importResponse.json();
    console.log('✅ Action - Import successful:', importResult);

    // ✅ SIMPLE SUCCESS RESPONSE
    return {
      success: true,
      message: `Sync initiated successfully. Products will update shortly.`,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error("❌ SYNC ACTION ERROR:", error.message);
    
    return {
      success: false,
      message: error.message || 'Unknown error occurred during sync',
      timestamp: Date.now(),
      error: error.message
    };
  }
};

export default function ProductsPage() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();

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

  // Helper function to safely render text
  const safeText = (text, fallback = 'N/A') => {
    if (text === null || text === undefined) return fallback;
    return String(text);
  };

  // Get product image from photos relationship
  const getProductImage = (product) => {
    if (product.photos && product.photos.length > 0) {
      const firstPhoto = product.photos[0];
      return firstPhoto.image_path || firstPhoto.url || firstPhoto.src;
    }
    return null;
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
                  Latest Update
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

      {/* Products Table */}
      <div className="products-table-container">
        <table className="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Price</th>
              <th>Inventory</th>
              <th>Condition</th>
            </tr>
          </thead>
          <tbody>
            {products && products.length > 0 ? (
              products.map((product) => {
                const productImage = getProductImage(product);

                return (
                  <tr key={product.id} className="product-row">
                    <td className="product-info-cell">
                      <div className="product-info">
                        {productImage ? (
                          <img
                            src={productImage}
                            alt={safeText(product.title)}
                            className="product-thumbnail"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="no-image-placeholder">No Image</div>
                        )}
                        <div className="product-text-info">
                          <div className="product-title-table">
                            {safeText(product.title, 'No Title')}
                          </div>
                          {product.description && product.description !== 'No Description' && (
                            <div className="product-description-table">
                              {safeText(product.description).substring(0, 80)}...
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="brand-value">
                        {product.brand?.name || safeText(product.brand, 'No Brand')}
                      </span>
                    </td>

                    <td>
                      <span className="price-value-table">
                        {product.price ? `$${parseFloat(product.price).toFixed(2)}` : 'N/A'}
                      </span>
                    </td>

                    <td>
                      <span className={`inventory-badge ${(product.quantity_left || 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>
                        {Number(product.quantity_left || 0)}
                      </span>
                    </td>

                    <td>
                      <span className={`condition-badge ${safeText(product.condition?.title || product.condition || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}>
                        {product.condition?.title || safeText(product.condition, 'Unknown')}
                      </span>
                    </td>
                  </tr>
                );
              })
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