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

// Check if store_domain column exists
async function checkStoreDomainColumn() {
  let connection;
  try {
    connection = await getDB();
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'my_shop' 
      AND TABLE_NAME = 'products' 
      AND COLUMN_NAME = 'store_domain'
    `);
    return columns.length > 0;
  } catch (error) {
    console.error('❌ Error checking store_domain column:', error);
    return false;
  } finally {
    if (connection) await connection.release();
  }
}

// Updated database schema with store separation
export async function ensureDatabaseSchema() {
  let connection;
  try {
    connection = await getDB();
    
    // First, check if store_domain column exists
    const hasStoreDomain = await checkStoreDomainColumn();
    
    if (!hasStoreDomain) {
      console.log('🔄 Adding store_domain column to products table...');
      
      // Add store_domain column
      await connection.execute(`
        ALTER TABLE products ADD COLUMN store_domain VARCHAR(255)
      `);
      
      // Add index
      await connection.execute(`
        CREATE INDEX idx_store_domain ON products(store_domain)
      `);
      
      // Update existing records
      await connection.execute(`
        UPDATE products SET store_domain = 'default-store.myshopify.com' 
        WHERE store_domain IS NULL
      `);
      
      // Make store_domain NOT NULL
      await connection.execute(`
        ALTER TABLE products MODIFY store_domain VARCHAR(255) NOT NULL
      `);
      
      console.log('✅ store_domain column added successfully!');
    }
    
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
    
    console.log('✅ Database schema with store separation is ready!');
    return true;
    
  } catch (error) {
    console.error('❌ Error ensuring database schema:', error);
    return false;
  } finally {
    if (connection) await connection.release();
  }
}

// ============================================================================
// STORE TABLE AUTOMATIC CREATION FUNCTIONS
// ============================================================================

/**
 * Extract clean store name from domain
 */
export function extractStoreName(storeDomain) {
  return storeDomain.replace('.myshopify.com', '').replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Check if a store table exists
 */
export async function storeTableExists(storeName) {
  let connection;
  try {
    connection = await getDB();
    const tableName = storeName;
    
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = 'my_shop' 
       AND TABLE_NAME = ?`,
      [tableName]
    );
    
    return tables.length > 0;
  } catch (error) {
    console.error('❌ Error checking store table:', error);
    return false;
  } finally {
    if (connection) await connection.release();
  }
}

/**
 * Create a new store table automatically
 */
export async function createStoreTable(storeName) {
  let connection;
  try {
    connection = await getDB();
    const tableName =  storeName;
    
    // Check if table already exists
    if (await storeTableExists(storeName)) {
      console.log(`✅ Store table already exists: ${tableName}`);
      return tableName;
    }
    
    // Create the store-specific table
    const createTableSQL = `
      CREATE TABLE ${tableName} (
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_shopify_id (shopify_id),
        INDEX idx_shopify_id (shopify_id),
        INDEX idx_brand (brand),
        INDEX idx_inventory (inventory_quantity)
      )
    `;
    
    await connection.execute(createTableSQL);
    console.log(`✅ Store table created: ${tableName}`);
    
    return tableName;
  } catch (error) {
    console.error('❌ Error creating store table:', error);
    throw error;
  } finally {
    if (connection) await connection.release();
  }
}

/**
 * Save products to store-specific table
 */
export async function saveProductsToStoreTable(storeName, products) {
  let connection;
  try {
    connection = await getDB();
    const tableName = storeName;
    
    let savedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    console.log(`🔄 Saving ${products.length} products to ${tableName}...`);
    
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
        
        // Check if product exists in store table
        const [existingProducts] = await connection.execute(
          `SELECT id FROM ${tableName} WHERE shopify_id = ?`,
          [shopifyId]
        );
        
        if (existingProducts.length > 0) {
          // Update existing product
          await connection.execute(
            `UPDATE ${tableName} SET 
              title = ?, description = ?, image_url = ?, product_condition = ?, 
              brand = ?, size = ?, price = ?, inventory_quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE shopify_id = ?`,
            [
              product.title,
              product.description || '',
              product.mainImage || '',
              product.condition || 'Unknown',
              product.brand || 'Luxury Brand',
              product.size || 'One Size',
              product.price || 'Price not available',
              product.inventory || 0,
              shopifyId
            ]
          );
          updatedCount++;
          console.log(`🔵 Updated in ${tableName}: ${product.title}`);
        } else {
          // Insert new product
          await connection.execute(
            `INSERT INTO ${tableName} (
              shopify_id, title, description, image_url, product_condition, 
              brand, size, price, inventory_quantity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              shopifyId,
              product.title,
              product.description || '',
              product.mainImage || '',
              product.condition || 'Unknown',
              product.brand || 'Luxury Brand',
              product.size || 'One Size',
              product.price || 'Price not available',
              product.inventory || 0
            ]
          );
          savedCount++;
          console.log(`🆕 Added to ${tableName}: ${product.title}`);
        }
        
      } catch (error) {
        console.error(`❌ Error saving product to ${tableName}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`✅ Store table sync completed for ${tableName}:`);
    console.log(`   📥 New products: ${savedCount}`);
    console.log(`   🔄 Updated products: ${updatedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    return { 
      success: true, 
      saved: savedCount, 
      updated: updatedCount, 
      errors: errorCount,
      tableName: tableName
    };
    
  } catch (error) {
    console.error('❌ Error in saveProductsToStoreTable:', error);
    throw error;
  } finally {
    if (connection) await connection.release();
  }
}

/**
 * Get products from store-specific table
 */
export async function getProductsFromStoreTable(storeName) {
  let connection;
  try {
    connection = await getDB();
    const tableName = storeName;
    
    // Check if table exists first
    if (!await storeTableExists(storeName)) {
      console.log(`🔵 Store table doesn't exist yet: ${tableName}`);
      return [];
    }
    
    const [products] = await connection.execute(
      `SELECT * FROM ${tableName} ORDER BY id DESC`
    );
    
    console.log(`📊 Retrieved ${products.length} products from ${tableName}`);
    return products;
  } catch (error) {
    console.error(`❌ Error getting products from store table:`, error);
    return [];
  } finally {
    if (connection) await connection.release();
  }
}

/**
 * Get all store tables
 */
export async function getAllStoreTables() {
  let connection;
  try {
    connection = await getDB();
    
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = 'my_shop' 
       AND TABLE_NAME NOT IN ('products', 'Session')` // CHANGED: Remove "store_%" pattern
    );
    
    const storeNames  = tables.map(table => table.TABLE_NAME); // ✅ Just return the table names directly
    
    
    return storeNames;
  } catch (error) {
    console.error('❌ Error getting store tables:', error);
    return [];
  } finally {
    if (connection) await connection.release();
  }
}

/**
 * Auto-create store table and save products (MAIN FUNCTION)
 */
export async function saveProductsToAutoStoreTable(storeDomain, products) {
  try {
    // Extract clean store name
    const storeName = extractStoreName(storeDomain);
    console.log(`🏪 Processing store: ${storeName} (from ${storeDomain})`);
    
    // Create store table if it doesn't exist
    const tableName = await createStoreTable(storeName);
    
    // Save products to store-specific table
    const result = await saveProductsToStoreTable(storeName, products);
    
    return {
      ...result,
      storeName: storeName,
      storeDomain: storeDomain
    };
    
  } catch (error) {
    console.error('❌ Error in saveProductsToAutoStoreTable:', error);
    throw error;
  }
}

/**
 * Get products from store-specific table (MAIN FUNCTION)
 */
export async function getProductsFromAutoStoreTable(storeDomain) {
  try {
    const storeName = extractStoreName(storeDomain);
    const products = await getProductsFromStoreTable(storeName);
    
    // Add store domain to each product for display
    return products.map(product => ({
      ...product,
      store_domain: storeDomain
    }));
    
  } catch (error) {
    console.error('❌ Error in getProductsFromAutoStoreTable:', error);
    return [];
  }
}

/**
 * Get all stores with their product counts
 */
export async function getAllStoresWithStats() {
  let connection;
  try {
    connection = await getDB();
    const storeNames = await getAllStoreTables();
    
    const storesWithStats = [];
    
    for (const storeName of storeNames) {
      const tableName = storeName;
      
      const [productCount] = await connection.execute(
        `SELECT COUNT(*) as count FROM ${tableName}`
      );
      
      const [inventorySum] = await connection.execute(
        `SELECT SUM(inventory_quantity) as total FROM ${tableName}`
      );
      
      storesWithStats.push({
        name: storeName,
        domain: `${storeName}.myshopify.com`,
        productCount: productCount[0].count,
        totalInventory: inventorySum[0].total || 0,
        tableName: tableName
      });
    }
    
    return storesWithStats;
  } catch (error) {
    console.error('❌ Error getting stores with stats:', error);
    return [];
  } finally {
    if (connection) await connection.release();
  }
}

// ============================================================================
// EXISTING FUNCTIONS (KEEP THESE FOR BACKWARD COMPATIBILITY)
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
          type: 'TITLE'
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
          type: 'INVENTORY'
        });
        console.log(`📦 Inventory difference [${storeDomain}]: DB=${dbInventory} vs Shopify=${shopifyInventory}`);
      }
    }
  }
  
  console.log(`📝 Found ${titleChanges.length} title changes needing sync for ${storeDomain}`);
  console.log(`📦 Found ${inventoryChanges.length} inventory changes needing sync for ${storeDomain}`);
  
  return { titleChanges, inventoryChanges };
}

// Save products from Shopify to DB with store separation (ORIGINAL FUNCTION)
export async function saveProductsToDB(products, storeDomain) {
  let connection;
  try {
    connection = await getDB();
    
    // Ensure schema is up to date
    await ensureDatabaseSchema();
    
    let savedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    let titleChanges = [];
    let inventoryChanges = [];
    
    console.log(`🔄 Processing ${products.length} products from ${storeDomain}...`);
    
    for (const productEdge of products) {
      const product = productEdge.node;
      
      try {
        // Extract Shopify ID
        let shopifyId = product.id;
        if (shopifyId && shopifyId.includes('/')) {
          shopifyId = shopifyId.split('/').pop();
        }
        
        if (!shopifyId) {
          console.error(`❌ Missing shopify_id for product in ${storeDomain}:`, product.title);
          errorCount++;
          continue;
        }
        
        // Check if product exists for THIS STORE
        const [existingProducts] = await connection.execute(
          'SELECT id, title, inventory_quantity FROM products WHERE shopify_id = ? AND store_domain = ?',
          [shopifyId, storeDomain]
        );
        
        if (existingProducts.length > 0) {
          const existingProduct = existingProducts[0];
          const oldTitle = existingProduct.title;
          const newTitle = product.title;
          const oldInventory = existingProduct.inventory_quantity || 0;
          const newInventory = product.inventory || 0;
          const titleChanged = oldTitle !== newTitle;
          const inventoryChanged = oldInventory !== newInventory;
          
          // Update existing product FOR THIS STORE
          const [updateResult] = await connection.execute(
            `UPDATE products SET 
              title = ?, description = ?, image_url = ?, product_condition = ?, 
              brand = ?, size = ?, price = ?, inventory_quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE shopify_id = ? AND store_domain = ?`,
            [
              newTitle,
              product.description || '',
              product.mainImage || '',
              product.condition || 'Unknown',
              product.brand || 'Luxury Brand',
              product.size || 'One Size',
              product.price || 'Price not available',
              newInventory,
              shopifyId,
              storeDomain
            ]
          );
          
          updatedCount++;
          
          if (titleChanged) {
            titleChanges.push({
              from: oldTitle,
              to: newTitle,
              shopifyId: shopifyId,
              storeDomain: storeDomain
            });
            console.log(`📝 TITLE UPDATED [${storeDomain}]: "${oldTitle}" → "${newTitle}"`);
          }
          
          if (inventoryChanged) {
            inventoryChanges.push({
              from: oldInventory,
              to: newInventory,
              shopifyId: shopifyId,
              storeDomain: storeDomain
            });
            console.log(`📦 INVENTORY UPDATED [${storeDomain}]: ${oldInventory} → ${newInventory}`);
          }
          
          if (!titleChanged && !inventoryChanged) {
            console.log(`🔵 No changes [${storeDomain}]: "${oldTitle}" (Inventory: ${oldInventory})`);
          }
          
        } else {
          // Insert new product WITH STORE DOMAIN
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
          console.log(`🆕 New product added to ${storeDomain}: ${product.title}`);
        }
        
      } catch (error) {
        console.error(`❌ Error saving ${product.title} to ${storeDomain}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`✅ Database sync completed for ${storeDomain}:`);
    console.log(`   📥 New products: ${savedCount}`);
    console.log(`   🔄 Updated products: ${updatedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Title changes: ${titleChanges.length}`);
    console.log(`   📦 Inventory changes: ${inventoryChanges.length}`);
    
    return { 
      success: true, 
      saved: savedCount, 
      updated: updatedCount, 
      errors: errorCount,
      titleChanges: titleChanges.length,
      inventoryChanges: inventoryChanges.length
    };
    
  } catch (error) {
    console.error('❌ Database error in saveProductsToDB:', error.message);
    throw error;
  } finally {
    if (connection) await connection.release();
  }
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

// Get all products FOR SPECIFIC STORE
export async function getAllProducts(storeDomain) {
  let connection;
  try {
    connection = await getDB();
    const [products] = await connection.execute(
      'SELECT * FROM products WHERE store_domain = ? ORDER BY id DESC', 
      [storeDomain]
    );
    return products;
  } catch (error) {
    console.error(`❌ Error fetching products for ${storeDomain}:`, error);
    return [];
  } finally {
    if (connection) await connection.release();
  }
}

// Update product inventory in database FOR SPECIFIC STORE
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

// Get product by ID FOR SPECIFIC STORE
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

// Get product by Shopify ID FOR SPECIFIC STORE
export async function getProductByShopifyId(shopifyId, storeDomain) {
  let connection;
  try {
    connection = await getDB();
    const [products] = await connection.execute(
      'SELECT * FROM products WHERE shopify_id = ? AND store_domain = ?', 
      [shopifyId, storeDomain]
    );
    return products[0] || null;
  } catch (error) {
    console.error(`❌ Error fetching product by Shopify ID for ${storeDomain}:`, error);
    return null;
  } finally {
    if (connection) await connection.release();
  }
}

// Get low inventory products FOR SPECIFIC STORE
export async function getLowInventoryProducts(storeDomain, threshold = 5) {
  let connection;
  try {
    connection = await getDB();
    const [products] = await connection.execute(
      'SELECT * FROM products WHERE store_domain = ? AND inventory_quantity <= ? ORDER BY inventory_quantity ASC',
      [storeDomain, threshold]
    );
    return products;
  } catch (error) {
    console.error(`❌ Error fetching low inventory products for ${storeDomain}:`, error);
    return [];
  } finally {
    if (connection) await connection.release();
  }
}

// Get inventory summary FOR SPECIFIC STORE
export async function getInventorySummary(storeDomain) {
  let connection;
  try {
    connection = await getDB();
    const [summary] = await connection.execute(`
      SELECT 
        COUNT(*) as total_products,
        SUM(inventory_quantity) as total_inventory,
        AVG(inventory_quantity) as avg_inventory,
        COUNT(CASE WHEN inventory_quantity = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN inventory_quantity <= 5 THEN 1 END) as low_stock
      FROM products
      WHERE store_domain = ?
    `, [storeDomain]);
    return summary[0];
  } catch (error) {
    console.error(`❌ Error getting inventory summary for ${storeDomain}:`, error);
    return null;
  } finally {
    if (connection) await connection.release();
  }
}

// NEW: Get database stats with store separation
export async function getDatabaseStats(storeDomain = null) {
  let connection;
  try {
    connection = await getDB();
    
    let totalProducts, storeProducts, totalStores, stores;
    
    // Overall stats
    const [totalCount] = await connection.execute('SELECT COUNT(*) as count FROM products');
    const [storesCount] = await connection.execute('SELECT COUNT(DISTINCT store_domain) as count FROM products');
    const [storesList] = await connection.execute('SELECT DISTINCT store_domain FROM products ORDER BY store_domain');
    
    totalProducts = totalCount[0].count;
    totalStores = storesCount[0].count;
    stores = storesList.map(row => row.store_domain);
    
    // Store-specific stats
    if (storeDomain) {
      const [storeCount] = await connection.execute(
        'SELECT COUNT(*) as count FROM products WHERE store_domain = ?',
        [storeDomain]
      );
      storeProducts = storeCount[0].count;
    }
    
    return {
      totalProducts: totalProducts,
      storeProducts: storeProducts || null,
      totalStores: totalStores,
      stores: stores,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error getting database stats:', error);
    return null;
  } finally {
    if (connection) await connection.release();
  }
}

// Reset database completely or for specific store
export async function resetDatabase(storeDomain = null) {
  let connection;
  try {
    connection = await getDB();
    
    if (storeDomain) {
      console.log(`🔄 Resetting products for store: ${storeDomain}...`);
      await connection.execute('DELETE FROM products WHERE store_domain = ?', [storeDomain]);
      console.log(`✅ Products reset for store: ${storeDomain}`);
    } else {
      console.log('🔄 Resetting all database tables...');
      await connection.execute('DROP TABLE IF EXISTS products');
      console.log('✅ Database tables dropped successfully');
      await ensureDatabaseSchema();
      console.log('✅ Database reset and schema recreated!');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    return false;
  } finally {
    if (connection) await connection.release();
  }
}