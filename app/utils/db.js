import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'my_shop',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
});

export async function getDB() {
  return await pool.getConnection();
}

// Updated database schema - SINGLE TABLE ONLY
export async function ensureDatabaseSchema() {
  let connection;
  try {
    connection = await getDB();
    
    // Ensure the main table structure with composite unique key
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shopify_id VARCHAR(255),
        title VARCHAR(255),
        description TEXT,
        image_url VARCHAR(500),
        product_condition VARCHAR(50),
        brand VARCHAR(100),
        size VARCHAR(50),
        price VARCHAR(100),
        inventory_quantity INT DEFAULT 0,
        store_domain VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_shopify_product (shopify_id, store_domain),
        INDEX idx_shopify_id (shopify_id),
        INDEX idx_store_domain (store_domain)
      )
    `);
    
    console.log('✅ Single products table is ready!');
    return true;
    
  } catch (error) {
    console.error('❌ Error ensuring database schema:', error);
    return false;
  } finally {
    if (connection) await connection.release();
  }
}

// ============================================================================
// MAIN FUNCTIONS - SINGLE TABLE ONLY
// ============================================================================

/**
 * Save products to SINGLE products table
 */
export async function saveProductsToDB(products, storeDomain) {
  let connection;
  try {
    connection = await getDB();
    
    // Ensure schema is up to date
    await ensureDatabaseSchema();
    
    let savedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    console.log(`🔄 Saving ${products.length} products to single table for: ${storeDomain}`);
    
    for (const productEdge of products) {
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
        
        // Check if product exists for THIS STORE
        const [existingProducts] = await connection.execute(
          'SELECT id, title, inventory_quantity FROM products WHERE shopify_id = ? AND store_domain = ?',
          [shopifyId, storeDomain]
        );
        
        if (existingProducts.length > 0) {
          // Update existing product
          await connection.execute(
            `UPDATE products SET 
              title = ?, description = ?, image_url = ?, product_condition = ?, 
              brand = ?, size = ?, price = ?, inventory_quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE shopify_id = ? AND store_domain = ?`,
            [
              product.title,
              product.description || '',
              product.mainImage || '',
              product.condition || 'Unknown',
              product.brand || 'Luxury Brand',
              product.size || 'One Size',
              product.price || 'Price not available',
              product.inventory || 0,
              shopifyId,
              storeDomain
            ]
          );
          updatedCount++;
          console.log(`🔵 Updated: ${product.title}`);
        } else {
          // Insert new product
          await connection.execute(
            `INSERT INTO products (
              shopify_id, title, description, image_url, product_condition, 
              brand, size, price, inventory_quantity, store_domain
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              shopifyId,
              product.title,
              product.description || '',
              product.mainImage || '',
              product.condition || 'Unknown',
              product.brand || 'Luxury Brand',
              product.size || 'One Size',
              product.price || 'Price not available',
              product.inventory || 0,
              storeDomain
            ]
          );
          savedCount++;
          console.log(`🆕 Added: ${product.title}`);
        }
        
      } catch (error) {
        console.error(`❌ Error saving product:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`✅ Single table sync completed for ${storeDomain}:`);
    console.log(`   📥 New products: ${savedCount}`);
    console.log(`   🔄 Updated products: ${updatedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    return { 
      success: true, 
      saved: savedCount, 
      updated: updatedCount, 
      errors: errorCount
    };
    
  } catch (error) {
    console.error('❌ Database error in saveProductsToDB:', error.message);
    throw error;
  } finally {
    if (connection) await connection.release();
  }
}

/**
 * Get products from SINGLE table for specific store
 */
export async function getProductsFromDB(storeDomain) {
  let connection;
  try {
    connection = await getDB();
    const [products] = await connection.execute(
      'SELECT * FROM products WHERE store_domain = ? ORDER BY id DESC', 
      [storeDomain]
    );
    console.log(`📊 Retrieved ${products.length} products for: ${storeDomain}`);
    return products;
  } catch (error) {
    console.error(`❌ Error fetching products for ${storeDomain}:`, error);
    return [];
  } finally {
    if (connection) await connection.release();
  }
}

/**
 * Get all stores with their product counts
 */
export async function getAllStoresWithStats() {
  let connection;
  try {
    connection = await getDB();
    
    const [stores] = await connection.execute(`
      SELECT 
        store_domain as name,
        store_domain as domain,
        COUNT(*) as productCount,
        SUM(inventory_quantity) as totalInventory,
        'products' as tableName
      FROM products 
      GROUP BY store_domain
      ORDER BY store_domain
    `);
    
    return stores;
  } catch (error) {
    console.error('❌ Error getting stores with stats:', error);
    return [];
  } finally {
    if (connection) await connection.release();
  }
}

// ============================================================================
// BIDIRECTIONAL SYNC FUNCTIONS
// ============================================================================

// Helper function to detect changes between DB and Shopify
export async function detectChanges(dbProducts, shopifyProducts, storeDomain) {
  const titleChanges = [];
  const inventoryChanges = [];
  
  console.log(`🔍 Detecting changes for store: ${storeDomain}...`);
  
  for (const dbProduct of dbProducts) {
    if (!dbProduct.shopify_id) continue;
    
    const shopifyProduct = shopifyProducts.find(sp => {
      let shopifyId = sp.node.id;
      if (shopifyId && shopifyId.includes('/')) {
        shopifyId = shopifyId.split('/').pop();
      }
      return shopifyId === dbProduct.shopify_id;
    });
    
    if (shopifyProduct) {
      const dbTitle = dbProduct.title;
      const shopifyTitle = shopifyProduct.node.title;
      const dbInventory = dbProduct.inventory_quantity || 0;
      const shopifyInventory = shopifyProduct.node.inventory || 0;
      
      // Check title changes
      if (dbTitle !== shopifyTitle) {
        titleChanges.push({
          dbProductId: dbProduct.id,
          shopifyId: dbProduct.shopify_id,
          dbTitle: dbTitle,
          shopifyTitle: shopifyTitle,
          type: 'TITLE_DB_TO_SHOPIFY',
          direction: 'DB_TO_SHOPIFY'
        });
        console.log(`📝 Title difference [${storeDomain}]: DB="${dbTitle}" vs Shopify="${shopifyTitle}"`);
      }
      
      // Check inventory changes
      if (dbInventory !== shopifyInventory) {
        inventoryChanges.push({
          dbProductId: dbProduct.id,
          shopifyId: dbProduct.shopify_id,
          dbInventory: dbInventory,
          shopifyInventory: shopifyInventory,
          type: 'INVENTORY_DB_TO_SHOPIFY',
          direction: 'DB_TO_SHOPIFY'
        });
        console.log(`📦 Inventory difference [${storeDomain}]: DB=${dbInventory} vs Shopify=${shopifyInventory}`);
      }
    }
  }

  // Detect Shopify → DB changes (new products or changes that should update DB)
  for (const shopifyProduct of shopifyProducts) {
    let shopifyId = shopifyProduct.node.id;
    if (shopifyId && shopifyId.includes('/')) {
      shopifyId = shopifyId.split('/').pop();
    }
    
    const dbProduct = dbProducts.find(db => db.shopify_id === shopifyId);
    
    if (!dbProduct) {
      // New product in Shopify that doesn't exist in DB
      console.log(`🆕 New product in Shopify: ${shopifyProduct.node.title}`);
    }
  }
  
  console.log(`📝 Found ${titleChanges.length} title changes DB → Shopify for ${storeDomain}`);
  console.log(`📦 Found ${inventoryChanges.length} inventory changes DB → Shopify for ${storeDomain}`);
  
  return { titleChanges, inventoryChanges };
}

// Update product title in Shopify
export async function syncTitleToShopify(admin, productId, storeDomain) {
  let connection;
  try {
    connection = await getDB();
    
    const [products] = await connection.execute(
      'SELECT shopify_id, title FROM products WHERE id = ? AND store_domain = ? LIMIT 1',
      [productId, storeDomain]
    );
    
    if (products.length === 0) {
      throw new Error(`Product not found in database for store: ${storeDomain}`);
    }
    
    const shopifyId = products[0].shopify_id;
    const productTitle = products[0].title;

    console.log(`🔄 DB → Shopify (Title) [${storeDomain}]: "${productTitle}"`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const response = await admin.graphql(
        `#graphql
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              product {
                id
                title
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            input: {
              id: `gid://shopify/Product/${shopifyId}`,
              title: productTitle
            }
          },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      const result = await response.json();
      
      if (result.errors) {
        console.error(`❌ Shopify API errors [${storeDomain}]:`, result.errors);
        return { success: false, error: result.errors[0]?.message || 'API error' };
      }
      
      if (result.data?.productUpdate?.userErrors?.length > 0) {
        console.error(`❌ Shopify sync user errors [${storeDomain}]:`, result.data.productUpdate.userErrors);
        return { 
          success: false, 
          error: result.data.productUpdate.userErrors[0]?.message || 'Sync error' 
        };
      }
      
      console.log(`✅ SUCCESS: Updated title in Shopify for ${storeDomain}`);
      return { success: true };
      
    } catch (graphqlError) {
      clearTimeout(timeoutId);
      if (graphqlError.name === 'AbortError') {
        throw new Error('Shopify API timeout');
      }
      throw graphqlError;
    }
    
  } catch (error) {
    console.error(`❌ Error syncing title to Shopify for ${storeDomain}:`, error.message);
    return { success: false, error: error.message };
  } finally {
    if (connection) await connection.release();
  }
}

// Update product inventory in Shopify
export async function syncInventoryToShopify(admin, productId, storeDomain) {
  let connection;
  try {
    connection = await getDB();
    
    const [products] = await connection.execute(
      'SELECT shopify_id, inventory_quantity, title FROM products WHERE id = ? AND store_domain = ? LIMIT 1',
      [productId, storeDomain]
    );
    
    if (products.length === 0) {
      throw new Error(`Product not found in database for store: ${storeDomain}`);
    }
    
    const shopifyId = products[0].shopify_id;
    const inventoryQuantity = products[0].inventory_quantity || 0;
    const productTitle = products[0].title;

    console.log(`🔄 DB → Shopify (Inventory) [${storeDomain}]: ${inventoryQuantity} for "${productTitle}"`);

    // Get product variants and their inventory items
    const productResponse = await admin.graphql(
      `#graphql
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            variants(first: 10) {
              nodes {
                id
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          id: `gid://shopify/Product/${shopifyId}`
        }
      }
    );
    
    const productResult = await productResponse.json();
    
    if (productResult.errors) {
      console.error(`❌ Error fetching product variants for ${storeDomain}:`, productResult.errors);
      return { success: false, error: productResult.errors[0]?.message || 'API error' };
    }
    
    const variants = productResult.data?.product?.variants?.nodes;
    if (!variants || variants.length === 0) {
      return { success: false, error: 'No variants found for product' };
    }

    const locationId = "109904462187";

    const quantities = variants.map(variant => ({
      inventoryItemId: variant.inventoryItem.id,
      locationId: `gid://shopify/Location/${locationId}`,
      quantity: inventoryQuantity
    }));

    console.log(`📦 Updating ${quantities.length} variants to ${inventoryQuantity} for ${storeDomain}`);

    const updateResponse = await admin.graphql(
      `#graphql
        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup {
              createdAt
              reason
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          input: {
            name: "available",
            reason: "correction",
            ignoreCompareQuantity: true,
            quantities: quantities
          }
        }
      }
    );
    
    const result = await updateResponse.json();
    
    if (result.errors) {
      console.error(`❌ Shopify API errors [${storeDomain}]:`, result.errors);
      return { success: false, error: result.errors[0]?.message || 'API error' };
    }
    
    if (result.data?.inventorySetQuantities?.userErrors?.length > 0) {
      console.error(`❌ Shopify sync user errors [${storeDomain}]:`, result.data.inventorySetQuantities.userErrors);
      return { 
        success: false, 
        error: result.data.inventorySetQuantities.userErrors[0]?.message || 'Sync error' 
      };
    }
    
    console.log(`✅ SUCCESS: Updated inventory for ${quantities.length} variants to ${inventoryQuantity} for ${storeDomain}`);
    return { success: true, variantsUpdated: quantities.length };
    
  } catch (error) {
    console.error(`❌ Error syncing inventory to Shopify for ${storeDomain}:`, error.message);
    return { success: false, error: error.message };
  } finally {
    if (connection) await connection.release();
  }
}

// ============================================================================
// COMPATIBILITY FUNCTIONS (Keep for backward compatibility)
// ============================================================================

// Alias functions for compatibility with your existing code
export async function saveProductsToAutoStoreTable(storeDomain, products) {
  return await saveProductsToDB(products, storeDomain);
}

export async function getProductsFromAutoStoreTable(storeDomain) {
  return await getProductsFromDB(storeDomain);
}

// Other utility functions (keep as is)
export async function updateProductInventory(productId, newInventory, storeDomain) {
  let connection;
  try {
    connection = await getDB();
    
    const [result] = await connection.execute(
      'UPDATE products SET inventory_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND store_domain = ?',
      [newInventory, productId, storeDomain]
    );
    
    console.log(`📦 Updated inventory for product ${productId} in ${storeDomain} to ${newInventory}`);
    return { success: true, affectedRows: result.affectedRows };
    
  } catch (error) {
    console.error(`❌ Error updating product inventory for ${storeDomain}:`, error.message);
    return { success: false, error: error.message };
  } finally {
    if (connection) await connection.release();
  }
}

export async function getProductById(productId, storeDomain) {
  let connection;
  try {
    connection = await getDB();
    const [products] = await connection.execute(
      'SELECT * FROM products WHERE id = ? AND store_domain = ?', 
      [productId, storeDomain]
    );
    return products[0] || null;
  } catch (error) {
    console.error(`❌ Error fetching product by ID for ${storeDomain}:`, error);
    return null;
  } finally {
    if (connection) await connection.release();
  }
}

export async function resetDatabase(storeDomain = null) {
  let connection;
  try {
    connection = await getDB();
    
    if (storeDomain) {
      console.log(`🔄 Resetting products for store: ${storeDomain}...`);
      await connection.execute('DELETE FROM products WHERE store_domain = ?', [storeDomain]);
      console.log(`✅ Products reset for store: ${storeDomain}`);
    } else {
      console.log('🔄 Resetting all products...');
      await connection.execute('DELETE FROM products');
      console.log('✅ All products deleted!');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    return false;
  } finally {
    if (connection) await connection.release();
  }
}