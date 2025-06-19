require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'inventory-management-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: NODE_ENV === 'production', 
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});


// Initialize database tables
async function initializeDatabase() {
  try {
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_name VARCHAR(255) NOT NULL,
        category_id UUID REFERENCES categories(id),
        supplier_id UUID REFERENCES suppliers(id),
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
        date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert demo user if not exists
    const demoPasswordHash = '$2b$10$I4YgbAwRV7QI5J5Bub8VEOCdDrIIOaotcYBcCk5gGfIlyDEhAdfky'; // demo123
    await pool.query(`
      INSERT INTO users (username, email, password_hash, full_name) 
      VALUES ('demo', 'demo@example.com', $1, 'Demo User')
      ON CONFLICT (username) DO NOTHING
    `, [demoPasswordHash]);

    // Insert sample categories if empty
    const categoryCount = await pool.query('SELECT COUNT(*) FROM categories');
    if (parseInt(categoryCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO categories (category_name, description) VALUES 
        ('Electronics', 'Electronic devices and components'),
        ('Furniture', 'Office and home furniture items'),
        ('Stationery', 'Office supplies and writing materials'),
        ('Books', 'Educational and reference books'),
        ('Clothing', 'Apparel and accessories')
      `);
    }

    // Insert sample suppliers if empty
    const supplierCount = await pool.query('SELECT COUNT(*) FROM suppliers');
    if (parseInt(supplierCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO suppliers (supplier_name, contact_email, phone_number) VALUES 
        ('TechWorld Inc', 'orders@techworld.com', '+1-555-0101'),
        ('Office Pro Supply', 'sales@officepro.com', '+1-555-0102'),
        ('BookMart Publishers', 'contact@bookmart.com', '+1-555-0103'),
        ('Furniture Express', 'info@furnitureexpress.com', '+1-555-0104'),
        ('Fashion Hub', 'support@fashionhub.com', '+1-555-0105')
      `);
    }

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
}

// Routes - Authentication first, then protected routes

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;
    
    if (!username || !email || !password || !fullName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email, full_name',
      [username, email, passwordHash, fullName]
    );
    
    req.session.userId = result.rows[0].id;
    req.session.username = result.rows[0].username;
    
    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = await pool.query(
      'SELECT id, username, email, password_hash, full_name FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ message: 'Logout successful' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({
      authenticated: true,
      userId: req.session.userId,
      username: req.session.username
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Frontend routes with proper authentication handling
app.get('/', (req, res) => {
  // Check if user is authenticated
  if (req.session && req.session.userId) {
    // User is logged in, serve the main application
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    // User is not logged in, redirect to auth page
    res.redirect('/auth.html');
  }
});

app.get('/auth.html', (req, res) => {
  // If user is already authenticated, redirect to main app
  if (req.session && req.session.userId) {
    res.redirect('/');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'auth.html'));
  }
});

// Categories
app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY category_name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    const { categoryName, description } = req.body;
    const result = await pool.query(
      'INSERT INTO categories (category_name, description) VALUES ($1, $2) RETURNING *',
      [categoryName, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Category name already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryName, description } = req.body;
    const result = await pool.query(
      'UPDATE categories SET category_name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [categoryName, description, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Category name already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const productsCount = await pool.query('SELECT COUNT(*) FROM products WHERE category_id = $1', [id]);
    if (parseInt(productsCount.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete category with existing products' });
    }
    
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Suppliers
app.get('/api/suppliers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers ORDER BY supplier_name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/suppliers', requireAuth, async (req, res) => {
  try {
    const { supplierName, contactEmail, phoneNumber } = req.body;
    const result = await pool.query(
      'INSERT INTO suppliers (supplier_name, contact_email, phone_number) VALUES ($1, $2, $3) RETURNING *',
      [supplierName, contactEmail, phoneNumber]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/suppliers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierName, contactEmail, phoneNumber } = req.body;
    const result = await pool.query(
      'UPDATE suppliers SET supplier_name = $1, contact_email = $2, phone_number = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [supplierName, contactEmail, phoneNumber, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/suppliers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const productsCount = await pool.query('SELECT COUNT(*) FROM products WHERE supplier_id = $1', [id]);
    if (parseInt(productsCount.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete supplier with existing products' });
    }
    
    const result = await pool.query('DELETE FROM suppliers WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Products
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const { category, lowStock } = req.query;
    let query = `
      SELECT p.*, c.category_name, s.supplier_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN suppliers s ON p.supplier_id = s.id
    `;
    let params = [];
    let whereConditions = [];
    
    if (category) {
      whereConditions.push(`p.category_id = $${params.length + 1}`);
      params.push(category);
    }
    
    if (lowStock === 'true') {
      whereConditions.push('p.quantity < 5');
    }
    
    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    query += ' ORDER BY p.date_added DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const { productName, categoryId, supplierId, quantity, price } = req.body;
    const result = await pool.query(
      `INSERT INTO products (product_name, category_id, supplier_id, quantity, price) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [productName, categoryId, supplierId, quantity, price]
    );
    
    const productWithDetails = await pool.query(`
      SELECT p.*, c.category_name, s.supplier_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = $1
    `, [result.rows[0].id]);
    
    res.status(201).json(productWithDetails.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, categoryId, supplierId, quantity, price } = req.body;
    const result = await pool.query(
      `UPDATE products 
       SET product_name = $1, category_id = $2, supplier_id = $3, quantity = $4, price = $5, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $6 RETURNING *`,
      [productName, categoryId, supplierId, quantity, price, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const productWithDetails = await pool.query(`
      SELECT p.*, c.category_name, s.supplier_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = $1
    `, [id]);
    
    res.json(productWithDetails.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats endpoint
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const totalProducts = await pool.query('SELECT COUNT(*) FROM products');
    const totalCategories = await pool.query('SELECT COUNT(*) FROM categories');
    const totalSuppliers = await pool.query('SELECT COUNT(*) FROM suppliers');
    const lowStockProducts = await pool.query('SELECT COUNT(*) FROM products WHERE quantity < 5');
    const stockValue = await pool.query('SELECT SUM(quantity * price) as total FROM products');
    
    res.json({
      totalProducts: parseInt(totalProducts.rows[0].count),
      totalCategories: parseInt(totalCategories.rows[0].count),
      totalSuppliers: parseInt(totalSuppliers.rows[0].count),
      lowStockProducts: parseInt(lowStockProducts.rows[0].count),
      totalStockValue: parseFloat(stockValue.rows[0].total) || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files AFTER route definitions to prevent conflicts
app.use(express.static('public'));

// Test database connection
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to PostgreSQL database');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Base URL: ${BASE_URL}`);
});
